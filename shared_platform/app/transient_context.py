"""Bounded process-memory storage for raw inference context and recent results."""

from __future__ import annotations

from collections import OrderedDict
from copy import deepcopy
from dataclasses import dataclass
from threading import Lock
from time import monotonic
from typing import Any

from .config import settings


@dataclass
class _Entry:
    expires_at: float
    value: dict[str, Any]


class TransientDetectionStore:
    def __init__(self, ttl_seconds: int, max_entries: int) -> None:
        self.ttl_seconds = max(1, ttl_seconds)
        self.max_entries = max(1, max_entries)
        self._entries: OrderedDict[tuple[str, str, str], _Entry] = OrderedDict()
        self._lock = Lock()

    def _purge(self, now: float) -> None:
        expired = [key for key, entry in self._entries.items() if entry.expires_at <= now]
        for key in expired:
            self._entries.pop(key, None)

    def put(self, user_id: str, device_id: str, detection_id: str, value: dict[str, Any]) -> None:
        key = (user_id, device_id, detection_id)
        now = monotonic()
        with self._lock:
            self._purge(now)
            self._entries.pop(key, None)
            self._entries[key] = _Entry(now + self.ttl_seconds, deepcopy(value))
            while len(self._entries) > self.max_entries:
                self._entries.popitem(last=False)

    def get(self, user_id: str, device_id: str, detection_id: str) -> dict[str, Any] | None:
        key = (user_id, device_id, detection_id)
        now = monotonic()
        with self._lock:
            self._purge(now)
            entry = self._entries.get(key)
            if entry is None:
                return None
            self._entries.move_to_end(key)
            return deepcopy(entry.value)

    def clear_device(self, user_id: str, device_id: str) -> None:
        with self._lock:
            for key in [key for key in self._entries if key[:2] == (user_id, device_id)]:
                self._entries.pop(key, None)


transient_detections = TransientDetectionStore(
    settings.transient_context_ttl_seconds,
    settings.transient_context_max_entries,
)
