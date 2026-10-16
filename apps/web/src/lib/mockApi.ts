/**
 * Backend simulado para o modo de pré-visualização (build com VITE_PREVIEW=true).
 *
 * Reproduz no navegador as regras do backend real: perfis e permissões, auditoria, leitura
 * da planilha da turma, importação idempotente com histórico, catálogos de status, funil,
 * fórmulas dos indicadores e o dashboard. Tudo fica guardado SOMENTE no navegador de quem
 * está usando (localStorage): nenhum dado é enviado a servidor algum.
 *
 * A fonte da verdade continua sendo o backend em apps/api; este módulo existe para validar
 * a experiência sem servidor.
 */
import * as XLSX from "xlsx";

import { ApiError } from "./api";
import { PREVIEW_ACCOUNTS } from "./preview";
import type {
  AuditLog,
  ImportBatch,
  ImportIssue,
  Outcome,
  Page,
  Permission,
  Session,
  User,
  UserRole,
} from "./types";

// ============================================================================ estado

interface MockUser extends User {
  password: string;
}

interface StatusHistory {
  from_raw: string | null;
  to_raw: string | null;
  from_id: number | null;
  to_id: number | null;
  at: string;
  batch_id: number | null;
  note: string | null;
}

interface FieldChange {
  field: string;
  old: string | null;
  new: string | null;
  at: string;
  batch_id: number | null;
}

interface Note {
  body: string;
  author: string;
  at: string;
}

interface MockApplication {
  id: number;
  candidate_id: number;
  agency_id: number;
  external_record_id: string;
  site_registered_at: string | null;
  registered_at: string | null;
  regional: string | null;
  sub_representative: string | null;
  susep_active: string | null;
  susep_number: string | null;
  relationship_program: string | null;
  cohort_name: string | null;
  exam_date: string | null;
  status_raw: string | null;
  status_id: number | null;
  raw_payload: Record<string, string | null>;
  row_key: string;
  first_batch_id: number;
  is_demo: boolean;
  history: StatusHistory[];
  changes: FieldChange[];
  notes: Note[];
}

interface MockStatus {
  id: number;
  code: string;
  label: string;
  outcome: Outcome;
  funnel_stage_id: number | null;
  is_provisional: boolean;
  raw_values: string[];
  keys: string[];
}

interface MockStage {
  id: number;
  code: string;
  label: string;
  position: number;
  is_active: boolean;
  is_provisional: boolean;
}

interface MockMetric {
  code: string;
  label: string;
  description: string;
  numerator_outcomes: Outcome[];
  denominator_outcomes: Outcome[];
  min_sample_size: number;
  is_validated: boolean;
}

interface MockBatch extends ImportBatch {
  sha: string;
  issues: ImportIssue[];
  sheet: unknown[][] | null;
}

interface MockState {
  version: 2;
  seq: number;
  users: MockUser[];
  audit: AuditLog[];
  sessionUserId: number | null;
  agencies: { id: number; code: string; name: string }[];
  candidates: { id: number; name: string; key: string }[];
  applications: MockApplication[];
  statuses: MockStatus[];
  stages: MockStage[];
  metrics: MockMetric[];
  batches: MockBatch[];
  savedFilters: { id: number; user_id: number; scope: string; name: string; definition: Record<string, unknown>; is_shared: boolean }[];
}

const STORAGE_KEY = "mrc-preview-state-v2";
const CLASSIFIED: Outcome[] = ["in_progress", "approved", "rejected", "hired", "withdrawn"];
const OUTCOMES: Outcome[] = ["in_progress", "approved", "rejected", "hired", "withdrawn", "unmapped"];

const ALL_PERMISSIONS: Permission[] = [
  "audit.view",
  "candidates.export",
  "candidates.notes_write",
  "candidates.view",
  "candidates.view_sensitive",
  "catalogs.manage",
  "imports.manage",
  "integrations.manage",
  "performance.view",
  "users.manage",
];

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: ALL_PERMISSIONS,
  viewer: ["candidates.view"],
};

function nowIso() {
  return new Date().toISOString();
}

function initialState(): MockState {
  const now = nowIso();
  const stages = [
    "Candidatura recebida",
    "Triagem",
    "Avaliação comercial",
    "Aprovação",
    "Documentação",
    "Contratação",
  ].map((label, i) => ({
    id: i + 1,
    code: `STAGE-${i + 1}`,
    label,
    position: (i + 1) * 10,
    is_active: true,
    is_provisional: true,
  }));
  const metric = (code: string, label: string, description: string, numerator: Outcome[]): MockMetric => ({
    code,
    label,
    description,
    numerator_outcomes: numerator,
    denominator_outcomes: [...CLASSIFIED],
    min_sample_size: 10,
    is_validated: false,
  });
  return {
    version: 2,
    seq: 100,
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
    agencies: [],
    candidates: [],
    applications: [],
    statuses: [],
    stages,
    metrics: [
      metric("approval_rate", "Taxa de aprovação", "Aprovados e contratados sobre o total de candidaturas classificadas.", ["approved", "hired"]),
      metric("hiring_rate", "Taxa de contratação", "Contratados sobre o total de candidaturas classificadas.", ["hired"]),
      metric("rejection_rate", "Taxa de reprovação", "Reprovados sobre o total de candidaturas classificadas.", ["rejected"]),
      metric("withdrawal_rate", "Taxa de desistência", "Desistências sobre o total de candidaturas classificadas.", ["withdrawn"]),
    ],
    batches: [],
    savedFilters: [],
  };
}

function load(): MockState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MockState;
      if (parsed.version === 2) return parsed;
    }
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
    /* sem espaço ou bloqueado: o estado continua em memória nesta aba */
  }
}

const nextId = () => ++state.seq;

function audit(action: string, actor: MockUser | null, extra: Partial<AuditLog> = {}) {
  state.audit.unshift({
    id: nextId(),
    created_at: nowIso(),
    user_id: actor?.id ?? null,
    actor_email: actor?.email ?? extra.actor_email ?? null,
    action,
    entity_type: null,
    entity_id: null,
    details: null,
    ip_address: "navegador",
    ...extra,
  });
  if (state.audit.length > 1000) state.audit.length = 1000;
}

function fail(status: number, detail: string): never {
  throw new ApiError(status, detail, { detail });
}

// ============================================================================ texto

function clean(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text || null;
}

function normalizeKey(value: unknown): string {
  return (clean(value) ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function slug(value: unknown, max = 64): string {
  const key = normalizeKey(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (key.toUpperCase() || "SEM-NOME").slice(0, max).replace(/-+$/, "");
}

// ============================================================================ planilha

interface Column {
  key: string;
  label: string;
  aliases: string[];
  required?: boolean;
}

const COLUMNS: Column[] = [
  { key: "external_record_id", label: "ID", aliases: ["id", "id do registro"], required: true },
  { key: "site_registered_at", label: "Cadastro no site", aliases: ["cadastro no site", "data de cadastro", "data cadastro", "cadastro"] },
  { key: "agency", label: "Agência", aliases: ["agencia"], required: true },
  { key: "regional", label: "Regional", aliases: ["regional"] },
  { key: "sub_representative", label: "Sub Representante", aliases: ["sub representante", "sub-representante", "subrepresentante"] },
  { key: "full_name", label: "Nome Potencial Parceiro", aliases: ["nome potencial parceiro", "nome do candidato", "nome"], required: true },
  { key: "susep_active", label: "SUSEP Ativa?", aliases: ["susep ativa", "susep ativa?"] },
  { key: "susep_number", label: "Número SUSEP", aliases: ["numero susep", "n susep", "no susep"] },
  { key: "relationship_program", label: "Programa Relacionamento", aliases: ["programa relacionamento", "programa de relacionamento"] },
  { key: "status", label: "Status", aliases: ["status"], required: true },
];

const headerKey = (value: unknown) => normalizeKey(value).replace(/[^a-z0-9 ]+/g, "").trim();

interface ParsedRow {
  rowNumber: number;
  values: Record<string, string | null>;
  raw: Record<string, string | null>;
  issues: { code: string; message: string; field: string | null; raw_value: string | null; severity: "error" | "warning" }[];
}

interface ParsedSheet {
  title: string | null;
  cohort: string | null;
  exam: string | null;
  rows: ParsedRow[];
  missingOptional: string[];
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function parseTitle(title: string | null): { cohort: string | null; exam: string | null } {
  if (!title) return { cohort: null, exam: null };
  let exam: string | null = null;
  const match = /prova\s*:?\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/i.exec(title);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month - 1, day);
    if (d.getMonth() === month - 1 && d.getDate() === day) exam = `${year}-${pad(month)}-${pad(day)}`;
  }
  const cohort = clean(title.replace(/\s+[-–—]\s+prova\b.*$/i, ""));
  return { cohort, exam };
}

/** Data/hora de Brasília em ISO com fuso: "12/11/2025 10:39:02" → "2025-11-12T10:39:02-03:00". */
function parseDateTime(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}-03:00`;
  }
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(value).trim());
  if (!m) throw new Error("data");
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${year}-${pad(Number(m[2]))}-${pad(Number(m[1]))}T${pad(Number(m[4] ?? 0))}:${m[5] ?? "00"}:${m[6] ?? "00"}-03:00`;
}

function cellText(value: unknown): string | null {
  if (value instanceof Date) return parseDateTime(value);
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  return clean(value);
}

function parseSheet(rows: unknown[][]): ParsedSheet | null {
  let headerIndex = -1;
  let found: Record<string, number> = {};
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const keys = (rows[i] ?? []).map(headerKey);
    const match: Record<string, number> = {};
    const used = new Set<number>();
    for (const column of COLUMNS) {
      const aliases = new Set(column.aliases.map(headerKey));
      const index = keys.findIndex((k, idx) => k && aliases.has(k) && !used.has(idx));
      if (index >= 0) {
        match[column.key] = index;
        used.add(index);
      }
    }
    if (COLUMNS.filter((c) => c.required).every((c) => c.key in match)) {
      headerIndex = i;
      found = match;
      break;
    }
  }
  if (headerIndex < 0) return null;

  let title: string | null = null;
  for (let i = 0; i < headerIndex && !title; i++) {
    title = (rows[i] ?? []).map(clean).find((v) => v) ?? null;
  }
  const { cohort, exam } = parseTitle(title);
  const header = rows[headerIndex] ?? [];
  const parsed: ParsedRow[] = [];
  const seen = new Map<string, number>();

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const cells = rows[i] ?? [];
    if (!cells.some((c) => clean(c))) continue;
    const rowNumber = i + 1;
    const cell = (key: string) => (found[key] != null ? cells[found[key]] : null);
    const raw: Record<string, string | null> = {};
    header.forEach((name, idx) => {
      raw[clean(name) ?? `Coluna ${idx + 1}`] = cellText(cells[idx]);
    });
    const row: ParsedRow = { rowNumber, values: {}, raw, issues: [] };
    const v = row.values;
    v.external_record_id = cellText(cell("external_record_id"));
    v.agency = clean(cell("agency"));
    v.full_name = clean(cell("full_name"));
    for (const [key, label] of [
      ["external_record_id", "ID"],
      ["agency", "Agência"],
      ["full_name", "Nome"],
    ] as const) {
      if (!v[key]) row.issues.push({ code: "required", message: `${label} não preenchido.`, field: key, raw_value: null, severity: "error" });
    }
    v.regional = clean(cell("regional"));
    v.sub_representative = clean(cell("sub_representative"));
    v.susep_active = clean(cell("susep_active"));
    v.susep_number = cellText(cell("susep_number"));
    v.relationship_program = clean(cell("relationship_program"));
    v.status = clean(cell("status"));
    if (!v.status) row.issues.push({ code: "status_empty", message: "Status não preenchido.", field: "status", raw_value: null, severity: "warning" });
    try {
      v.site_registered_at = parseDateTime(cell("site_registered_at"));
    } catch {
      v.site_registered_at = null;
      row.issues.push({
        code: "invalid_date",
        message: "Data de cadastro em formato não reconhecido (esperado dd/mm/aaaa hh:mm:ss).",
        field: "site_registered_at",
        raw_value: cellText(cell("site_registered_at")),
        severity: "warning",
      });
    }
    const id = v.external_record_id;
    if (id) {
      if (seen.has(id)) {
        row.issues.push({
          code: "duplicate_id",
          message: `ID repetido na planilha (já aparece na linha ${seen.get(id)}).`,
          field: "external_record_id",
          raw_value: id,
          severity: "error",
        });
      } else seen.set(id, rowNumber);
    }
    parsed.push(row);
  }
  const missingOptional = COLUMNS.filter((c) => !c.required && !(c.key in found)).map((c) => c.label);
  return { title, cohort, exam, rows: parsed, missingOptional };
}

// ============================================================================ importação

function getOrCreateStatus(raw: string): MockStatus {
  const key = normalizeKey(raw);
  let status = state.statuses.find((s) => s.keys.includes(key));
  if (status) return status;
  const code = slug(raw);
  status = state.statuses.find((s) => s.code === code);
  if (!status) {
    status = {
      id: nextId(),
      code,
      label: clean(raw) ?? code,
      outcome: "unmapped",
      funnel_stage_id: null,
      is_provisional: true,
      raw_values: [],
      keys: [],
    };
    state.statuses.push(status);
  }
  status.keys.push(key);
  status.raw_values.push(clean(raw) ?? raw);
  return status;
}

function agencyFor(name: string) {
  const code = slug(name, 32);
  let agency = state.agencies.find((a) => a.code === code);
  if (!agency) {
    agency = { id: nextId(), code, name };
    state.agencies.push(agency);
  }
  return agency;
}

function candidateFor(name: string, existing: MockApplication | undefined) {
  if (existing) {
    const candidate = state.candidates.find((c) => c.id === existing.candidate_id)!;
    if (candidate.name !== name) {
      candidate.name = name;
      candidate.key = normalizeKey(name);
    }
    return candidate;
  }
  const key = normalizeKey(name);
  let candidate = state.candidates.find((c) => c.key === key);
  if (!candidate) {
    candidate = { id: nextId(), name, key };
    state.candidates.push(candidate);
  }
  return candidate;
}

const TRACKED: [keyof MockApplication, string][] = [
  ["agency_id", "Agência"],
  ["regional", "Regional"],
  ["sub_representative", "Sub-representante"],
  ["susep_active", "SUSEP ativa"],
  ["susep_number", "Número SUSEP"],
  ["relationship_program", "Programa de relacionamento"],
  ["cohort_name", "Turma"],
  ["exam_date", "Data da prova"],
  ["registered_at", "Data de cadastro"],
];

function fmt(field: keyof MockApplication, value: unknown): string | null {
  if (value == null) return null;
  if (field === "agency_id") return state.agencies.find((a) => a.id === value)?.name ?? null;
  if (field === "exam_date" || field === "registered_at") {
    const [y, m, d] = String(value).split("-");
    return `${d}/${m}/${y}`;
  }
  return String(value);
}

function applySheet(batch: MockBatch, sheet: ParsedSheet, isDemo: boolean) {
  batch.sheet_title = sheet.title;
  batch.cohort_name = sheet.cohort;
  batch.exam_date = sheet.exam;
  if (!sheet.cohort) batch.issues.push(issue(null, "no_title", "Título da turma não encontrado acima do cabeçalho.", "warning"));
  for (const label of sheet.missingOptional) {
    batch.issues.push(issue(null, "missing_column", `Coluna '${label}' não encontrada; o campo ficará vazio.`, "warning", label));
  }
  const counts = { created: 0, updated: 0, unchanged: 0, rejected: 0 };
  const now = nowIso();

  for (const row of sheet.rows) {
    for (const i of row.issues) batch.issues.push({ id: nextId(), row_number: row.rowNumber, ...i });
    if (row.issues.some((i) => i.severity === "error")) {
      counts.rejected++;
      continue;
    }
    const v = row.values;
    const rowKey = JSON.stringify([sheet.cohort, sheet.exam, ...Object.keys(v).sort().map((k) => v[k])]);
    const existing = state.applications.find((a) => a.external_record_id === v.external_record_id);
    if (existing && existing.row_key === rowKey) {
      counts.unchanged++;
      continue;
    }
    const agency = agencyFor(v.agency!);
    const candidate = candidateFor(v.full_name!, existing);
    const status = v.status ? getOrCreateStatus(v.status) : null;
    const fields = {
      agency_id: agency.id,
      regional: v.regional,
      sub_representative: v.sub_representative,
      susep_active: v.susep_active,
      susep_number: v.susep_number,
      relationship_program: v.relationship_program,
      cohort_name: sheet.cohort,
      exam_date: sheet.exam,
      site_registered_at: v.site_registered_at,
      registered_at: v.site_registered_at ? v.site_registered_at.slice(0, 10) : null,
      raw_payload: row.raw,
      row_key: rowKey,
    };

    if (!existing) {
      state.applications.push({
        id: nextId(),
        candidate_id: candidate.id,
        external_record_id: v.external_record_id!,
        status_raw: v.status,
        status_id: status?.id ?? null,
        first_batch_id: batch.id,
        is_demo: isDemo,
        history: [
          { from_raw: null, to_raw: v.status, from_id: null, to_id: status?.id ?? null, at: now, batch_id: batch.id, note: "Entrada via importação de planilha." },
        ],
        changes: [],
        notes: [],
        ...fields,
      });
      counts.created++;
      continue;
    }

    for (const [field, label] of TRACKED) {
      const oldValue = existing[field];
      const newValue = (fields as Record<string, unknown>)[field];
      if (oldValue !== newValue) {
        existing.changes.push({ field: label, old: fmt(field, oldValue), new: fmt(field, newValue), at: now, batch_id: batch.id });
      }
    }
    if (existing.status_raw !== v.status) {
      existing.history.push({
        from_raw: existing.status_raw,
        to_raw: v.status,
        from_id: existing.status_id,
        to_id: status?.id ?? null,
        at: now,
        batch_id: batch.id,
        note: null,
      });
      existing.status_raw = v.status;
      existing.status_id = status?.id ?? null;
    }
    Object.assign(existing, fields);
    existing.candidate_id = candidate.id;
    counts.updated++;
  }

  batch.rows_total = sheet.rows.length;
  batch.rows_created = counts.created;
  batch.rows_updated = counts.updated;
  batch.rows_unchanged = counts.unchanged;
  batch.rows_rejected = counts.rejected;
  batch.status = counts.rejected ? "completed_with_errors" : "completed";
  batch.finished_at = nowIso();
}

function issue(
  row: number | null,
  code: string,
  message: string,
  severity: "error" | "warning",
  field: string | null = null,
): ImportIssue {
  return { id: nextId(), row_number: row, field, code, severity, message, raw_value: null };
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return `${buffer.byteLength}-${Date.now()}`;
  }
}

function newBatch(fileName: string, size: number, sha: string, _actor: MockUser, sheet: unknown[][] | null): MockBatch {
  const now = nowIso();
  return {
    id: nextId(),
    source: "manual",
    status: "processing",
    file_name: fileName,
    file_size: size,
    sheet_title: null,
    cohort_name: null,
    exam_date: null,
    received_at: now,
    started_at: now,
    finished_at: null,
    rows_total: 0,
    rows_created: 0,
    rows_updated: 0,
    rows_unchanged: 0,
    rows_rejected: 0,
    error_message: null,
    reprocess_of_id: null,
    sha,
    issues: [],
    sheet,
  };
}

function runImport(batch: MockBatch, isDemo: boolean) {
  const sheet = batch.sheet ? parseSheet(batch.sheet) : null;
  if (!sheet) {
    const required = COLUMNS.filter((c) => c.required).map((c) => c.label).join(", ");
    batch.status = "failed";
    batch.error_message = `Nenhuma aba tem o cabeçalho esperado. Colunas obrigatórias: ${required}.`;
    batch.finished_at = nowIso();
    batch.issues.push(issue(null, "template", batch.error_message, "error"));
    return;
  }
  applySheet(batch, sheet, isDemo);
}

function readWorkbook(buffer: ArrayBuffer): unknown[][] | null {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null });
    if (parseSheet(rows)) return rows;
  }
  return null;
}

async function importBuffer(fileName: string, buffer: ArrayBuffer, actor: MockUser, isDemo: boolean): Promise<MockBatch> {
  const sha = await sha256(buffer);
  const previous = state.batches.find((b) => b.sha === sha && (b.status === "completed" || b.status === "completed_with_errors"));
  let rows: unknown[][] | null = null;
  let readError: string | null = null;
  if (!previous) {
    try {
      rows = readWorkbook(buffer);
    } catch {
      readError = "Não foi possível abrir o arquivo como planilha Excel (.xlsx).";
    }
  }
  const batch = newBatch(fileName, buffer.byteLength, sha, actor, rows);
  if (isDemo) batch.source = "demo";
  if (previous) {
    batch.status = "skipped_duplicate";
    batch.reprocess_of_id = previous.id;
    batch.finished_at = nowIso();
    batch.error_message = `Este arquivo já foi importado no lote #${previous.id}. Use 'Reprocessar' se quiser processá-lo de novo.`;
  } else if (readError) {
    batch.status = "failed";
    batch.error_message = readError;
    batch.finished_at = nowIso();
    batch.issues.push(issue(null, "template", readError, "error"));
  } else {
    runImport(batch, isDemo);
  }
  state.batches.unshift(batch);
  audit("imports.uploaded", actor, { entity_type: "import_batch", entity_id: String(batch.id), details: { file_name: fileName, status: batch.status } });
  save();
  return batch;
}

function publicBatch(b: MockBatch): ImportBatch {
  const copy: Partial<MockBatch> = { ...b };
  delete copy.sha;
  delete copy.issues;
  delete copy.sheet;
  return copy as ImportBatch;
}

// ---------------------------------------------------------------------------- planilha fictícia

function demoSheet(): unknown[][] {
  let seed = 99;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];
  const agencies: [string, string][] = [
    ["AURORA", "SUD"], ["BÚSSOLA", "SUD"], ["CEDRO", "SUL"], ["DUNAS", "CE-NO-NE"], ["ESTEIO", "SUD"],
    ["FAROL", "CE-NO-NE"], ["GALÁXIA", "SUD"], ["HORIZONTE", "SUL"], ["LUMEN", "SUD"], ["MARÉ", "CE-NO-NE"],
    ["NÚCLEO", "SUL"], ["PRISMA", "SUD"], ["QUARTZO", "SUL"], ["RUMO", "CE-NO-NE"], ["VÉRTICE", "CE-NO-NE"],
  ];
  const first = ["Ana", "Bruno", "Carla", "Daniel", "Eduarda", "Felipe", "Gabriela", "Henrique", "Isabela", "João", "Karina", "Lucas", "Mariana", "Pedro", "Rafael", "Sofia", "Thiago", "Yasmin"];
  const last = ["Almeida", "Barros", "Cardoso", "Duarte", "Farias", "Gomes", "Lima", "Macedo", "Nogueira", "Oliveira", "Pacheco", "Ribeiro", "Siqueira", "Teixeira", "Valente", "Xavier"];
  const statuses: [string, number][] = [["PAGA", 40], ["AGUA", 20], ["REPRC", 14], ["CANC", 12], ["ENVIA", 7], ["ENTRE", 7]];
  const total = statuses.reduce((n, [, w]) => n + w, 0);
  const status = () => {
    let r = rand() * total;
    for (const [code, w] of statuses) {
      if ((r -= w) < 0) return code;
    }
    return "AGUA";
  };
  const exam = new Date();
  exam.setDate(exam.getDate() + 20);
  const rows: unknown[][] = [
    [`DEMO T99 - Prova ${pad(exam.getDate())}/${pad(exam.getMonth() + 1)}/${String(exam.getFullYear()).slice(2)}`],
    COLUMNS.map((c) => c.label),
  ];
  for (let i = 0; i < 60; i++) {
    const [agency, regional] = pick(agencies);
    const d = new Date(exam);
    d.setDate(d.getDate() - 75 + Math.floor(rand() * 60));
    const susep = rand() < 0.1;
    rows.push([
      900000 + i,
      `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(8 + Math.floor(rand() * 10))}:${pad(Math.floor(rand() * 60))}:${pad(Math.floor(rand() * 60))}`,
      agency,
      regional,
      `${pick(first)} ${pick(last)} ${pick(last)}`,
      `${pick(first)} ${pick(last)} ${pick(last)}`,
      susep ? "SIM" : "NÃO",
      susep ? String(200000000 + Math.floor(rand() * 59999999)) : null,
      rand() < 0.05 ? "Básico" : "Integral",
      status(),
    ]);
  }
  return rows;
}

// ============================================================================ sessão e permissões

function publicUser(user: MockUser): User {
  const copy: Partial<MockUser> = { ...user };
  delete copy.password;
  return copy as User;
}

function session(user: MockUser): Session {
  return { user: publicUser(user), permissions: [...ROLE_PERMISSIONS[user.role]].sort() };
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

// ============================================================================ consultas

interface Filters {
  search: string;
  agency_id: string[];
  regional: string[];
  status_id: string[];
  outcome: string[];
  cohort: string[];
  program: string[];
  susep_active: string[];
  date_from: string;
  date_to: string;
}

function readFilters(q: URLSearchParams): Filters {
  return {
    search: q.get("search") ?? "",
    agency_id: q.getAll("agency_id"),
    regional: q.getAll("regional"),
    status_id: q.getAll("status_id"),
    outcome: q.getAll("outcome"),
    cohort: q.getAll("cohort"),
    program: q.getAll("program"),
    susep_active: q.getAll("susep_active"),
    date_from: q.get("date_from") ?? "",
    date_to: q.get("date_to") ?? "",
  };
}

const statusOf = (app: MockApplication) => state.statuses.find((s) => s.id === app.status_id) ?? null;
const outcomeOf = (app: MockApplication): Outcome => statusOf(app)?.outcome ?? "unmapped";
const candidateOf = (app: MockApplication) => state.candidates.find((c) => c.id === app.candidate_id)!;
const agencyOf = (app: MockApplication) => state.agencies.find((a) => a.id === app.agency_id)!;

function filterApps(f: Filters): MockApplication[] {
  const term = f.search.trim();
  const key = normalizeKey(term);
  return state.applications.filter((a) => {
    if (term) {
      const hit =
        candidateOf(a).key.includes(key) ||
        a.external_record_id === term ||
        (a.sub_representative ?? "").toLowerCase().includes(term.toLowerCase());
      if (!hit) return false;
    }
    if (f.agency_id.length && !f.agency_id.includes(String(a.agency_id))) return false;
    if (f.regional.length && !f.regional.includes(a.regional ?? "")) return false;
    if (f.status_id.length && !f.status_id.includes(String(a.status_id))) return false;
    if (f.outcome.length && !f.outcome.includes(outcomeOf(a))) return false;
    if (f.cohort.length && !f.cohort.includes(a.cohort_name ?? "")) return false;
    if (f.program.length && !f.program.includes(a.relationship_program ?? "")) return false;
    if (f.susep_active.length && !f.susep_active.includes(a.susep_active ?? "")) return false;
    if (f.date_from && (!a.registered_at || a.registered_at < f.date_from)) return false;
    if (f.date_to && (!a.registered_at || a.registered_at > f.date_to)) return false;
    return true;
  });
}

function row(a: MockApplication) {
  const st = statusOf(a);
  return {
    id: a.id,
    external_record_id: a.external_record_id,
    candidate_id: a.candidate_id,
    full_name: candidateOf(a).name,
    agency_id: a.agency_id,
    agency_name: agencyOf(a).name,
    regional: a.regional,
    sub_representative: a.sub_representative,
    cohort_name: a.cohort_name,
    exam_date: a.exam_date,
    registered_at: a.site_registered_at,
    status_raw: a.status_raw,
    status: { id: st?.id ?? null, label: st?.label ?? a.status_raw, outcome: st?.outcome ?? "unmapped" },
    susep_active: a.susep_active,
    susep_number: a.susep_number,
    relationship_program: a.relationship_program,
    is_demo: a.is_demo,
  };
}

const SORTS: Record<string, (a: MockApplication) => string> = {
  name: (a) => candidateOf(a).key,
  external_id: (a) => a.external_record_id.padStart(12, "0"),
  agency: (a) => agencyOf(a).name,
  regional: (a) => a.regional ?? "",
  registered_at: (a) => a.site_registered_at ?? "",
  status: (a) => a.status_raw ?? "",
  cohort: (a) => a.cohort_name ?? "",
  exam_date: (a) => a.exam_date ?? "",
};

function emptyOutcomes(): Record<Outcome, number> {
  return { in_progress: 0, approved: 0, rejected: 0, hired: 0, withdrawn: 0, unmapped: 0 };
}

function groupStats(by: Record<Outcome, number>, minSample: number) {
  const rates: Record<string, number | null> = {};
  let base = 0;
  for (const m of state.metrics) {
    const den = m.denominator_outcomes.reduce((n, o) => n + by[o], 0);
    const num = m.numerator_outcomes.reduce((n, o) => n + by[o], 0);
    rates[m.code] = den ? Math.round((num / den) * 10000) / 10000 : null;
    base = Math.max(base, den);
  }
  const total = OUTCOMES.reduce((n, o) => n + by[o], 0);
  return { total, by_outcome: by, rates, rate_base: base, low_sample: base < minSample };
}

function count<T>(items: T[], key: (item: T) => string | null) {
  const map = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k != null) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([value, c]) => ({ value, count: c }));
}

function dashboard(apps: MockApplication[]) {
  const minSample = Math.min(...state.metrics.map((m) => m.min_sample_size), 10);
  const total = emptyOutcomes();
  const byAgency = new Map<number, Record<Outcome, number>>();
  const byStatus = new Map<number | null, number>();
  const byAgencyStatus = new Map<string, number>();
  const byMonth = new Map<string, Record<Outcome, number>>();
  const byCohort = new Map<string, Record<Outcome, number>>();
  const cohortDates = new Map<string, string | null>();
  const profiles: Record<string, Map<string, Record<Outcome, number>>> = { susep: new Map(), program: new Map(), regional: new Map() };
  const stages = state.stages.filter((s) => s.is_active).sort((a, b) => a.position - b.position);
  const reached = new Map<number, number>();
  const bump = (map: Map<string, Record<Outcome, number>>, key: string, o: Outcome) => {
    if (!map.has(key)) map.set(key, emptyOutcomes());
    map.get(key)![o]++;
  };

  for (const a of apps) {
    const o = outcomeOf(a);
    total[o]++;
    if (!byAgency.has(a.agency_id)) byAgency.set(a.agency_id, emptyOutcomes());
    byAgency.get(a.agency_id)![o]++;
    byStatus.set(a.status_id, (byStatus.get(a.status_id) ?? 0) + 1);
    const asKey = `${a.agency_id}|${a.status_id}`;
    byAgencyStatus.set(asKey, (byAgencyStatus.get(asKey) ?? 0) + 1);
    if (a.registered_at) bump(byMonth, a.registered_at.slice(0, 7), o);
    if (a.cohort_name) {
      bump(byCohort, a.cohort_name, o);
      cohortDates.set(a.cohort_name, a.exam_date);
    }
    bump(profiles.susep, a.susep_active ?? "Não informado", o);
    bump(profiles.program, a.relationship_program ?? "Não informado", o);
    bump(profiles.regional, a.regional ?? "Não informado", o);
    const stage = state.stages.find((s) => s.id === statusOf(a)?.funnel_stage_id);
    if (stage) for (const s of stages) if (s.position <= stage.position) reached.set(s.id, (reached.get(s.id) ?? 0) + 1);
  }

  const applications = apps.length;
  const metrics = state.metrics.map((m) => {
    const den = m.denominator_outcomes.reduce((n, o) => n + total[o], 0);
    const num = m.numerator_outcomes.reduce((n, o) => n + total[o], 0);
    return {
      code: m.code,
      label: m.label,
      description: m.description,
      value: den ? Math.round((num / den) * 10000) / 10000 : null,
      numerator: num,
      denominator: den,
      min_sample_size: m.min_sample_size,
      low_sample: den < m.min_sample_size,
      is_validated: m.is_validated,
    };
  });
  const profileLabels: Record<string, string> = { susep: "SUSEP ativa", program: "Programa de relacionamento", regional: "Regional" };

  return {
    totals: {
      applications,
      candidates: new Set(apps.map((a) => a.candidate_id)).size,
      classified: applications - total.unmapped,
      by_outcome: total,
    },
    metrics,
    min_sample_size: minSample,
    unmapped_statuses: state.statuses
      .filter((s) => s.outcome === "unmapped" && byStatus.get(s.id))
      .map((s) => ({ id: s.id, label: s.label, count: byStatus.get(s.id) ?? 0 })),
    agencies: [...byAgency.entries()]
      .map(([id, by]) => ({ agency_id: id, name: state.agencies.find((a) => a.id === id)?.name ?? "?", ...groupStats(by, minSample) }))
      .sort((a, b) => b.total - a.total),
    statuses: [...byStatus.entries()]
      .map(([id, c]) => {
        const s = state.statuses.find((x) => x.id === id);
        return { status_id: id, label: s?.label ?? "Sem status", outcome: s?.outcome ?? "unmapped", count: c };
      })
      .sort((a, b) => b.count - a.count),
    agency_status: [...byAgencyStatus.entries()].map(([k, c]) => {
      const [agency, status] = k.split("|");
      return { agency_id: Number(agency), status_id: status === "null" ? null : Number(status), count: c };
    }),
    funnel: [
      { id: null, label: "Candidaturas", count: applications, is_provisional: false },
      ...stages.map((s) => ({ id: s.id, label: s.label, count: reached.get(s.id) ?? 0, is_provisional: s.is_provisional })),
    ],
    funnel_configured: state.statuses.some((s) => s.funnel_stage_id != null),
    timeline: [...byMonth.entries()].sort().map(([period, by]) => ({ period, ...groupStats(by, minSample) })),
    cohorts: [...byCohort.entries()]
      .map(([name, by]) => ({ name, exam_date: cohortDates.get(name) ?? null, ...groupStats(by, minSample) }))
      .sort((a, b) => (a.exam_date ?? "").localeCompare(b.exam_date ?? "")),
    profile: Object.entries(profiles).map(([key, groups]) => ({
      key,
      label: profileLabels[key],
      groups: [...groups.entries()]
        .map(([value, by]) => {
          const g = groupStats(by, minSample);
          return g.total < 5
            ? { value, ...g, rates: Object.fromEntries(Object.keys(g.rates).map((k) => [k, null])), suppressed: true }
            : { value, ...g };
        })
        .sort((a, b) => b.total - a.total),
    })),
    profile_min_group: 5,
    time_to_hire_days: null,
  };
}

function detail(app: MockApplication) {
  const agency = agencyOf(app);
  const label = (id: number | null, raw: string | null) => state.statuses.find((s) => s.id === id)?.label ?? raw;
  const batchName = (id: number | null) => state.batches.find((b) => b.id === id)?.file_name ?? null;
  const timeline = [
    ...app.history.map((h) =>
      h.from_raw == null && h.from_id == null
        ? { kind: "created" as const, at: h.at, title: `Entrada pela agência ${agency.name} com status ${label(h.to_id, h.to_raw) ?? "sem status"}`, detail: h.note, author: null, source: batchName(h.batch_id) }
        : { kind: "status" as const, at: h.at, title: `Status alterado de ${label(h.from_id, h.from_raw)} para ${label(h.to_id, h.to_raw)}`, detail: null, author: null, source: batchName(h.batch_id) },
    ),
    ...app.changes.map((c) => ({ kind: "field" as const, at: c.at, title: `${c.field} atualizado por importação`, detail: `${c.old ?? "vazio"} → ${c.new ?? "vazio"}`, author: null, source: batchName(c.batch_id) })),
    ...app.notes.map((n) => ({ kind: "note" as const, at: n.at, title: "Observação interna", detail: n.body, author: n.author, source: null })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const first = state.batches.find((b) => b.id === app.first_batch_id);
  return {
    application: row(app),
    raw_payload: app.raw_payload,
    first_import: first ? { id: first.id, file_name: first.file_name, received_at: first.received_at } : null,
    other_applications: state.applications.filter((a) => a.candidate_id === app.candidate_id && a.id !== app.id).map(row),
    timeline,
  };
}

// ============================================================================ roteamento

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type Body = Record<string, unknown>;

export async function mockRequest<T>(method: string, fullPath: string, body?: unknown): Promise<T> {
  await delay(120 + Math.random() * 160);
  const url = new URL(fullPath, "http://preview.local");
  const data = (body ?? {}) as Body;
  const result = await route(method, url.pathname, url.searchParams, data);
  save();
  return result as T;
}

export async function mockUpload<T>(file: File): Promise<T> {
  const actor = requirePermission("imports.manage");
  if (!file.name.toLowerCase().endsWith(".xlsx")) fail(422, "Envie um arquivo Excel no formato .xlsx.");
  if (file.size > 10 * 1024 * 1024) fail(413, "Arquivo maior que 10 MB.");
  const batch = await importBuffer(file.name, await file.arrayBuffer(), actor, false);
  return publicBatch(batch) as T;
}

async function route(method: string, path: string, query: URLSearchParams, data: Body): Promise<unknown> {
  if (method === "GET" && path === "/api/meta") {
    return { app_name: "MetLife Recruitment CRM", version: "0.2.0", environment: "preview", demo_mode: true };
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
    user.last_login_at = nowIso();
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

  // ------------------------------------------------------------ CRM
  if (method === "GET" && path === "/api/candidates") {
    requirePermission("candidates.view");
    const apps = filterApps(readFilters(query));
    const sortKey = SORTS[query.get("sort") ?? "registered_at"] ? (query.get("sort") ?? "registered_at") : "registered_at";
    const desc = (query.get("order") ?? "desc") === "desc";
    const sorted = [...apps].sort((a, b) => {
      const cmp = SORTS[sortKey](a).localeCompare(SORTS[sortKey](b)) || a.id - b.id;
      return desc ? -cmp : cmp;
    });
    const page = Math.max(1, Number(query.get("page") ?? 1));
    const size = Math.min(200, Math.max(1, Number(query.get("page_size") ?? 25)));
    return { items: sorted.slice((page - 1) * size, page * size).map(row), total: apps.length, page, page_size: size };
  }
  if (method === "GET" && path === "/api/candidates/summary") {
    requirePermission("candidates.view");
    const apps = filterApps(readFilters(query));
    const by = emptyOutcomes();
    for (const a of apps) by[outcomeOf(a)]++;
    return { applications: apps.length, candidates: new Set(apps.map((a) => a.candidate_id)).size, by_outcome: by };
  }
  if (method === "GET" && path === "/api/candidates/options") {
    requirePermission("candidates.view");
    const apps = state.applications;
    const dates = apps.map((a) => a.registered_at).filter((d): d is string => !!d).sort();
    const cohorts = count(apps, (a) => a.cohort_name).map((c) => ({
      ...c,
      exam_date: apps.find((a) => a.cohort_name === c.value)?.exam_date ?? null,
    }));
    return {
      agencies: state.agencies
        .map((ag) => ({ id: ag.id, name: ag.name, count: apps.filter((a) => a.agency_id === ag.id).length }))
        .filter((ag) => ag.count > 0)
        .sort((a, b) => a.name.localeCompare(b.name)),
      regionals: count(apps, (a) => a.regional),
      statuses: state.statuses
        .map((s) => ({ id: s.id, label: s.label, outcome: s.outcome, count: apps.filter((a) => a.status_id === s.id).length }))
        .filter((s) => s.count > 0)
        .sort((a, b) => a.label.localeCompare(b.label)),
      cohorts: cohorts.sort((a, b) => (b.exam_date ?? "").localeCompare(a.exam_date ?? "")),
      programs: count(apps, (a) => a.relationship_program),
      susep_active: count(apps, (a) => a.susep_active),
      date_min: dates[0] ?? null,
      date_max: dates[dates.length - 1] ?? null,
    };
  }
  const appMatch = /^\/api\/applications\/(\d+)(\/notes)?$/.exec(path);
  if (appMatch) {
    const app = state.applications.find((a) => a.id === Number(appMatch[1]));
    if (method === "GET" && !appMatch[2]) {
      requirePermission("candidates.view");
      if (!app) fail(404, "Candidatura não encontrada.");
      return detail(app);
    }
    if (method === "POST" && appMatch[2]) {
      const user = requirePermission("candidates.notes_write");
      if (!app) fail(404, "Candidatura não encontrada.");
      const text = String(data.body ?? "").trim();
      if (!text) fail(422, "Escreva a observação.");
      app.notes.push({ body: text, author: user.name, at: nowIso() });
      audit("candidates.note_added", user, { entity_type: "application", entity_id: String(app.id) });
      return { id: nextId() };
    }
  }
  if (method === "GET" && path === "/api/saved-filters") {
    const user = requirePermission("candidates.view");
    const scope = query.get("scope") ?? "candidates";
    return state.savedFilters
      .filter((f) => f.scope === scope && (f.user_id === user.id || f.is_shared))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((f) => ({ id: f.id, scope: f.scope, name: f.name, definition: f.definition, is_shared: f.is_shared, is_mine: f.user_id === user.id }));
  }
  if (method === "POST" && path === "/api/saved-filters") {
    const user = requirePermission("candidates.view");
    const name = String(data.name ?? "").trim();
    if (!name) fail(422, "Informe um nome.");
    const scope = String(data.scope ?? "candidates");
    let saved = state.savedFilters.find((f) => f.user_id === user.id && f.scope === scope && f.name === name);
    if (!saved) {
      saved = { id: nextId(), user_id: user.id, scope, name, definition: {}, is_shared: false };
      state.savedFilters.push(saved);
    }
    saved.definition = (data.definition as Record<string, unknown>) ?? {};
    saved.is_shared = Boolean(data.is_shared);
    return { ...saved, is_mine: true };
  }
  const savedMatch = /^\/api\/saved-filters\/(\d+)$/.exec(path);
  if (method === "DELETE" && savedMatch) {
    const user = requirePermission("candidates.view");
    const index = state.savedFilters.findIndex((f) => f.id === Number(savedMatch[1]) && f.user_id === user.id);
    if (index < 0) fail(404, "Filtro não encontrado.");
    state.savedFilters.splice(index, 1);
    return undefined;
  }

  // ------------------------------------------------------------ dashboard
  if (method === "GET" && path === "/api/performance/dashboard") {
    requirePermission("performance.view");
    return dashboard(filterApps({ ...readFilters(query), search: "" }));
  }

  // ------------------------------------------------------------ importações
  if (method === "GET" && path === "/api/imports") {
    requirePermission("imports.manage");
    const page = Math.max(1, Number(query.get("page") ?? 1));
    const size = Number(query.get("page_size") ?? 20);
    return {
      items: state.batches.slice((page - 1) * size, page * size).map(publicBatch),
      total: state.batches.length,
      page,
      page_size: size,
    } satisfies Page<ImportBatch>;
  }
  if (method === "POST" && path === "/api/imports/sample-load") {
    const actor = requirePermission("imports.manage");
    const rows = demoSheet();
    const buffer = new TextEncoder().encode(JSON.stringify(rows)).buffer as ArrayBuffer;
    const sha = await sha256(buffer);
    const previous = state.batches.find((b) => b.sha === sha && b.status.startsWith("completed"));
    const batch = newBatch("planilha_ficticia_DEMO_T99.xlsx", buffer.byteLength, sha, actor, rows);
    batch.source = "demo";
    if (previous) {
      batch.status = "skipped_duplicate";
      batch.reprocess_of_id = previous.id;
      batch.finished_at = nowIso();
      batch.error_message = `A planilha fictícia já foi importada no lote #${previous.id}.`;
    } else {
      runImport(batch, true);
    }
    state.batches.unshift(batch);
    audit("imports.uploaded", actor, { entity_type: "import_batch", entity_id: String(batch.id), details: { file_name: batch.file_name } });
    return publicBatch(batch);
  }
  if (method === "POST" && path === "/api/imports/reset") {
    const actor = requirePermission("imports.manage");
    if (String(data.confirmation ?? "").trim().toUpperCase() !== "APAGAR") fail(422, "Digite APAGAR para confirmar.");
    const details = { applications: state.applications.length, import_batches: state.batches.length };
    state.applications = [];
    state.candidates = [];
    state.agencies = [];
    state.batches = [];
    audit("imports.data_reset", actor, { details });
    return undefined;
  }
  const batchMatch = /^\/api\/imports\/(\d+)(\/reprocess)?$/.exec(path);
  if (batchMatch) {
    const actor = requirePermission("imports.manage");
    const original = state.batches.find((b) => b.id === Number(batchMatch[1]));
    if (!original) fail(404, "Importação não encontrada.");
    if (method === "GET" && !batchMatch[2]) {
      return {
        batch: publicBatch(original),
        issues: [...original.issues].sort((a, b) => a.severity.localeCompare(b.severity) || (a.row_number ?? 0) - (b.row_number ?? 0)).slice(0, 500),
        issues_total: original.issues.length,
      };
    }
    if (method === "POST" && batchMatch[2]) {
      const source = original.sheet ? original : state.batches.find((b) => b.id === original.reprocess_of_id);
      if (!source?.sheet) fail(409, "O arquivo original deste lote não está guardado. Envie a planilha novamente.");
      const batch = newBatch(source.file_name, source.file_size ?? 0, source.sha, actor, source.sheet);
      batch.reprocess_of_id = original.id;
      batch.source = source.source;
      runImport(batch, source.source === "demo");
      state.batches.unshift(batch);
      audit("imports.reprocessed", actor, { entity_type: "import_batch", entity_id: String(batch.id) });
      return publicBatch(batch);
    }
  }

  // ------------------------------------------------------------ catálogos
  if (method === "GET" && path === "/api/admin/statuses") {
    requirePermission("catalogs.manage");
    return state.statuses
      .map((s) => ({
        id: s.id,
        code: s.code,
        label: s.label,
        outcome: s.outcome,
        funnel_stage_id: s.funnel_stage_id,
        is_provisional: s.is_provisional,
        raw_values: s.raw_values,
        applications: state.applications.filter((a) => a.status_id === s.id).length,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }
  const statusMatch = /^\/api\/admin\/statuses\/(\d+)$/.exec(path);
  if (method === "PATCH" && statusMatch) {
    const actor = requirePermission("catalogs.manage");
    const status = state.statuses.find((s) => s.id === Number(statusMatch[1]));
    if (!status) fail(404, "Status não encontrado.");
    if (typeof data.label === "string" && data.label.trim()) status.label = data.label.trim();
    if (typeof data.outcome === "string" && (OUTCOMES as string[]).includes(data.outcome)) status.outcome = data.outcome as Outcome;
    if (data.clear_funnel_stage) status.funnel_stage_id = null;
    else if (typeof data.funnel_stage_id === "number") {
      if (!state.stages.some((s) => s.id === data.funnel_stage_id)) fail(422, "Etapa inválida.");
      status.funnel_stage_id = data.funnel_stage_id;
    }
    status.is_provisional = status.outcome === "unmapped";
    audit("catalog.status_updated", actor, { entity_type: "process_status", entity_id: String(status.id), details: { code: status.code, ...data } });
    return status;
  }
  if (method === "GET" && path === "/api/admin/funnel-stages") {
    requirePermission("catalogs.manage");
    return [...state.stages].sort((a, b) => a.position - b.position || a.id - b.id);
  }
  if (method === "POST" && path === "/api/admin/funnel-stages") {
    const actor = requirePermission("catalogs.manage");
    const label = String(data.label ?? "").trim();
    if (!label) fail(422, "Informe o nome da etapa.");
    const stage: MockStage = {
      id: nextId(),
      code: slug(label),
      label,
      position: Math.max(0, ...state.stages.map((s) => s.position)) + 10,
      is_active: true,
      is_provisional: false,
    };
    state.stages.push(stage);
    audit("catalog.stage_created", actor, { details: { label } });
    return stage;
  }
  const stageMatch = /^\/api\/admin\/funnel-stages\/(\d+)$/.exec(path);
  if (stageMatch) {
    const actor = requirePermission("catalogs.manage");
    const stage = state.stages.find((s) => s.id === Number(stageMatch[1]));
    if (!stage) fail(404, "Etapa não encontrada.");
    if (method === "PATCH") {
      if (typeof data.label === "string" && data.label.trim()) stage.label = data.label.trim();
      if (typeof data.position === "number") stage.position = data.position;
      if (typeof data.is_active === "boolean") stage.is_active = data.is_active;
      stage.is_provisional = false;
      audit("catalog.stage_updated", actor, { details: data });
      return stage;
    }
    if (method === "DELETE") {
      for (const s of state.statuses) if (s.funnel_stage_id === stage.id) s.funnel_stage_id = null;
      state.stages = state.stages.filter((s) => s.id !== stage.id);
      audit("catalog.stage_deleted", actor, { details: { label: stage.label } });
      return undefined;
    }
  }
  if (method === "GET" && path === "/api/admin/metrics") {
    requirePermission("catalogs.manage");
    return state.metrics;
  }
  const metricMatch = /^\/api\/admin\/metrics\/([a-z_]+)$/.exec(path);
  if (method === "PATCH" && metricMatch) {
    const actor = requirePermission("catalogs.manage");
    const metric = state.metrics.find((m) => m.code === metricMatch[1]);
    if (!metric) fail(404, "Indicador não encontrado.");
    if (Array.isArray(data.denominator_outcomes) && data.denominator_outcomes.length === 0) {
      fail(422, "O denominador precisa de pelo menos uma categoria.");
    }
    if (Array.isArray(data.numerator_outcomes)) metric.numerator_outcomes = data.numerator_outcomes as Outcome[];
    if (Array.isArray(data.denominator_outcomes)) metric.denominator_outcomes = data.denominator_outcomes as Outcome[];
    if (typeof data.min_sample_size === "number") metric.min_sample_size = data.min_sample_size;
    if (typeof data.is_validated === "boolean") metric.is_validated = data.is_validated;
    audit("catalog.metric_updated", actor, { details: { code: metric.code, ...data } });
    return metric;
  }

  // ------------------------------------------------------------ usuários e auditoria
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
      id: nextId(),
      name,
      email,
      password: String(data.password),
      role: data.role === "admin" ? "admin" : "viewer",
      is_active: true,
      last_login_at: null,
      created_at: nowIso(),
    };
    state.users.push(user);
    audit("user.created", actor, { entity_type: "user", entity_id: String(user.id), details: { email, role: user.role } });
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
      const losingAdmin = user.role === "admin" && user.is_active && (data.role === "viewer" || data.is_active === false);
      if (losingAdmin && activeAdmins <= 1) fail(400, "É preciso manter pelo menos um administrador ativo.");
      if (user.id === actor.id && data.is_active === false) fail(400, "Você não pode desativar o próprio acesso.");
      const applied: Record<string, unknown> = {};
      for (const field of ["name", "role", "is_active"] as const) {
        if (data[field] !== undefined && data[field] !== user[field]) {
          (user as unknown as Record<string, unknown>)[field] = data[field];
          applied[field] = data[field];
        }
      }
      if (Object.keys(applied).length) audit("user.updated", actor, { entity_type: "user", entity_id: String(user.id), details: applied });
      return publicUser(user);
    }
  }
  if (method === "GET" && path === "/api/admin/audit-logs") {
    requirePermission("audit.view");
    const page = Math.max(1, Number(query.get("page") ?? 1));
    const size = Math.min(100, Math.max(1, Number(query.get("page_size") ?? 25)));
    const action = query.get("action") ?? "";
    const rows = state.audit.filter((a) => a.action.startsWith(action));
    return { items: rows.slice((page - 1) * size, page * size), total: rows.length, page, page_size: size } satisfies Page<AuditLog>;
  }

  fail(404, "Recurso não disponível na pré-visualização.");
}

