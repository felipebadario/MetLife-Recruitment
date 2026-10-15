import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const DialogRoot = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-ink/30 backdrop-blur-[2px]" />
      <RadixDialog.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2",
          "rounded-[var(--radius-panel)] border border-line bg-white shadow-[var(--shadow-overlay)] focus:outline-none",
          className,
        )}
      >
        <div className="animate-sheet-in">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <RadixDialog.Title className="text-[15px] font-semibold text-ink">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-0.5 text-[13px] text-muted">
                  {description}
                </RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close
              className="-m-1 rounded-md p-1 text-muted hover:bg-surface hover:text-ink"
              aria-label="Fechar"
            >
              <X className="size-4" />
            </RadixDialog.Close>
          </div>
          <div className="px-5 py-5">{children}</div>
        </div>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
