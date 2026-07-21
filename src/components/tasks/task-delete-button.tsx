"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteTask } from "@/server/actions/tasks";

/** Exclui a tarefa (com confirmação) e volta para a origem. */
export function TaskDeleteButton({
  taskId,
  title,
  backHref,
}: {
  taskId: string;
  title: string;
  backHref: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Trash2 />
        Excluir
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Excluir tarefa"
        description={`Tem certeza que deseja excluir a tarefa "${title}"? Comentários, checklist e anexos serão removidos junto. Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        onConfirm={async () => {
          const result = await deleteTask(taskId);
          if ("error" in result) return result.error;
          toast.success("Tarefa excluída.");
          router.push(backHref);
          return null;
        }}
      />
    </>
  );
}
