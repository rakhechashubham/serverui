"use client";

import type { Server } from "@/src/lib/servers";
import type { ServerInfo } from "@/src/lib/api/server";
import { ServerStatus } from "@/src/components/server-selection/ServerStatus";

export function ServerCard({
  server,
  health,
  testing,
  testMessage,
  onConnect,
  onTest,
  onEdit,
  onDelete,
  selected = false,
  onSelectToggle,
}: {
  server: Server;
  health?: { metrics: ServerInfo; checkedAt: Date };
  testing?: boolean;
  testMessage?: string | null;
  onConnect: () => void;
  onTest: () => void;
  onEdit: () => void;
  onDelete: () => void;
  selected?: boolean;
  onSelectToggle?: () => void;
}) {
  return (
    <div className="sui-card animate-card-in rounded-[22px] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
      <div className="relative flex min-h-[118px] flex-col items-start text-left">
        {onSelectToggle ? (
          <input
            type="checkbox"
            aria-label={`Select ${server.name} for group action`}
            checked={selected}
            onChange={onSelectToggle}
            className="absolute left-0 top-0 size-4 accent-sky-400"
          />
        ) : null}
        <span
          className={`absolute right-0 top-0 size-2 rounded-full ${
            server.status === "online"
              ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.85)]"
              : server.status === "connecting"
                ? "bg-amber-300"
                : server.status === "authentication_failed"
                  ? "bg-red-400"
                  : "bg-zinc-400"
          }`}
          aria-hidden
        />
        <p
          className={`pr-6 text-[17px] font-semibold tracking-tight text-white ${onSelectToggle ? "pl-6" : ""}`}
        >
          {server.name}
        </p>
        {server.groupName ? (
          <span className="mt-2 rounded-full border border-white/12 bg-white/6 px-2.5 py-1 text-[10px] font-medium text-white/65">
            {server.groupName}
          </span>
        ) : null}
        {server.hostname && server.hostname !== server.name ? (
          <p className="mt-3 font-mono text-[12px] text-white/58">{server.hostname}</p>
        ) : null}
        <p
          className={`${server.hostname && server.hostname !== server.name ? "mt-1" : "mt-3"} font-mono text-[12px] text-white/58`}
        >
          {server.username ? `${server.username}@${server.address}` : server.address}
          {server.sshPort && server.sshPort !== 22 ? `:${server.sshPort}` : ""}
        </p>
        <div className="mt-auto pt-5">
          <ServerStatus status={server.status} />
        </div>
        <p
          className={`mt-1 text-[10px] ${server.hostKeyFingerprint ? "text-emerald-200/65" : "text-amber-200/75"}`}
        >
          {server.hostKeyFingerprint ? "SSH host key verified" : "SSH host key needs verification"}
        </p>
      </div>

      {health ? (
        <div
          className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-white/10 pt-3 text-[11px]"
          aria-label={`Latest resource snapshot for ${server.name}`}
        >
          <ResourceValue label="Uptime" value={formatUptime(health.metrics.uptimeSeconds)} />
          <ResourceValue label="CPU" value={`${Math.round(health.metrics.cpuUsage || 0)}%`} />
          <ResourceValue
            label="Memory"
            value={`${Math.round(health.metrics.memoryUsage || 0)}%${health.metrics.memoryTotalBytes ? ` · ${formatBytes(health.metrics.memoryUsedBytes || 0)} / ${formatBytes(health.metrics.memoryTotalBytes)}` : ""}`}
          />
          <ResourceValue
            label="Disk"
            value={`${Math.round(health.metrics.diskUsage || 0)}%${health.metrics.diskTotalBytes ? ` · ${formatBytes(health.metrics.diskUsedBytes || 0)} / ${formatBytes(health.metrics.diskTotalBytes)}` : ""}`}
          />
          <span className="col-span-2 text-white/35">
            Snapshot{" "}
            {health.checkedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      ) : null}

      {testMessage ? (
        <p className="mt-3 break-all text-[12px] text-white/70" role="status">
          {testMessage}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onConnect}
          disabled={!server.hostKeyFingerprint}
          title={
            server.hostKeyFingerprint
              ? undefined
              : "Verify the SSH host fingerprint before connecting"
          }
          className="rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-zinc-900 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/45 disabled:hover:bg-white/20"
        >
          Connect
        </button>
        <button
          type="button"
          onClick={onTest}
          disabled={testing}
          className="rounded-full bg-white/12 px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-white/18 disabled:opacity-60"
        >
          {testing ? "Testing…" : "Test Connection"}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-full px-3 py-1.5 text-[12px] font-medium text-white/78 transition hover:bg-white/10 hover:text-white"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-full px-3 py-1.5 text-[12px] font-medium text-red-300/90 transition hover:bg-red-400/10 hover:text-red-200"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function ResourceValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="text-white/40">{label}</span>
      <p className="truncate font-medium tabular-nums text-white/78" title={value}>
        {value}
      </p>
    </div>
  );
}

function formatUptime(seconds = 0) {
  if (!seconds) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unit = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** unit).toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
