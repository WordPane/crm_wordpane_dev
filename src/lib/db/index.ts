import { Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";

import * as schema from "./schema";

export type DB = NeonDatabase<typeof schema>;

let _db: DB | null = null;

function getDb(): DB {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL não configurada. Crie .env.local a partir de .env.example.",
      );
    }
    _db = drizzle(new Pool({ connectionString: url }), { schema });
  }
  return _db;
}

// Instanciação preguiçosa: o build do Next não exige DATABASE_URL,
// apenas as requisições em runtime.
export const db = new Proxy({} as DB, {
  get: (_target, prop) => {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
