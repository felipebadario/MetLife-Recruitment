import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ChevronDown, KeyRound, LogOut } from "lucide-react";
import { useState } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { ROLE_LABELS } from "@/lib/types";
import { initials } from "@/lib/utils";

import { ChangePasswordDialog } from "./ChangePasswordDialog";

const itemClass =
  "flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm text-body outline-none select-none data-[highlighted]:bg-brand-50 data-[highlighted]:text-brand-700";

export function UserMenu() {
  const { session, logout } = useAuth();
  const [passwordOpen, setPasswordOpen] = useState(false);
  if (!session) return null;
  const { user } = session;

  return (
    <>
      <Dropdown.Root>
        <Dropdown.Trigger className="flex items-center gap-2.5 rounded-[var(--radius-control)] py-1 pr-2 pl-1 hover:bg-surface data-[state=open]:bg-surface">
          <span className="grid size-8 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">
            {initials(user.name)}
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-[13px] font-semibold text-ink">{user.name}</span>
            <span className="block text-xs text-muted">{ROLE_LABELS[user.role]}</span>
          </span>
          <ChevronDown className="size-4 text-muted" aria-hidden />
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content
            align="end"
            sideOffset={6}
            className="z-50 w-64 animate-fade-in rounded-[var(--radius-panel)] border border-line bg-white p-1.5 shadow-[var(--shadow-overlay)]"
          >
            <div className="px-2.5 pt-2 pb-3">
              <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
              <p className="truncate text-[13px] text-muted">{user.email}</p>
              <Badge tone={user.role === "admin" ? "brand" : "neutral"} className="mt-2">
                {ROLE_LABELS[user.role]}
              </Badge>
            </div>
            <Dropdown.Separator className="mx-1 mb-1 h-px bg-line" />
            <Dropdown.Item className={itemClass} onSelect={() => setPasswordOpen(true)}>
              <KeyRound className="size-4" aria-hidden />
              Alterar senha
            </Dropdown.Item>
            <Dropdown.Item className={itemClass} onSelect={() => void logout()}>
              <LogOut className="size-4" aria-hidden />
              Sair
            </Dropdown.Item>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </>
  );
}
