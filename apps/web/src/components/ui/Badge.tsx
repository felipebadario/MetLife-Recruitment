import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Tone = "neutral" | "brand" | "positive" | "warning" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-surface text-body border-line",
  brand: "bg-brand-50 text-brand-700 border-brand-100",
  positive: "bg-green-50 text-green-700 border-green-100",
  warning: "bg-warning-50 text-warning-700 border-warning-50",
  danger: "bg-danger-50 text-danger-600 border-danger-50",
};

export function Badge({
  tone = "neutral",
  dot = false,
  children,
  className,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
