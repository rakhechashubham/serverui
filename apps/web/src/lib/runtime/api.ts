import { currentRuntime, type RuntimeMode } from "@/src/lib/runtime/mode";
import { getInjectedDesktopConfig, withLocalAuthQuery } from "@/src/lib/runtime/config";

export type BrowserLocation = {
  hostname: string;
  port: string;
  protocol: string;
};

export type ApiResolveInput = {
  runtime?: RuntimeMode;
  /** Explicit browser-facing API origin, e.g. https://api.example.test */
  explicitBase?: string | null;
  location?: BrowserLocation | null;
  /**
   * Desktop local backend origin from the Tauri shell,
   * e.g. http://127.0.0.1:43127
   */
  desktopBackendOrigin?: string | null;
};

const DEFAULT_DESKTOP_BACKEND = "http://127.0.0.1:8080";

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

function readExplicitBase(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  return trimTrailingSlash(env.NEXT_PUBLIC_API_BASE?.trim() || "");
}

/**
 * Pure API origin resolution. Used by the browser client and unit tests.
 *
 * WEB:
 *   1. NEXT_PUBLIC_API_BASE when set
 *   2. Direct to local Go API when the UI is on localhost:3000 (dev convenience)
 *   3. Same-origin empty string (Next.js rewrites / reverse proxy)
 *
 * DESKTOP:
 *   1. NEXT_PUBLIC_API_BASE when set (unusual)
 *   2. desktopBackendOrigin from Tauri (required in practice)
 *   3. fallback default only for tests
 */
export function resolveApiOrigin(input: ApiResolveInput = {}): string {
  const explicit = trimTrailingSlash(input.explicitBase?.trim() || "");
  if (explicit) return explicit;

  const runtime = input.runtime ?? "web";

  if (runtime === "desktop") {
    const desktop = trimTrailingSlash(input.desktopBackendOrigin?.trim() || "");
    return desktop || DEFAULT_DESKTOP_BACKEND;
  }

  const location = input.location;
  if (!location) return "";

  const { hostname, port, protocol } = location;
  if ((hostname === "localhost" || hostname === "127.0.0.1") && port === "3000") {
    return `${protocol}//127.0.0.1:8080`;
  }
  return "";
}

/** Browser-facing API origin for the current runtime. */
export function apiOrigin(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  if (typeof window === "undefined") return "";
  const injected = getInjectedDesktopConfig();
  const { hostname, port, protocol } = window.location;
  return resolveApiOrigin({
    runtime: currentRuntime(env),
    explicitBase: readExplicitBase(env),
    location: { hostname, port, protocol },
    desktopBackendOrigin: injected?.apiOrigin,
  });
}

export function apiUrl(
  path: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${apiOrigin(env)}${path}`;
}

/**
 * WebSocket URL without embedding the local auth token in the query string.
 * Pass `localAuthWSProtocols(token)` to `new WebSocket(url, protocols)`.
 */
export function wsUrl(
  path: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  const origin = apiOrigin(env);
  if (!origin) {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.host}${path}`;
  }
  return `${origin.replace(/^http/, "ws")}${path}`;
}

export function resolveWsUrl(
  path: string,
  httpOrigin: string,
  pageHost: string,
  pageIsHttps: boolean,
) {
  if (!httpOrigin) {
    const protocol = pageIsHttps ? "wss" : "ws";
    return `${protocol}://${pageHost}${path}`;
  }
  return `${httpOrigin.replace(/^http/, "ws")}${path}`;
}

export function authenticatedApiUrl(
  path: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  return withLocalAuthQuery(apiUrl(path, env), getInjectedDesktopConfig()?.localAuthToken);
}
