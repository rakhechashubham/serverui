import { apiRequest } from "@/src/lib/api/client";
import { apiUrl } from "@/src/lib/api/origin";

// The first start boots px0 on the server, so allow it time.
const START_TIMEOUT_MS = 50_000;

/** Makes sure px0 runs on the server; resolves to the URL the iframe opens. 409 (ApiError.status) means px0 is not installed. */
export async function startPx0(serverId: string) {
  const { path } = await apiRequest<{ path: string }>(
    `/api/px0/${encodeURIComponent(serverId)}/start`,
    { method: "POST", timeoutMs: START_TIMEOUT_MS },
  );
  return apiUrl(path);
}

/** px0 opens one file given by ?path=, relative to its root (the SSH home). Without a target it opens on its root. */
export function px0FrameUrl(base: string, target?: string) {
  if (!target) return base;
  return `${base}?${new URLSearchParams({ path: target })}`;
}
