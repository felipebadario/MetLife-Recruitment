from __future__ import annotations

from app.core.crypto import (
    cpf_hash,
    decrypt_value,
    encrypt_value,
    format_cpf,
    is_valid_cpf,
    mask_cpf,
    mask_email,
    mask_phone,
    normalize_cpf,
)
from app.core.security import hash_password, verify_password

# CPFs fictícios, gerados apenas para teste (dígitos verificadores válidos).
VALID_CPF = "529.982.247-25"


def test_cpf_normalization_and_validation():
    assert normalize_cpf(VALID_CPF) == "52998224725"
    assert normalize_cpf("1234567890") == "01234567890"  # zero à esquerda perdido no Excel
    assert is_valid_cpf(VALID_CPF)
    assert not is_valid_cpf("529.982.247-24")
    assert not is_valid_cpf("111.111.111-11")
    assert not is_valid_cpf(None)


def test_cpf_hash_is_stable_and_format_independent():
    assert cpf_hash(normalize_cpf(VALID_CPF)) == cpf_hash(normalize_cpf("52998224725"))


def test_masking():
    assert mask_cpf(VALID_CPF) == "***.***.*47-25"
    assert format_cpf("52998224725") == VALID_CPF
    assert mask_email("joana.silva@example.com") == "jo*********@example.com"
    assert mask_phone("(11) 98765-4321") == "(**) *****-4321"


def test_field_encryption_roundtrip():
    token = encrypt_value("52998224725")
    assert "52998224725" not in token
    assert decrypt_value(token) == "52998224725"
    assert decrypt_value("token-invalido") is None


def test_password_hashing():
    encoded = hash_password("SenhaForte123")
    assert encoded.startswith("scrypt$")
    assert verify_password("SenhaForte123", encoded)
    assert not verify_password("SenhaForte124", encoded)
    assert not verify_password("SenhaForte123", "lixo")
