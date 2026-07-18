"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteProject } from "@/server/actions/projects";

/** Exclusão do projeto (somente super_admin) com confirmação. */
export function ProjectDeleteButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Trash2 />
        Excluir projeto
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Excluir projeto"
        description={`Tem certeza que deseja excluir "${projectName}"? Etapas, tarefas e checklists serão removidos em cascade. Esta ação não pode ser desfeita.`}
        onConfirm={async () => {
          const result = await deleteProject(projectId);
          if ("error" in result) return result.error;
          toast.success("Projeto excluído.");
          router.push("/admin/projetos");
          return null;
        }}
      />
    </>
  );
}
