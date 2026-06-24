function normalizeSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function createWorkspaceSlug(name: string, existingSlug?: string | null): string {
  if (existingSlug) {
    return existingSlug;
  }

  return normalizeSlug(name) || "workspace";
}

export function ensureUniqueWorkspaceSlug(
  baseSlug: string,
  workspaceId: string,
  usedSlugs: Set<string>,
): string {
  if (!usedSlugs.has(baseSlug)) {
    return baseSlug;
  }

  let suffixLength = 6;
  let candidateSlug = `${baseSlug}-${workspaceId.slice(0, suffixLength)}`;

  while (usedSlugs.has(candidateSlug) && suffixLength < workspaceId.length) {
    suffixLength += 1;
    candidateSlug = `${baseSlug}-${workspaceId.slice(0, suffixLength)}`;
  }

  let counter = 2;
  while (usedSlugs.has(candidateSlug)) {
    candidateSlug = `${baseSlug}-${workspaceId}-${counter}`;
    counter += 1;
  }

  return candidateSlug;
}
