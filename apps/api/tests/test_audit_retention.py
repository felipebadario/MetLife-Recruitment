"""Retenção da auditoria: acessos ficam 90 dias; ações administrativas, 365."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select

from app.core.security import utcnow
from app.db.session import get_sessionmaker
from app.models import AuditLog, UserRole
from app.services.audit import AuditAction, purge_audit_logs
from tests.conftest import login


def _log(db, action: str, days_ago: int) -> None:
    db.add(AuditLog(action=action, created_at=utcnow() - timedelta(days=days_ago)))


def test_purge_respects_each_retention_window():
    with get_sessionmaker()() as db:
        _log(db, AuditAction.LOGIN_SUCCESS, 91)  # acesso antigo: sai
        _log(db, AuditAction.ACCESS_DENIED, 120)  # acesso antigo: sai
        _log(db, AuditAction.LOGIN_FAILED, 30)  # acesso recente: fica
        _log(db, AuditAction.USER_UPDATED, 200)  # ação administrativa dentro de 1 ano: fica
        _log(db, AuditAction.LOGIN_LOCKED, 200)  # bloqueio é incidente: retenção longa, fica
        _log(db, "imports.deleted", 400)  # ação administrativa com mais de 1 ano: sai
        db.commit()

        assert purge_audit_logs(db) == {"access_removed": 2, "other_removed": 1}
        actions = sorted(db.scalars(select(AuditLog.action)))
        assert actions == sorted(
            [AuditAction.LOGIN_FAILED, AuditAction.USER_UPDATED, AuditAction.LOGIN_LOCKED, AuditAction.AUDIT_PURGED]
        )
        purge_log = db.scalar(select(AuditLog).where(AuditLog.action == AuditAction.AUDIT_PURGED))
        assert purge_log.details["access_removed"] == 2


def test_purge_without_old_records_logs_nothing():
    with get_sessionmaker()() as db:
        _log(db, AuditAction.LOGIN_SUCCESS, 1)
        db.commit()
        assert purge_audit_logs(db) == {"access_removed": 0, "other_removed": 0}
        assert db.scalar(select(AuditLog).where(AuditLog.action == AuditAction.AUDIT_PURGED)) is None


def test_retention_endpoint(client, make_user):
    make_user("admin@example.com", UserRole.ADMIN)
    login(client, "admin@example.com")
    data = client.get("/api/admin/audit-logs/retention").json()
    assert data["access_retention_days"] == 90 and data["retention_days"] == 365
    assert AuditAction.LOGIN_SUCCESS in data["access_actions"]

    make_user("op@example.com", UserRole.OPERATIONAL)
    login(client, "op@example.com")
    assert client.get("/api/admin/audit-logs/retention").status_code == 403
