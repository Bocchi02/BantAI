"""Local BantAI Companion pairing and privacy-minimized delivery state."""

from __future__ import annotations

import base64
import ctypes
import json
import os
import platform
import threading
import urllib.error
import urllib.request
from ctypes import wintypes
from pathlib import Path
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

    def __init__(self) -> None:
        local_data = os.getenv("LOCALAPPDATA") or str(Path.home())
        self.state_path = Path(
            os.getenv("BANTAI_COMPANION_STATE_PATH", str(Path(local_data) / "BantAI" / "companion.dat"))
        )
        self.platform_url = os.getenv("BANTAI_PLATFORM_API", "").rstrip("/")
        self._lock = threading.RLock()

    def _empty(self) -> dict[str, Any]:
        return {"device_id": None, "device_token": None, "device_label": None, "user_email": None, "outbox": []}

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
            return keyring.get_password(CREDENTIAL_SERVICE, str(device_id))
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
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
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
            if platform.system() == "Windows" and keyring is None:
                raise CompanionError("Windows Credential Manager support is not installed.")
            result = self._request(
                "/pairing/consume",
                {"code": code.strip().upper(), "device_label": device_label.strip()},
                authenticated=False,
            )
            state = self._load()
            previous_device_id = state.get("device_id")
            if platform.system() == "Windows" and keyring is not None:
                if previous_device_id:
                    try:
                        keyring.delete_password(CREDENTIAL_SERVICE, str(previous_device_id))
                    except keyring.errors.PasswordDeleteError:
                        pass
                keyring.set_password(CREDENTIAL_SERVICE, str(result["device_id"]), result["device_token"])
            state.update(
                {
                    "device_id": result["device_id"],
                    "device_token": result["device_token"] if platform.system() != "Windows" else None,
                    "device_label": device_label.strip(),
                    "user_email": result.get("user_email"),
                }
            )
            self._save(state)
            return self.status()

    def status(self) -> dict[str, Any]:
        with self._lock:
            state = self._load()
            return {
                "paired": bool(state.get("device_id") and self._credential(state)),
                "device_id": state.get("device_id"),
                "device_label": state.get("device_label"),
                "user_email": state.get("user_email"),
                "queued_events": len(state.get("outbox") or []),
                "platform_configured": bool(self.platform_url),
                "credential_protection": "WINDOWS_CREDENTIAL_MANAGER" if platform.system() == "Windows" else "FILESYSTEM_ONLY",
                "outbox_protection": "WINDOWS_DPAPI" if platform.system() == "Windows" else "FILESYSTEM_ONLY",
            }

    def unpair(self) -> dict[str, Any]:
        """Forget the current account and discard its unsent minimized events."""

        with self._lock:
            state = self._load()
            device_id = state.get("device_id")
            if platform.system() == "Windows" and keyring is not None and device_id:
                try:
                    keyring.delete_password(CREDENTIAL_SERVICE, str(device_id))
                except keyring.errors.PasswordDeleteError:
                    pass
                except Exception as exc:
                    raise CompanionError(
                        "Windows could not remove the BantAI device credential."
                    ) from exc
            self._save(self._empty())
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
