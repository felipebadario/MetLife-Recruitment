/** Peças de indicadores usadas no dashboard e na apresentação exportável. */
import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";

import { CompositionBar } from "@/components/charts/charts";
import type { Filters } from "@/lib/filters";
import { OUTCOME_COLORS, OUTCOME_LABELS, OUTCOME_ORDER, formatRate } from "@/lib/outcomes";
import type { Dashboard, FilterOptions, GroupStats, Outcome } from "@/lib/types";
import { cn, formatDate, formatNumber } from "@/lib/utils";

export const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function monthLabel(period: string): string {
  const [year, month] = period.split("-");
  return `${MONTHS[Number(month) - 1]}/${year.slice(2)}`;
}

export function SampleTag({ base, min }: { base: number; min: number }) {
  return (
    <span
      className="ml-1.5 rounded-full bg-warning-50 px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-warning-700"
      title={`Taxa calculada sobre ${base} candidaturas classificadas (menos de ${min}). Interprete com cautela.`}
    >
      amostra pequena
    </span>
  );
}

/** Linhas de barras por classificação (em ordem fixa), sem as classificações zeradas. */
export function outcomeBars(byOutcome: Record<Outcome, number>) {
  return OUTCOME_ORDER.filter((o) => byOutcome[o] > 0).map((o) => ({
    key: o,
    label: OUTCOME_LABELS[o],
    value: byOutcome[o],
    color: OUTCOME_COLORS[o],
  }));
}

/** Linhas de barras por status VGCF, opcionalmente restritas a uma agência e/ou representante. */
export function statusBars(data: Dashboard, scope: { agencyId?: number | null; representative?: string | null } = {}) {
  const counts = new Map<number | null, number>();
  if (scope.representative != null) {
    for (const row of data.representative_status) {
      if (row.name !== scope.representative || (scope.agencyId != null && row.agency_id !== scope.agencyId)) continue;
      counts.set(row.status_id, (counts.get(row.status_id) ?? 0) + row.count);
    }
  } else if (scope.agencyId != null) {
    for (const row of data.agency_status) {
      if (row.agency_id === scope.agencyId) counts.set(row.status_id, (counts.get(row.status_id) ?? 0) + row.count);
    }
  } else {
    for (const s of data.statuses) counts.set(s.status_id, s.count);
  }
  return data.statuses
    .map((s) => ({
      key: String(s.status_id),
      label: (
        <>
          {s.label} <span className="text-muted">({OUTCOME_LABELS[s.outcome]})</span>
        </>
      ),
      value: counts.get(s.status_id) ?? 0,
      color: OUTCOME_COLORS[s.outcome],
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
}

export interface RankRow extends GroupStats {
  key: string;
  name: string;
  agency?: string;
}

type RankKey = "name" | "agency" | "total" | Outcome | "approval_rate" | "hiring_rate" | "rejection_rate" | "withdrawal_rate";

const COUNT_COLUMNS: { key: Outcome; label: string }[] = [
  { key: "in_progress", label: "Em andamento" },
  { key: "approved", label: "Aprovados" },
  { key: "hired", label: "Contratados" },
  { key: "rejected", label: "Reprovados" },
  { key: "withdrawn", label: "Desistências" },
  { key: "unmapped", label: "Sem classificação" },
];

const RATE_COLUMNS: { key: "approval_rate" | "hiring_rate" | "rejection_rate" | "withdrawal_rate"; label: string }[] = [
  { key: "approval_rate", label: "Aprovação" },
  { key: "hiring_rate", label: "Contratação" },
  { key: "rejection_rate", label: "Reprovação" },
  { key: "withdrawal_rate", label: "Desistência" },
];

function rankValue(row: RankRow, key: RankKey): number | string {
  if (key === "name") return row.name;
  if (key === "agency") return row.agency ?? "";
  if (key === "total") return row.total;
  if (key in row.by_outcome) return row.by_outcome[key as Outcome];
  return row.rates[key] ?? -1;
}

/**
 * Tabela de desempenho (agências ou representantes): volume por classificação ao lado das
 * taxas, para não comparar só pelo tamanho. Ordenável na tela; estática na apresentação.
 */
export function RankingTable({
  rows,
  firstLabel,
  minSample,
  showAgency = false,
  onSelect,
  selectLabel,
  print = false,
}: {
  rows: RankRow[];
  firstLabel: string;
  minSample: number;
  showAgency?: boolean;
  onSelect?: (row: RankRow) => void;
  selectLabel?: (row: RankRow) => string;
  print?: boolean;
}) {
  const [sort, setSort] = useState<{ key: RankKey; desc: boolean }>({ key: "total", desc: true });
  const sorted = useMemo(() => {
    if (print) return rows;
    return [...rows].sort((a, b) => {
      const va = rankValue(a, sort.key);
      const vb = rankValue(b, sort.key);
      const cmp = typeof va === "string" ? va.localeCompare(String(vb)) : va - (vb as number);
      return sort.desc ? -cmp : cmp;
    });
  }, [rows, sort, print]);
  const showUnmapped = rows.some((r) => r.by_outcome.unmapped > 0);
  const counts = COUNT_COLUMNS.filter((c) => c.key !== "unmapped" || showUnmapped);

  const header = (key: RankKey, label: string, right = true) => (
    <th key={key} scope="col" className={cn("px-2.5 py-2 font-semibold whitespace-nowrap", right && "text-right")}>
      {print ? (
        label
      ) : (
        <button
          className="inline-flex items-center gap-1 hover:text-ink"
          onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== "name" && key !== "agency" }))}
        >
          {label}
          {sort.key === key &&
            (sort.desc ? <ArrowDown className="size-3.5 text-brand-500" /> : <ArrowUp className="size-3.5 text-brand-500" />)}
        </button>
      )}
    </th>
  );

  return (
    <div className={cn(!print && "overflow-x-auto")}>
      <table className={cn("w-full text-left", print ? "text-[12px]" : "min-w-[1080px] text-[13px]")}>
        <thead className="bg-surface/60 text-muted">
          <tr>
            {header("name", firstLabel, false)}
            {showAgency && header("agency", "Agência", false)}
            {header("total", "Candidaturas")}
            {counts.map((c) => header(c.key, c.label))}
            {RATE_COLUMNS.map((c) => header(c.key, c.label))}
            <th scope="col" className="w-32 px-2.5 py-2 font-semibold">
              Composição
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sorted.map((row) => (
            <tr
              key={row.key}
              className={cn(onSelect && "cursor-pointer hover:bg-brand-50/50")}
              onClick={onSelect ? () => onSelect(row) : undefined}
              onKeyDown={onSelect ? (e) => e.key === "Enter" && onSelect(row) : undefined}
              tabIndex={onSelect ? 0 : undefined}
              title={onSelect && selectLabel ? selectLabel(row) : undefined}
            >
              <td className="max-w-56 truncate px-2.5 py-2 font-semibold text-ink">{row.name}</td>
              {showAgency && <td className="px-2.5 py-2 whitespace-nowrap text-body">{row.agency}</td>}
              <td className="tabular px-2.5 py-2 text-right font-medium text-ink">{formatNumber(row.total)}</td>
              {counts.map((c) => (
                <td key={c.key} className="tabular px-2.5 py-2 text-right">
                  {formatNumber(row.by_outcome[c.key])}
                </td>
              ))}
              {RATE_COLUMNS.map((c, i) => (
                <td key={c.key} className="tabular px-2.5 py-2 text-right whitespace-nowrap text-ink">
                  {formatRate(row.rates[c.key])}
                  {i === 0 && row.low_sample && row.rate_base > 0 && !print && <SampleTag base={row.rate_base} min={minSample} />}
                </td>
              ))}
              <td className="px-2.5 py-2">
                <CompositionBar byOutcome={row.by_outcome} label={row.name} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function agencyRows(data: Dashboard): RankRow[] {
  return data.agencies.map((a) => ({ ...a, key: String(a.agency_id), name: a.name }));
}

export function representativeRows(data: Dashboard, agencyId?: number | null): RankRow[] {
  return data.representatives
    .filter((r) => agencyId == null || r.agency_id === agencyId)
    .map((r) => ({ ...r, key: `${r.agency_id}:${r.name}`, name: r.name, agency: r.agency_name }));
}

/** Resumo legível do recorte aplicado (para a apresentação). */
export function describeFilters(filters: Filters, options: FilterOptions | undefined): string[] {
  const names = (ids: string[], list: { id: number; name?: string; label?: string }[] | undefined) =>
    ids.map((id) => list?.find((x) => String(x.id) === id)?.name ?? list?.find((x) => String(x.id) === id)?.label ?? id);
  const parts: string[] = [];
  if (filters.agency_id.length) parts.push(`Agência: ${names(filters.agency_id, options?.agencies).join(", ")}`);
  if (filters.sub_representative.length) parts.push(`Representante: ${filters.sub_representative.join(", ")}`);
  if (filters.regional.length) parts.push(`Regional: ${filters.regional.join(", ")}`);
  if (filters.cohort.length) parts.push(`Turma: ${filters.cohort.join(", ")}`);
  if (filters.status_id.length) parts.push(`Status: ${names(filters.status_id, options?.statuses).join(", ")}`);
  if (filters.outcome.length) parts.push(`Classificação: ${filters.outcome.map((o) => OUTCOME_LABELS[o]).join(", ")}`);
  if (filters.susep_active.length) parts.push(`SUSEP ativa: ${filters.susep_active.join(", ")}`);
  if (filters.program.length) parts.push(`Programa: ${filters.program.join(", ")}`);
  if (filters.date_from || filters.date_to) {
    parts.push(`Cadastro: ${filters.date_from ? formatDate(filters.date_from) : "início"} a ${filters.date_to ? formatDate(filters.date_to) : "hoje"}`);
  }
  return parts;
}
