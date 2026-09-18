/**
 * In-memory desktop runtime config injected by the Tauri shell.
 * Never persisted to localStorage, sessionStorage, cookies, or disk from the UI.
 */

export type DesktopRuntimeStatus = "starting" | "ready" | "failed" | "stopped";

export type DesktopRuntimeConfig = {
  mode: "desktop";
  apiOrigin: string;
  localAuthToken: string;
  status: DesktopRuntimeStatus;
  error?: string | null;
};

let injected: DesktopRuntimeConfig | null = null;

export function getInjectedDesktopConfig(): DesktopRuntimeConfig | null {
  return injected;
}

export function setInjectedDesktopConfig(config: DesktopRuntimeConfig | null) {
  injected = config;
}

export function clearInjectedDesktopConfig() {
  injected = null;
}

export function localAuthHeaderName() {
  return "X-ServerUI-Local-Token";
}

export function localAuthQueryName() {
  return "localToken";
}

export function localAuthWSProtocolPrefix() {
  return "serverui-local.";
}

/** Subprotocol list for WebSocket auth (preferred over query strings). */
export function localAuthWSProtocols(token?: string | null): string[] | undefined {
  const value = token?.trim();
  if (!value) return undefined;
  return [`${localAuthWSProtocolPrefix()}${value}`];
}

/** Append localToken only for URLs that cannot send headers (media/download). */
export function withLocalAuthQuery(url: string, token?: string | null): string {
  const value = token?.trim();
  if (!value) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${localAuthQueryName()}=${encodeURIComponent(value)}`;
}

/**
 * Validates desktop runtime config before the UI makes authenticated calls.
 * Desktop API origins must be loopback HTTP.
 */
export function validateDesktopConfig(config: DesktopRuntimeConfig): string | null {
  if (config.mode !== "desktop") {
    return "invalid desktop runtime mode";
  }
  if (config.status === "ready") {
    if (!config.localAuthToken?.trim()) {
      return "desktop local authentication token is missing";
    }
    if (!isLoopbackHttpOrigin(config.apiOrigin)) {
      return "desktop API origin must be http://127.0.0.1:<port>";
    }
  }
  return null;
}

export function isLoopbackHttpOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:") return false;
    return url.hostname === "127.0.0.1" || url.hostname === "localhost";
  } catch {
    return false;
  }
}
