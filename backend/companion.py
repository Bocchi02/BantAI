"""Local BantAI Companion pairing and privacy-minimized delivery state."""

from __future__ import annotations

import base64
import ctypes
import json
import os
import platform
import secrets
import threading
import urllib.error
import urllib.request
from collections import OrderedDict
from ctypes import wintypes
from pathlib import Path
from time import monotonic
from typing import Any

try:
    import keyring
except ImportError:  # The packaged Windows companion installs this dependency.
    keyring = None


CREDENTIAL_SERVICE = "BantAI Companion"


class CompanionError(RuntimeError):
    """Safe local companion failure without sensitive payload content."""


class _DataBlob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]


def _blob(data: bytes) -> tuple[_DataBlob, Any]:
    buffer = ctypes.create_string_buffer(data)
    return _DataBlob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_char))), buffer


def _protect(data: bytes) -> bytes:
    if platform.system() != "Windows":
        return data
    source, source_buffer = _blob(data)
    destination = _DataBlob()
    if not ctypes.windll.crypt32.CryptProtectData(
        ctypes.byref(source), "BantAI Companion", None, None, None, 1, ctypes.byref(destination)
    ):
        raise CompanionError("Windows could not protect BantAI Companion state.")
    try:
        return ctypes.string_at(destination.pbData, destination.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(destination.pbData)
        del source_buffer


def _unprotect(data: bytes) -> bytes:
    if platform.system() != "Windows":
        return data
    source, source_buffer = _blob(data)
    destination = _DataBlob()
    if not ctypes.windll.crypt32.CryptUnprotectData(
        ctypes.byref(source), None, None, None, None, 1, ctypes.byref(destination)
    ):
        raise CompanionError("Windows could not unlock BantAI Companion state.")
    try:
        return ctypes.string_at(destination.pbData, destination.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(destination.pbData)
        del source_buffer


class CompanionManager:
    max_outbox_entries = 500
    max_detail_contexts_per_type = 20

    def __init__(self) -> None:
        local_data = os.getenv("LOCALAPPDATA") or str(Path.home())
        self.state_path = Path(
            os.getenv("BANTAI_COMPANION_STATE_PATH", str(Path(local_data) / "BantAI" / "companion.dat"))
        )
        self.platform_url = os.getenv("BANTAI_PLATFORM_API", "").rstrip("/")
        self._lock = threading.RLock()
        self._training_consent_cache = {"expires_at": 0.0, "enabled": False, "sample_rate_percent": 0}
        # Full addresses and email bodies are deliberately memory-only. They
        # are available for an explicit dashboard explanation, but never enter
        # the encrypted activity outbox or the Companion state file.
        self._detail_contexts: OrderedDict[str, dict[str, Any]] = OrderedDict()

    def _empty(self) -> dict[str, Any]:
        return {
            "device_id": None,
            "device_token": None,
            "device_label": None,
            "user_email": None,
            "credential_storage": None,
            "outbox": [],
        }

    def _load(self) -> dict[str, Any]:
        if not self.state_path.is_file():
            return self._empty()
        try:
            encoded = self.state_path.read_bytes()
            payload = _unprotect(base64.urlsafe_b64decode(encoded))
            value = json.loads(payload.decode("utf-8"))
            return {**self._empty(), **value} if isinstance(value, dict) else self._empty()
        except Exception:
            return self._empty()

    def _save(self, state: dict[str, Any]) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        clear = json.dumps(state, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        temporary = self.state_path.with_suffix(".tmp")
        temporary.write_bytes(base64.urlsafe_b64encode(_protect(clear)))
        temporary.replace(self.state_path)

    def _credential(self, state: dict[str, Any]) -> str | None:
        device_id = state.get("device_id")
        if platform.system() == "Windows" and keyring is not None and device_id:
            try:
                credential = keyring.get_password(CREDENTIAL_SERVICE, str(device_id))
                if credential:
                    return credential
            except Exception:
                # Some background Windows logon sessions cannot open Credential
                # Manager (WinError 1312). In that case the DPAPI-protected
                # companion state remains the secure local fallback.
                pass
        return state.get("device_token")

    def _request(self, path: str, payload: dict[str, Any], *, authenticated: bool = True) -> dict[str, Any]:
        if not self.platform_url:
            raise CompanionError("The shared BantAI service is not configured.")
        state = self._load()
        headers = {"Content-Type": "application/json", "User-Agent": "BantAI-Companion/1.0"}
        if authenticated:
            token = self._credential(state)
            if not token:
                raise CompanionError("Pair BantAI before using shared services.")
            headers["Authorization"] = f"Bearer {token}"
        request = urllib.request.Request(
            f"{self.platform_url}/api/v1{path}",
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            message = "The shared BantAI service rejected this request."
            try:
                problem = json.loads(exc.read().decode("utf-8"))
                detail = problem.get("detail") if isinstance(problem, dict) else None
                if isinstance(detail, str) and 0 < len(detail) <= 180:
                    message = detail
            except (ValueError, UnicodeDecodeError):
                pass
            raise CompanionError(message) from exc
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            raise CompanionError("The shared BantAI service is unavailable.") from exc

    def _get(self, path: str, *, timeout: int = 5) -> dict[str, Any]:
        if not self.platform_url:
            raise CompanionError("The shared BantAI service is not configured.")
        state = self._load()
        token = self._credential(state)
        if not token:
            raise CompanionError("Pair BantAI before using shared services.")
        request = urllib.request.Request(
            f"{self.platform_url}/api/v1{path}",
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {token}",
                "User-Agent": "BantAI-Companion/1.0",
            },
            method="GET",
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError) as exc:
            raise CompanionError("The shared BantAI service is unavailable.") from exc

    def platform_status(self) -> dict[str, Any]:
        """Check gateway and provider readiness without making an LLM request."""

        if not self.platform_url:
            return {
                "reachable": False,
                "device_authenticated": False,
                "cloud_ai_configured": False,
                "cloud_ai_available": False,
            }
        state = self._load()
        token = self._credential(state)
        path = "/api/v1/device-status" if token else "/health"
        headers = {"Accept": "application/json", "User-Agent": "BantAI-Companion/1.0"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        request = urllib.request.Request(
            f"{self.platform_url}{path}",
            headers=headers,
            method="GET",
        )
        try:
            with urllib.request.urlopen(request, timeout=3) as response:
                result = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            return {
                "reachable": exc.code in {401, 403},
                "device_authenticated": False,
                "cloud_ai_configured": False,
                "cloud_ai_available": False,
            }
        except (urllib.error.URLError, TimeoutError, ValueError):
            return {
                "reachable": False,
                "device_authenticated": False,
                "cloud_ai_configured": False,
                "cloud_ai_available": False,
            }
        cloud = result.get("cloud_ai") if isinstance(result, dict) else None
        cloud = cloud if isinstance(cloud, dict) else {}
        return {
            "reachable": result.get("status") == "ok" or result.get("connected") is True,
            "device_authenticated": bool(result.get("connected")) if token else False,
            "cloud_ai_configured": bool(cloud.get("configured")),
            "cloud_ai_available": bool(cloud.get("available")),
        }

    def pair(self, code: str, device_label: str) -> dict[str, Any]:
        with self._lock:
            result = self._request(
                "/pairing/consume",
                {"code": code.strip().upper(), "device_label": device_label.strip()},
                authenticated=False,
            )
            state = self._load()
            previous_device_id = state.get("device_id")
            previous_storage = state.get("credential_storage")
            stored_in_keyring = False
            if platform.system() == "Windows" and keyring is not None:
                if previous_device_id and previous_storage != "WINDOWS_DPAPI":
                    try:
                        keyring.delete_password(CREDENTIAL_SERVICE, str(previous_device_id))
                    except keyring.errors.PasswordDeleteError:
                        pass
                try:
                    keyring.set_password(CREDENTIAL_SERVICE, str(result["device_id"]), result["device_token"])
                    stored_in_keyring = True
                except Exception:
                    # The state file is itself protected with the current
                    # Windows user's DPAPI key, so pairing can complete safely
                    # even when Credential Manager is unavailable to a
                    # background Companion process.
                    stored_in_keyring = False
            windows = platform.system() == "Windows"
            state.update(
                {
                    "device_id": result["device_id"],
                    "device_token": result["device_token"] if not windows or not stored_in_keyring else None,
                    "device_label": device_label.strip(),
                    "user_email": result.get("user_email"),
                    "credential_storage": (
                        "WINDOWS_CREDENTIAL_MANAGER"
                        if windows and stored_in_keyring
                        else "WINDOWS_DPAPI"
                        if windows
                        else "FILESYSTEM_ONLY"
                    ),
                }
            )
            self._save(state)
            return self.status()

    def status(self) -> dict[str, Any]:
        with self._lock:
            state = self._load()
            windows = platform.system() == "Windows"
            credential_protection = state.get("credential_storage")
            if not credential_protection:
                credential_protection = (
                    "WINDOWS_CREDENTIAL_MANAGER"
                    if windows and keyring is not None and not state.get("device_token")
                    else "WINDOWS_DPAPI"
                    if windows
                    else "FILESYSTEM_ONLY"
                )
            return {
                "paired": bool(state.get("device_id") and self._credential(state)),
                "device_id": state.get("device_id"),
                "device_label": state.get("device_label"),
                "user_email": state.get("user_email"),
                "queued_events": len(state.get("outbox") or []),
                "platform_configured": bool(self.platform_url),
                "credential_protection": credential_protection,
                "outbox_protection": "WINDOWS_DPAPI" if windows else "FILESYSTEM_ONLY",
            }

    def access_status(self) -> dict[str, Any]:
        """Return whether this device may run detection for an active account."""

        local = self.status()
        if not local["paired"]:
            return {
                **local,
                "authenticated": False,
                "detection_enabled": False,
                "platform_reachable": False,
                "access_message": "Pair this device with a BantAI account to enable detection.",
            }

        platform_status = self.platform_status()
        authenticated = bool(
            not platform_status["reachable"]
            or platform_status["device_authenticated"]
        )
        if platform_status["reachable"] and authenticated:
            message = "This device is paired with an active BantAI account."
        elif platform_status["reachable"]:
            message = "This device connection is expired or revoked. Disconnect it, then pair it again."
        else:
            message = "This device remains paired. Local detection is available while the shared service reconnects."
        return {
            **local,
            "authenticated": authenticated,
            "detection_enabled": authenticated,
            "platform_reachable": platform_status["reachable"],
            "access_message": message,
        }

    def unpair(self) -> dict[str, Any]:
        """Forget the current account and discard its unsent minimized events."""

        with self._lock:
            state = self._load()
            device_id = state.get("device_id")
            if (
                platform.system() == "Windows"
                and keyring is not None
                and device_id
                and state.get("credential_storage") != "WINDOWS_DPAPI"
            ):
                try:
                    keyring.delete_password(CREDENTIAL_SERVICE, str(device_id))
                except keyring.errors.PasswordDeleteError:
                    pass
                except Exception as exc:
                    raise CompanionError(
                        "Windows could not remove the BantAI device credential."
                    ) from exc
            self._save(self._empty())
            self._detail_contexts.clear()
            return self.status()

    @property
    def paired(self) -> bool:
        return bool(self.status()["paired"])

    def cloud_review(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            return self._request(path, payload)

    def submit_activity(self, event: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            state = self._load()
            if not self._credential(state):
                return {"submitted": False, "queued": False, "reason": "NOT_PAIRED"}
            pending = list(state.get("outbox") or [])
            pending.append(event)
            state["outbox"] = pending[-self.max_outbox_entries :]
            self._save(state)
            return self.flush()

    def remember_detail_context(self, context: dict[str, Any]) -> dict[str, Any]:
        """Keep one completed detection's sensitive context in RAM only."""

        with self._lock:
            client_event_id = str(context["client_event_id"])
            event_type = str(context["event_type"])
            self._detail_contexts.pop(client_event_id, None)
            self._detail_contexts[client_event_id] = dict(context)
            same_type_ids = [
                context_id
                for context_id, saved_context in self._detail_contexts.items()
                if saved_context.get("event_type") == event_type
            ]
            while len(same_type_ids) > self.max_detail_contexts_per_type:
                self._detail_contexts.pop(same_type_ids.pop(0), None)
            return {"remembered": True, "stored": False}

    def explain_activity(self, activity_id: str, client_event_id: str) -> dict[str, Any]:
        """Forward explicit full context for an owner-checked activity."""

        with self._lock:
            context = self._detail_contexts.get(client_event_id)
            if context is None:
                return self._request(
                    "/cloud-review/activity-explanation-fallback",
                    {
                        "activity_id": activity_id,
                        "client_event_id": client_event_id,
                    },
                )
            payload = {
                **context,
                "activity_id": activity_id,
                "client_event_id": client_event_id,
            }
            return self._request("/cloud-review/activity-explanation", payload)

    def submit_url_feedback(self, feedback: dict[str, Any]) -> dict[str, Any]:
        """Flush the matching minimized activity before forwarding explicit feedback."""

        with self._lock:
            state = self._load()
            if not self._credential(state):
                raise CompanionError("Pair BantAI before submitting feedback.")
            for _ in range(5):
                delivery = self.flush()
                if not delivery.get("submitted") or not delivery.get("remaining"):
                    break
            return self._request("/url-reports/from-device-activity", feedback)

    def submit_email_feedback(self, feedback: dict[str, Any]) -> dict[str, Any]:
        """Flush activity before forwarding an explicitly confirmed email report."""

        with self._lock:
            state = self._load()
            if not self._credential(state):
                raise CompanionError("Pair BantAI before submitting feedback.")
            for _ in range(5):
                delivery = self.flush()
                if not delivery.get("submitted") or not delivery.get("remaining"):
                    break
            return self._request("/email-reports/from-device-activity", feedback)

    def submit_automatic_training_sample(self, sample: dict[str, Any]) -> dict[str, Any]:
        """Randomly forward opted-in content without placing it in the retry outbox."""

        with self._lock:
            now = monotonic()
            consent = self._training_consent_cache
            if now >= float(consent.get("expires_at", 0)):
                try:
                    result = self._get("/training-consent/device")
                except CompanionError:
                    return {"selected": False, "submitted": False, "reason": "CONSENT_UNAVAILABLE"}
                consent = {
                    "expires_at": now + 60,
                    "enabled": bool(result.get("enabled")),
                    "sample_rate_percent": int(result.get("sample_rate_percent") or 0),
                }
                self._training_consent_cache = consent
            if not consent.get("enabled"):
                return {"selected": False, "submitted": False, "reason": "NOT_ENABLED"}
            rate = max(0, min(100, int(consent.get("sample_rate_percent") or 0)))
            if secrets.randbelow(10_000) >= rate * 100:
                return {"selected": False, "submitted": False, "reason": "NOT_SELECTED"}
            try:
                result = self._request("/training-samples", sample)
            except CompanionError:
                return {"selected": True, "submitted": False, "reason": "SERVICE_UNAVAILABLE"}
            return {"selected": True, "submitted": bool(result.get("accepted")), **result}

    def flush(self) -> dict[str, Any]:
        with self._lock:
            state = self._load()
            pending = list(state.get("outbox") or [])
            if not pending:
                return {"submitted": True, "queued": False, "remaining": 0}
            try:
                result = self._request("/activities", {"events": pending[:100]})
            except CompanionError:
                return {"submitted": False, "queued": True, "remaining": len(pending)}
            state["outbox"] = pending[100:]
            self._save(state)
            return {"submitted": True, "queued": bool(state["outbox"]), "remaining": len(state["outbox"]), **result}


companion_manager = CompanionManager()
