export function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatModified(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "—";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function totalSize(entries: { type: string; size: number }[]) {
  return entries.reduce((sum, entry) => sum + (entry.type === "file" ? entry.size : 0), 0);
}
