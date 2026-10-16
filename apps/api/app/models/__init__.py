"""Importa todos os modelos para que o metadata do SQLAlchemy (e o Alembic) os enxerguem."""

from app.models.agency import Agency
from app.models.application import (
    Application,
    ApplicationFieldChange,
    ApplicationStatusHistory,
    ChangeSource,
    InternalNote,
)
from app.models.audit import AuditLog
from app.models.candidate import Candidate
from app.models.catalog import (
    UNMAPPED_OUTCOME,
    FunnelStage,
    ImportColumn,
    LossReason,
    LossReasonMapping,
    MetricDefinition,
    OutcomeCategory,
    ProcessOutcome,
    ProcessStatus,
    StatusMapping,
    ValueMapping,
)
from app.models.imports import (
    ImportBatch,
    ImportIssue,
    ImportRow,
    ImportSource,
    ImportStatus,
    IssueSeverity,
    RowOutcome,
)
from app.models.platform import IntegrationKind, IntegrationSource, SavedFilter
from app.models.user import User, UserRole

__all__ = [
    "Agency",
    "Application",
    "ApplicationFieldChange",
    "ApplicationStatusHistory",
    "AuditLog",
    "Candidate",
    "ChangeSource",
    "FunnelStage",
    "ImportBatch",
    "ImportColumn",
    "ImportIssue",
    "ImportRow",
    "ImportSource",
    "ImportStatus",
    "IntegrationKind",
    "IntegrationSource",
    "InternalNote",
    "IssueSeverity",
    "LossReason",
    "LossReasonMapping",
    "MetricDefinition",
    "OutcomeCategory",
    "ProcessOutcome",
    "ProcessStatus",
    "RowOutcome",
    "SavedFilter",
    "StatusMapping",
    "UNMAPPED_OUTCOME",
    "User",
    "UserRole",
    "ValueMapping",
]
