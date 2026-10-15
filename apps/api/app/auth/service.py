"""Regras de autenticação: verificação de senha e bloqueio por tentativas."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import as_utc, dummy_verify, utcnow, verify_password
from app.models import User


@dataclass
class LoginResult:
    user: User | None
    locked: bool = False


def authenticate(db: Session, email: str, password: str) -> LoginResult:
    settings = get_settings()
    user = db.scalar(select(User).where(User.email == email))

    if user is None or not user.is_active:
        dummy_verify()  # tempo de resposta equivalente, para não revelar quais e-mails existem
        return LoginResult(user=None)

    now = utcnow()
    locked_until = as_utc(user.locked_until)
    if locked_until and locked_until > now:
        return LoginResult(user=None, locked=True)

    if not verify_password(password, user.password_hash):
        user.failed_login_attempts += 1
        locked = False
        if user.failed_login_attempts >= settings.login_max_attempts:
            user.locked_until = now + timedelta(minutes=settings.login_lockout_minutes)
            user.failed_login_attempts = 0
            locked = True
        db.commit()
        return LoginResult(user=None, locked=locked)

    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now
    db.commit()
    return LoginResult(user=user)
