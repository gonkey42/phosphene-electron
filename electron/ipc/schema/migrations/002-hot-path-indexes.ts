import type { Migration } from "../types";

const migration: Migration = {
  version: 2,
  description: "Add hot-path indexes for workspaces, boards, files, and captures",
  up(db) {
    db.exec(
      "CREATE INDEX IF NOT EXISTS boards_workspace_id_idx ON boards(workspace_id)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS boards_position_idx ON boards(workspace_id, position)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS boards_deleted_at_idx ON boards(deleted_at)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS files_board_id_idx ON files(board_id)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS captures_board_id_idx ON captures(board_id)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS workspaces_position_idx ON workspaces(position)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS workspaces_deleted_at_idx ON workspaces(deleted_at)",
    );
  },
};

export default migration;
