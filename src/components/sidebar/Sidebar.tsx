import { BoardList } from "./BoardList";
import "./Sidebar.css";

interface SidebarProps {
  workspaceId?: string;
  onBoardSelect?: (boardId: string | null) => void;
  isVisible?: boolean;
}

export function Sidebar({ workspaceId, onBoardSelect, isVisible = true }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Workspace boards">
      <BoardList workspaceId={workspaceId} onBoardSelect={onBoardSelect} isVisible={isVisible} />
    </aside>
  );
}
