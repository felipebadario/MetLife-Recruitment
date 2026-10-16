from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response, status

from app.auth.deps import CurrentUser, DbSession
from app.auth.permissions import permissions_for
from app.auth.service import authenticate
from app.core.config import get_settings
from app.core.security import create_session_token, hash_password, utcnow, verify_password
from app.models import User
from app.schemas import ChangePasswordIn, LoginIn, SessionOut, UserOut
from app.services.audit import AuditAction, record_audit

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _session_out(user: User) -> SessionOut:
    return SessionOut(
        user=UserOut.model_validate(user),
        permissions=sorted(p.value for p in permissions_for(user.role)),
    )


def _set_session_cookie(response: Response, user: User) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.session_cookie_name,
        value=create_session_token(user.id, user.role.value, user.password_changed_at),
        max_age=settings.session_hours * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


@router.post("/login", response_model=SessionOut)
def login(payload: LoginIn, request: Request, response: Response, db: DbSession) -> SessionOut:
    result = authenticate(db, payload.email, payload.password)

    if result.user is None:
        record_audit(
            db,
            action=AuditAction.LOGIN_LOCKED if result.locked else AuditAction.LOGIN_FAILED,
            request=request,
            actor_email=payload.email,
        )
        if result.locked:
            minutes = get_settings().login_lockout_minutes
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"Muitas tentativas. Acesso bloqueado temporariamente por {minutes} minutos."
                ),
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="E-mail ou senha incorretos."
        )

    _set_session_cookie(response, result.user)
    record_audit(db, action=AuditAction.LOGIN_SUCCESS, request=request, actor=result.user)
    return _session_out(result.user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, user: CurrentUser, db: DbSession) -> Response:
    record_audit(db, action=AuditAction.LOGOUT, request=request, actor=user)
    response.status_code = status.HTTP_204_NO_CONTENT
    response.delete_cookie(get_settings().session_cookie_name, path="/")
    return response


@router.get("/me", response_model=SessionOut)
def me(user: CurrentUser) -> SessionOut:
    return _session_out(user)


@router.post("/change-password", response_model=SessionOut)
def change_password(
    payload: ChangePasswordIn,
    request: Request,
    response: Response,
    user: CurrentUser,
    db: DbSession,
) -> SessionOut:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Senha atual incorreta."
        )
    user.password_hash = hash_password(payload.new_password)
    user.password_changed_at = utcnow()
    db.commit()
    record_audit(db, action=AuditAction.PASSWORD_CHANGED, request=request, actor=user)
    # Outras sessões abertas são invalidadas; esta recebe um cookie novo.
    _set_session_cookie(response, user)
    return _session_out(user)
