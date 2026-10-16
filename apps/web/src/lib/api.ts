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
  // Pré-visualização sem servidor: a constante é resolvida no build, e o módulo
  // simulado fica fora do pacote de produção.
  if (import.meta.env.VITE_PREVIEW === "true") {
    const { mockRequest } = await import("./mockApi");
    try {
      return await mockRequest<T>(method, path, body);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && path !== "/api/auth/login" && path !== "/api/auth/me") {
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      }
      throw error;
    }
  }

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

/** Envia um arquivo (campo "file") ou vários (campo "files") em multipart. */
async function upload<T>(path: string, file: File | File[]): Promise<T> {
  const form = new FormData();
  if (Array.isArray(file)) for (const f of file) form.append("files", f);
  else form.append("file", file);
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "X-Requested-With": "XMLHttpRequest" },
    body: form,
  }).catch(() => {
    throw new ApiError(0, messageFrom(0, null));
  });
  const payload: unknown = (response.headers.get("content-type") ?? "").includes("application/json")
    ? await response.json()
    : null;
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new ApiError(response.status, messageFrom(response.status, payload), payload);
  }
  return payload as T;
}

/** Baixa um arquivo gerado pela API e entrega ao navegador para salvar. */
async function download(path: string, fallbackName: string): Promise<void> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "X-Requested-With": "XMLHttpRequest" },
  }).catch(() => {
    throw new ApiError(0, messageFrom(0, null));
  });
  if (!response.ok) {
    const payload: unknown = (response.headers.get("content-type") ?? "").includes("application/json")
      ? await response.json()
      : null;
    throw new ApiError(response.status, messageFrom(response.status, payload), payload);
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  upload,
  download,
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

type QueryValue = string | number | null | undefined | (string | number)[];

export function withQuery(path: string, params: Record<string, QueryValue>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item));
    } else if (value !== null && value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}
