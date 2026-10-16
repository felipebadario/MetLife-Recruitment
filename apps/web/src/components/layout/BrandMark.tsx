import { cn } from "@/lib/utils";

/** Símbolo da MetLife (redesenhado em vetor a partir do logotipo oficial). */
export function MetLifeSymbol({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 80" className={className} aria-hidden>
      <path d="M0 2Q31 6 50 31V80H0Z" fill="#0090DA" />
      <path d="M50 31V80H17Q41 61 50 31Z" fill="#0061A0" />
      <path d="M100 2Q69 6 50 31V80H100Z" fill="#A4CE4E" />
    </svg>
  );
}

/** Logotipo da MetLife com o nome do produto. */
export function BrandMark({ inverted = false, className }: { inverted?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <MetLifeSymbol className="h-7 w-[35px] shrink-0" />
      <div className="leading-tight">
        <div
          className={cn("text-[19px] font-extrabold tracking-[-0.02em]", inverted ? "text-white" : "text-[#1f1f1f]")}
          aria-label="MetLife"
        >
          MetLife
        </div>
        <div className={cn("text-xs", inverted ? "text-brand-100" : "text-muted")}>Recruitment CRM</div>
      </div>
    </div>
  );
}
