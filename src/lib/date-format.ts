export function parseUpdatedAt(updatedAt: string): number {
  const sqliteUtcMatch = updatedAt.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);

  if (sqliteUtcMatch) {
    const [, year, month, day, hours, minutes, seconds] = sqliteUtcMatch;

    return Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds),
    );
  }

  const parsedTime = Date.parse(updatedAt);
  return Number.isNaN(parsedTime) ? Date.now() : parsedTime;
}

export function formatRelativeUpdatedTime(updatedAt: string): string {
  const updatedTime = parseUpdatedAt(updatedAt);
  const diffMs = Math.max(0, Date.now() - updatedTime);
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) {
    return "just now";
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  return `${Math.floor(diffHours / 24)}d ago`;
}
