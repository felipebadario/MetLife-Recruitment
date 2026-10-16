"""Ponto de entrada da API. Em produção, também serve o frontend compilado (apps/web/dist)."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

from app.core.config import get_settings
from app.core.middleware import CSRFMiddleware, SecurityHeadersMiddleware
from app.routers import admin, auth, candidates, catalogs, imports, meta, performance

logger = logging.getLogger(__name__)


def _mount_frontend(app: FastAPI, dist: Path) -> None:
    index = dist / "index.html"
    if not index.is_file():
        return
    dist_root = dist.resolve()

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(status_code=404)
        candidate = (dist / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(dist_root):
            return FileResponse(candidate)
        # Rotas do React Router caem no index.html
        return FileResponse(index)


def _purge_audit() -> None:
    from app.db.session import get_sessionmaker
    from app.services.audit import purge_audit_logs

    try:
        with get_sessionmaker()() as db:
            purge_audit_logs(db)
    except Exception:  # a limpeza nunca deve derrubar a aplicação
        logger.exception("Falha na limpeza da auditoria")


async def _purge_audit_daily() -> None:
    """Limpa na inicialização e depois uma vez por dia enquanto o serviço estiver ativo."""
    while True:
        await asyncio.to_thread(_purge_audit)
        await asyncio.sleep(24 * 60 * 60)


@asynccontextmanager
async def _lifespan(_: FastAPI) -> AsyncIterator[None]:
    from app.services.bootstrap import ensure_initial_admin

    ensure_initial_admin()
    task = asyncio.create_task(_purge_audit_daily())
    try:
        yield
    finally:
        task.cancel()


def create_app() -> FastAPI:
    settings = get_settings()
    missing = settings.missing_secrets()
    if missing:
        raise RuntimeError(
            "Configuração incompleta. Faltam: "
            + ", ".join(missing)
            + ". Rode `python -m app.cli init` em apps/api para gerar o arquivo .env."
        )

    app = FastAPI(
        lifespan=_lifespan,
        title=settings.app_name,
        version=settings.app_version,
        # Documentação interativa apenas fora de produção
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/openapi.json",
    )
    app.add_middleware(CSRFMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)

    app.include_router(meta.router)
    app.include_router(auth.router)
    app.include_router(admin.router)
    app.include_router(candidates.router)
    app.include_router(imports.router)
    app.include_router(catalogs.router)
    app.include_router(performance.router)

    _mount_frontend(app, settings.web_dist_dir)
    return app


app = create_app()
