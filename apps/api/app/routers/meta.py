from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from app.auth.deps import DbSession
from app.core.config import get_settings
from app.schemas import AppMetaOut

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/health")
def health(db: DbSession) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


@router.get("/meta", response_model=AppMetaOut)
def meta() -> AppMetaOut:
    settings = get_settings()
    return AppMetaOut(
        app_name=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
        demo_mode=settings.demo_mode,
    )
