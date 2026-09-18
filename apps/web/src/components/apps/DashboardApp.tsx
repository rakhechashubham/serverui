"use client";

import { useServer } from "@/src/lib/api/server-context";
import { useSelectedServer } from "@/src/lib/session";

function formatUptime(seconds: number) {
  if (!seconds) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function statusCopy(status: string | undefined, error: string | null, name: string) {
  if (status === "online") return "Connected over SSH.";
  if (status === "connecting") return `Connecting to ${name}…`;
  if (status === "authentication_failed")
    return "Authentication failed. Edit the server and retry.";
  return error || "Unable to connect to server.";
}

export function DashboardApp() {
  const selected = useSelectedServer();
  const { server, loading, error, refresh, lastUpdatedAt } = useServer();
  const online = server?.status === "online";
  const name = selected?.name || server?.name || "Server";
  const host = selected?.address || server?.host;
  const hostname = selected?.hostname || server?.hostname;
  const username = selected?.username || server?.username;
  const lastUpdated = lastUpdatedAt
    ? formatClock(lastUpdatedAt)
    : server?.lastSeen
      ? formatLastSeen(server.lastSeen)
      : null;

  return (
    <div className="h-full overflow-auto sui-app p-6">
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] sui-muted">ServerUI</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h3 className="text-2xl font-semibold tracking-tight sui-title">{name}</h3>
        <span
          className={`size-2 rounded-full ${
            online ? "bg-emerald-500" : loading ? "bg-amber-400" : "bg-red-500"
          }`}
          aria-hidden
        />
        <span className="text-sm sui-muted">
          {online ? "Online" : loading && !server ? "Connecting" : "Offline"}
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          className="ml-auto rounded-md border border-black/10 bg-black/[0.03] px-2.5 py-1 text-[12px] sui-title hover:bg-black/[0.06]"
        >
          Refresh
        </button>
      </div>
      <p className="mt-2 text-sm sui-muted">
        {loading && !server ? "Loading live metrics…" : statusCopy(server?.status, error, name)}
      </p>
      {username && host ? (
        <p className="mt-1 text-xs sui-muted">
          {username}@{host}
          {hostname ? ` · ${hostname}` : ""}
        </p>
      ) : null}
      <p className="mt-1 text-xs sui-muted">
        {loading && !server
          ? "Last updated: —"
          : lastUpdated
            ? `Last updated: ${lastUpdated}`
            : online
              ? "Last updated: just now"
              : "Metrics unavailable"}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <MetricCard
          label="CPU"
          value={online ? `${Math.round(server?.cpuUsage || 0)}%` : "—"}
          loading={loading && !server}
          unavailable={!online && !loading}
        />
        <MetricCard
          label="RAM"
          value={online ? `${Math.round(server?.memoryUsage || 0)}%` : "—"}
          loading={loading && !server}
          unavailable={!online && !loading}
        />
        <MetricCard
          label="Disk"
          value={online ? `${Math.round(server?.diskUsage || 0)}%` : "—"}
          loading={loading && !server}
          unavailable={!online && !loading}
        />
        <MetricCard
          label="Uptime"
          value={online ? formatUptime(server?.uptimeSeconds || 0) : "—"}
          loading={loading && !server}
          unavailable={!online && !loading}
        />
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  loading,
  unavailable,
}: {
  label: string;
  value: string;
  loading: boolean;
  unavailable?: boolean;
}) {
  return (
    <div className="sui-card rounded-xl px-4 py-3 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] sui-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums sui-title">{loading ? "…" : value}</p>
      {unavailable && !loading ? <p className="mt-1 text-[11px] sui-muted">Unavailable</p> : null}
    </div>
  );
}

function formatLastSeen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatClock(ms: number) {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
