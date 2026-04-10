import { BoardList } from "./BoardList";
import "./Sidebar.css";

interface SidebarProps {
  workspaceId?: string;
  onBoardSelect?: (boardId: string | null) => void;
}

export function Sidebar({ workspaceId, onBoardSelect }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Workspace boards">
      <BoardList workspaceId={workspaceId} onBoardSelect={onBoardSelect} />
    </aside>
  );
}
