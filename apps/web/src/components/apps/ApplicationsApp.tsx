"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, RefreshCw, Search, X } from "lucide-react";
import {
  filterStoreApps,
  STORE_CATALOG,
  STORE_CATEGORIES,
  type StoreApp,
  type StoreCategory,
} from "@/src/data/store-catalog";
import { ApiError } from "@/src/lib/api/client";
import {
  getStoreJob,
  listStoreApps,
  startStoreJob,
  type StoreAction,
  type StoreAppStatus,
  type StoreJob,
} from "@/src/lib/api/store";
import { useSelectedServer } from "@/src/lib/session";

type Filter = StoreCategory | "All" | "Installed";

const JOB_POLL_MS = 1000;
const LOG_LINES_SHOWN = 6;

const RUNNING_LABEL: Record<StoreAction, string> = {
  install: "Installing…",
  update: "Updating…",
  remove: "Removing…",
};

const DONE_LABEL: Record<StoreAction, string> = {
  install: "Installed",
  update: "Updated",
  remove: "Removed",
};

function errorText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

function formatVersion(version: string) {
  return /^\d/.test(version) ? `v${version}` : version;
}

export function ApplicationsApp() {
  // Remounting per server drops the previous server's statuses and jobs.
  return <Store key={useSelectedServer()?.id ?? ""} />;
}

function Store() {
  const server = useSelectedServer();
  const serverId = server?.id || "";
  const [category, setCategory] = useState<Filter>("All");
  const [query, setQuery] = useState("");
  // Each check carries the reload key it answers, so "checking" is simply "no answer for this key yet".
  const [reloadKey, setReloadKey] = useState(0);
  const [check, setCheck] = useState<{
    key: number;
    statuses: Record<string, StoreAppStatus>;
    error: string | null;
  } | null>(null);
  const checking = Boolean(serverId) && check?.key !== reloadKey;
  const statuses = useMemo(() => check?.statuses ?? {}, [check]);
  const checkError = check?.error ?? null;
  const [jobs, setJobs] = useState<Record<string, StoreJob>>({});
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    if (!serverId) return;
    let cancelled = false;
    listStoreApps(serverId)
      .then((apps) => {
        if (cancelled) return;
        setCheck({
          key: reloadKey,
          statuses: Object.fromEntries(apps.map((app) => [app.id, app])),
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        // Keep what we knew: a failed re-check must not make installed apps look absent.
        setCheck((prev) => ({
          key: reloadKey,
          statuses: prev?.statuses ?? {},
          error: errorText(err, "unable to check this server"),
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [serverId, reloadKey]);

  const run = useCallback(
    async (app: StoreApp, action: StoreAction) => {
      setConfirmRemove(null);
      try {
        let job = await startStoreJob(serverId, app.id, action);
        setJobs((all) => ({ ...all, [app.id]: job }));
        while (job.state === "running" && mounted.current) {
          await new Promise((resolve) => setTimeout(resolve, JOB_POLL_MS));
          job = await getStoreJob(serverId, job.id);
          if (mounted.current) setJobs((all) => ({ ...all, [app.id]: job }));
        }
      } catch (err) {
        const failed: StoreJob = {
          id: "",
          appId: app.id,
          action,
          state: "failed",
          log: [],
          error: errorText(err, `unable to ${action} ${app.name}`),
        };
        if (mounted.current) setJobs((all) => ({ ...all, [app.id]: failed }));
      }
      if (mounted.current) refresh();
    },
    [refresh, serverId],
  );

  const visible = useMemo(() => {
    const installedOnly = category === "Installed";
    const apps = filterStoreApps(STORE_CATALOG, installedOnly ? "All" : category, query);
    return installedOnly ? apps.filter((app) => statuses[app.id]?.installed) : apps;
  }, [category, query, statuses]);

  return (
    <div className="flex h-full min-h-0 overflow-hidden sui-app">
      <aside className="sui-sidebar flex w-[176px] shrink-0 flex-col gap-0.5 px-3 py-4 text-[13px]">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] sui-muted">
          Store
        </p>
        {(["All", "Installed", ...STORE_CATEGORIES] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-current={category === item ? "page" : undefined}
            className={`rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
              category === item ? "sui-selected" : ""
            }`}
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto px-6 py-6">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-2xl font-semibold tracking-tight sui-title">
              {category === "All" ? "Discover" : category}
            </h3>
            <p className="mt-1 flex items-center gap-1.5 truncate text-[13px] sui-muted">
              {server ? `On ${server.name}` : "No server selected"}
              {checking ? (
                <>
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                  <span>Checking…</span>
                </>
              ) : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-label="Check this server again"
              title="Check this server again"
              disabled={!serverId || checking}
              className="sui-input grid size-8 place-items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-50"
              onClick={refresh}
            >
              <RefreshCw className={`size-3.5 ${checking ? "animate-spin" : ""}`} aria-hidden />
            </button>
            <label className="sui-input flex w-48 items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] focus-within:ring-2 focus-within:ring-sky-400">
              <Search className="size-3.5 shrink-0 sui-muted" aria-hidden />
              <input
                type="search"
                aria-label="Search apps"
                placeholder="Search"
                className="min-w-0 flex-1 bg-transparent outline-none"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
        </div>

        {checkError ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-800/40 dark:bg-red-950/30 dark:text-red-300"
          >
            Couldn’t check {server?.name || "the server"}: {checkError}. Installed apps are unknown
            until this works.
          </p>
        ) : null}

        {visible.length === 0 ? (
          <p className="mt-16 text-center text-[13px] sui-muted">
            {query.trim()
              ? `No app matches “${query.trim()}”`
              : category === "Installed"
                ? "Nothing from the store is installed on this server yet"
                : "No app here"}
          </p>
        ) : (
          <ul className="mt-6 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {visible.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                status={statuses[app.id]}
                job={jobs[app.id]}
                confirming={confirmRemove === app.id}
                onAction={(action) => void run(app, action)}
                onAskRemove={() => setConfirmRemove(app.id)}
                onCancelRemove={() => setConfirmRemove(null)}
                onDismissJob={() =>
                  setJobs((all) => {
                    const rest = { ...all };
                    delete rest[app.id];
                    return rest;
                  })
                }
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type AppCardProps = {
  app: StoreApp;
  status?: StoreAppStatus;
  job?: StoreJob;
  confirming: boolean;
  onAction: (action: StoreAction) => void;
  onAskRemove: () => void;
  onCancelRemove: () => void;
  onDismissJob: () => void;
};

const buttonClass =
  "rounded-full px-3.5 py-1 text-[12px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-50";
const primaryClass = `${buttonClass} bg-sky-500 text-white enabled:hover:bg-sky-600`;
const secondaryClass = `${buttonClass} bg-black/8 text-[inherit] enabled:hover:bg-black/12 dark:bg-white/10 dark:enabled:hover:bg-white/15`;
const dangerClass = `${buttonClass} bg-red-600 text-white enabled:hover:bg-red-700`;

function AppCard({
  app,
  status,
  job,
  confirming,
  onAction,
  onAskRemove,
  onCancelRemove,
  onDismissJob,
}: AppCardProps) {
  const Icon = app.icon;
  const running = job?.state === "running";
  const actions = status?.actions ?? [];

  return (
    <li className="sui-card flex flex-col rounded-[14px] p-4">
      <div className="flex items-start gap-3.5">
        <div
          className={`grid size-12 shrink-0 place-items-center rounded-[11px] bg-gradient-to-br text-white shadow-sm ${app.tint}`}
        >
          <Icon className="size-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold sui-title">{app.name}</h4>
          {status?.installed ? (
            <p className="mt-0.5 inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="size-3" aria-hidden />
              Installed{status.version ? ` ${formatVersion(status.version)}` : ""}
            </p>
          ) : null}
          <p className="mt-1 text-[12.5px] leading-5 sui-muted">{app.tagline}</p>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-3">
        <p className="min-w-0 text-[11px] sui-muted">{app.footprint}</p>
        {running && job ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium sui-muted">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {RUNNING_LABEL[job.action]}
          </span>
        ) : confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] sui-muted">Remove {app.name}?</span>
            <button type="button" className={secondaryClass} onClick={onCancelRemove}>
              Cancel
            </button>
            <button type="button" className={dangerClass} onClick={() => onAction("remove")}>
              Remove
            </button>
          </div>
        ) : actions.length === 0 ? null : (
          <div className="flex gap-1.5">
            {actions.includes("install") ? (
              <button type="button" className={primaryClass} onClick={() => onAction("install")}>
                Get
              </button>
            ) : null}
            {actions.includes("update") ? (
              <button type="button" className={secondaryClass} onClick={() => onAction("update")}>
                Update
              </button>
            ) : null}
            {actions.includes("remove") ? (
              <button type="button" className={secondaryClass} onClick={onAskRemove}>
                Remove
              </button>
            ) : null}
          </div>
        )}
      </div>
      {job ? <JobPanel job={job} onDismiss={onDismissJob} /> : null}
    </li>
  );
}

function JobPanel({ job, onDismiss }: { job: StoreJob; onDismiss: () => void }) {
  const failed = job.state === "failed";
  const done = job.state === "done";
  const tail = job.log.slice(-LOG_LINES_SHOWN);
  const title = failed
    ? job.error || "Something went wrong"
    : done
      ? DONE_LABEL[job.action]
      : RUNNING_LABEL[job.action];
  const tone = failed
    ? "text-red-600 dark:text-red-400"
    : done
      ? "text-emerald-600 dark:text-emerald-400"
      : "";

  return (
    <div
      className="mt-3 rounded-lg bg-black/5 px-3 py-2 text-[11.5px] dark:bg-black/25"
      role={failed ? "alert" : "status"}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={`font-medium ${tone}`}>{title}</p>
        {job.state !== "running" ? (
          <button
            type="button"
            aria-label="Dismiss"
            className="rounded p-0.5 opacity-60 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-sky-400"
            onClick={onDismiss}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      {tail.length > 0 ? (
        <pre className="mt-1.5 max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-4 sui-muted">
          {tail.join("\n")}
        </pre>
      ) : null}
    </div>
  );
}
