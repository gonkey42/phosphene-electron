import path from "node:path";

const SAFE_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function assertSafeWebPublishPathSegment(segment: string): string {
  if (
    !SAFE_PATH_SEGMENT_PATTERN.test(segment) ||
    segment === "." ||
    segment === ".." ||
    segment.includes("/") ||
    segment.includes("\\")
  ) {
    throw new Error("Unsafe web publish path segment");
  }

  return segment;
}

export function resolveInsideWebPublishRoot(root: string, ...segments: string[]): string {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(
    resolvedRoot,
    ...segments.map((segment) => assertSafeWebPublishPathSegment(segment)),
  );

  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Unsafe web publish path segment");
  }

  return resolvedPath;
}
