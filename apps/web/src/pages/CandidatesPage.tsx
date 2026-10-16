import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  FileSpreadsheet,
  SearchX,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";

import { useAuth } from "@/auth/AuthProvider";
import { FilterBar } from "@/components/filters/FilterBar";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DialogContent, DialogRoot } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input } from "@/components/ui/Field";
import { MetricStrip } from "@/components/ui/MetricStrip";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";
import { api, ApiError, withQuery } from "@/lib/api";
import { fieldLabel, useSystemFields } from "@/lib/fields";
import { activeFilterCount, filtersFromSearch, filtersToQuery, useFilters, type Filters } from "@/lib/filters";
import { outcomeTone } from "@/lib/outcomes";
import type { ApplicationRow, CandidatesSummary, FilterOptions, Page, SavedFilter, SystemField } from "@/lib/types";
import { cn, formatDate, formatNumber, formatRegistered } from "@/lib/utils";

import { CandidateSheet } from "./candidates/CandidateSheet";

type SortKey = "name" | "external_id" | "agency" | "regional" | "registered_at" | "status" | "cohort" | "exam_date";

interface Column {
  key: string;
  label: string;
  /** Campo do Padrão da planilha: se o administrador renomeou, vale o nome dado lá. */
  field?: string;
  sort?: SortKey;
  defaultVisible: boolean;
  render: (row: ApplicationRow) => ReactNode;
}

const COLUMNS: Column[] = [
  {
    key: "name",
    field: "full_name",
    label: "Candidato",
    sort: "name",
    defaultVisible: true,
    render: (r) => <span className="font-semibold text-ink">{r.full_name}</span>,
  },
  { key: "id", field: "external_record_id", label: "ID", sort: "external_id", defaultVisible: false, render: (r) => <span className="tabular">{r.external_record_id ?? "—"}</span> },
  { key: "agency", field: "agency", label: "Agência", sort: "agency", defaultVisible: true, render: (r) => r.agency_name },
  { key: "regional", field: "regional", label: "Regional", sort: "regional", defaultVisible: true, render: (r) => r.regional ?? "—" },
  { key: "cohort", field: "cohort_name", label: "Turma", sort: "cohort", defaultVisible: true, render: (r) => r.cohort_name ?? "—" },
  {
    key: "registered",
    field: "site_registered_at",
    label: "Data de cadastro",
    sort: "registered_at",
    defaultVisible: true,
    render: (r) => <span className="tabular whitespace-nowrap">{formatRegistered(r.registered_at)}</span>,
  },
  {
    key: "status",
    field: "status",
    label: "Status VGCF",
    sort: "status",
    defaultVisible: true,
    render: (r) => (
      <Badge tone={outcomeTone(r.status.outcome)} dot>
        {r.status.label ?? "Sem status"}
      </Badge>
    ),
  },
  { key: "sub", field: "sub_representative", label: "Representante (R.N)", defaultVisible: true, render: (r) => r.sub_representative ?? "—" },
  { key: "status_final", field: "status_final", label: "Status final", defaultVisible: false, render: (r) => r.status_final ?? "—" },
  { key: "status_ens", field: "status_ens", label: "Status ENS", defaultVisible: false, render: (r) => r.status_ens ?? "—" },
  { key: "executive", field: "executive", label: "Executivo", defaultVisible: false, render: (r) => r.executive ?? "—" },
  { key: "branch", field: "agency_branch", label: "Código da agência", defaultVisible: false, render: (r) => r.agency_branch ?? "—" },
  { key: "exams", field: "exams_count", label: "Provas", defaultVisible: false, render: (r) => <span className="tabular">{r.exams_count ?? "—"}</span> },
  { key: "suspended", field: "suspended", label: "Suspenso", defaultVisible: false, render: (r) => r.suspended ?? "—" },
  {
    key: "exam",
    label: "Data da prova",
    sort: "exam_date",
    defaultVisible: false,
    render: (r) => <span className="tabular">{formatDate(r.exam_date)}</span>,
  },
  { key: "susep", field: "susep_active", label: "SUSEP ativa", defaultVisible: false, render: (r) => r.susep_active ?? "—" },
  { key: "program", field: "relationship_program", label: "Programa", defaultVisible: false, render: (r) => r.relationship_program ?? "—" },
];

/** Colunas da tabela com os nomes do Padrão da planilha e os campos novos criados lá. */
function buildColumns(fields: SystemField[] | undefined): Column[] {
  const base = COLUMNS.map((c) => (c.field ? { ...c, label: fieldLabel(fields, c.field, c.label) } : c));
  const custom = (fields ?? [])
    .filter((f) => f.custom && f.active)
    .map<Column>((f) => ({
      key: `campo:${f.field}`,
      label: f.name,
      defaultVisible: false,
      render: (r) => r.custom_fields?.[f.field] ?? "—",
    }));
  return [...base, ...custom];
}

const COLUMNS_STORAGE = "mrc-candidate-columns";
const PAGE_SIZE = 25;

function loadColumns(): string[] {
  try {
    const raw = window.localStorage.getItem(COLUMNS_STORAGE);
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    /* preferências indisponíveis */
  }
  return COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key);
}

function SavedFilters({ filters, onApply }: { filters: Filters; onApply: (f: Filters) => void }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const saved = useQuery({
    queryKey: ["saved-filters", "candidates"],
    queryFn: () => api.get<SavedFilter[]>("/api/saved-filters?scope=candidates"),
  });
  const save = useMutation({
    mutationFn: () =>
      api.post("/api/saved-filters", { scope: "candidates", name, definition: filtersToQuery(filters) }),
    onSuccess: () => {
      setSaving(false);
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["saved-filters"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/api/saved-filters/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["saved-filters"] }),
  });

  function apply(definition: Record<string, unknown>) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(definition)) {
      if (Array.isArray(value)) value.forEach((v) => params.append(key, String(v)));
      else if (value) params.set(key, String(value));
    }
    onApply(filtersFromSearch(params));
  }

  return (
    <>
      <Dropdown.Root>
        <Dropdown.Trigger asChild>
          <Button variant="secondary" size="sm">
            <Bookmark className="size-4" aria-hidden />
            Filtros salvos
          </Button>
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content
            align="end"
            sideOffset={6}
            className="z-50 w-72 animate-fade-in rounded-[var(--radius-panel)] border border-line bg-white p-1.5 shadow-[var(--shadow-overlay)]"
          >
            {(saved.data ?? []).length === 0 && (
              <p className="px-2.5 py-2 text-[13px] text-muted">Nenhum filtro salvo ainda.</p>
            )}
            {(saved.data ?? []).map((f) => (
              <div key={f.id} className="flex items-center gap-1">
                <Dropdown.Item
                  onSelect={() => apply(f.definition)}
                  className="min-w-0 flex-1 cursor-pointer truncate rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none data-[highlighted]:bg-brand-50"
                >
                  {f.name}
                </Dropdown.Item>
                {f.is_mine && (
                  <button
                    className="rounded-md p-1.5 text-muted hover:bg-danger-50 hover:text-danger-600"
                    aria-label={`Excluir filtro ${f.name}`}
                    onClick={() => remove.mutate(f.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
            <Dropdown.Separator className="my-1 h-px bg-line" />
            <Dropdown.Item
              disabled={activeFilterCount(filters) === 0}
              onSelect={() => setSaving(true)}
              className="cursor-pointer rounded-md px-2.5 py-1.5 text-[13px] font-medium text-brand-600 outline-none data-[disabled]:cursor-default data-[disabled]:text-muted data-[highlighted]:bg-brand-50"
            >
              Salvar filtros atuais
            </Dropdown.Item>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
      <DialogRoot open={saving} onOpenChange={setSaving}>
        <DialogContent title="Salvar filtros" description="Os filtros aplicados agora ficam disponíveis para reaplicar com um clique.">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
            className="flex flex-col gap-4"
          >
            <Field label="Nome">
              {(p) => <Input {...p} required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />}
            </Field>
            {save.error && <Alert>{save.error instanceof ApiError ? save.error.message : "Não foi possível salvar."}</Alert>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setSaving(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={save.isPending}>
                Salvar filtros
              </Button>
            </div>
          </form>
        </DialogContent>
      </DialogRoot>
    </>
  );
}

function ColumnPicker({
  columns,
  visible,
  onChange,
}: {
  columns: Column[];
  visible: string[];
  onChange: (keys: string[]) => void;
}) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <Button variant="secondary" size="sm">
          <Columns3 className="size-4" aria-hidden />
          Colunas
        </Button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="end"
          sideOffset={6}
          className="z-50 max-h-[70vh] w-56 animate-fade-in overflow-y-auto rounded-[var(--radius-panel)] border border-line bg-white p-1.5 shadow-[var(--shadow-overlay)]"
        >
          {columns.map((column) => {
            const checked = visible.includes(column.key);
            return (
              <Dropdown.CheckboxItem
                key={column.key}
                checked={checked}
                disabled={column.key === "name"}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(next) =>
                  onChange(next ? [...visible, column.key] : visible.filter((k) => k !== column.key))
                }
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none data-[disabled]:cursor-default data-[disabled]:text-muted data-[highlighted]:bg-brand-50"
              >
                <span
                  className={cn(
                    "grid size-4 place-items-center rounded border",
                    checked ? "border-brand-500 bg-brand-500 text-white" : "border-line-strong",
                  )}
                >
                  {checked && <Check className="size-3" strokeWidth={3} />}
                </span>
                {column.label}
              </Dropdown.CheckboxItem>
            );
          })}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

export function CandidatesPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const { filters, setFilters, clear } = useFilters();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: SortKey; order: "asc" | "desc" }>({ key: "registered_at", order: "desc" });
  const [visible, setVisible] = useState<string[]>(loadColumns);
  const fields = useSystemFields();
  const allColumns = useMemo(() => buildColumns(fields.data), [fields.data]);
  const [selected, setSelected] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const filterQuery = filtersToQuery(filters);
  const filterKey = JSON.stringify(filterQuery);
  useEffect(() => setPage(1), [filterKey]);
  useEffect(() => {
    try {
      window.localStorage.setItem(COLUMNS_STORAGE, JSON.stringify(visible));
    } catch {
      /* ignora */
    }
  }, [visible]);

  const options = useQuery({
    queryKey: ["candidate-options"],
    queryFn: () => api.get<FilterOptions>("/api/candidates/options"),
  });
  const summary = useQuery({
    queryKey: ["candidates-summary", filterKey],
    queryFn: () => api.get<CandidatesSummary>(withQuery("/api/candidates/summary", filterQuery)),
    placeholderData: keepPreviousData,
  });
  const list = useQuery({
    queryKey: ["candidates", filterKey, page, sort],
    queryFn: () =>
      api.get<Page<ApplicationRow>>(
        withQuery("/api/candidates", { ...filterQuery, page, page_size: PAGE_SIZE, sort: sort.key, order: sort.order }),
      ),
    placeholderData: keepPreviousData,
  });

  const s = summary.data;
  const columns = allColumns.filter((c) => visible.includes(c.key));
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;
  const emptyBase = list.data?.total === 0 && activeFilterCount(filters) === 0;

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key ? { key, order: current.order === "asc" ? "desc" : "asc" } : { key, order: key === "registered_at" ? "desc" : "asc" },
    );
  }

  async function exportExcel() {
    setExporting(true);
    setExportError(null);
    try {
      await api.download(withQuery("/api/candidates/export", filterQuery), "candidaturas.xlsx");
    } catch (error) {
      setExportError(error instanceof ApiError ? error.message : "Não foi possível exportar.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <MetricStrip
        loading={summary.isPending}
        metrics={[
          { label: "Candidatos únicos", value: s?.candidates ?? null },
          { label: "Candidaturas no período", value: s?.applications ?? null },
          { label: "Em andamento", value: s?.by_outcome.in_progress ?? null },
          { label: "Aprovadas", value: s?.by_outcome.approved ?? null },
          { label: "Reprovadas", value: s?.by_outcome.rejected ?? null },
          { label: "Contratações confirmadas", value: s?.by_outcome.hired ?? null, positive: true },
        ]}
      />
      {s && s.by_outcome.unmapped > 0 && s.applications > 0 && (
        <Alert tone="info">
          {formatNumber(s.by_outcome.unmapped)} candidaturas têm status ainda não classificado e não entram nos totais
          de aprovadas, reprovadas e contratações.
          {can("catalogs.manage") && (
            <>
              {" "}
              <button className="font-semibold underline" onClick={() => navigate("/administracao/catalogos")}>
                Classificar status
              </button>
            </>
          )}
        </Alert>
      )}

      <Panel>
        <div className="border-b border-line px-5 py-4">
          <FilterBar
            withSearch
            filters={filters}
            options={options.data}
            onChange={setFilters}
            onClear={clear}
            actions={
              <>
                <SavedFilters filters={filters} onApply={(f) => setFilters(f)} />
                <ColumnPicker columns={allColumns} visible={visible} onChange={setVisible} />
                {can("candidates.export") && (
                  <Button variant="secondary" size="sm" onClick={exportExcel} loading={exporting}>
                    <Download className="size-4" aria-hidden />
                    Exportar Excel
                  </Button>
                )}
              </>
            }
          />
          {exportError && <Alert className="mt-3">{exportError}</Alert>}
        </div>

        {list.isPending ? (
          <div className="flex flex-col gap-2.5 p-5">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : list.isError ? (
          <div className="p-5">
            <Alert>{list.error instanceof ApiError ? list.error.message : "Não foi possível carregar os candidatos."}</Alert>
          </div>
        ) : emptyBase ? (
          <EmptyState
            icon={FileSpreadsheet}
            title="Nenhum candidato na base ainda"
            description="Os candidatos aparecem aqui depois da importação da planilha de uma turma."
            action={
              can("imports.manage") ? (
                <Button onClick={() => navigate("/importacao")}>Importar planilha</Button>
              ) : undefined
            }
          />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="Nenhum candidato com esses filtros"
            description="Ajuste ou limpe os filtros para ver mais resultados."
            action={
              <Button variant="secondary" onClick={clear}>
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <>
            <div className={cn("overflow-x-auto transition-opacity", list.isFetching && "opacity-60")}>
              <table className="w-full min-w-[860px] text-left text-[13px]">
                <thead className="bg-surface/60 text-muted">
                  <tr>
                    {columns.map((column) => (
                      <th key={column.key} scope="col" className="px-5 py-2.5 font-semibold whitespace-nowrap">
                        {column.sort ? (
                          <button
                            onClick={() => toggleSort(column.sort!)}
                            className="inline-flex items-center gap-1 hover:text-ink"
                            aria-label={`Ordenar por ${column.label}`}
                          >
                            {column.label}
                            {sort.key === column.sort &&
                              (sort.order === "asc" ? (
                                <ArrowUp className="size-3.5 text-brand-500" />
                              ) : (
                                <ArrowDown className="size-3.5 text-brand-500" />
                              ))}
                          </button>
                        ) : (
                          column.label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {list.data.items.map((row) => (
                    <tr
                      key={row.id}
                      tabIndex={0}
                      onClick={() => setSelected(row.id)}
                      onKeyDown={(e) => e.key === "Enter" && setSelected(row.id)}
                      className="cursor-pointer text-body hover:bg-brand-50/50 focus-visible:bg-brand-50"
                    >
                      {columns.map((column) => (
                        <td key={column.key} className="px-5 py-2.5">
                          {column.render(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-[13px] text-muted">
              <span className="tabular">{formatNumber(list.data.total)} candidaturas</span>
              <div className="flex items-center gap-2">
                <span className="tabular">
                  Página {page} de {totalPages}
                </span>
                <Button variant="secondary" size="sm" aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label="Próxima página"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Panel>

      <CandidateSheet applicationId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
