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
function translateParams(sql: string): string {
  return sql.replace(/\$\d+/g, "?");
}

export function registerDatabaseIPC(userDataPath: string): void {
  const database = getDatabase(userDataPath);

  ipcMain.handle("db:execute", (_event, sql: string, params?: unknown[]) => {
    const translated = translateParams(sql);
    const statement = database.prepare(translated);

    if (params && params.length > 0) {
      const result = statement.run(...params);
      return { rowsAffected: result.changes };
    }

    statement.run();
    return { rowsAffected: 0 };
  });

  ipcMain.handle("db:select", (_event, sql: string, params?: unknown[]) => {
    const translated = translateParams(sql);
    const statement = database.prepare(translated);

    if (params && params.length > 0) {
      return statement.all(...params);
    }

    return statement.all();
  });
}

export function closeDatabase(): void {
  db?.close();
  db = null;
}
