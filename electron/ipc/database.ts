import { ipcMain } from "electron";
import path from "node:path";
import Database from "better-sqlite3";

let db: Database.Database | null = null;

export function getDatabase(userDataPath: string): Database.Database {
  if (db) return db;

  const dbPath = path.join(userDataPath, "phosphene.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  return db;
}

/**
 * Translate `$1`, `$2`, ... positional placeholders to `?` anonymous placeholders.
 * The existing codebase uses Tauri's `$N` positional syntax, but `better-sqlite3`
 * treats `$N` as named parameters (expecting an object like `{ 1: val }`).
 * Anonymous `?` placeholders work with positional spread arguments.
 */
function translateParams(sql: string, params?: unknown[]): { sql: string; params: unknown[] } {
  const orderedParams: unknown[] = [];
  const translatedSql = sql.replace(/\$(\d+)/g, (_match, indexText: string) => {
    const index = Number.parseInt(indexText, 10) - 1;
    orderedParams.push(params?.[index]);
    return "?";
  });

  return {
    sql: translatedSql,
    params: orderedParams,
  };
}

export function registerDatabaseIPC(userDataPath: string): void {
  const database = getDatabase(userDataPath);

  ipcMain.handle("db:execute", (_event, sql: string, params?: unknown[]) => {
    const translated = translateParams(sql, params);
    const statement = database.prepare(translated.sql);
    const result = statement.run(...translated.params);
    return { rowsAffected: result.changes };
  });

  ipcMain.handle("db:select", (_event, sql: string, params?: unknown[]) => {
    const translated = translateParams(sql, params);
    const statement = database.prepare(translated.sql);

    if (translated.params.length > 0) {
      return statement.all(...translated.params);
    }

    return statement.all();
  });
}

export function closeDatabase(): void {
  db?.close();
  db = null;
}
