import { AlertCircle, Info } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Alert({
  tone = "danger",
  children,
  className,
}: {
  tone?: "danger" | "info";
  children: ReactNode;
  className?: string;
}) {
  const Icon = tone === "danger" ? AlertCircle : Info;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-[var(--radius-control)] border px-3 py-2.5 text-[13px]",
        tone === "danger"
          ? "border-danger-600/20 bg-danger-50 text-danger-600"
          : "border-brand-100 bg-brand-50 text-brand-700",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
