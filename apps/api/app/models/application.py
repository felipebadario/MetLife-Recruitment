"""Candidatura: a participação de um candidato em um processo seletivo, indicada por uma agência.

Convenção de colunas:
- *_raw  → valor exatamente como veio da planilha (rastreabilidade);
- *_norm → valor normalizado via catálogos (usado em filtros e indicadores).

A lista de campos reflete o levantamento inicial feito por imagens da planilha
(seção 5.3 do briefing) e será revisada quando o arquivo Excel original chegar.
Qualquer coluna extra da planilha fica preservada em raw_payload.
"""

from __future__ import annotations

import enum
from datetime import date, datetime, time
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, JSONType, TimestampMixin, str_enum, utc_now

if TYPE_CHECKING:
    from app.models.agency import Agency
    from app.models.candidate import Candidate
    from app.models.catalog import LossReason, ProcessStatus
    from app.models.user import User


class Application(TimestampMixin, Base):
    __tablename__ = "applications"
    __table_args__ = (
        Index("ix_applications_agency_registered", "agency_id", "registered_at"),
        Index("ix_applications_status_registered", "status_id", "registered_at"),
        Index("ix_applications_agency_external", "agency_id", "external_record_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_id: Mapped[int] = mapped_column(
        ForeignKey("candidates.id", ondelete="RESTRICT"), index=True
    )
    agency_id: Mapped[int] = mapped_column(
        ForeignKey("agencies.id", ondelete="RESTRICT"), index=True
    )

    # IDENTIFICAÇÃO
    # "ID" da planilha: número do cadastro no site, usado como chave da candidatura.
    external_record_id: Mapped[str | None] = mapped_column(String(100), index=True)
    registered_at: Mapped[date | None] = mapped_column(Date, index=True)  # "Cadastro no site" (dia)
    site_registered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # TURMA — vem do título da planilha (ex.: "SAFEE T61 - Prova 21/01/26")
    cohort_name: Mapped[str | None] = mapped_column(String(120), index=True)
    exam_date: Mapped[date | None] = mapped_column(Date, index=True)

    # ORIGEM
    agency_branch_raw: Mapped[str | None] = mapped_column(String(100))  # coluna "Agência" (código)
    regional_raw: Mapped[str | None] = mapped_column(String(200))
    regional_norm: Mapped[str | None] = mapped_column(String(160), index=True)
    sub_representative_raw: Mapped[str | None] = mapped_column(String(200))
    sub_representative_norm: Mapped[str | None] = mapped_column(String(160), index=True)
    origin_raw: Mapped[str | None] = mapped_column(String(200))
    origin_norm: Mapped[str | None] = mapped_column(String(160))

    # PERFIL PROFISSIONAL (snapshot desta candidatura — pode mudar entre processos)
    company_segment_raw: Mapped[str | None] = mapped_column(String(200))
    company_segment_norm: Mapped[str | None] = mapped_column(String(160))
    activity_segment_raw: Mapped[str | None] = mapped_column(String(200))
    activity_segment_norm: Mapped[str | None] = mapped_column(String(160))
    occupation_raw: Mapped[str | None] = mapped_column(String(200))
    education_raw: Mapped[str | None] = mapped_column(String(200))
    education_norm: Mapped[str | None] = mapped_column(String(160), index=True)
    income_band_raw: Mapped[str | None] = mapped_column(String(200))
    income_band_norm: Mapped[str | None] = mapped_column(String(160), index=True)
    exp_entrepreneurship_raw: Mapped[str | None] = mapped_column(String(200))
    exp_entrepreneurship_norm: Mapped[str | None] = mapped_column(String(160))
    exp_sales_raw: Mapped[str | None] = mapped_column(String(200))
    exp_sales_norm: Mapped[str | None] = mapped_column(String(160), index=True)
    exp_life_insurance_raw: Mapped[str | None] = mapped_column(String(200))
    exp_life_insurance_norm: Mapped[str | None] = mapped_column(String(160), index=True)

    # PROCESSO SELETIVO
    commercial_evaluation_raw: Mapped[str | None] = mapped_column(String(200))
    evaluator_name: Mapped[str | None] = mapped_column(String(200))
    evaluation_date: Mapped[date | None] = mapped_column(Date)
    evaluation_time: Mapped[time | None] = mapped_column(Time)
    status_raw: Mapped[str | None] = mapped_column(String(200))
    status_ens_raw: Mapped[str | None] = mapped_column(String(200))
    status_final_raw: Mapped[str | None] = mapped_column(String(200))
    executive_raw: Mapped[str | None] = mapped_column(String(200))
    suspended_raw: Mapped[str | None] = mapped_column(String(50))
    exams_count: Mapped[int | None] = mapped_column(Integer)
    status_id: Mapped[int | None] = mapped_column(
        ForeignKey("process_statuses.id", ondelete="SET NULL")
    )
    status_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    loss_reason_raw: Mapped[str | None] = mapped_column(String(255))
    loss_reason_id: Mapped[int | None] = mapped_column(
        ForeignKey("loss_reasons.id", ondelete="SET NULL"), index=True
    )
    relationship_program_raw: Mapped[str | None] = mapped_column(String(200))
    susep_active_raw: Mapped[str | None] = mapped_column(String(50))
    susep_number: Mapped[str | None] = mapped_column(String(50))
    is_paused_raw: Mapped[str | None] = mapped_column(String(50))
    pause_reason_raw: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)  # "Observações" vindas da planilha
    # Campos criados em Administração > Padrão da planilha: {chave: texto como veio}.
    custom_fields: Mapped[dict | None] = mapped_column(JSONType)

    # RASTREABILIDADE
    raw_payload: Mapped[dict | None] = mapped_column(JSONType)
    row_hash: Mapped[str | None] = mapped_column(String(64))
    first_import_batch_id: Mapped[int | None] = mapped_column(
        ForeignKey("import_batches.id", ondelete="SET NULL")
    )
    last_import_batch_id: Mapped[int | None] = mapped_column(
        ForeignKey("import_batches.id", ondelete="SET NULL")
    )
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    candidate: Mapped[Candidate] = relationship(back_populates="applications")
    agency: Mapped[Agency] = relationship()
    status: Mapped[ProcessStatus | None] = relationship()
    loss_reason: Mapped[LossReason | None] = relationship()


class ChangeSource(str, enum.Enum):
    IMPORT = "import"
    MANUAL = "manual"
    SYSTEM = "system"
    DEMO = "demo"


class ApplicationStatusHistory(Base):
    __tablename__ = "application_status_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    from_status_raw: Mapped[str | None] = mapped_column(String(200))
    to_status_raw: Mapped[str | None] = mapped_column(String(200))
    from_status_id: Mapped[int | None] = mapped_column(
        ForeignKey("process_statuses.id", ondelete="SET NULL")
    )
    to_status_id: Mapped[int | None] = mapped_column(
        ForeignKey("process_statuses.id", ondelete="SET NULL")
    )
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, index=True
    )
    source: Mapped[ChangeSource] = mapped_column(str_enum(ChangeSource, 16))
    import_batch_id: Mapped[int | None] = mapped_column(
        ForeignKey("import_batches.id", ondelete="SET NULL")
    )
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    note: Mapped[str | None] = mapped_column(Text)


class ApplicationFieldChange(Base):
    """Alterações campo a campo recebidas por importação (aba Histórico)."""

    __tablename__ = "application_field_changes"

    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    import_batch_id: Mapped[int | None] = mapped_column(
        ForeignKey("import_batches.id", ondelete="SET NULL")
    )
    field: Mapped[str] = mapped_column(String(64))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class InternalNote(TimestampMixin, Base):
    """Observação interna registrada pela equipe (não vem da planilha)."""

    __tablename__ = "internal_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    body: Mapped[str] = mapped_column(Text)

    author: Mapped[User | None] = relationship()
