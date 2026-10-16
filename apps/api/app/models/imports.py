"""Controle de importações de planilhas (manual ou via Microsoft Graph)."""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, str_enum, utc_now


class ImportSource(str, enum.Enum):
    MANUAL = "manual"
    SHAREPOINT = "sharepoint"
    ONEDRIVE = "onedrive"
    OUTLOOK = "outlook"
    DEMO = "demo"


class ImportStatus(str, enum.Enum):
    RECEIVED = "received"
    PROCESSING = "processing"
    COMPLETED = "completed"
    COMPLETED_WITH_ERRORS = "completed_with_errors"
    FAILED = "failed"
    SKIPPED_DUPLICATE = "skipped_duplicate"


class RowOutcome(str, enum.Enum):
    PENDING = "pending"
    CREATED = "created"
    UPDATED = "updated"
    UNCHANGED = "unchanged"
    REJECTED = "rejected"


class IssueSeverity(str, enum.Enum):
    ERROR = "error"
    WARNING = "warning"


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[ImportSource] = mapped_column(str_enum(ImportSource, 16))
    status: Mapped[ImportStatus] = mapped_column(
        str_enum(ImportStatus, 32), default=ImportStatus.RECEIVED, index=True
    )

    file_name: Mapped[str] = mapped_column(String(255))
    # Idempotência: o mesmo arquivo (mesmo SHA-256) não é reprocessado sem pedido explícito.
    file_sha256: Mapped[str] = mapped_column(String(64), index=True)
    file_size: Mapped[int | None] = mapped_column(Integer)
    storage_path: Mapped[str | None] = mapped_column(String(500))
    # Origem externa (Graph): id do item e eTag, para não reprocessar o mesmo arquivo.
    external_id: Mapped[str | None] = mapped_column(String(255), index=True)
    external_etag: Mapped[str | None] = mapped_column(String(255))

    agency_id: Mapped[int | None] = mapped_column(
        ForeignKey("agencies.id", ondelete="SET NULL"), index=True
    )
    reference_period: Mapped[str | None] = mapped_column(String(7))  # AAAA-MM
    template_version: Mapped[str | None] = mapped_column(String(20))

    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, index=True
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    rows_total: Mapped[int] = mapped_column(Integer, default=0)
    rows_created: Mapped[int] = mapped_column(Integer, default=0)
    rows_updated: Mapped[int] = mapped_column(Integer, default=0)
    rows_unchanged: Mapped[int] = mapped_column(Integer, default=0)
    rows_rejected: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)

    triggered_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reprocess_of_id: Mapped[int | None] = mapped_column(
        ForeignKey("import_batches.id", ondelete="SET NULL")
    )


class ImportRow(Base):
    """Linha original da planilha (staging), preservada para rastreabilidade."""

    __tablename__ = "import_rows"

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[int] = mapped_column(
        ForeignKey("import_batches.id", ondelete="CASCADE"), index=True
    )
    row_number: Mapped[int] = mapped_column(Integer)
    raw: Mapped[dict] = mapped_column(JSONType)
    row_hash: Mapped[str] = mapped_column(String(64))
    outcome: Mapped[RowOutcome] = mapped_column(
        str_enum(RowOutcome, 16), default=RowOutcome.PENDING
    )
    application_id: Mapped[int | None] = mapped_column(
        ForeignKey("applications.id", ondelete="SET NULL")
    )


class ImportIssue(Base):
    """Inconsistência encontrada na importação (tabela import_errors do briefing)."""

    __tablename__ = "import_errors"

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[int] = mapped_column(
        ForeignKey("import_batches.id", ondelete="CASCADE"), index=True
    )
    row_number: Mapped[int | None] = mapped_column(Integer)
    field: Mapped[str | None] = mapped_column(String(64))
    code: Mapped[str] = mapped_column(String(64))
    severity: Mapped[IssueSeverity] = mapped_column(
        str_enum(IssueSeverity, 16), default=IssueSeverity.ERROR
    )
    message: Mapped[str] = mapped_column(Text)
    raw_value: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict | None] = mapped_column(JSONType)
