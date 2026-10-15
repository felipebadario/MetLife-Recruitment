import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const controlBase =
  "w-full rounded-[var(--radius-control)] border border-line-strong bg-white px-3 text-sm text-ink placeholder:text-muted transition-colors hover:border-brand-300 focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-100 disabled:bg-surface disabled:text-muted aria-invalid:border-danger-600";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(controlBase, "h-10", className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(controlBase, "h-10 pr-8", className)} {...props}>
        {children}
      </select>
    );
  },
);

interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  children: (props: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => ReactNode;
}

/** Rótulo + controle + dica/erro, com ids ligados para leitores de tela. */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-ink">
        {label}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] text-danger-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
