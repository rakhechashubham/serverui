import { apiRequest } from "@/src/lib/api/client";
import { apiUrl } from "@/src/lib/api/origin";

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

export function downloadUrl(serverId: string, path: string) {
  return apiUrl(`/api/files/download?${fileQuery(serverId, { path, download: "1" })}`);
}

export function mediaUrl(serverId: string, path: string) {
  return apiUrl(`/api/files/download?${fileQuery(serverId, { path })}`);
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
