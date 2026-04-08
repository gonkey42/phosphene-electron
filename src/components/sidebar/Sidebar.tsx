import { BoardList } from "./BoardList";

interface SidebarProps {
  workspaceId?: string;
  onBoardSelect?: (boardId: string | null) => void;
}

const sidebarStyle = {
  width: "240px",
  height: "100%",
  borderRight: "1px solid #e0e0e0",
  backgroundColor: "#fafafa",
  overflowY: "auto" as const,
  flexShrink: 0,
};

export function Sidebar({ workspaceId, onBoardSelect }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Workspace boards" style={sidebarStyle}>
      <BoardList workspaceId={workspaceId} onBoardSelect={onBoardSelect} />
    </aside>
  );
}
