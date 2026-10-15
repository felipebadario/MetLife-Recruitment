import { cn, formatNumber } from "@/lib/utils";

import { Skeleton } from "./Skeleton";

export interface Metric {
  label: string;
  value: number | null;
  /** Indicador positivo (ex.: contratações) ganha o marcador verde. */
  positive?: boolean;
}

/**
 * Faixa única de indicadores com divisórias, em vez de vários cartões soltos:
 * lê-se como um só painel de números, que é o que o topo das telas é.
 */
export function MetricStrip({ metrics, loading = false }: { metrics: Metric[]; loading?: boolean }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-white shadow-[var(--shadow-panel)]">
      <dl className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="relative -mt-px -ml-px border-t border-l border-line px-5 py-4"
          >
            <dt className="flex items-center gap-1.5 text-[13px] text-muted">
              {metric.positive && <span className="size-1.5 rounded-full bg-green-500" aria-hidden />}
              {metric.label}
            </dt>
            <dd className="mt-1.5">
              {loading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <span
                  className={cn(
                    "tabular text-[26px] leading-8 font-semibold tracking-tight",
                    metric.value == null ? "text-line-strong" : "text-ink",
                  )}
                >
                  {formatNumber(metric.value)}
                </span>
              )}
            </dd>
            {metric.positive && (
              <span className="absolute inset-x-5 bottom-0 h-0.5 rounded-full bg-green-500/70" aria-hidden />
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}
