import { db } from "../platform/desktop-api";

export interface MutationResult {
  rowsAffected: number;
}

export interface DatabaseLike {
  execute: (sql: string, params?: unknown[]) => Promise<MutationResult>;
  select: <TRows extends readonly unknown[] = unknown[]>(
    sql: string,
    params?: unknown[],
  ) => Promise<TRows>;
}

let cachedDb: DatabaseLike | null = null;

export async function getDb(): Promise<DatabaseLike> {
  if (!cachedDb) {
    cachedDb = db as DatabaseLike;
  }
  return cachedDb;
}
