"""Bounded in-memory TTL caches using hashes rather than raw email bodies."""

from __future__ import annotations

import hashlib
import re
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Generic, TypeVar


T = TypeVar("T")


def normalized_email_fingerprint(
    *,
    provider: str,
    sender: str | None,
    subject: str,
    body: str,
) -> str:
    normalize = lambda value: re.sub(r"\s+", " ", value or "").strip().casefold()
    digest = hashlib.sha256()
    for value in (provider, sender or "", subject, body):
        digest.update(normalize(value).encode("utf-8"))
        digest.update(b"\x1f")
    return digest.hexdigest()


def normalized_url_fingerprint(*, hostname: str, model_signal: str) -> str:
    digest = hashlib.sha256()
    digest.update(b"url\x1f")
    digest.update(str(hostname or "").strip().casefold().encode("utf-8"))
    digest.update(b"\x1f")
    digest.update(str(model_signal or "").strip().upper().encode("utf-8"))
    return digest.hexdigest()


@dataclass
class _Entry(Generic[T]):
    expires_at: float
    value: T


class TTLCache(Generic[T]):
    def __init__(self, *, ttl_seconds: float = 600.0, max_entries: int = 128):
        self.ttl_seconds = max(1.0, float(ttl_seconds))
        self.max_entries = max(1, int(max_entries))
        self._entries: OrderedDict[str, _Entry[T]] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: str) -> T | None:
        now = time.monotonic()
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None
            if entry.expires_at <= now:
                del self._entries[key]
                return None
            self._entries.move_to_end(key)
            return entry.value

    def set(self, key: str, value: T) -> None:
        with self._lock:
            self._entries[key] = _Entry(
                expires_at=time.monotonic() + self.ttl_seconds,
                value=value,
            )
            self._entries.move_to_end(key)
            while len(self._entries) > self.max_entries:
                self._entries.popitem(last=False)
