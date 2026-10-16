export type UserRole = "admin" | "operational" | "viewer";

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
  operational: "Operacional",
  viewer: "Visualizador",
};

// ---------------------------------------------------------------- CRM
export type Outcome = "in_progress" | "approved" | "rejected" | "hired" | "withdrawn" | "unmapped";

export interface StatusRef {
  id: number | null;
  label: string | null;
  outcome: Outcome;
}

export interface ApplicationRow {
  id: number;
  external_record_id: string | null;
  candidate_id: number;
  full_name: string;
  agency_id: number;
  agency_name: string;
  regional: string | null;
  sub_representative: string | null;
  cohort_name: string | null;
  exam_date: string | null;
  registered_at: string | null;
  status_raw: string | null;
  status: StatusRef;
  susep_active: string | null;
  susep_number: string | null;
  relationship_program: string | null;
  is_demo: boolean;
}

export interface CandidatesSummary {
  candidates: number;
  applications: number;
  by_outcome: Record<Outcome, number>;
}

export interface OptionValue {
  value: string;
  count: number;
}

export interface FilterOptions {
  agencies: { id: number; name: string; count: number }[];
  regionals: OptionValue[];
  sub_representatives: (OptionValue & { agencies: string[] })[];
  statuses: { id: number; label: string; outcome: Outcome; count: number }[];
  cohorts: (OptionValue & { exam_date: string | null })[];
  programs: OptionValue[];
  susep_active: OptionValue[];
  date_min: string | null;
  date_max: string | null;
}

export interface TimelineEvent {
  kind: "created" | "status" | "field" | "note";
  at: string;
  title: string;
  detail: string | null;
  author: string | null;
  source: string | null;
}

export interface ApplicationDetail {
  application: ApplicationRow;
  raw_payload: Record<string, string | null> | null;
  first_import: { id: number; file_name: string; received_at: string } | null;
  other_applications: ApplicationRow[];
  timeline: TimelineEvent[];
}

export interface SavedFilter {
  id: number;
  scope: string;
  name: string;
  definition: Record<string, unknown>;
  is_shared: boolean;
  is_mine: boolean;
}

// ---------------------------------------------------------------- importação
export type ImportStatus =
  | "received"
  | "processing"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | "skipped_duplicate";

export interface UploadResult {
  file_name: string;
  batch: ImportBatch | null;
  error: string | null;
}

export interface ImportDeleteResult {
  applications_removed: number;
  applications_restored: number;
  candidates_removed: number;
}

export interface ImportBatch {
  id: number;
  source: string;
  status: ImportStatus;
  file_name: string;
  file_size: number | null;
  sheet_title: string | null;
  cohort_name: string | null;
  exam_date: string | null;
  received_at: string;
  started_at: string | null;
  finished_at: string | null;
  rows_total: number;
  rows_created: number;
  rows_updated: number;
  rows_unchanged: number;
  rows_rejected: number;
  error_message: string | null;
  reprocess_of_id: number | null;
}

export interface ImportIssue {
  id: number;
  row_number: number | null;
  field: string | null;
  code: string;
  severity: "error" | "warning";
  message: string;
  raw_value: string | null;
}

export interface ImportDetail {
  batch: ImportBatch;
  issues: ImportIssue[];
  issues_total: number;
}

// ---------------------------------------------------------------- catálogos
export interface CatalogStatus {
  id: number;
  code: string;
  label: string;
  abbreviation: string | null;
  is_official: boolean;
  outcome: Outcome;
  is_provisional: boolean;
  raw_values: string[];
  applications: number;
}

export interface MetricDefinition {
  code: string;
  label: string;
  description: string | null;
  numerator_outcomes: Outcome[];
  denominator_outcomes: Outcome[];
  min_sample_size: number;
  is_validated: boolean;
}

// ---------------------------------------------------------------- dashboard
export interface GroupStats {
  total: number;
  by_outcome: Record<Outcome, number>;
  rates: Record<string, number | null>;
  rate_base: number;
  low_sample: boolean;
}

export interface MetricValue {
  code: string;
  label: string;
  description: string | null;
  value: number | null;
  numerator: number;
  denominator: number;
  min_sample_size: number;
  low_sample: boolean;
  is_validated: boolean;
}

export interface Dashboard {
  totals: { applications: number; candidates: number; classified: number; by_outcome: Record<Outcome, number> };
  metrics: MetricValue[];
  min_sample_size: number;
  unmapped_statuses: { id: number; label: string; count: number }[];
  agencies: (GroupStats & { agency_id: number; name: string })[];
  statuses: { status_id: number | null; label: string; outcome: Outcome; count: number }[];
  agency_status: { agency_id: number; status_id: number | null; count: number }[];
  representatives: (GroupStats & { agency_id: number; agency_name: string; name: string })[];
  representative_status: { agency_id: number; name: string; status_id: number | null; count: number }[];
  timeline: (GroupStats & { period: string })[];
  cohorts: (GroupStats & { name: string; exam_date: string | null })[];
  profile: { key: string; label: string; groups: (GroupStats & { value: string; suppressed?: boolean })[] }[];
  profile_min_group: number;
  time_to_hire_days: number | null;
}
