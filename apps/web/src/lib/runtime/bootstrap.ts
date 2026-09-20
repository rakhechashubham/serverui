import {
  clearInjectedDesktopConfig,
  getInjectedDesktopConfig,
  setInjectedDesktopConfig,
  validateDesktopConfig,
  type DesktopRuntimeConfig,
} from "@/src/lib/runtime/config";

export type BootstrapResult = { kind: "web" } | { kind: "desktop"; config: DesktopRuntimeConfig };

async function isTauriShell(): Promise<boolean> {
  try {
    const { isTauri } = await import("@tauri-apps/api/core");
    return isTauri();
  } catch {
    return false;
  }
}

/**
 * Single desktop detection + config load point.
 * Application code should not call window.__TAURI__ directly.
 */
export async function bootstrapRuntime(): Promise<BootstrapResult> {
  if (!(await isTauriShell())) {
    clearInjectedDesktopConfig();
    return { kind: "web" };
  }

  const { invoke } = await import("@tauri-apps/api/core");
  const started = Date.now();
  const timeoutMs = 60_000;

  while (Date.now() - started < timeoutMs) {
    let config: DesktopRuntimeConfig;
    try {
      config = await invoke<DesktopRuntimeConfig>("get_runtime_config");
    } catch (err) {
      const detail =
        err instanceof Error && err.message.trim()
          ? err.message.trim()
          : typeof err === "string"
            ? err
            : "get_runtime_config failed";
      const failed: DesktopRuntimeConfig = {
        mode: "desktop",
        apiOrigin: getInjectedDesktopConfig()?.apiOrigin || "",
        localAuthToken: "",
        status: "failed",
        error: `Desktop shell IPC error: ${detail}`,
      };
      setInjectedDesktopConfig(failed);
      return { kind: "desktop", config: failed };
    }
    if (config.status === "ready") {
      const invalid = validateDesktopConfig(config);
      if (invalid) {
        const failed: DesktopRuntimeConfig = {
          ...config,
          localAuthToken: "",
          status: "failed",
          error: invalid,
        };
        setInjectedDesktopConfig(failed);
        return { kind: "desktop", config: failed };
      }
    }
    setInjectedDesktopConfig(config);
    if (config.status === "ready") {
      return { kind: "desktop", config };
    }
    if (config.status === "failed" || config.status === "stopped") {
      return { kind: "desktop", config };
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  const failed: DesktopRuntimeConfig = {
    mode: "desktop",
    apiOrigin: getInjectedDesktopConfig()?.apiOrigin || "",
    localAuthToken: "",
    status: "failed",
    error: "ServerUI backend failed to start.",
  };
  setInjectedDesktopConfig(failed);
  return { kind: "desktop", config: failed };
}

/** Polls Tauri for backend crash / stop after the UI is running. */
export async function watchDesktopBackend(
  onStopped: (message: string) => void,
  signal: AbortSignal,
): Promise<void> {
  if (!(await isTauriShell())) return;
  const { invoke } = await import("@tauri-apps/api/core");
  while (!signal.aborted) {
    await new Promise((r) => setTimeout(r, 1000));
    if (signal.aborted) return;
    try {
      const config = await invoke<DesktopRuntimeConfig>("get_runtime_config");
      if (config.status === "stopped" || config.status === "failed") {
        setInjectedDesktopConfig({ ...config, localAuthToken: "" });
        onStopped(config.error?.trim() || "ServerUI backend stopped unexpectedly.");
        return;
      }
      // Keep in-memory config in sync without widening React state.
      setInjectedDesktopConfig(config);
    } catch {
      onStopped("Unable to connect to local ServerUI backend.");
      return;
    }
  }
}
