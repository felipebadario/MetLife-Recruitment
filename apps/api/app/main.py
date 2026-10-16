"""Ponto de entrada da API. Em produção, também serve o frontend compilado (apps/web/dist)."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

from app.core.config import get_settings
from app.core.middleware import CSRFMiddleware, SecurityHeadersMiddleware
from app.routers import admin, auth, meta


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

    _mount_frontend(app, settings.web_dist_dir)
    return app


app = create_app()
