"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { isDesktopRuntime, currentRuntime } from "@/src/lib/runtime";
import { useSelectedServer } from "@/src/lib/session";
import { BrandMark } from "@/src/components/brand/BrandMark";

type UpdatePhase = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "error";

type AvailableUpdate = {
  version: string;
  body?: string | null;
};

/**
 * Settings: About + Runtime for all environments; Updates only on desktop.
 * Never displays tokens, encryption keys, passwords, or private keys.
 */
export function SettingsApp() {
  const selected = useSelectedServer();
  const desktop = isDesktopRuntime();
  const runtime = currentRuntime();
  const [version, setVersion] = useState<string>(() => (isDesktopRuntime() ? "…" : "web"));
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [available, setAvailable] = useState<AvailableUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const downloadedRef = useRef(0);

  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;
    (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const v = await getVersion();
        if (!cancelled) setVersion(v);
      } catch {
        if (!cancelled) setVersion("unknown");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [desktop]);

  const checkForUpdates = useCallback(async () => {
    setPhase("checking");
    setError(null);
    setAvailable(null);
    setProgress(null);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!update) {
        setPhase("up-to-date");
        return;
      }
      setAvailable({ version: update.version, body: update.body });
      setPhase("available");
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Update check failed");
    }
  }, []);

  const installUpdate = useCallback(async () => {
    setPhase("downloading");
    setError(null);
    setProgress(null);
    downloadedRef.current = 0;
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      const update = await check();
      if (!update) {
        setPhase("up-to-date");
        return;
      }
      let contentLength: number | undefined;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          contentLength = event.data.contentLength;
          downloadedRef.current = 0;
          setProgress(contentLength ? 0 : null);
        } else if (event.event === "Progress") {
          downloadedRef.current += event.data.chunkLength;
          if (contentLength && contentLength > 0) {
            setProgress(Math.min(99, Math.round((downloadedRef.current / contentLength) * 100)));
          }
        } else if (event.event === "Finished") {
          setProgress(100);
        }
      });
      await relaunch();
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Update install failed");
      setProgress(null);
    }
  }, []);

  return (
    <div className="flex h-full flex-col gap-8 sui-app overflow-auto px-8 py-10">
      <div className="flex items-start gap-4">
        <BrandMark size={48} />
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] sui-muted">ServerUI</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight sui-title">Settings</h3>
          <p className="mt-2 max-w-md text-sm leading-6 sui-muted">
            Application information and safe preferences. Secrets and credentials are never shown
            here.
          </p>
        </div>
      </div>

      <section className="max-w-lg space-y-3" aria-labelledby="settings-about">
        <h4 id="settings-about" className="text-sm font-medium sui-title">
          About
        </h4>
        <dl className="space-y-2 text-sm sui-muted">
          <div className="flex justify-between gap-4">
            <dt>Application</dt>
            <dd className="flex items-center gap-2 sui-title">
              <BrandMark size={18} />
              ServerUI
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Version</dt>
            <dd className="sui-title">{version}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>License</dt>
            <dd className="sui-title">Open source</dd>
          </div>
        </dl>
        <p className="text-sm leading-6 sui-muted">
          Documentation:{" "}
          <a
            className="underline underline-offset-2"
            href="https://github.com/rakhechashubham/serverui"
            target="_blank"
            rel="noreferrer"
          >
            GitHub repository
          </a>
        </p>
      </section>

      <section className="max-w-lg space-y-3" aria-labelledby="settings-runtime">
        <h4 id="settings-runtime" className="text-sm font-medium sui-title">
          Runtime
        </h4>
        <dl className="space-y-2 text-sm sui-muted">
          <div className="flex justify-between gap-4">
            <dt>Mode</dt>
            <dd className="sui-title capitalize">{runtime}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Backend</dt>
            <dd className="sui-title">
              {desktop ? "Local Go (loopback)" : "Remote / shared Go API"}
            </dd>
          </div>
          {selected ? (
            <div className="flex justify-between gap-4">
              <dt>Active server</dt>
              <dd className="truncate sui-title">{selected.name}</dd>
            </div>
          ) : null}
        </dl>
        <p className="text-[12px] leading-5 sui-muted">
          SSH, SFTP, and terminals always run in the Go backend. The UI never dials SSH directly.
        </p>
      </section>

      {desktop ? (
        <section className="max-w-lg space-y-3" aria-labelledby="settings-updates">
          <h4 id="settings-updates" className="text-sm font-medium sui-title">
            Updates
          </h4>
          <p className="text-sm leading-6 sui-muted">
            Checks GitHub Releases for a newer signed build. Packages are verified before install.
            Updates never install unless you choose Install and restart.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm sui-title hover:bg-white/10 disabled:opacity-50"
              onClick={() => void checkForUpdates()}
              disabled={phase === "checking" || phase === "downloading"}
            >
              {phase === "checking" ? "Checking…" : "Check for updates"}
            </button>
            {(phase === "available" || phase === "downloading") && available ? (
              <button
                type="button"
                className="rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-sm sui-title hover:bg-white/15 disabled:opacity-50"
                onClick={() => void installUpdate()}
                disabled={phase === "downloading"}
              >
                {phase === "downloading"
                  ? "Downloading…"
                  : `Install ${available.version} and restart`}
              </button>
            ) : null}
          </div>
          {phase === "up-to-date" ? (
            <p className="text-sm sui-muted">You are on the latest release.</p>
          ) : null}
          {(phase === "available" || phase === "downloading") && available ? (
            <p className="text-sm sui-muted">
              Update available: <span className="sui-title">{available.version}</span>
              {available.body ? (
                <span className="mt-1 block whitespace-pre-wrap text-[12px] opacity-80">
                  {available.body}
                </span>
              ) : null}
            </p>
          ) : null}
          {phase === "downloading" ? (
            <p className="text-sm sui-muted">
              Downloading update
              {progress !== null ? ` (${progress}%)` : ""}… ServerUI will restart when finished.
            </p>
          ) : null}
          {phase === "error" && error ? (
            <p className="text-sm text-red-300/90" role="alert">
              {error}
            </p>
          ) : null}
        </section>
      ) : (
        <section className="max-w-lg space-y-2" aria-labelledby="settings-web-note">
          <h4 id="settings-web-note" className="text-sm font-medium sui-title">
            Web deployment
          </h4>
          <p className="text-sm leading-6 sui-muted">
            In-app updates apply to the desktop application. Upgrade the web deployment with your
            usual Docker or host process.
          </p>
        </section>
      )}

      <section className="max-w-lg space-y-2" aria-labelledby="settings-shortcuts">
        <h4 id="settings-shortcuts" className="text-sm font-medium sui-title">
          Keyboard shortcuts
        </h4>
        <ul className="space-y-1.5 text-sm sui-muted">
          <li>
            <kbd className="sui-title">⌘/Ctrl</kbd> + <kbd className="sui-title">K</kbd> — Server
            menu
          </li>
          <li>
            <kbd className="sui-title">⌘/Ctrl</kbd> + <kbd className="sui-title">,</kbd> — Settings
          </li>
          <li>
            <kbd className="sui-title">⌘/Ctrl</kbd> + <kbd className="sui-title">W</kbd> — Close
            focused window (not while typing in Terminal)
          </li>
          <li>
            <kbd className="sui-title">Esc</kbd> — Clear menus / focus
          </li>
        </ul>
      </section>
    </div>
  );
}
