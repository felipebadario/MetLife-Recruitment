import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

/** Painel lateral à direita (detalhe do candidato). */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-ink/25" />
        <RadixDialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl animate-fade-in flex-col border-l border-line bg-white shadow-[var(--shadow-overlay)] focus:outline-none">
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
            <div className="min-w-0">
              <RadixDialog.Title className="truncate text-lg font-semibold text-ink">{title}</RadixDialog.Title>
              <RadixDialog.Description className="mt-0.5 text-[13px] text-muted">
                {description ?? "Detalhes"}
              </RadixDialog.Description>
            </div>
            <RadixDialog.Close
              className="-m-1 rounded-md p-1.5 text-muted hover:bg-surface hover:text-ink"
              aria-label="Fechar"
            >
              <X className="size-5" />
            </RadixDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line px-6">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={tab.value === value}
          onClick={() => onChange(tab.value)}
          className={
            "-mb-px h-11 shrink-0 border-b-2 px-3 text-sm font-medium transition-colors " +
            (tab.value === value
              ? "border-brand-500 text-brand-600"
              : "border-transparent text-muted hover:text-ink")
          }
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
