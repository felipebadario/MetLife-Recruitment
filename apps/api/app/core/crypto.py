"""Proteção de dados pessoais: CPF criptografado, hash para deduplicação e mascaramento."""

from __future__ import annotations

import base64
import hashlib
import hmac
import re
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings

_NON_DIGITS = re.compile(r"\D")


@lru_cache
def _fernet() -> Fernet:
    key = get_settings().field_encryption_key
    try:
        return Fernet(key.encode())
    except ValueError:
        # Valor que não é uma chave Fernet (ex.: segredo gerado pela hospedagem):
        # deriva uma chave de 32 bytes de forma determinística.
        derived = base64.urlsafe_b64encode(hashlib.sha256(key.encode()).digest())
        return Fernet(derived)


def encrypt_value(value: str) -> str:
    return _fernet().encrypt(value.encode("utf-8")).decode()


def decrypt_value(token: str) -> str | None:
    try:
        return _fernet().decrypt(token.encode()).decode("utf-8")
    except (InvalidToken, ValueError):
        return None


def normalize_cpf(value: str | None) -> str | None:
    """Mantém apenas dígitos; completa zeros à esquerda (Excel costuma removê-los)."""
    if value is None:
        return None
    digits = _NON_DIGITS.sub("", str(value))
    if not digits or len(digits) > 11:
        return None
    return digits.zfill(11)


def is_valid_cpf(value: str | None) -> bool:
    cpf = normalize_cpf(value)
    if cpf is None or cpf == cpf[0] * 11:
        return False
    for size in (9, 10):
        total = sum(int(cpf[i]) * (size + 1 - i) for i in range(size))
        check = (total * 10) % 11 % 10
        if check != int(cpf[size]):
            return False
    return True


def cpf_hash(cpf: str) -> str:
    """HMAC-SHA256 do CPF normalizado. Permite encontrar duplicidades sem guardar o CPF em claro."""
    key = get_settings().cpf_hash_key.encode()
    return hmac.new(key, cpf.encode(), hashlib.sha256).hexdigest()


def mask_cpf(cpf: str | None) -> str | None:
    """000.000.000-00 → ***.***.*00-00"""
    cpf = normalize_cpf(cpf)
    if cpf is None:
        return None
    return f"***.***.*{cpf[7:9]}-{cpf[9:]}"


def format_cpf(cpf: str | None) -> str | None:
    cpf = normalize_cpf(cpf)
    if cpf is None:
        return None
    return f"{cpf[:3]}.{cpf[3:6]}.{cpf[6:9]}-{cpf[9:]}"


def mask_email(email: str | None) -> str | None:
    if not email or "@" not in email:
        return email
    local, domain = email.split("@", 1)
    visible = local[:2] if len(local) > 2 else local[:1]
    return f"{visible}{'*' * max(len(local) - len(visible), 1)}@{domain}"


def mask_phone(phone: str | None) -> str | None:
    if not phone:
        return phone
    digits = _NON_DIGITS.sub("", phone)
    if len(digits) < 4:
        return "****"
    return f"(**) *****-{digits[-4:]}"
