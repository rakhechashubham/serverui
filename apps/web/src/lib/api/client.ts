import { apiUrl } from "@/src/lib/api/origin";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // Ignore non-JSON error bodies.
  }
  if (response.status === 502 || response.status === 503) {
    return "unable to connect to server";
  }
  if (response.status === 403) return "permission denied";
  if (response.status === 404) return "file not found";
  return "request failed";
}

const REQUEST_TIMEOUT_MS = 5000;

type RequestOptions = RequestInit & { timeoutMs?: number };

export async function apiRequest<T>(path: string, init?: RequestOptions): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");

  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  if (init?.signal) {
    if (init.signal.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    init.signal.addEventListener("abort", onParentAbort);
  }

  const timeoutMs = init?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const fetchInit = { ...(init ?? {}) };
  delete (fetchInit as { timeoutMs?: number }).timeoutMs;
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...fetchInit,
      cache: "no-store",
      credentials: "omit",
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    if (init?.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    const aborted =
      (err instanceof DOMException && err.name === "AbortError") ||
      (err instanceof Error && err.name === "AbortError");
    throw new ApiError(aborted ? "unable to connect to server" : "network disconnected", 0);
  } finally {
    clearTimeout(timeout);
    init?.signal?.removeEventListener("abort", onParentAbort);
  }

  if (!response.ok) {
    throw new ApiError(await readError(response), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
