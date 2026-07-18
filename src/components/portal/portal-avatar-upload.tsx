"use client";

import { Camera, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/utils/format";
import { updatePortalAvatar } from "@/server/actions/portal";

const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp,image/svg+xml,image/gif";

/** Foto de perfil: envia via /api/upload e grava o avatarUrl do usuário. */
export function PortalAvatarUpload({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        fileKey?: string;
        publicUrl?: string;
        mimeType?: string;
      } | null;
      if (!response.ok || !payload?.fileKey) {
        toast.error(payload?.error ?? "Não foi possível enviar a foto.");
        return;
      }

      const result = await updatePortalAvatar({
        fileKey: payload.fileKey,
        publicUrl: payload.publicUrl ?? "",
        mimeType: payload.mimeType ?? file.type,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Foto atualizada.");
      router.refresh();
    } catch {
      toast.error("Não foi possível enviar a foto.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-16">
        {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
        <AvatarFallback className="bg-[rgba(0,209,100,0.12)] text-lg font-bold text-[#00d164]">
          {initials(name)}
        </AvatarFallback>
      </Avatar>

      <div className="space-y-1.5">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={handleFileChange}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="animate-spin" /> : <Camera />}
          {uploading ? "Enviando..." : "Trocar foto"}
        </Button>
        <p className="text-xs text-muted-foreground">
          PNG, JPG, WebP, SVG ou GIF — até 50 MB.
        </p>
      </div>
    </div>
  );
}
