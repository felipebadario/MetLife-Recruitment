from __future__ import annotations

from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

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
