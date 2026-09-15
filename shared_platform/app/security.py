from __future__ import annotations

import base64
import hashlib
import hmac
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import settings


password_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)

# A stable, synthetic Argon2id hash keeps the unknown-account login path at the
# same password-verification cost without tying it to any real account.
DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=2$1VSwAdLYLNzz5auxsmy+uw$Z8VHnAmM3aXSfgQbIZWXTw2t6Tt5ildogbe42xeJDGA"


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return password_hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def random_token(bytes_count: int = 32) -> str:
    return secrets.token_urlsafe(bytes_count)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def blind_index(value: str, purpose: str) -> str:
    """Create a deterministic, keyed lookup without storing searchable clear text."""

    payload = f"{purpose}\0{value}".encode("utf-8")
    return hmac.new(_encryption_key(), payload, hashlib.sha256).hexdigest()


def pairing_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(8))


def _encryption_key() -> bytes:
    configured = settings.encryption_key.strip()
    if not configured:
        raise RuntimeError("BANTAI_ENCRYPTION_KEY must be configured.")
    try:
        key = base64.urlsafe_b64decode(configured + "=" * (-len(configured) % 4))
    except ValueError as exc:
        raise RuntimeError("BANTAI_ENCRYPTION_KEY is invalid.") from exc
    if len(key) != 32:
        raise RuntimeError("BANTAI_ENCRYPTION_KEY must decode to 32 bytes.")
    return key


def encrypt_text(value: str | None) -> str | None:
    if value is None:
        return None
    nonce = secrets.token_bytes(12)
    encrypted = AESGCM(_encryption_key()).encrypt(nonce, value.encode("utf-8"), b"bantai-activity-v1")
    return base64.urlsafe_b64encode(nonce + encrypted).decode("ascii")


def decrypt_text(value: str | None) -> str | None:
    if value is None:
        return None
    payload = base64.urlsafe_b64decode(value.encode("ascii"))
    clear = AESGCM(_encryption_key()).decrypt(payload[:12], payload[12:], b"bantai-activity-v1")
    return clear.decode("utf-8")
