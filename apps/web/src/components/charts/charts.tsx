/**
 * Gráficos do dashboard, em HTML/CSS: barras finas, cantos de 4px na ponta dos dados,
 * 2px de respiro entre segmentos, eixos discretos, rótulos em tinta de texto (nunca na cor
 * da série) e dica ao passar o mouse. Cor por classificação, na ordem do catálogo.
 */
import { useState, type ReactNode } from "react";

import { useOutcomes } from "@/lib/outcomes";
import type { Outcome } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";

export function OutcomeLegend({ outcomes }: { outcomes?: Outcome[] }) {
  const catalog = useOutcomes();
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-body">
      {(outcomes ?? catalog.order).map((o) => (
        <li key={o} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: catalog.color(o) }} aria-hidden />
          {catalog.label(o)}
        </li>
      ))}
    </ul>
  );
}

function percent(part: number, total: number): string {
  if (!total) return "0%";
  return `${((part / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/** Barra 100% empilhada com a composição por resultado. */
export function CompositionBar({
  byOutcome,
  className,
  label,
}: {
  byOutcome: Record<Outcome, number>;
  className?: string;
  label?: string;
}) {
  const catalog = useOutcomes();
  const total = catalog.order.reduce((n, o) => n + (byOutcome[o] ?? 0), 0);
  const [hover, setHover] = useState<Outcome | null>(null);
  const parts = catalog.order.filter((o) => (byOutcome[o] ?? 0) > 0);
  const summary = parts.map((o) => `${catalog.label(o)}: ${byOutcome[o]}`).join(", ");

  return (
    <div className={cn("relative", className)} role="img" aria-label={`${label ? `${label}. ` : ""}${summary}`}>
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-[4px] bg-surface">
        {parts.map((o) => (
          <span
            key={o}
            onMouseEnter={() => setHover(o)}
            onMouseLeave={() => setHover(null)}
            className="h-full first:rounded-l-[4px] last:rounded-r-[4px]"
            style={{ width: `${(byOutcome[o] / total) * 100}%`, background: catalog.color(o) }}
          />
        ))}
      </div>
      {hover && (
        <div className="pointer-events-none absolute -top-9 left-0 z-10 rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-white shadow">
          {catalog.label(hover)}: {formatNumber(byOutcome[hover])} ({percent(byOutcome[hover], total)})
        </div>
      )}
    </div>
  );
}

/** Barras horizontais com rótulo, valor e percentual do total. */
export function HorizontalBars({
  rows,
  total,
  emptyText = "Sem dados.",
}: {
  rows: { key: string; label: ReactNode; value: number; color: string; hint?: string }[];
  total?: number;
  emptyText?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const sum = total ?? rows.reduce((n, r) => n + r.value, 0);
  if (rows.length === 0) return <p className="text-[13px] text-muted">{emptyText}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.key} title={row.hint}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-ink">{row.label}</span>
            <span className="tabular shrink-0 text-body">
              {formatNumber(row.value)} <span className="text-muted">({percent(row.value, sum)})</span>
            </span>
          </div>
          <div className="h-2 rounded-[4px] bg-surface">
            <div
              className="h-full rounded-r-[4px]"
              style={{ width: `${(row.value / max) * 100}%`, background: row.color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Colunas empilhadas por período (ex.: candidaturas por mês, por resultado). */
export function StackedColumns({
  periods,
}: {
  periods: { key: string; label: string; byOutcome: Record<Outcome, number> }[];
}) {
  const catalog = useOutcomes();
  const [hover, setHover] = useState<string | null>(null);
  const totals = periods.map((p) => catalog.order.reduce((n, o) => n + (p.byOutcome[o] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));

  if (periods.length === 0) return <p className="text-[13px] text-muted">Sem candidaturas no período.</p>;

  return (
    <div className="flex gap-3">
      <div className="flex h-48 flex-col justify-between text-right text-[11px] leading-none text-muted tabular">
        {[...ticks].reverse().map((t, i) => (
          <span key={i}>{formatNumber(t)}</span>
        ))}
      </div>
      <div className="relative min-w-0 flex-1 overflow-x-auto">
        <div className="relative flex h-48 min-w-fit items-end gap-2 border-b border-line-strong pb-0">
          {[0.5, 1].map((t) => (
            <div key={t} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: `${t * 100}%` }} />
          ))}
          {periods.map((period, index) => {
            const total = totals[index];
            return (
              <div
                key={period.key}
                className="relative flex h-full min-w-9 flex-1 flex-col justify-end"
                onMouseEnter={() => setHover(period.key)}
                onMouseLeave={() => setHover(null)}
              >
                <div className="flex flex-col-reverse gap-[2px]" style={{ height: `${(total / max) * 100}%` }}>
                  {catalog.order.filter((o) => (period.byOutcome[o] ?? 0) > 0).map((o, i, arr) => (
                    <div
                      key={o}
                      className={cn(i === arr.length - 1 && "rounded-t-[4px]")}
                      style={{ flexGrow: period.byOutcome[o], flexBasis: 0, background: catalog.color(o) }}
                    />
                  ))}
                </div>
                {hover === period.key && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-44 -translate-x-1/2 rounded-md bg-ink px-2.5 py-2 text-xs text-white shadow">
                    <p className="mb-1 font-semibold">
                      {period.label}: {formatNumber(total)}
                    </p>
                    {catalog.order.filter((o) => period.byOutcome[o]).map((o) => (
                      <p key={o} className="flex justify-between gap-2">
                        <span>{catalog.label(o)}</span>
                        <span className="tabular">{formatNumber(period.byOutcome[o])}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex min-w-fit gap-2 pt-1.5">
          {periods.map((period) => (
            <span key={period.key} className="min-w-9 flex-1 text-center text-[11px] text-muted">
              {period.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
