import { cn } from "@/lib/utils";

/** Marca do produto (não reproduz o logotipo da MetLife). */
export function BrandMark({ inverted = false, className }: { inverted?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" fill={inverted ? "#ffffff" : "#0061A0"} />
        <circle cx="12" cy="12" r="4" fill={inverted ? "#0061A0" : "#ffffff"} />
        <path
          d="M5 25c0-4 3-7 7-7s7 3 7 7"
          fill="none"
          stroke={inverted ? "#0061A0" : "#ffffff"}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M19 15l3 3 6-7"
          fill="none"
          stroke="#A4CE4E"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="leading-tight">
        <div className={cn("text-[15px] font-bold tracking-tight", inverted ? "text-white" : "text-ink")}>
          MetLife
        </div>
        <div className={cn("text-xs", inverted ? "text-brand-100" : "text-muted")}>Recruitment CRM</div>
      </div>
    </div>
  );
}
