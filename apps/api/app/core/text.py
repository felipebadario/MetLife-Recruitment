"""Normalização de textos vindos das planilhas."""

from __future__ import annotations

import re
import unicodedata

_SPACES = re.compile(r"\s+")
_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def clean(value: object) -> str | None:
    """Texto como exibido: sem espaços sobrando. Vazio vira None."""
    if value is None:
        return None
    text = _SPACES.sub(" ", str(value)).strip()
    return text or None


def strip_accents(value: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", value) if not unicodedata.combining(c)
    )


def normalize_key(value: object) -> str:
    """Chave de comparação: minúsculas, sem acentos e com espaços simples.

    "  Superior  Completo " e "superior completo" → "superior completo".
    """
    text = clean(value) or ""
    return strip_accents(text).lower()


def slug(value: object, max_length: int = 64) -> str:
    """Identificador estável: "C3 Assessoria" → "C3-ASSESSORIA"."""
    key = _NON_ALNUM.sub("-", normalize_key(value)).strip("-")
    return (key.upper() or "SEM-NOME")[:max_length].rstrip("-")
