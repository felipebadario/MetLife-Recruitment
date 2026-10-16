"""Criação do primeiro administrador a partir de variáveis de ambiente."""

from __future__ import annotations

import logging

from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.security import hash_password, password_policy_errors, utcnow
from app.db.session import get_sessionmaker
from app.models import User, UserRole
from app.services.audit import record_audit

logger = logging.getLogger(__name__)


def ensure_initial_admin() -> None:
    settings = get_settings()
    email = settings.initial_admin_email.strip().lower()
    password = settings.initial_admin_password
    if not email or not password:
        return
    with get_sessionmaker()() as db:
        if (db.scalar(select(func.count()).select_from(User)) or 0) > 0:
            return
        errors = password_policy_errors(password)
        if errors:
            logger.error("INITIAL_ADMIN_PASSWORD não atende à política: %s", " ".join(errors))
            return
        user = User(
            name=settings.initial_admin_name,
            email=email,
            role=UserRole.ADMIN,
            password_hash=hash_password(password),
            password_changed_at=utcnow(),
            is_active=True,
            failed_login_attempts=0,
        )
        db.add(user)
        db.flush()
        record_audit(
            db,
            action="user.created",
            actor_email="bootstrap",
            entity_type="user",
            entity_id=user.id,
            details={"email": email, "role": "admin", "via": "INITIAL_ADMIN_EMAIL"},
        )
        logger.info("Administrador inicial %s criado.", email)
