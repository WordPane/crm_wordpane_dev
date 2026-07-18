"use client";

import { Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateTask } from "@/server/actions/tasks";

/** Edição rápida de título e descrição da tarefa. */
export function TaskEditDialog({
  taskId,
  title,
  description,
}: {
  taskId: string;
  title: string;
  description: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<{ title: string; description: string }>({
    defaultValues: { title, description },
  });

  function onSubmit(values: { title: string; description: string }) {
    setError(null);
    if (!values.title.trim()) {
      setError("Título é obrigatório.");
      return;
    }
    startTransition(async () => {
      const result = await updateTask(taskId, values);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Tarefa atualizada.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil />
        Editar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar tarefa</DialogTitle>
            <DialogDescription>
              Atualize o título e a descrição da tarefa.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="te-title">Título *</Label>
              <Input id="te-title" {...form.register("title")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="te-description">Descrição</Label>
              <Textarea
                id="te-description"
                rows={5}
                {...form.register("description")}
              />
            </div>

            {error && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                Salvar alterações
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
