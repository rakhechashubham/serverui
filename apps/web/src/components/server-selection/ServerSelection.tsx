"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { AddServerModal } from "@/src/components/server-selection/AddServerModal";
import { ServerCard } from "@/src/components/server-selection/ServerCard";
import type { NewServerInput, Server } from "@/src/lib/servers";
import { formatConnectionTestMessage, friendlyError } from "@/src/lib/errors";
import { formatApiError, useSession } from "@/src/lib/session";

export function ServerSelection() {
  const {
    servers,
    selectServer,
    addServer,
    updateServer,
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
  const [testingId, setTestingId] = useState<string | null>(null);
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
      const mapped = friendlyError(err, "Unable to add server.");
      setFormError(`${mapped.title}. ${mapped.detail}`);
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
      setEditing(null);
    } catch (err) {
      const mapped = friendlyError(err, "Unable to update server.");
      setFormError(`${mapped.title}. ${mapped.detail}`);
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
    setTestingId(id);
    setTestMessage((current) => ({ ...current, [id]: "Connecting…" }));
    try {
      const result = await testConnection(id);
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
      setTestingId(null);
    }
  }

  const empty = !loadingServers && !serversError && servers.length === 0;

  return (
    <div className="relative h-dvh w-full overflow-auto bg-[#0d1117] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-40"
        style={{ backgroundImage: "url('/wallpaper.jpg?v=luffy')" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.14),transparent_42%),linear-gradient(to_bottom,rgba(8,10,14,0.55),rgba(8,10,14,0.88))]"
      />

      <main className="relative mx-auto flex min-h-dvh w-full max-w-[920px] flex-col justify-center px-6 py-10 sm:px-10">
        <header className="max-w-xl">
          <p className="text-[12px] font-medium uppercase tracking-[0.28em] text-white/48">
            ServerUI
          </p>
          <h1 className="mt-2 text-[32px] font-semibold tracking-tight text-white">
            {empty ? "Welcome to ServerUI" : "Your Servers"}
          </h1>
          <p className="mt-2 text-[15px] leading-6 text-white/62">
            {empty
              ? "Add your first Linux server over SSH. Manage files, a terminal, and live metrics from a desktop-style control panel."
              : "Select a machine to open its desktop. Switch servers anytime from the top bar."}
          </p>
        </header>

        <section
          aria-label="Available servers"
          className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          {loadingServers && servers.length === 0 ? (
            <div className="min-h-[154px] rounded-[22px] border border-white/10 bg-white/[0.06] p-5 text-[13px] text-white/55">
              Loading servers…
            </div>
          ) : null}

          {serversError && servers.length === 0 ? (
            <div className="min-h-[154px] rounded-[22px] border border-white/10 bg-white/[0.06] p-5">
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
              className="flex min-h-[154px] flex-col items-center justify-center gap-3 rounded-[22px] border border-dashed border-white/18 bg-white/[0.03] text-white/70 outline-none transition hover:border-white/30 hover:bg-white/[0.06] hover:text-white focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/25 sm:col-span-2"
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

          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              testing={testingId === server.id}
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
            />
          ))}

          {!empty ? (
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setAdding(true);
              }}
              className="flex min-h-[154px] flex-col items-center justify-center gap-3 rounded-[22px] border border-dashed border-white/18 bg-white/[0.03] text-white/70 outline-none transition hover:border-white/30 hover:bg-white/[0.06] hover:text-white focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/25"
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
        className="w-full max-w-[400px] rounded-[22px] border border-white/12 bg-[#16181d]/92 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.5)] backdrop-blur-2xl animate-modal-in"
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
