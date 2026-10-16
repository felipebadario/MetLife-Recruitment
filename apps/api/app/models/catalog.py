"""Catálogos configuráveis que traduzem valores das planilhas em categorias usadas nos indicadores.

Princípio: o sistema nunca adivinha. Todo valor bruto recebido por importação é guardado
como veio; a tradução para status, etapa do funil, motivo de insucesso ou categoria de perfil
acontece por meio destas tabelas, mantidas pelo administrador. Valor sem mapeamento fica
classificado como "não mapeado" até ser revisado.
"""

from __future__ import annotations

import enum

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, JSONType, TimestampMixin


class ProcessOutcome(str, enum.Enum):
    """Códigos das classificações que vêm cadastradas (seções 5.1 e 7.1 do briefing).

    As classificações em si ficam na tabela `outcome_categories` e o administrador pode
    criar, renomear e excluir. Só "unmapped" (não classificado) é fixa: é o estado inicial
    de todo status. Quais status pertencem a cada classificação é regra de negócio pendente
    de validação — ver docs/pending-validations.md.
    """

    IN_PROGRESS = "in_progress"
    APPROVED = "approved"
    REJECTED = "rejected"
    HIRED = "hired"
    WITHDRAWN = "withdrawn"
    UNMAPPED = "unmapped"


UNMAPPED_OUTCOME = ProcessOutcome.UNMAPPED.value


class OutcomeCategory(TimestampMixin, Base):
    """Classificação de resultado (ex.: Aprovado, Contratado), mantida pelo administrador."""

    __tablename__ = "outcome_categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Código estável: é o que os status e as fórmulas dos indicadores guardam.
    code: Mapped[str] = mapped_column(String(32), unique=True)
    label: Mapped[str] = mapped_column(String(60))
    color: Mapped[str] = mapped_column(String(7))
    position: Mapped[int] = mapped_column(Integer, default=0)
    # Classificação do sistema ("não classificado"): não pode ser excluída.
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)


class FunnelStage(TimestampMixin, Base):
    __tablename__ = "funnel_stages"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True)
    label: Mapped[str] = mapped_column(String(120))
    position: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_provisional: Mapped[bool] = mapped_column(Boolean, default=True)


class ProcessStatus(TimestampMixin, Base):
    """Status normalizado do processo seletivo."""

    __tablename__ = "process_statuses"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True)
    label: Mapped[str] = mapped_column(String(120))
    # Rótulo curto opcional, só para exibição. Não é usado para reconhecer valores da planilha.
    abbreviation: Mapped[str | None] = mapped_column(String(32))
    # Código de uma classificação (outcome_categories.code).
    outcome: Mapped[str] = mapped_column(String(32), default=UNMAPPED_OUTCOME)
    funnel_stage_id: Mapped[int | None] = mapped_column(
        ForeignKey("funnel_stages.id", ondelete="SET NULL")
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_provisional: Mapped[bool] = mapped_column(Boolean, default=True)
    description: Mapped[str | None] = mapped_column(Text)

    funnel_stage: Mapped[FunnelStage | None] = relationship()


class StatusMapping(TimestampMixin, Base):
    """Valor bruto de status da planilha → status normalizado."""

    __tablename__ = "status_mappings"

    id: Mapped[int] = mapped_column(primary_key=True)
    raw_value: Mapped[str] = mapped_column(String(255))
    normalized_key: Mapped[str] = mapped_column(String(255), unique=True)
    status_id: Mapped[int] = mapped_column(ForeignKey("process_statuses.id", ondelete="CASCADE"))

    status: Mapped[ProcessStatus] = relationship()


class LossReason(TimestampMixin, Base):
    """Motivo de insucesso normalizado."""

    __tablename__ = "loss_reasons"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True)
    label: Mapped[str] = mapped_column(String(160))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_provisional: Mapped[bool] = mapped_column(Boolean, default=True)


class LossReasonMapping(TimestampMixin, Base):
    __tablename__ = "loss_reason_mappings"

    id: Mapped[int] = mapped_column(primary_key=True)
    raw_value: Mapped[str] = mapped_column(String(255))
    normalized_key: Mapped[str] = mapped_column(String(255), unique=True)
    loss_reason_id: Mapped[int] = mapped_column(ForeignKey("loss_reasons.id", ondelete="CASCADE"))

    loss_reason: Mapped[LossReason] = relationship()


class ValueMapping(TimestampMixin, Base):
    """Mapeamento genérico para dimensões de perfil (escolaridade, faixa de renda, experiências...).

    Ex.: field="education", raw "Superior Completo" / "superior completo" → "Superior completo".
    """

    __tablename__ = "value_mappings"
    __table_args__ = (UniqueConstraint("field", "normalized_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    field: Mapped[str] = mapped_column(String(64), index=True)
    raw_value: Mapped[str] = mapped_column(String(255))
    normalized_key: Mapped[str] = mapped_column(String(255))
    normalized_value: Mapped[str] = mapped_column(String(160))


class MetricDefinition(TimestampMixin, Base):
    """Fórmula configurável de um indicador: numerador e denominador por categoria de resultado."""

    __tablename__ = "metric_definitions"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True)
    label: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    numerator_outcomes: Mapped[list] = mapped_column(JSONType, default=list)
    denominator_outcomes: Mapped[list] = mapped_column(JSONType, default=list)
    # Abaixo deste volume, a taxa é exibida com alerta de amostra pequena.
    min_sample_size: Mapped[int] = mapped_column(Integer, default=30)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Falso até a regra ser validada pela área de negócio.
    is_validated: Mapped[bool] = mapped_column(Boolean, default=False)
