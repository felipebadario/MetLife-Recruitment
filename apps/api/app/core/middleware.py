"""Middlewares de segurança: cabeçalhos HTTP e proteção contra CSRF."""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
CSRF_HEADER = "x-requested-with"

CONTENT_SECURITY_POLICY = "; ".join(
    [
        "default-src 'self'",
        "img-src 'self' data:",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self' data:",
        "script-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ]
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        headers = response.headers
        headers.setdefault("X-Content-Type-Options", "nosniff")
        headers.setdefault("X-Frame-Options", "DENY")
        headers.setdefault("Referrer-Policy", "same-origin")
        headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        if request.url.path.startswith("/api"):
            # Respostas da API podem conter dados pessoais: nunca guardar em cache.
            headers["Cache-Control"] = "no-store"
        elif not request.url.path.startswith("/docs"):
            headers.setdefault("Content-Security-Policy", CONTENT_SECURITY_POLICY)
        return response


class CSRFMiddleware(BaseHTTPMiddleware):
    """Exige o cabeçalho X-Requested-With em requisições que alteram estado.

    Navegadores não enviam cabeçalhos customizados em requisições entre sites sem
    pré-verificação CORS (que não habilitamos). Somado ao cookie SameSite=Lax, isso
    impede que outro site dispare ações em nome do usuário logado.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if (
            request.method not in SAFE_METHODS
            and request.url.path.startswith("/api")
            and request.headers.get(CSRF_HEADER) != "XMLHttpRequest"
        ):
            return JSONResponse(
                status_code=403, content={"detail": "Requisição bloqueada (proteção CSRF)."}
            )
        return await call_next(request)
