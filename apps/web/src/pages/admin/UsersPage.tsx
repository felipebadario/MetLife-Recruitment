import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Pencil, Plus, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DialogContent, DialogRoot } from "@/components/ui/Dialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { api, ApiError } from "@/lib/api";
import { ROLE_LABELS, type User, type UserRole } from "@/lib/types";
import { formatDateTime, initials } from "@/lib/utils";

const USERS_KEY = ["admin", "users"] as const;

const ROLE_HINTS: Record<UserRole, string> = {
  admin: "Acesso total: candidatos, performance, administração e exportação.",
  viewer: "Somente leitura da aba Candidatos, com CPF, e-mail e telefone mascarados.",
};

function errorMessage(error: unknown): string | null {
  if (!error) return null;
  return error instanceof ApiError ? error.message : "Não foi possível concluir a operação.";
}

export function UsersPage() {
  const { session } = useAuth();
  const users = useQuery({ queryKey: USERS_KEY, queryFn: () => api.get<User[]>("/api/admin/users") });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);

  return (
    <Panel>
      <PanelHeader
        title="Usuários"
        description="Quem acessa a plataforma e com qual perfil."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden />
            Novo usuário
          </Button>
        }
      />

      {users.isPending ? (
        <div className="flex flex-col gap-3 p-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : users.isError ? (
        <div className="p-5">
          <Alert>{errorMessage(users.error)}</Alert>
        </div>
      ) : users.data.length === 0 ? (
        <EmptyState icon={UserRound} title="Nenhum usuário cadastrado" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="bg-surface/60 text-muted">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-semibold">Nome</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Perfil</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Situação</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Último acesso</th>
                <th scope="col" className="px-5 py-2.5"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.data.map((user) => (
                <tr key={user.id} className="hover:bg-surface/50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
                        {initials(user.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">
                          {user.name}
                          {user.id === session?.user.id && <span className="ml-1.5 font-normal text-muted">(você)</span>}
                        </p>
                        <p className="truncate text-muted">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={user.role === "admin" ? "brand" : "neutral"}>{ROLE_LABELS[user.role]}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    {user.is_active ? (
                      <Badge tone="positive" dot>Ativo</Badge>
                    ) : (
                      <Badge tone="neutral" dot>Inativo</Badge>
                    )}
                  </td>
                  <td className="tabular px-5 py-3 text-body">{formatDateTime(user.last_login_at)}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(user)}>
                        <Pencil className="size-3.5" aria-hidden />
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setResetting(user)}>
                        <KeyRound className="size-3.5" aria-hidden />
                        Redefinir senha
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateUserDialog open={creating} onOpenChange={setCreating} />
      {editing && <EditUserDialog user={editing} onClose={() => setEditing(null)} />}
      {resetting && <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />}
    </Panel>
  );
}

function RoleSelect({ value, onChange, ...props }: { value: UserRole; onChange: (role: UserRole) => void; id?: string }) {
  return (
    <Select {...props} value={value} onChange={(e) => onChange(e.target.value as UserRole)}>
      <option value="viewer">{ROLE_LABELS.viewer}</option>
      <option value="admin">{ROLE_LABELS.admin}</option>
    </Select>
  );
}

function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", email: "", role: "viewer" as UserRole, password: "" });
  const mutation = useMutation({
    mutationFn: () => api.post<User>("/api/admin/users", form),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_KEY });
      close(false);
    },
  });

  function close(next: boolean) {
    if (!next) {
      setForm({ name: "", email: "", role: "viewer", password: "" });
      mutation.reset();
    }
    onOpenChange(next);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <DialogRoot open={open} onOpenChange={close}>
      <DialogContent title="Novo usuário" description="Informe a senha inicial à pessoa por um canal seguro.">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Nome">
            {(p) => <Input {...p} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
          </Field>
          <Field label="E-mail">
            {(p) => (
              <Input {...p} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            )}
          </Field>
          <Field label="Perfil" hint={ROLE_HINTS[form.role]}>
            {(p) => <RoleSelect id={p.id} value={form.role} onChange={(role) => setForm({ ...form, role })} />}
          </Field>
          <Field label="Senha inicial" hint="Mínimo de 10 caracteres, com letras e números.">
            {(p) => (
              <Input
                {...p}
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            )}
          </Field>
          {mutation.error && <Alert>{errorMessage(mutation.error)}</Alert>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => close(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Criar usuário
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}

function EditUserDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: user.name, role: user.role, is_active: user.is_active });
  const mutation = useMutation({
    mutationFn: () => api.patch<User>(`/api/admin/users/${user.id}`, form),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_KEY });
      onClose();
    },
  });

  return (
    <DialogRoot open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Editar usuário" description={user.email}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="flex flex-col gap-4"
        >
          <Field label="Nome">
            {(p) => <Input {...p} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
          </Field>
          <Field label="Perfil" hint={ROLE_HINTS[form.role]}>
            {(p) => <RoleSelect id={p.id} value={form.role} onChange={(role) => setForm({ ...form, role })} />}
          </Field>
          <label className="flex items-start gap-2.5 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-brand-500"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <span>
              Acesso ativo
              <span className="block text-[13px] text-muted">Desmarque para bloquear o acesso sem apagar o histórico.</span>
            </span>
          </label>
          {mutation.error && <Alert>{errorMessage(mutation.error)}</Alert>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Salvar alterações
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const mutation = useMutation({
    mutationFn: () => api.post<void>(`/api/admin/users/${user.id}/reset-password`, { new_password: password }),
  });

  return (
    <DialogRoot open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Redefinir senha"
        description={`${user.name} precisará entrar novamente com a nova senha.`}
      >
        {mutation.isSuccess ? (
          <div className="flex flex-col gap-4">
            <Alert tone="info">Senha redefinida. As sessões abertas desse usuário foram encerradas.</Alert>
            <Button className="self-end" onClick={onClose}>
              Fechar
            </Button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
            className="flex flex-col gap-4"
          >
            <Field label="Nova senha" hint="Mínimo de 10 caracteres, com letras e números.">
              {(p) => (
                <Input
                  {...p}
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
            </Field>
            {mutation.error && <Alert>{errorMessage(mutation.error)}</Alert>}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                Redefinir senha
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </DialogRoot>
  );
}
