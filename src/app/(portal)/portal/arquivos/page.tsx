import type { Metadata } from "next";
import {
  File,
  FileArchive,
  FileImage,
  FileText,
  FileVideo,
  Paperclip,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { ForbiddenError, requireUser } from "@/lib/access/permissions";
import { listPortalFiles } from "@/lib/queries/portal";
import { formatDate, formatFileSize } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Arquivos" };

const ORIGIN_KIND_LABELS = {
  project: "Projeto",
  task: "Tarefa",
  demand: "Demanda",
} as const;

function fileIcon(mimeType: string | null) {
  if (!mimeType) return File;
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType.startsWith("video/")) return FileVideo;
  if (mimeType.includes("zip")) return FileArchive;
  if (
    mimeType === "application/pdf" ||
    mimeType.startsWith("text/") ||
    mimeType.includes("word") ||
    mimeType.includes("excel") ||
    mimeType.includes("spreadsheet")
  ) {
    return FileText;
  }
  return File;
}

export default async function PortalFilesPage() {
  const user = await requireUser();

  let files;
  try {
    files = await listPortalFiles(user);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Arquivos</h1>
        <p className="text-sm text-muted-foreground">
          Todos os anexos dos seus projetos, tarefas e demandas.
        </p>
      </div>

      {files.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Paperclip className="size-12 text-muted-foreground/40" />
            <p className="font-medium">Nenhum arquivo por aqui ainda</p>
            <p className="text-sm text-muted-foreground">
              Os anexos enviados por você e pela equipe aparecem aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {files.map((file) => {
            const Icon = fileIcon(file.mimeType);
            return (
              <li
                key={file.id}
                className="flex items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10"
              >
                <Icon className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <a
                    href={`/api/files/${file.id}`}
                    className="block truncate text-sm font-medium text-foreground transition-colors hover:text-[#00d164]"
                  >
                    {file.fileName}
                  </a>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.fileSize)}
                    {" · "}
                    {file.uploaderName ?? "—"}
                    {" · "}
                    {formatDate(file.createdAt)}
                  </p>
                </div>
                {file.origin && (
                  <Link
                    href={file.origin.href}
                    className="chip hidden shrink-0 border-border bg-muted text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
                    title={file.origin.label}
                  >
                    <span className="max-w-40 truncate">
                      {ORIGIN_KIND_LABELS[file.origin.kind]} · {file.origin.label}
                    </span>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
