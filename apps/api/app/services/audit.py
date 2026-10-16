from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from fastapi import Request
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import utcnow
from app.models import AuditLog, User


class AuditAction:
    """Catálogo de ações auditadas. Use estas constantes em vez de strings soltas."""

    LOGIN_SUCCESS = "auth.login_success"
    LOGIN_FAILED = "auth.login_failed"
    LOGIN_LOCKED = "auth.login_locked"
    LOGOUT = "auth.logout"
    PASSWORD_CHANGED = "auth.password_changed"  # noqa: S105 (nome de ação, não senha)
    USER_CREATED = "user.created"
    USER_UPDATED = "user.updated"
    USER_PASSWORD_RESET = "user.password_reset"  # noqa: S105
    ACCESS_DENIED = "security.access_denied"
    AUDIT_PURGED = "audit.purged"


# Eventos de acesso: alto volume, retenção curta. Bloqueio de conta fica na retenção longa,
# por ser sinal de incidente de segurança.
ACCESS_ACTIONS = (
    AuditAction.LOGIN_SUCCESS,
    AuditAction.LOGIN_FAILED,
    AuditAction.LOGOUT,
    AuditAction.ACCESS_DENIED,
)


def client_ip(request: Request | None) -> str | None:
    if request is None or request.client is None:
        return None
    return request.client.host


def record_audit(
    db: Session,
    *,
    action: str,
    request: Request | None = None,
    actor: User | None = None,
    actor_email: str | None = None,
    entity_type: str | None = None,
    entity_id: str | int | None = None,
    details: dict[str, Any] | None = None,
    commit: bool = True,
) -> AuditLog:
    """Registra um evento de auditoria. Nunca grave senhas, tokens ou CPF em claro em `details`."""
    entry = AuditLog(
        user_id=actor.id if actor else None,
        actor_email=actor.email if actor else actor_email,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        details=details,
        ip_address=client_ip(request),
        user_agent=(request.headers.get("user-agent", "")[:255] or None) if request else None,
    )
    db.add(entry)
    if commit:
        db.commit()
    return entry


def purge_audit_logs(db: Session, now: datetime | None = None) -> dict[str, int]:
    """Apaga registros de auditoria além do prazo de retenção e registra a limpeza."""
    settings = get_settings()
    now = now or utcnow()
    access_cutoff = now - timedelta(days=settings.audit_access_retention_days)
    other_cutoff = now - timedelta(days=settings.audit_retention_days)
    access = db.execute(
        delete(AuditLog).where(AuditLog.action.in_(ACCESS_ACTIONS), AuditLog.created_at < access_cutoff)
    ).rowcount or 0
    other = db.execute(
        delete(AuditLog).where(AuditLog.action.not_in(ACCESS_ACTIONS), AuditLog.created_at < other_cutoff)
    ).rowcount or 0
    result = {"access_removed": access, "other_removed": other}
    if access or other:
        record_audit(
            db,
            action=AuditAction.AUDIT_PURGED,
            entity_type="audit_log",
            details={
                **result,
                "access_retention_days": settings.audit_access_retention_days,
                "retention_days": settings.audit_retention_days,
            },
            commit=False,
        )
    db.commit()
    return result
