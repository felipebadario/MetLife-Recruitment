"""Filtros salvos e fontes de integração (Microsoft Graph)."""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, TimestampMixin, str_enum


class SavedFilter(TimestampMixin, Base):
    __tablename__ = "saved_filters"
    __table_args__ = (UniqueConstraint("user_id", "scope", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    scope: Mapped[str] = mapped_column(String(32))  # "candidates" | "performance"
    name: Mapped[str] = mapped_column(String(120))
    definition: Mapped[dict] = mapped_column(JSONType)
    is_shared: Mapped[bool] = mapped_column(Boolean, default=False)


class IntegrationKind(str, enum.Enum):
    SHAREPOINT = "sharepoint"
    ONEDRIVE = "onedrive"
    OUTLOOK = "outlook"


class IntegrationSource(TimestampMixin, Base):
    """Configuração não secreta de uma origem automática de planilhas.

    Credenciais (client secret, certificado) NUNCA ficam aqui: só em variáveis de
    ambiente / cofre de segredos do backend.
    """

    __tablename__ = "integration_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[IntegrationKind] = mapped_column(str_enum(IntegrationKind, 16))
    name: Mapped[str] = mapped_column(String(120))
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    config: Mapped[dict | None] = mapped_column(JSONType)  # site/drive/pasta/caixa de e-mail
    delta_token: Mapped[str | None] = mapped_column(Text)
    subscription_id: Mapped[str | None] = mapped_column(String(255))
    subscription_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
