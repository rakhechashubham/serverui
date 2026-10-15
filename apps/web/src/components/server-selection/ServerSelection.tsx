"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";
import { BrandMark } from "@/src/components/brand/BrandMark";
import { AddServerModal } from "@/src/components/server-selection/AddServerModal";
import { ServerCard } from "@/src/components/server-selection/ServerCard";
import type { NewServerInput, Server } from "@/src/lib/servers";
import { ApiError } from "@/src/lib/api/client";
import { formatConnectionTestMessage, formatFriendly, friendlyError } from "@/src/lib/errors";
import { getServerMetrics, type ServerInfo } from "@/src/lib/api/server";
import { formatApiError, useSession } from "@/src/lib/session";
import { WallpaperBackdrop } from "@/src/lib/wallpaper";

export function ServerSelection() {
  const {
    servers,
    selectServer,
    addServer,
    updateServer,
    assignServerGroup,
    deleteServer,
    testConnection,
    loadingServers,
    serversError,
    refreshServers,
  } = useSession();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Server | null>(null);
  const [deleting, setDeleting] = useState<Server | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [testingIds, setTestingIds] = useState<Set<string>>(() => new Set());
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [selectedServerIds, setSelectedServerIds] = useState<Set<string>>(() => new Set());
  const [groupDestination, setGroupDestination] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [resourceChecks, setResourceChecks] = useState<
    Record<string, { metrics: ServerInfo; checkedAt: Date }>
  >({});
  const [testMessage, setTestMessage] = useState<Record<string, string>>({});
  const didRefresh = useRef(false);

  useEffect(() => {
    if (didRefresh.current || loadingServers) return;
    didRefresh.current = true;
    const id = window.setTimeout(() => {
      void refreshServers();
    }, 1600);
    return () => window.clearTimeout(id);
  }, [loadingServers, refreshServers]);

  async function onAdd(input: NewServerInput, options?: { connect?: boolean }) {
    setFormBusy(true);
    setFormError(null);
    try {
      const created = await addServer(input);
      setAdding(false);
      if (options?.connect) {
        selectServer(created);
      }
    } catch (err) {
      setFormError(formatFriendly(friendlyError(err, "Unable to add server.")));
    } finally {
      setFormBusy(false);
    }
  }

  async function onEdit(input: NewServerInput) {
    if (!editing) return;
    setFormBusy(true);
    setFormError(null);
    try {
      await updateServer(editing.id, input);
      setTestMessage((current) => {
        const next = { ...current };
        delete next[editing.id];
        return next;
      });
      setEditing(null);
    } catch (err) {
      setFormError(
        err instanceof ApiError && err.status === 404
          ? "This server no longer exists. Close this form and refresh the list."
          : formatFriendly(friendlyError(err, "Unable to update server.")),
      );
    } finally {
      setFormBusy(false);
    }
  }

  async function onDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteServer(deleting.id);
      setDeleting(null);
    } catch (err) {
      setDeleteError(formatApiError(err, "Unable to delete server."));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function onTest(id: string) {
    setTestingIds((current) => new Set(current).add(id));
    setTestMessage((current) => ({ ...current, [id]: "Connecting…" }));
    try {
      const result = await testConnection(id);
      if (result.code === "host_key_unverified" || result.code === "host_key_changed") {
        const warning =
          result.code === "host_key_changed" ? "Host key changed." : "Host key is not trusted yet.";
        setTestMessage((current) => ({
          ...current,
          [id]: `${warning} Fingerprint: ${result.hostKeyFingerprint || "unavailable"}. Edit this server to verify and trust it.`,
        }));
        return;
      }
      if (result.ok) {
        try {
          const metrics = await getServerMetrics(id);
          if (metrics.error) throw new Error(metrics.error);
          setResourceChecks((current) => ({
            ...current,
            [id]: { metrics, checkedAt: new Date() },
          }));
        } catch {
          setTestMessage((current) => ({
            ...current,
            [id]: `${formatConnectionTestMessage(true, result.latencyMs)} Resource snapshot unavailable.`,
          }));
          return;
        }
      }
      setTestMessage((current) => ({
        ...current,
        [id]: formatConnectionTestMessage(result.ok, result.latencyMs, result.error),
      }));
    } catch (err) {
      setTestMessage((current) => ({
        ...current,
        [id]: formatConnectionTestMessage(
          false,
          undefined,
          formatApiError(err, "Connection failed"),
        ),
      }));
    } finally {
      setTestingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  async function onTestAll() {
    if (refreshingAll || servers.length === 0) return;
    setRefreshingAll(true);
    const queue = [...servers];
    const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (queue.length > 0) {
        const server = queue.shift();
        if (server) await onTest(server.id);
      }
    });
    await Promise.all(workers);
    setLastCheckedAt(new Date());
    setRefreshingAll(false);
  }

  function toggleServerSelection(serverId: string) {
    setSelectedServerIds((current) => {
      const next = new Set(current);
      if (next.has(serverId)) next.delete(serverId);
      else next.add(serverId);
      return next;
    });
  }

  function toggleVisibleSelection() {
    setSelectedServerIds((current) => {
      const next = new Set(current);
      const allSelected =
        visibleServers.length > 0 && visibleServers.every((server) => next.has(server.id));
      for (const server of visibleServers) {
        if (allSelected) next.delete(server.id);
        else next.add(server.id);
      }
      return next;
    });
  }

  async function applyGroupToSelection() {
    const groupName =
      newGroupName.trim() || (groupDestination === "__ungrouped__" ? "" : groupDestination);
    if (!groupName && groupDestination !== "__ungrouped__") return;
    setGroupBusy(true);
    setGroupError(null);
    try {
      await assignServerGroup([...selectedServerIds], groupName);
      setSelectedServerIds(new Set());
      setGroupDestination("");
      setNewGroupName("");
    } catch (err) {
      setGroupError(formatApiError(err, "Unable to assign group."));
    } finally {
      setGroupBusy(false);
    }
  }

  const statusCounts = useMemo(
    () =>
      servers.reduce<Record<string, number>>((counts, server) => {
        counts[server.status] = (counts[server.status] ?? 0) + 1;
        return counts;
      }, {}),
    [servers],
  );
  const groupOptions = useMemo(
    () =>
      [
        ...new Set(
          servers
            .map((server) => server.groupName?.trim())
            .filter((group): group is string => Boolean(group)),
        ),
      ].sort(),
    [servers],
  );
  const visibleServers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return servers.filter((server) => {
      const matchesSearch =
        !term ||
        [server.name, server.hostname, server.address, server.username].some((value) =>
          value?.toLocaleLowerCase().includes(term),
        );
      const matchesGroup =
        groupFilter === "all" || (server.groupName?.trim() || "") === groupFilter;
      return (
        matchesSearch && matchesGroup && (statusFilter === "all" || server.status === statusFilter)
      );
    });
  }, [servers, search, statusFilter, groupFilter]);
  const visibleGroups = useMemo(() => {
    const groups = new Map<string, Server[]>();
    for (const server of visibleServers) {
      const name = server.groupName?.trim() || "";
      groups.set(name, [...(groups.get(name) || []), server]);
    }
    return [...groups.entries()].sort(([a], [b]) =>
      a === "" ? 1 : b === "" ? -1 : a.localeCompare(b),
    );
  }, [visibleServers]);

  const empty = !loadingServers && !serversError && servers.length === 0;

  return (
    <div className="relative h-dvh w-full overflow-auto text-white">
      <WallpaperBackdrop
        className="pointer-events-none fixed inset-0 bg-cover bg-center"
        opacity={0.4}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.14),transparent_42%),linear-gradient(to_bottom,rgba(8,10,14,0.55),rgba(8,10,14,0.88))]"
      />

      <main className="relative mx-auto flex min-h-dvh w-full max-w-[1600px] flex-col justify-center px-6 py-10 sm:px-10">
        <header className="max-w-xl">
          <BrandMark
            size={40}
            withWordmark
            className="text-white"
            wordmarkClassName="text-[12px] font-medium uppercase tracking-[0.28em] text-white/48"
          />
          <h1 className="mt-3 text-[32px] font-semibold tracking-tight text-white">
            {empty ? "Welcome to ServerUI" : "Your Servers"}
          </h1>
          <p className="mt-2 text-[15px] leading-6 text-white/62">
            {empty
              ? "Add your first Linux server over SSH. Manage files, a terminal, and live metrics from a desktop-style control panel."
              : "Select a machine to open its desktop. Switch servers anytime from the top bar."}
          </p>
        </header>

        {!empty && !loadingServers && servers.length > 0 ? (
          <section aria-label="Server monitoring overview" className="mt-6">
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-white/75">
                {servers.length} total
              </span>
              <span className="rounded-full bg-emerald-400/12 px-3 py-1.5 text-emerald-200">
                {statusCounts.online ?? 0} online
              </span>
              <span className="rounded-full bg-red-400/12 px-3 py-1.5 text-red-200">
                {(statusCounts.offline ?? 0) +
                  (statusCounts.error ?? 0) +
                  (statusCounts.authentication_failed ?? 0)}{" "}
                needs attention
              </span>
              {lastCheckedAt ? (
                <span className="text-white/45" aria-live="polite">
                  Checked{" "}
                  {lastCheckedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              ) : null}
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <label className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40"
                  aria-hidden
                />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Find server by name, host, or user"
                  aria-label="Find server by name, host, or user"
                  className="h-10 w-full rounded-full border border-white/10 bg-black/20 pl-9 pr-4 text-[13px] text-white outline-none placeholder:text-white/38 focus:border-white/25"
                />
              </label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                aria-label="Filter servers by status"
                className="h-10 rounded-full border border-white/10 bg-zinc-900 px-4 text-[13px] text-white outline-none focus:border-white/25"
              >
                <option value="all">All statuses</option>
                <option value="online">Online ({statusCounts.online ?? 0})</option>
                <option value="offline">Offline ({statusCounts.offline ?? 0})</option>
                <option value="error">Error ({statusCounts.error ?? 0})</option>
                <option value="authentication_failed">
                  Auth failed ({statusCounts.authentication_failed ?? 0})
                </option>
                <option value="unknown">Unknown ({statusCounts.unknown ?? 0})</option>
              </select>
              <select
                value={groupFilter}
                onChange={(event) => setGroupFilter(event.target.value)}
                aria-label="Filter servers by group"
                className="h-10 rounded-full border border-white/10 bg-zinc-900 px-4 text-[13px] text-white outline-none focus:border-white/25"
              >
                <option value="all">All groups</option>
                {groupOptions.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
                <option value="">Ungrouped</option>
              </select>
              <button
                type="button"
                onClick={() => void onTestAll()}
                disabled={refreshingAll || testingIds.size > 0}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-white px-4 text-[13px] font-semibold text-zinc-900 transition hover:bg-white/90 disabled:opacity-55"
              >
                <RefreshCw
                  className={`size-4 ${refreshingAll ? "animate-spin" : ""}`}
                  aria-hidden
                />
                {refreshingAll ? "Checking servers…" : "Check all"}
              </button>
            </div>
            {selectedServerIds.size > 0 ? (
              <div
                className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/20 p-3 text-[12px]"
                aria-label="Bulk group action"
              >
                <span className="mr-auto font-medium text-white/80">
                  {selectedServerIds.size} selected
                </span>
                <button
                  type="button"
                  onClick={toggleVisibleSelection}
                  className="rounded-full bg-white/10 px-3 py-2 text-white/75 hover:bg-white/15"
                >
                  {visibleServers.length > 0 &&
                  visibleServers.every((server) => selectedServerIds.has(server.id))
                    ? "Deselect visible"
                    : "Select visible"}
                </button>
                <select
                  value={groupDestination}
                  onChange={(event) => setGroupDestination(event.target.value)}
                  aria-label="Add selected servers to existing group"
                  className="h-9 rounded-full border border-white/10 bg-zinc-900 px-3 text-white outline-none"
                  disabled={groupBusy}
                >
                  <option value="">Choose existing group…</option>
                  {groupOptions.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                  <option value="__ungrouped__">Ungroup selected</option>
                </select>
                <input
                  value={newGroupName}
                  onChange={(event) => setNewGroupName(event.target.value)}
                  aria-label="Create group for selected servers"
                  placeholder="Or create a group…"
                  maxLength={48}
                  className="h-9 min-w-40 rounded-full border border-white/10 bg-black/20 px-3 text-white outline-none placeholder:text-white/35"
                  disabled={groupBusy}
                />
                <button
                  type="button"
                  onClick={() => void applyGroupToSelection()}
                  disabled={groupBusy || (!newGroupName.trim() && !groupDestination)}
                  className="h-9 rounded-full bg-white px-4 font-semibold text-zinc-900 disabled:opacity-45"
                >
                  {groupBusy ? "Saving…" : newGroupName.trim() ? "Create & Assign" : "Assign Group"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedServerIds(new Set())}
                  disabled={groupBusy}
                  className="h-9 rounded-full px-3 text-white/55 hover:bg-white/10"
                >
                  Clear
                </button>
                {groupError ? (
                  <p className="w-full text-red-300" role="alert">
                    {groupError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        <section aria-label="Available servers" className="mt-8 space-y-8">
          {loadingServers && servers.length === 0 ? (
            <div className="sui-card min-h-[154px] rounded-[22px] p-5 text-[13px] text-white/55">
              Loading servers…
            </div>
          ) : null}

          {serversError && servers.length === 0 ? (
            <div className="sui-card min-h-[154px] rounded-[22px] p-5">
              <p className="text-[15px] font-medium text-white">Unable to load servers.</p>
              <p className="mt-1 text-[13px] text-white/55">
                {friendlyError(serversError, "Unable to load servers.").detail}
              </p>
              <button
                type="button"
                onClick={() => void refreshServers()}
                className="mt-4 rounded-full bg-white/12 px-3 py-1.5 text-[12px] font-medium text-white"
              >
                Retry
              </button>
            </div>
          ) : null}

          {empty ? (
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setAdding(true);
              }}
              className="flex min-h-[154px] flex-col items-center justify-center gap-3 rounded-[22px] border border-dashed border-white/18 bg-white/[0.03] text-white/70 outline-none transition hover:border-white/30 hover:bg-white/[0.06] hover:text-white focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/25 sm:col-span-2 xl:col-span-3 2xl:col-span-4"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-white/10">
                <Plus className="size-5" />
              </span>
              <span className="text-[14px] font-medium">Add your first server</span>
              <span className="max-w-xs text-center text-[12px] leading-5 text-white/45">
                You’ll enter host, SSH port, username, and a password or private key.
              </span>
            </button>
          ) : null}

          {visibleGroups.map(([groupName, groupServers]) => (
            <div key={groupName || "ungrouped"} className="space-y-3">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/58">
                {groupName || "Ungrouped"}{" "}
                <span className="font-normal tracking-normal text-white/35">
                  · {groupServers.length}
                </span>
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {groupServers.map((server) => (
                  <ServerCard
                    key={server.id}
                    server={server}
                    health={resourceChecks[server.id]}
                    testing={testingIds.has(server.id)}
                    testMessage={testMessage[server.id]}
                    onConnect={() => selectServer(server)}
                    onTest={() => void onTest(server.id)}
                    onEdit={() => {
                      setFormError(null);
                      setEditing(server);
                    }}
                    onDelete={() => {
                      setDeleteError(null);
                      setDeleting(server);
                    }}
                    selected={selectedServerIds.has(server.id)}
                    onSelectToggle={() => toggleServerSelection(server.id)}
                  />
                ))}
              </div>
            </div>
          ))}

          {servers.length > 0 && visibleServers.length === 0 ? (
            <div className="sui-card rounded-[22px] p-5 text-[13px] text-white/60">
              No servers match these filters.
            </div>
          ) : null}

          {!empty ? (
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setAdding(true);
              }}
              className="flex min-h-[154px] w-full flex-col items-center justify-center gap-3 rounded-[22px] border border-dashed border-white/18 bg-white/[0.03] text-white/70 outline-none transition hover:border-white/30 hover:bg-white/[0.06] hover:text-white focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/25 sm:col-span-2 xl:col-span-3 2xl:col-span-4"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-white/10">
                <Plus className="size-5" />
              </span>
              <span className="text-[14px] font-medium">Add Server</span>
            </button>
          ) : null}
        </section>
      </main>

      {adding ? (
        <AddServerModal
          busy={formBusy}
          error={formError}
          connectAfterSave={empty || servers.length === 0}
          onClose={() => setAdding(false)}
          onSubmit={onAdd}
        />
      ) : null}

      {editing ? (
        <AddServerModal
          server={editing}
          busy={formBusy}
          error={formError}
          onClose={() => setEditing(null)}
          onSubmit={onEdit}
        />
      ) : null}

      {deleting ? (
        <DeleteServerModal
          server={deleting}
          busy={deleteBusy}
          error={deleteError}
          onClose={() => setDeleting(null)}
          onConfirm={() => void onDelete()}
        />
      ) : null}
    </div>
  );
}

function DeleteServerModal({
  server,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  server: Server;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm animate-overlay-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-server-title"
        className="sui-card w-full max-w-[400px] rounded-[22px] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.5)] animate-modal-in"
      >
        <h2 id="delete-server-title" className="text-[16px] font-semibold text-white">
          Delete “{server.name}”?
        </h2>
        <p className="mt-2 text-[13px] leading-6 text-white/62">
          This permanently removes the server configuration and encrypted credentials from ServerUI.
          The remote machine is not deleted or modified.
        </p>
        {error ? (
          <p className="mt-3 text-[12px] text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-[13px] font-medium text-white/70 hover:bg-white/8 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-full bg-red-400 px-4 py-2 text-[13px] font-semibold text-zinc-950 disabled:opacity-60"
          >
            {busy ? "Deleting…" : "Delete Server"}
          </button>
        </div>
      </div>
    </div>
  );
}
