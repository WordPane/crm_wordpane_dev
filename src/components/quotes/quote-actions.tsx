"use client";

import { Copy, FolderPlus, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  createProjectFromQuote,
  deleteQuote,
  duplicateQuote,
  sendQuote,
} from "@/server/actions/quotes";

/** Envia o rascunho ao cliente (notificação + e-mail). */
export function SendQuoteButton({
  quoteId,
  quoteNumber,
}: {
  quoteId: string;
  quoteNumber: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Send />
        Enviar ao cliente
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Enviar orçamento"
        description={`O orçamento ${quoteNumber} ficará visível no portal do cliente e ele será notificado por e-mail. Após o envio não será mais possível editar.`}
        confirmLabel="Enviar"
        onConfirm={async () => {
          const result = await sendQuote(quoteId);
          if ("error" in result) return result.error;
          toast.success("Orçamento enviado ao cliente.");
          router.refresh();
          return null;
        }}
      />
    </>
  );
}

/** Exclui o orçamento (com confirmação). Não-rascunho só para super admin. */
export function DeleteQuoteButton({
  quoteId,
  quoteNumber,
  status = "draft",
}: {
  quoteId: string;
  quoteNumber: string;
  status?: string;
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
        title="Excluir orçamento"
        description={
          status === "draft"
            ? `Tem certeza que deseja excluir o rascunho ${quoteNumber}? Esta ação não pode ser desfeita.`
            : `Tem certeza que deseja excluir o orçamento ${quoteNumber}? Projeto e cobranças gerados a partir dele serão mantidos (desvinculados). Esta ação não pode ser desfeita.`
        }
        onConfirm={async () => {
          const result = await deleteQuote(quoteId);
          if ("error" in result) return result.error;
          toast.success("Orçamento excluído.");
          router.push("/admin/orcamentos");
          return null;
        }}
      />
    </>
  );
}

/** Cria um projeto a partir do orçamento aprovado e navega até ele. */
export function CreateProjectButton({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <FolderPlus />
        Criar projeto
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Criar projeto a partir do orçamento"
        description="Um projeto será criado para a empresa com o título e os itens deste orçamento aprovado. Você poderá ajustá-lo depois."
        confirmLabel="Criar projeto"
        onConfirm={async () => {
          const result = await createProjectFromQuote(quoteId);
          if ("error" in result) return result.error;
          toast.success("Projeto criado a partir do orçamento.");
          router.push(result.id ? `/admin/projetos/${result.id}` : "/admin/projetos");
          return null;
        }}
      />
    </>
  );
}

/** Duplica o orçamento como novo rascunho (próxima versão). */
export function DuplicateQuoteButton({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Copy />
        Duplicar
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Duplicar orçamento"
        description="Um novo rascunho será criado com os mesmos itens e valores, como uma nova versão deste orçamento. O original não é alterado."
        confirmLabel="Duplicar"
        onConfirm={async () => {
          const result = await duplicateQuote(quoteId);
          if ("error" in result) return result.error;
          toast.success("Orçamento duplicado como novo rascunho.");
          router.push(result.id ? `/admin/orcamentos/${result.id}` : "/admin/orcamentos");
          return null;
        }}
      />
    </>
  );
}

/** Copia o link público de aprovação (sem login) para a área de transferência. */
export function CopyPublicLinkButton({ publicToken }: { publicToken: string }) {
  function handleCopy() {
    const url = `${window.location.origin}/orcamento/${publicToken}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success("Link público copiado."),
      () => toast.error("Não foi possível copiar o link."),
    );
  }

  return (
    <Button type="button" variant="outline" onClick={handleCopy}>
      <Copy />
      Copiar link público
    </Button>
  );
}
