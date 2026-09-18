import { getInjectedDesktopConfig } from "@/src/lib/runtime/config";

/**
 * Runtime modes ServerUI supports.
 *
 * - web: browser UI talking to a Go backend (remote or same host)
 * - desktop: Tauri shell talking to a local Go backend
 */
export type RuntimeMode = "web" | "desktop";

const DESKTOP_OVERRIDE = "desktop";

/**
 * Resolves the active runtime.
 *
 * Priority:
 * 1. In-memory config injected by the Tauri shell
 * 2. NEXT_PUBLIC_SERVERUI_RUNTIME override (tests / experiments)
 * 3. web
 */
export function currentRuntime(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): RuntimeMode {
  const injected = getInjectedDesktopConfig();
  if (injected?.mode === "desktop") return "desktop";

  const raw = env.NEXT_PUBLIC_SERVERUI_RUNTIME?.trim().toLowerCase();
  if (raw === DESKTOP_OVERRIDE) return "desktop";
  return "web";
}

export function isDesktopRuntime(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return currentRuntime(env) === "desktop";
}
