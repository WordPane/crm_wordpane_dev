"use client";

import { Camera, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { uploadFile } from "@/lib/upload";
import { initials } from "@/lib/utils/format";
import { updateOwnAvatar } from "@/server/actions/profile";

const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp,image/svg+xml,image/gif";

/** Foto de perfil: envia via uploadFile e grava o avatarUrl do usuário (qualquer role). */
export function AvatarUpload({
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
      const uploaded = await uploadFile(file);

      const result = await updateOwnAvatar({
        fileKey: uploaded.fileKey,
        publicUrl: uploaded.publicUrl ?? "",
        mimeType: uploaded.mimeType,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Foto atualizada.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar a foto.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-16">
        {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
        <AvatarFallback className="bg-primary/10 text-lg font-bold text-primary">
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
