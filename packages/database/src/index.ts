import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(url: string) {
  const client = createClient({ url });
  return drizzle(client, { schema });
}

export * from "./migrate.js";
export * from "./schema.js";
