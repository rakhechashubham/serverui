import { apiRequest } from "@/src/lib/api/client";
import { apiUrl } from "@/src/lib/api/origin";

// The first start boots a Node process on the server, so allow it time.
const START_TIMEOUT_MS = 50_000;

/** Makes sure VS Code runs on the server; resolves to the URL the iframe opens. */
export async function startCode(serverId: string) {
  const { path } = await apiRequest<{ path: string }>(
    `/api/code/${encodeURIComponent(serverId)}/start`,
    { method: "POST", timeoutMs: START_TIMEOUT_MS },
  );
  return apiUrl(path);
}

/** What the window should open: a folder, and optionally one file inside it. */
export type CodeTarget = { folder?: string; file?: string };

export function codeFrameUrl(base: string, target: CodeTarget) {
  const params = new URLSearchParams();
  if (target.folder) params.set("folder", target.folder);
  if (target.file) {
    params.set("payload", JSON.stringify([["openFile", `vscode-remote://${target.file}`]]));
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
