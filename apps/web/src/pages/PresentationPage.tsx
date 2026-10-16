/**
 * Apresentação dos indicadores: uma página 16:9 por tela, pronta para salvar em PDF pela
 * impressão do navegador. Usa os mesmos filtros (na URL) e os mesmos dados do dashboard.
 */
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";

import { HorizontalBars, OutcomeLegend, StackedColumns } from "@/components/charts/charts";
import { BrandMark } from "@/components/layout/BrandMark";
import {
  RankingTable,
  agencyRows,
  describeFilters,
  monthLabel,
  outcomeBars,
  representativeRows,
  statusBars,
  type RankRow,
} from "@/components/performance/indicators";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { api, ApiError, withQuery } from "@/lib/api";
import { filtersToQuery, useFilters } from "@/lib/filters";
import { OUTCOME_LABELS, formatRate } from "@/lib/outcomes";
import type { Dashboard, FilterOptions, GroupStats, Outcome } from "@/lib/types";
import { formatDate, formatDateTime, formatNumber } from "@/lib/utils";

const TABLE_ROWS = 12;
const TOP_REPS = 24;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out.length ? out : [[]];
}

interface SlideSpec {
  key: string;
  section: string;
  title: string;
  subtitle?: string;
  body: ReactNode;
}

function Slide({ spec, page, pages, scope }: { spec: SlideSpec; page: number; pages: number; scope: string }) {
  return (
    <section className="slide mx-auto flex h-[720px] w-[1280px] shrink-0 flex-col bg-white px-14 pt-10 pb-6 shadow-[var(--shadow-panel)]">
      <header className="flex items-start justify-between gap-8">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold tracking-wide text-brand-600">{spec.section}</p>
          <h2 className="mt-1 text-[28px] leading-tight font-bold tracking-tight text-ink">{spec.title}</h2>
          {spec.subtitle && <p className="mt-1 text-[14px] text-muted">{spec.subtitle}</p>}
        </div>
        <BrandMark className="shrink-0" />
      </header>
      <div className="mt-4 min-h-0 flex-1 overflow-hidden">{spec.body}</div>
      <footer className="mt-4 flex items-center justify-between gap-6 border-t border-line pt-3 text-[11px] text-muted">
        <span className="truncate">{scope}</span>
        <span className="tabular shrink-0">
          {page} / {pages}
        </span>
      </footer>
    </section>
  );
}

const KPI_OUTCOMES: Outcome[] = ["in_progress", "approved", "hired", "rejected", "withdrawn"];

function KpiGrid({ stats }: { stats: GroupStats }) {
  const items = [
    { label: "Candidaturas", value: formatNumber(stats.total) },
    ...KPI_OUTCOMES.map((o) => ({ label: OUTCOME_LABELS[o], value: formatNumber(stats.by_outcome[o]) })),
    { label: "Taxa de aprovação", value: formatRate(stats.rates.approval_rate) },
    { label: "Taxa de contratação", value: formatRate(stats.rates.hiring_rate) },
    { label: "Taxa de reprovação", value: formatRate(stats.rates.rejection_rate) },
    { label: "Taxa de desistência", value: formatRate(stats.rates.withdrawal_rate) },
  ];
  return (
    <dl className="grid grid-cols-5 gap-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-[var(--radius-control)] border border-line px-4 py-3">
          <dt className="text-[12px] text-muted">{item.label}</dt>
          <dd className="tabular mt-0.5 text-[22px] font-semibold text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-control)] border border-line p-4">
      <h3 className="mb-3 text-[14px] font-semibold text-ink">{title}</h3>
      {children}
    </div>
  );
}

function rankingSlides(
  rows: RankRow[],
  base: Omit<SlideSpec, "key" | "body">,
  key: string,
  minSample: number,
  showAgency = false,
): SlideSpec[] {
  const pages = chunk(rows, TABLE_ROWS);
  return pages.map((page, i) => ({
    ...base,
    key: `${key}-${i}`,
    subtitle: pages.length > 1 ? `${base.subtitle ?? ""} (parte ${i + 1} de ${pages.length})`.trim() : base.subtitle,
    body: (
      <div className="flex flex-col gap-3">
        <OutcomeLegend />
        <RankingTable rows={page} firstLabel={showAgency ? "Representante" : "Agência"} showAgency={showAgency} minSample={minSample} print />
      </div>
    ),
  }));
}

function buildSlides(data: Dashboard, scopeLines: string[], perAgency: boolean, perAgencyReps: boolean): SlideSpec[] {
  const totals: GroupStats = {
    total: data.totals.applications,
    by_outcome: data.totals.by_outcome,
    rates: Object.fromEntries(data.metrics.map((m) => [m.code, m.value])),
    rate_base: 0,
    low_sample: false,
  };
  const slides: SlideSpec[] = [
    {
      key: "cover",
      section: "MetLife Recruitment CRM",
      title: "Indicadores de recrutamento",
      subtitle: `Gerado em ${formatDateTime(new Date().toISOString())}`,
      body: (
        <div className="flex h-full flex-col justify-between">
          <div className="max-w-3xl">
            <p className="text-[15px] text-body">
              {formatNumber(data.totals.applications)} candidaturas de {formatNumber(data.totals.candidates)} candidatos,
              em {formatNumber(data.agencies.length)} agências e {formatNumber(data.representatives.length)} representantes.
            </p>
            <h3 className="mt-8 text-[14px] font-semibold text-ink">Recorte</h3>
            <ul className="mt-2 space-y-1 text-[14px] text-body">
              {(scopeLines.length ? scopeLines : ["Todas as candidaturas, sem filtros."]).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <p className="text-[12px] text-muted">
            Taxas calculadas sobre candidaturas classificadas.
            {data.metrics.some((m) => !m.is_validated) && " As fórmulas das taxas são provisórias até a validação da área de negócio."}
          </p>
        </div>
      ),
    },
    {
      key: "overview",
      section: "Visão geral",
      title: "Indicadores gerais",
      subtitle: [
        `${formatNumber(data.totals.candidates)} candidatos únicos.`,
        data.totals.by_outcome.unmapped
          ? `${formatNumber(data.totals.by_outcome.unmapped)} candidaturas com status ainda sem classificação ficam fora das taxas.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
      body: (
        <div className="flex flex-col gap-5">
          <KpiGrid stats={totals} />
          <div className="grid grid-cols-2 gap-5">
            <Box title="Resultado por classificação">
              <HorizontalBars total={data.totals.applications} rows={outcomeBars(data.totals.by_outcome)} />
            </Box>
            <Box title="Status VGCF mais frequentes">
              <HorizontalBars total={data.totals.applications} rows={statusBars(data).slice(0, 6)} />
            </Box>
          </div>
        </div>
      ),
    },
    ...rankingSlides(
      agencyRows(data),
      { section: "Agências", title: "Ranking de agências", subtitle: "Ordenado pelo número de candidaturas." },
      "agencies",
      data.min_sample_size,
    ),
    {
      key: "statuses",
      section: "Status",
      title: "Distribuição por status VGCF",
      subtitle: "Todos os status do recorte, com a classificação de cada um.",
      body: (
        <div className="columns-2 gap-8">
          <HorizontalBars total={data.totals.applications} rows={statusBars(data)} />
        </div>
      ),
    },
    ...rankingSlides(
      representativeRows(data).slice(0, TOP_REPS),
      {
        section: "Representantes",
        title: "Desempenho por representante",
        subtitle:
          data.representatives.length > TOP_REPS
            ? `Os ${TOP_REPS} representantes com mais candidaturas, de ${formatNumber(data.representatives.length)}. A lista completa está nas páginas de cada agência.`
            : "Todos os representantes, ordenados pelo número de candidaturas.",
      },
      "reps",
      data.min_sample_size,
      true,
    ),
    {
      key: "timeline",
      section: "Evolução",
      title: "Evolução mensal",
      subtitle: "Candidaturas por mês de cadastro no site, separadas pelo resultado atual.",
      body: (
        <div className="flex flex-col gap-4">
          <OutcomeLegend />
          <StackedColumns
            periods={data.timeline.slice(-18).map((t) => ({ key: t.period, label: monthLabel(t.period), byOutcome: t.by_outcome }))}
          />
          <PeriodTable rows={data.timeline.slice(-6).map((t) => ({ ...t, name: monthLabel(t.period) }))} label="Mês" />
        </div>
      ),
    },
    ...chunk(data.cohorts, TABLE_ROWS).map((page, i, all) => ({
      key: `cohorts-${i}`,
      section: "Turmas",
      title: "Resultado por turma",
      subtitle: all.length > 1 ? `Parte ${i + 1} de ${all.length}` : undefined,
      body: (
        <PeriodTable
          label="Turma"
          rows={page.map((c) => ({ ...c, name: c.exam_date ? `${c.name} (prova em ${formatDate(c.exam_date)})` : c.name }))}
        />
      ),
    })),
  ];

  if (perAgency) {
    for (const agency of data.agencies) {
      const reps = representativeRows(data, agency.agency_id);
      slides.push({
        key: `agency-${agency.agency_id}`,
        section: "Agência",
        title: agency.name,
        subtitle: reps.length === 1 ? "1 representante" : `${formatNumber(reps.length)} representantes`,
        body: (
          <div className="flex flex-col gap-5">
            <KpiGrid stats={agency} />
            <div className="grid grid-cols-2 gap-5">
              <Box title="Resultado por classificação">
                <HorizontalBars total={agency.total} rows={outcomeBars(agency.by_outcome)} />
              </Box>
              <Box title="Status VGCF">
                <HorizontalBars total={agency.total} rows={statusBars(data, { agencyId: agency.agency_id }).slice(0, 6)} />
              </Box>
            </div>
          </div>
        ),
      });
      if (perAgencyReps && reps.length) {
        slides.push(
          ...rankingSlides(
            reps,
            { section: `Agência ${agency.name}`, title: "Representantes", subtitle: "Resultado de cada representante desta agência." },
            `agency-${agency.agency_id}-reps`,
            data.min_sample_size,
            true,
          ),
        );
      }
    }
  }
  return slides;
}

function PeriodTable({ rows, label }: { rows: (GroupStats & { name: string })[]; label: string }) {
  return (
    <table className="w-full text-left text-[12px]">
      <thead className="bg-surface/60 text-muted">
        <tr>
          <th className="px-2.5 py-2 font-semibold">{label}</th>
          <th className="px-2.5 py-2 text-right font-semibold">Candidaturas</th>
          {KPI_OUTCOMES.map((o) => (
            <th key={o} className="px-2.5 py-2 text-right font-semibold">
              {OUTCOME_LABELS[o]}
            </th>
          ))}
          <th className="px-2.5 py-2 text-right font-semibold">Aprovação</th>
          <th className="px-2.5 py-2 text-right font-semibold">Contratação</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r) => (
          <tr key={r.name}>
            <td className="px-2.5 py-2 font-medium text-ink">{r.name}</td>
            <td className="tabular px-2.5 py-2 text-right">{formatNumber(r.total)}</td>
            {KPI_OUTCOMES.map((o) => (
              <td key={o} className="tabular px-2.5 py-2 text-right">
                {formatNumber(r.by_outcome[o])}
              </td>
            ))}
            <td className="tabular px-2.5 py-2 text-right">{formatRate(r.rates.approval_rate)}</td>
            <td className="tabular px-2.5 py-2 text-right">{formatRate(r.rates.hiring_rate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PresentationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { filters } = useFilters();
  const query = filtersToQuery({ ...filters, search: "" });
  const [perAgency, setPerAgency] = useState(true);
  const [perAgencyReps, setPerAgencyReps] = useState(true);

  const options = useQuery({
    queryKey: ["candidate-options"],
    queryFn: () => api.get<FilterOptions>("/api/candidates/options"),
  });
  const dashboard = useQuery({
    queryKey: ["dashboard", JSON.stringify(query)],
    queryFn: () => api.get<Dashboard>(withQuery("/api/performance/dashboard", query)),
  });

  const scopeLines = describeFilters(filters, options.data);
  const scope = scopeLines.length ? scopeLines.join(" · ") : "Todas as candidaturas";
  const slides = dashboard.data ? buildSlides(dashboard.data, scopeLines, perAgency, perAgencyReps) : [];

  return (
    <div className="min-h-screen bg-surface print:bg-white">
      <div className="no-print sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/performance${location.search}`)}>
            <ArrowLeft className="size-4" aria-hidden />
            Voltar ao dashboard
          </Button>
          <span className="text-[13px] text-muted">
            {slides.length ? `${slides.length} páginas` : "Montando apresentação…"}
          </span>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" className="size-4 accent-brand-500" checked={perAgency} onChange={(e) => setPerAgency(e.target.checked)} />
            Uma página por agência
          </label>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              className="size-4 accent-brand-500"
              checked={perAgencyReps}
              disabled={!perAgency}
              onChange={(e) => setPerAgencyReps(e.target.checked)}
            />
            Representantes de cada agência
          </label>
          <Button className="ml-auto" size="sm" onClick={() => window.print()} disabled={!slides.length}>
            <Printer className="size-4" aria-hidden />
            Salvar em PDF
          </Button>
        </div>
        <p className="mx-auto max-w-[1280px] px-4 pb-2 text-xs text-muted">
          Na janela que abrir, escolha "Salvar como PDF" como destino. Cada tela abaixo vira uma página da apresentação.
        </p>
      </div>

      <div className="overflow-x-auto py-6 print:overflow-visible print:py-0">
        {dashboard.isError ? (
          <div className="mx-auto max-w-xl">
            <Alert>{dashboard.error instanceof ApiError ? dashboard.error.message : "Não foi possível carregar os indicadores."}</Alert>
          </div>
        ) : !dashboard.data ? (
          <Skeleton className="mx-auto h-[720px] w-[1280px]" />
        ) : (
          <div className="flex flex-col gap-6 print:gap-0">
            {slides.map((spec, i) => (
              <Slide key={spec.key} spec={spec} page={i + 1} pages={slides.length} scope={scope} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
