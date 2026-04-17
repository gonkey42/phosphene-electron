import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { runMigrations } from "./migrations";

let databaseBootstrapped = false;

const INSERT_WORKSPACE_SQL =
  "INSERT INTO workspaces (id, name, icon, position) VALUES (?, ?, ?, ?)";

function generateId(): string {
  return randomUUID().replace(/-/g, "");
}

export function initializeSchema(database: Database.Database): void {
  if (databaseBootstrapped) {
    return;
  }

  runMigrations(database);

  const workspaceCount = database
    .prepare("SELECT count(*) as count FROM workspaces WHERE deleted_at IS NULL")
    .get() as { count?: number } | undefined;

  if ((workspaceCount?.count ?? 0) === 0) {
    database.prepare(INSERT_WORKSPACE_SQL).run(generateId(), "Home", "\u{1F3E0}", 0);
  }

  databaseBootstrapped = true;
}

export function resetSchemaBootstrapForTests(): void {
  databaseBootstrapped = false;
}
