import { uploadFile } from "@/lib/upload";

/** Envia uma imagem para o storage e retorna a URL pública para inserção no editor. */
export async function uploadCommentImage(file: File): Promise<string> {
  const meta = await uploadFile(file);
  const url = meta.publicUrl ?? meta.fileKey;
  if (!url) throw new Error("URL da imagem não disponível.");
  return url;
}
