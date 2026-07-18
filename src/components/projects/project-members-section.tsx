"use client";

import { Loader2, Plus, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProjectMemberItem } from "@/lib/queries/projects";
import {
  addProjectMember,
  removeProjectMember,
} from "@/server/actions/projects";

type SelectOption = { id: string; name: string };

/** Gestão da equipe do projeto (project_members). */
export function ProjectMembersSection({
  projectId,
  members,
  teamUsers,
}: {
  projectId: string;
  members: ProjectMemberItem[];
  teamUsers: SelectOption[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [pending, startTransition] = useTransition();

  const memberIds = new Set(members.map((m) => m.id));
  const available = teamUsers.filter((u) => !memberIds.has(u.id));

  function add() {
    if (!selected) return;
    startTransition(async () => {
      const result = await addProjectMember(projectId, selected);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Membro adicionado.");
      setSelected("");
      router.refresh();
    });
  }

  function remove(userId: string) {
    startTransition(async () => {
      const result = await removeProjectMember(projectId, userId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Membro removido.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Equipe do projeto</CardTitle>
        <CardDescription>
          Membros da equipe interna envolvidos neste projeto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum membro atribuído ainda.
          </p>
        ) : (
          <ul className="space-y-2">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-sm">
                <UserRound className="size-4 text-muted-foreground" />
                <span className="font-medium">{m.name}</span>
                <span className="text-muted-foreground">({m.email})</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="ml-auto"
                  aria-label={`Remover ${m.name}`}
                  disabled={pending}
                  onClick={() => remove(m.id)}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {available.length > 0 && (
          <div className="flex items-center gap-2">
            <Select
              value={selected || undefined}
              onValueChange={(v) => setSelected(v ?? "")}
            >
              <SelectTrigger className="w-full" aria-label="Selecionar membro">
                <SelectValue placeholder="Adicionar membro da equipe...">
                  {(value: string | null) =>
                    !value
                      ? "Adicionar membro da equipe..."
                      : (available.find((u) => u.id === value)?.name ??
                        "Adicionar membro da equipe...")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {available.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={!selected || pending}
              onClick={add}
            >
              {pending ? <Loader2 className="animate-spin" /> : <Plus />}
              Adicionar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
