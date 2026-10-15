from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, JSONType, TimestampMixin, utc_now

if TYPE_CHECKING:
    from app.models.application import Application


class Candidate(TimestampMixin, Base):
    """Pessoa candidata — registro único, independente de quantas candidaturas tenha.

    O CPF nunca é armazenado em claro:
    - cpf_hash: HMAC-SHA256, usado para deduplicação;
    - cpf_encrypted: criptografado (Fernet), revelado apenas a administradores;
    - cpf_masked: versão mascarada, usada em listagens.
    """

    __tablename__ = "candidates"

    id: Mapped[int] = mapped_column(primary_key=True)
    cpf_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    cpf_encrypted: Mapped[str | None] = mapped_column(String(255))
    cpf_masked: Mapped[str | None] = mapped_column(String(14))

    full_name: Mapped[str] = mapped_column(String(200))
    # Nome em minúsculas e sem acentos, para busca.
    name_search: Mapped[str] = mapped_column(String(200), index=True)
    birth_date: Mapped[date | None] = mapped_column(Date)

    email: Mapped[str | None] = mapped_column(String(254), index=True)
    phone: Mapped[str | None] = mapped_column(String(32))
    address: Mapped[dict | None] = mapped_column(JSONType)
    linkedin_url: Mapped[str | None] = mapped_column(String(500))

    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    applications: Mapped[list[Application]] = relationship(back_populates="candidate")
