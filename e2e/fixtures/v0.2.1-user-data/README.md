This fixture contains a real SQLite user-data snapshot for the pre-v0.2.2 schema shape.

Contents:
- `phosphene.db` with one workspace (`Legacy Workspace`) and one board (`Legacy Board`)
- no `schema_version` table rows
- no v2 hot-path indexes

Capture recipe:
- Start from the exact v0.2.1 table definitions documented in `electron/ipc/schema/migrations.test.ts`.
- Create `phosphene.db` with `better-sqlite3`.
- Insert one workspace and one board.
- Do not create `schema_version`, so startup exercises the backfill-and-migrate path that v0.2.2 added.
