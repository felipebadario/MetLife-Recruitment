import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { DialogContent, DialogRoot } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Field";
import { api, ApiError } from "@/lib/api";
import type { Session } from "@/lib/types";

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { refresh } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      api.post<Session>("/api/auth/change-password", {
        current_password: current,
        new_password: next,
      }),
    onSuccess: (session) => {
      refresh(session);
      setDone(true);
    },
  });

  function reset(nextOpen: boolean) {
    if (!nextOpen) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setLocalError(null);
      setDone(false);
      mutation.reset();
    }
    onOpenChange(nextOpen);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (next !== confirm) {
      setLocalError("A confirmação não confere com a nova senha.");
      return;
    }
    setLocalError(null);
    mutation.mutate();
  }

  const error = localError ?? (mutation.error instanceof ApiError ? mutation.error.message : null);

  return (
    <DialogRoot open={open} onOpenChange={reset}>
      <DialogContent
        title="Alterar senha"
        description="Ao trocar a senha, as sessões abertas em outros dispositivos são encerradas."
      >
        {done ? (
          <div className="flex flex-col gap-4">
            <Alert tone="info">Senha alterada.</Alert>
            <Button className="self-end" onClick={() => reset(false)}>
              Fechar
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field label="Senha atual">
              {(props) => (
                <Input
                  {...props}
                  type="password"
                  autoComplete="current-password"
                  required
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                />
              )}
            </Field>
            <Field label="Nova senha" hint="Mínimo de 10 caracteres, com letras e números.">
              {(props) => (
                <Input
                  {...props}
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                />
              )}
            </Field>
            <Field label="Confirme a nova senha">
              {(props) => (
                <Input
                  {...props}
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              )}
            </Field>
            {error && <Alert>{error}</Alert>}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => reset(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                Alterar senha
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </DialogRoot>
  );
}
