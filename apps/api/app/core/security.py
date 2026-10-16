"""Hash de senhas, tokens de sessão e política de senha.

Senhas usam scrypt (biblioteca padrão do Python, KDF com custo de memória),
com parâmetros alinhados às recomendações da OWASP (N=2^16, r=8, p=2).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt

from app.core.config import get_settings

_SCRYPT_N = 2**16
_SCRYPT_R = 8
_SCRYPT_P = 2
_SCRYPT_DKLEN = 64
_SCRYPT_MAXMEM = 256 * 1024 * 1024

PASSWORD_MIN_LENGTH = 10
PASSWORD_MAX_LENGTH = 128

JWT_ALGORITHM = "HS256"


def utcnow() -> datetime:
    return datetime.now(UTC)


def as_utc(value: datetime | None) -> datetime | None:
    """SQLite devolve datetimes sem fuso; tratamos todos como UTC."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=_SCRYPT_DKLEN,
        maxmem=_SCRYPT_MAXMEM,
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, n, r, p, salt, expected = encoded.split("$")
        if scheme != "scrypt":
            return False
        expected_bytes = _unb64(expected)
        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=_unb64(salt),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(expected_bytes),
            maxmem=_SCRYPT_MAXMEM,
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest, expected_bytes)


# Hash fixo usado para equalizar o tempo de resposta quando o e-mail não existe.
_DUMMY_HASH: str | None = None


def dummy_verify() -> None:
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = hash_password(secrets.token_urlsafe(16))
    verify_password("invalid-password", _DUMMY_HASH)


def password_policy_errors(password: str) -> list[str]:
    errors = []
    if len(password) < PASSWORD_MIN_LENGTH:
        errors.append(f"A senha deve ter pelo menos {PASSWORD_MIN_LENGTH} caracteres.")
    if len(password) > PASSWORD_MAX_LENGTH:
        errors.append(f"A senha deve ter no máximo {PASSWORD_MAX_LENGTH} caracteres.")
    if not any(c.isalpha() for c in password) or not any(c.isdigit() for c in password):
        errors.append("A senha deve conter letras e números.")
    return errors


_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


def _password_stamp(password_changed_at: datetime | None) -> int:
    """Instante da última troca de senha, em microssegundos (inteiro exato)."""
    value = as_utc(password_changed_at)
    return (value - _EPOCH) // timedelta(microseconds=1) if value else 0


def create_session_token(user_id: int, role: str, password_changed_at: datetime | None) -> str:
    settings = get_settings()
    now = utcnow()
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "role": role,
        "pwd": _password_stamp(password_changed_at),
        "iat": now,
        "exp": now + timedelta(hours=settings.session_hours),
        "jti": secrets.token_urlsafe(12),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=JWT_ALGORITHM)


def decode_session_token(token: str) -> dict[str, Any] | None:
    settings = get_settings()
    try:
        return jwt.decode(
            token,
            settings.secret_key,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "exp", "iat"]},
        )
    except jwt.PyJWTError:
        return None


def token_matches_password(payload: dict[str, Any], password_changed_at: datetime | None) -> bool:
    """Sessões emitidas antes de uma troca de senha deixam de valer."""
    return payload.get("pwd") == _password_stamp(password_changed_at)
