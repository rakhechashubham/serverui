import { apiRequest } from "@/src/lib/api/client";
import { authenticatedApiUrl } from "@/src/lib/runtime";

export type FileEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  mode: string;
  modified: string;
  mime?: string;
};

export type FileList = {
  path: string;
  entries: FileEntry[];
};

export type FileContent = {
  path: string;
  content: string;
  size?: number;
  truncated?: boolean;
  mime?: string;
  binary?: boolean;
  writable?: boolean;
};

function fileQuery(serverId: string, extra: Record<string, string>) {
  return new URLSearchParams({ serverId, ...extra }).toString();
}

export function listFiles(serverId: string, path: string) {
  return apiRequest<FileList>(`/api/files?${fileQuery(serverId, { path })}`);
}

export function readFile(serverId: string, path: string) {
  return apiRequest<FileContent>(`/api/files/read?${fileQuery(serverId, { path })}`);
}

export function writeFile(serverId: string, path: string, content: string) {
  return apiRequest<{ status: string }>("/api/files/write", {
    method: "POST",
    body: JSON.stringify({ serverId, path, content }),
    // The default 5s is too short to upload a few MB over a slow link.
    timeoutMs: 60_000,
  });
}

export function createFile(serverId: string, path: string) {
  return apiRequest<{ status: string }>("/api/files/create", {
    method: "POST",
    body: JSON.stringify({ serverId, path }),
  });
}

export function createDirectory(serverId: string, path: string) {
  return apiRequest<{ status: string }>("/api/files/mkdir", {
    method: "POST",
    body: JSON.stringify({ serverId, path }),
  });
}

export function renameFile(serverId: string, from: string, to: string) {
  return apiRequest<{ status: string }>("/api/files/rename", {
    method: "POST",
    body: JSON.stringify({ serverId, from, to }),
  });
}

export function deleteFile(serverId: string, path: string) {
  return apiRequest<{ status: string }>(`/api/files?${fileQuery(serverId, { path })}`, {
    method: "DELETE",
  });
}

export async function uploadFile(serverId: string, directory: string, file: File) {
  const body = new FormData();
  body.set("serverId", serverId);
  body.set("path", directory);
  body.set("file", file);
  return apiRequest<{ status: string; path: string }>("/api/files/upload", {
    method: "POST",
    body,
  });
}

// Copy, move, compress and extract run as shell commands on the server and can take minutes.
const LONG_OPERATION_MS = 30 * 60 * 1000;

export function copyItem(serverId: string, from: string, to: string, overwrite = false) {
  return apiRequest<{ status: string }>("/api/files/copy", {
    method: "POST",
    body: JSON.stringify({ serverId, from, to, overwrite }),
    timeoutMs: LONG_OPERATION_MS,
  });
}

export function moveItem(serverId: string, from: string, to: string, overwrite = false) {
  return apiRequest<{ status: string }>("/api/files/move", {
    method: "POST",
    body: JSON.stringify({ serverId, from, to, overwrite }),
    timeoutMs: LONG_OPERATION_MS,
  });
}

export const ARCHIVE_FORMATS = [
  { id: "zip", label: "ZIP", ext: ".zip" },
  { id: "tar.gz", label: "TAR.GZ", ext: ".tar.gz" },
  { id: "tgz", label: "TGZ", ext: ".tgz" },
  { id: "tar.bz2", label: "TAR.BZ2", ext: ".tar.bz2" },
  { id: "tar.xz", label: "TAR.XZ", ext: ".tar.xz" },
  { id: "tar", label: "TAR", ext: ".tar" },
  { id: "7z", label: "7Z", ext: ".7z" },
] as const;

export type ArchiveFormat = (typeof ARCHIVE_FORMATS)[number]["id"];

export function compressItems(
  serverId: string,
  dir: string,
  names: string[],
  archive: string,
  format: ArchiveFormat,
  overwrite = false,
) {
  return apiRequest<{ status: string; path: string }>("/api/files/compress", {
    method: "POST",
    body: JSON.stringify({ serverId, dir, names, archive, format, overwrite }),
    timeoutMs: LONG_OPERATION_MS,
  });
}

// Mirrors the server's filesystem.ArchiveSuffix (longest first so ".tar.gz" wins over ".tar").
const ARCHIVE_SUFFIXES = [
  ".tar.gz",
  ".tar.bz2",
  ".tar.xz",
  ".tgz",
  ".tbz2",
  ".txz",
  ".tar",
  ".zip",
  ".7z",
];

export function archiveSuffix(name: string) {
  const lower = name.toLowerCase();
  return (
    ARCHIVE_SUFFIXES.find((suffix) => lower.endsWith(suffix) && name.length > suffix.length) ?? ""
  );
}

export function isArchive(entry: Pick<FileEntry, "name" | "type">) {
  return entry.type === "file" && archiveSuffix(entry.name) !== "";
}

/** "backup.tar.gz" → "backup" */
export function archiveStem(name: string) {
  return name.slice(0, name.length - archiveSuffix(name).length);
}

export type ExtractState =
  "scanning" | "awaiting_decision" | "extracting" | "done" | "failed" | "cancelled";

export type ExtractJob = {
  id: string;
  state: ExtractState;
  archive: string;
  destination: string;
  done: number;
  total: number;
  conflicts: string[];
  extracted: string[];
  error?: string;
};

export type ConflictPolicy = "replace" | "keep-both";

export function isExtractFinished(state: ExtractState) {
  return state === "done" || state === "failed" || state === "cancelled";
}

/** Starts a server-side extraction job; progress comes from getExtractJob. */
export function startExtract(
  serverId: string,
  path: string,
  mode: "here" | "to",
  destination?: string,
) {
  return apiRequest<ExtractJob>("/api/files/extract", {
    method: "POST",
    body: JSON.stringify({ serverId, path, mode, destination }),
  });
}

export function getExtractJob(serverId: string, jobId: string) {
  return apiRequest<ExtractJob>(
    `/api/files/extract/${encodeURIComponent(jobId)}?${fileQuery(serverId, {})}`,
  );
}

export function resolveExtract(serverId: string, jobId: string, policy: ConflictPolicy) {
  return apiRequest<ExtractJob>(`/api/files/extract/${encodeURIComponent(jobId)}/resolve`, {
    method: "POST",
    body: JSON.stringify({ serverId, policy }),
  });
}

export function cancelExtract(serverId: string, jobId: string) {
  return apiRequest<ExtractJob>(
    `/api/files/extract/${encodeURIComponent(jobId)}?${fileQuery(serverId, {})}`,
    { method: "DELETE" },
  );
}

export function downloadUrl(serverId: string, path: string) {
  return authenticatedApiUrl(`/api/files/download?${fileQuery(serverId, { path, download: "1" })}`);
}

export function mediaUrl(serverId: string, path: string) {
  return authenticatedApiUrl(`/api/files/download?${fileQuery(serverId, { path })}`);
}

export function joinPath(base: string, name: string) {
  if (base === "/") return `/${name}`;
  return `${base.replace(/\/$/, "")}/${name}`;
}

export function parentPath(path: string) {
  if (path === "/") return "/";
  const trimmed = path.replace(/\/+$/, "");
  const index = trimmed.lastIndexOf("/");
  return index <= 0 ? "/" : trimmed.slice(0, index);
}

export function baseName(path: string) {
  const trimmed = path.replace(/\/+$/, "");
  const index = trimmed.lastIndexOf("/");
  return index < 0 ? trimmed : trimmed.slice(index + 1);
}

export function buildMoveDestination(destDir: string, sourcePath: string) {
  return joinPath(destDir, baseName(sourcePath));
}

export function isValidMove(sourcePath: string, sourceType: "file" | "dir", destDir: string) {
  if (sourcePath === "/") return false;
  const source = sourcePath.replace(/\/+$/, "") || "/";
  const dest = destDir.replace(/\/+$/, "") || "/";
  if (source === dest) return false;
  if (parentPath(source) === dest) return false;
  // ponytail: prefix check blocks self/descendant drops; backend rename is final guard
  if (sourceType === "dir" && (dest === source || dest.startsWith(`${source}/`))) return false;
  return true;
}

export function suggestUniqueName(existing: string[], desired: string) {
  if (!existing.includes(desired)) return desired;
  const dot = desired.lastIndexOf(".");
  const base = dot > 0 ? desired.slice(0, dot) : desired;
  const ext = dot > 0 ? desired.slice(dot) : "";
  let i = 1;
  while (true) {
    const candidate = `${base} (${i})${ext}`;
    if (!existing.includes(candidate)) return candidate;
    i += 1;
  }
}
