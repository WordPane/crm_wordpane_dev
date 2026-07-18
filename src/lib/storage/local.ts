import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { StorageDriver } from "./index";

const ROOT = path.join(process.cwd(), ".storage");

function resolveSafe(key: string): string {
  const full = path.resolve(ROOT, key);
  if (!full.startsWith(path.resolve(ROOT) + path.sep)) {
    throw new Error("Chave de arquivo inválida.");
  }
  return full;
}

export const localDriver: StorageDriver = {
  async put(key, data) {
    const full = resolveSafe(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
    return { fileKey: key };
  },

  async get(key) {
    try {
      return await readFile(resolveSafe(key));
    } catch {
      return null;
    }
  },

  async delete(key) {
    try {
      await unlink(resolveSafe(key));
    } catch {
      // arquivo já inexistente — ok
    }
  },
};
