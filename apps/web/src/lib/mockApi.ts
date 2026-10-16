/**
 * API simulada para o modo de pré-visualização.
 * Reproduz as regras do backend da Fase 1 (perfis, permissões, auditoria, política de senha)
 * com estado guardado apenas no navegador de quem está olhando.
 */
import { ApiError } from "./api";
import { DEFAULT_OUTCOMES } from "./outcomes";
import { PREVIEW_ACCOUNTS } from "./preview";
import type { AuditLog, Page, Permission, Session, User, UserRole } from "./types";

interface MockUser extends User {
  password: string;
}

interface MockState {
  users: MockUser[];
  audit: AuditLog[];
  sessionUserId: number | null;
  nextId: number;
}

const STORAGE_KEY = "mrc-preview-state-v1";

const ALL_PERMISSIONS: Permission[] = [
  "audit.view",
  "candidates.export",
  "candidates.notes_write",
  "candidates.view",
  "candidates.view_sensitive",
  "catalogs.manage",
  "imports.manage",
  "imports.reset",
  "integrations.manage",
  "performance.view",
  "users.manage",
];

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: ALL_PERMISSIONS,
  operational: [
    "candidates.export",
    "candidates.notes_write",
    "candidates.view",
    "candidates.view_sensitive",
    "imports.manage",
    "performance.view",
  ],
  viewer: ["candidates.view"],
};

function initialState(): MockState {
  const now = new Date().toISOString();
  return {
    users: [
      {
        id: 1,
        name: "Ana Demonstração",
        email: PREVIEW_ACCOUNTS[0].email,
        password: PREVIEW_ACCOUNTS[0].password,
        role: "admin",
        is_active: true,
        last_login_at: null,
        created_at: now,
      },
      {
        id: 2,
        name: "Bruno Demonstração",
        email: PREVIEW_ACCOUNTS[1].email,
        password: PREVIEW_ACCOUNTS[1].password,
        role: "viewer",
        is_active: true,
        last_login_at: null,
        created_at: now,
      },
    ],
    audit: [],
    sessionUserId: null,
    nextId: 3,
  };
}

function load(): MockState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as MockState;
  } catch {
    /* armazenamento indisponível: segue em memória */
  }
  return initialState();
}

let state = load();

function save() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignora */
  }
}

let auditId = state.audit.reduce((max, a) => Math.max(max, a.id), 0);

function audit(action: string, actor: MockUser | null, extra: Partial<AuditLog> = {}) {
  state.audit.unshift({
    id: ++auditId,
    created_at: new Date().toISOString(),
    user_id: actor?.id ?? null,
    actor_email: actor?.email ?? extra.actor_email ?? null,
    action,
    entity_type: null,
    entity_id: null,
    details: null,
    ip_address: "pré-visualização",
    ...extra,
  });
}

function publicUser(user: MockUser): User {
  const copy: Partial<MockUser> = { ...user };
  delete copy.password;
  return copy as User;
}

function session(user: MockUser): Session {
  return { user: publicUser(user), permissions: [...ROLE_PERMISSIONS[user.role]].sort() };
}

function fail(status: number, detail: string): never {
  throw new ApiError(status, detail, { detail });
}

function policyErrors(password: string): string | null {
  if (password.length < 10) return "A senha deve ter pelo menos 10 caracteres.";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return "A senha deve conter letras e números.";
  return null;
}

function currentUser(): MockUser {
  const user = state.users.find((u) => u.id === state.sessionUserId && u.is_active);
  if (!user) fail(401, "Sessão inválida ou expirada.");
  return user;
}

function requirePermission(permission: Permission): MockUser {
  const user = currentUser();
  if (!ROLE_PERMISSIONS[user.role].includes(permission)) {
    audit("security.access_denied", user, { details: { permission } });
    save();
    fail(403, "Seu perfil não tem acesso a este recurso.");
  }
  return user;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Body = Record<string, unknown>;

export async function mockRequest<T>(method: string, fullPath: string, body?: unknown): Promise<T> {
  await delay(220 + Math.random() * 200);
  const url = new URL(fullPath, "http://preview.local");
  const path = url.pathname;
  const data = (body ?? {}) as Body;
  const result = route(method, path, url.searchParams, data);
  save();
  return result as T;
}

function route(method: string, path: string, query: URLSearchParams, data: Body): unknown {
  if (method === "GET" && path === "/api/meta") {
    return { app_name: "MetLife Recruitment CRM", version: "0.1.0", environment: "preview", demo_mode: true };
  }
  if (method === "GET" && path === "/api/health") return { status: "ok" };

  // ------------------------------------------------------------ auth
  if (method === "POST" && path === "/api/auth/login") {
    const email = String(data.email ?? "").trim().toLowerCase();
    const user = state.users.find((u) => u.email === email);
    if (!user || !user.is_active || user.password !== data.password) {
      audit("auth.login_failed", null, { actor_email: email });
      save();
      fail(401, "E-mail ou senha incorretos.");
    }
    user.last_login_at = new Date().toISOString();
    state.sessionUserId = user.id;
    audit("auth.login_success", user);
    return session(user);
  }
  if (method === "POST" && path === "/api/auth/logout") {
    const user = currentUser();
    audit("auth.logout", user);
    state.sessionUserId = null;
    return undefined;
  }
  if (method === "GET" && path === "/api/auth/me") return session(currentUser());
  if (method === "POST" && path === "/api/auth/change-password") {
    const user = currentUser();
    if (data.current_password !== user.password) fail(400, "Senha atual incorreta.");
    const error = policyErrors(String(data.new_password ?? ""));
    if (error) fail(422, error);
    user.password = String(data.new_password);
    audit("auth.password_changed", user);
    return session(user);
  }

  // ------------------------------------------------------------ admin
  if (method === "GET" && path === "/api/admin/users") {
    requirePermission("users.manage");
    return [...state.users].sort((a, b) => a.name.localeCompare(b.name)).map(publicUser);
  }
  if (method === "POST" && path === "/api/admin/users") {
    const actor = requirePermission("users.manage");
    const email = String(data.email ?? "").trim().toLowerCase();
    const name = String(data.name ?? "").trim();
    if (name.length < 2) fail(422, "Informe o nome.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(422, "E-mail inválido.");
    const error = policyErrors(String(data.password ?? ""));
    if (error) fail(422, error);
    if (state.users.some((u) => u.email === email)) fail(409, "Já existe um usuário com este e-mail.");
    const user: MockUser = {
      id: state.nextId++,
      name,
      email,
      password: String(data.password),
      role: data.role === "admin" || data.role === "operational" ? data.role : "viewer",
      is_active: true,
      last_login_at: null,
      created_at: new Date().toISOString(),
    };
    state.users.push(user);
    audit("user.created", actor, {
      entity_type: "user",
      entity_id: String(user.id),
      details: { email, role: user.role },
    });
    return publicUser(user);
  }

  const userMatch = /^\/api\/admin\/users\/(\d+)(\/reset-password)?$/.exec(path);
  if (userMatch) {
    const actor = requirePermission("users.manage");
    const user = state.users.find((u) => u.id === Number(userMatch[1]));
    if (!user) fail(404, "Usuário não encontrado.");

    if (method === "POST" && userMatch[2]) {
      const error = policyErrors(String(data.new_password ?? ""));
      if (error) fail(422, error);
      user.password = String(data.new_password);
      audit("user.password_reset", actor, { entity_type: "user", entity_id: String(user.id) });
      return undefined;
    }
    if (method === "PATCH" && !userMatch[2]) {
      const activeAdmins = state.users.filter((u) => u.role === "admin" && u.is_active).length;
      const losingAdmin =
        user.role === "admin" && user.is_active && ((data.role !== undefined && data.role !== "admin") || data.is_active === false);
      if (losingAdmin && activeAdmins <= 1) fail(400, "É preciso manter pelo menos um administrador ativo.");
      if (user.id === actor.id && data.is_active === false) fail(400, "Você não pode desativar o próprio acesso.");
      if (data.email !== undefined) {
        const email = String(data.email).trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(422, "E-mail inválido.");
        if (state.users.some((u) => u.email === email && u.id !== user.id)) fail(409, "Já existe um usuário com este e-mail.");
        data.email = email;
      }
      const applied: Record<string, unknown> = {};
      for (const field of ["name", "email", "role", "is_active"] as const) {
        if (data[field] !== undefined && data[field] !== user[field]) {
          (user as unknown as Record<string, unknown>)[field] = data[field];
          applied[field] = data[field];
        }
      }
      if (Object.keys(applied).length) {
        audit("user.updated", actor, { entity_type: "user", entity_id: String(user.id), details: applied });
      }
      return publicUser(user);
    }
  }

  if (method === "GET" && path === "/api/admin/audit-logs") {
    requirePermission("audit.view");
    const page = Math.max(1, Number(query.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.get("page_size") ?? 25)));
    const action = query.get("action") ?? "";
    const rows = state.audit.filter((a) => a.action.startsWith(action));
    const result: Page<AuditLog> = {
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      total: rows.length,
      page,
      page_size: pageSize,
    };
    return result;
  }

  if (method === "GET" && path === "/api/catalogs/outcomes") return DEFAULT_OUTCOMES;

  fail(404, "Recurso não disponível na pré-visualização.");
}
