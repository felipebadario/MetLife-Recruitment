/**
 * Cliente HTTP da API.
 * - Sessão via cookie httpOnly (o token nunca fica acessível ao JavaScript).
 * - Cabeçalho X-Requested-With em todas as chamadas (proteção CSRF exigida pelo backend).
 */

export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export const SESSION_EXPIRED_EVENT = "mrc:session-expired";

function messageFrom(status: number, body: unknown): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string };
      if (first?.msg) return first.msg.replace(/^Value error, /, "");
    }
  }
  if (status >= 500) return "O servidor não conseguiu concluir a operação. Tente novamente em instantes.";
  if (status === 0) return "Sem conexão com o servidor.";
  return "Não foi possível concluir a operação.";
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, messageFrom(0, null));
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") ?? "";
  const payload: unknown = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    if (response.status === 401 && path !== "/api/auth/login" && path !== "/api/auth/me") {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(response.status, messageFrom(response.status, payload), payload);
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

export function withQuery(path: string, params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}
