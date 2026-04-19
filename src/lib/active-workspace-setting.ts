import { getDb } from "./database";

const ACTIVE_WORKSPACE_ID_KEY = "active_workspace_id";

export async function loadActiveWorkspaceId(): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<Array<{ value: string }>>(
    "SELECT value FROM settings WHERE key = $1 LIMIT 1",
    [ACTIVE_WORKSPACE_ID_KEY],
  );

  return rows[0]?.value ?? null;
}

export async function saveActiveWorkspaceId(workspaceId: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `
    INSERT INTO settings (key, value, updated_at)
    VALUES ($1, $2, datetime('now','utc'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now','utc')
    `,
    [ACTIVE_WORKSPACE_ID_KEY, workspaceId],
  );
}
