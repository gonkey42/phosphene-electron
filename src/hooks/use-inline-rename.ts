import { useCallback, useState } from "react";

export type CommitHandler = (id: string, name: string) => Promise<void>;

export function useInlineRename(onCommit?: CommitHandler) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const cancelRename = useCallback(() => {
    setEditingId(null);
    setDraftName("");
  }, []);

  const startRename = useCallback((id: string, currentName: string) => {
    setEditingId(id);
    setDraftName(currentName);
  }, []);

  const commitRename = useCallback(
    async (id: string) => {
      const trimmedName = draftName.trim();

      if (!trimmedName) {
        return;
      }

      await onCommit?.(id, trimmedName);
      cancelRename();
    },
    [cancelRename, draftName, onCommit],
  );

  return {
    editingId,
    draftName,
    setDraftName,
    startRename,
    cancelRename,
    commitRename,
  };
}
