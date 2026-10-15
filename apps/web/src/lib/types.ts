export type UserRole = "admin" | "viewer";

export type Permission =
  | "candidates.view"
  | "candidates.view_sensitive"
  | "candidates.export"
  | "candidates.notes_write"
  | "performance.view"
  | "imports.manage"
  | "catalogs.manage"
  | "users.manage"
  | "audit.view"
  | "integrations.manage";

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface Session {
  user: User;
  permissions: Permission[];
}

export interface AppMeta {
  app_name: string;
  version: string;
  environment: string;
  demo_mode: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface AuditLog {
  id: number;
  created_at: string;
  user_id: number | null;
  actor_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  viewer: "Visualizador",
};
