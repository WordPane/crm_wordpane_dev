import { del, put } from "@vercel/blob";

import type { StorageDriver } from "./index";

export const blobDriver: StorageDriver = {
  async put(key, data, contentType) {
    const blob = await put(key, data, {
      access: "public",
      contentType,
    });
    return { fileKey: blob.url, publicUrl: blob.url };
  },

  async get() {
    // No driver blob, o acesso é via URL pública (redirect na rota de download).
    return null;
  },

  async delete(key) {
    await del(key);
  },
};
