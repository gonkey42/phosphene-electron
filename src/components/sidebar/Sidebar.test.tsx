import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { boardListMock } = vi.hoisted(() => ({
  boardListMock: vi.fn(),
}));

vi.mock("./BoardList", () => ({
  BoardList: (props: {
    workspaceId?: string;
    onBoardSelect?: (boardId: string | null) => void;
  }) => {
    boardListMock(props);
    return <div data-testid="board-list" />;
  },
}));

import { Sidebar } from "./Sidebar";

describe("Sidebar", () => {
  it("passes workspace-scoped board selection callbacks through to BoardList", () => {
    const onBoardSelect = vi.fn();

    render(<Sidebar workspaceId="workspace-1" onBoardSelect={onBoardSelect} />);

    expect(boardListMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      onBoardSelect,
    });
  });
});
