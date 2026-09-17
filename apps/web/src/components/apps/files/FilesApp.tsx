"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ChevronLeft, ChevronRight, Home, Search } from "lucide-react";
import { ApiError } from "@/src/lib/api/client";
import {
  createDirectory,
  createFile,
  deleteFile,
  downloadUrl,
  joinPath,
  listFiles,
  parentPath,
  renameFile,
  uploadFile,
  type FileEntry,
} from "@/src/lib/api/files";
import { useWindowManager } from "@/src/components/window/window-context";
import { useServer } from "@/src/lib/api/server-context";
import { useSelectedServer } from "@/src/lib/session";
import { formatSize, totalSize } from "@/src/lib/files/format";
import { Breadcrumbs } from "@/src/components/apps/files/Breadcrumbs";
import { FileContextMenu } from "@/src/components/apps/files/FileContextMenu";
import { FileList } from "@/src/components/apps/files/FileList";
import { FileToolbar, toolbarClass } from "@/src/components/apps/files/FileToolbar";

type Dialog =
  | { type: "file"; value: string }
  | { type: "dir"; value: string }
  | { type: "rename"; value: string; from: string };

type MenuState = {
  x: number;
  y: number;
  entry: FileEntry | null;
};

export function FilesApp() {
  const { openWindow } = useWindowManager();
  const { server } = useServer();
  const selectedServer = useSelectedServer();
  const [path, setPath] = useState("/");
  const [history, setHistory] = useState<string[]>(["/"]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const serverId = selectedServer?.id || "";
  const homePath =
    selectedServer?.username || server?.username
      ? `/home/${selectedServer?.username || server?.username}`
      : "/home";

  async function load(nextPath: string) {
    if (!serverId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listFiles(serverId, nextPath);
      const sorted = [...result.entries].sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setEntries(sorted);
      setPath(result.path || nextPath);
    } catch (err) {
      setEntries([]);
      setError(err instanceof ApiError ? err.message : "unable to list files");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!serverId) return;
    let cancelled = false;
    listFiles(serverId, "/")
      .then((result) => {
        if (cancelled) return;
        const sorted = [...result.entries].sort((a, b) => {
          if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setEntries(sorted);
        setPath(result.path || "/");
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setEntries([]);
        setError(err instanceof ApiError ? err.message : "unable to list files");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  function goTo(next: string) {
    const normalized = next.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    const nextHistory = [...history.slice(0, historyIndex + 1), normalized];
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
    setSelected(null);
    setQuery("");
    setPath(normalized);
    setMenu(null);
    void load(normalized);
  }

  function back() {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setSelected(null);
    setPath(history[nextIndex]);
    void load(history[nextIndex]);
  }

  function forward() {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    setSelected(null);
    setPath(history[nextIndex]);
    void load(history[nextIndex]);
  }

  function openEntry(entry: FileEntry) {
    if (entry.type === "dir") {
      goTo(entry.path);
      return;
    }
    openWindow("viewer", {
      filePath: entry.path,
      fileName: entry.name,
      fileSize: entry.size,
      modified: entry.modified,
      mime: entry.mime,
    });
  }

  function openSelected() {
    const entry = selectedEntry;
    if (!entry) return;
    openEntry(entry);
  }

  const selectedEntry = entries.find((entry) => entry.path === selected) || null;
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) => entry.name.toLowerCase().includes(needle));
  }, [entries, query]);

  async function submitDialog() {
    if (!dialog || !dialog.value.trim()) return;
    const name = dialog.value.trim();
    try {
      if (dialog.type === "file") {
        await createFile(serverId, joinPath(path, name));
      } else if (dialog.type === "dir") {
        await createDirectory(serverId, joinPath(path, name));
      } else if (dialog.type === "rename") {
        await renameFile(serverId, dialog.from, joinPath(parentPath(dialog.from), name));
      }
      setDialog(null);
      await load(path);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "filesystem operation failed");
    }
  }

  async function onDelete() {
    if (!selectedEntry) return;
    try {
      await deleteFile(serverId, selectedEntry.path);
      setSelected(null);
      await load(path);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "filesystem operation failed");
    }
  }

  async function onUpload(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    try {
      await uploadFile(serverId, path, file);
      await load(path);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "upload failed");
    }
  }

  function openContextMenu(event: MouseEvent, entry: FileEntry | null) {
    event.preventDefault();
    event.stopPropagation();
    if (entry) setSelected(entry.path);
    const width = 210;
    const height = 180;
    setMenu({
      x: Math.min(event.clientX, window.innerWidth - width - 8),
      y: Math.min(event.clientY, window.innerHeight - height - 8),
      entry,
    });
  }

  function copyPath(value: string) {
    void navigator.clipboard.writeText(value);
  }

  function openInfo(entry: FileEntry | null) {
    const target = entry;
    if (!target) return;
    openWindow("viewer", {
      filePath: target.path,
      fileName: target.name,
      fileSize: target.size,
      modified: target.modified,
      mime: target.mime,
      isDirectory: target.type === "dir",
      infoOnly: true,
    });
  }

  function openTerminalHere(entry: FileEntry | null) {
    const cwd = entry?.type === "dir" ? entry.path : path;
    openWindow("terminal", { cwd });
  }

  const places = [
    { label: "Root", path: "/" },
    { label: "Home", path: homePath },
    { label: "tmp", path: "/tmp" },
    { label: "etc", path: "/etc" },
    { label: "var", path: "/var" },
  ];

  return (
    <div
      className="flex h-full min-h-0 overflow-hidden sui-app"
      onClick={() => setMenu(null)}
      onKeyDown={(event) => {
        if (event.key === "Enter") openSelected();
      }}
    >
      <aside className="flex w-[188px] shrink-0 flex-col overflow-y-auto bg-[#6d7278] px-3 py-4 text-[12px] text-white/90">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
          Favorites
        </p>
        {places.map((place) => (
          <button
            key={place.path}
            type="button"
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70 ${
              path === place.path ? "bg-white/15" : ""
            }`}
            onClick={() => goTo(place.path)}
          >
            <Home aria-hidden className="size-3.5 opacity-80" />
            {place.label}
          </button>
        ))}
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col sui-app">
        <div className="flex items-center gap-2 border-b sui-hairline px-3 py-2">
          <button
            type="button"
            aria-label="Back"
            className="sui-hover rounded-md p-1 sui-muted outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-30"
            onClick={back}
            disabled={historyIndex <= 0}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Forward"
            className="sui-hover rounded-md p-1 sui-muted outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-30"
            onClick={forward}
            disabled={historyIndex >= history.length - 1}
          >
            <ChevronRight aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Home"
            className="sui-hover rounded-md p-1 sui-muted outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            onClick={() => goTo(homePath)}
          >
            <Home aria-hidden className="size-4" />
          </button>
          <Breadcrumbs path={path} onNavigate={goTo} />
          <label className="relative shrink-0">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2 top-1.5 size-3.5 sui-muted"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              className="sui-input w-36 rounded-md py-1 pl-7 pr-2 text-[12px] outline-none focus:ring-2 focus:ring-sky-400"
            />
          </label>
        </div>
        <FileToolbar
          selected={selectedEntry}
          onOpen={openSelected}
          onDownload={() => {
            if (selectedEntry?.type === "file") {
              window.location.href = downloadUrl(serverId, selectedEntry.path);
            }
          }}
          onUploadClick={() => uploadRef.current?.click()}
          onRename={() =>
            selectedEntry &&
            setDialog({ type: "rename", value: selectedEntry.name, from: selectedEntry.path })
          }
          onDelete={() => void onDelete()}
        />
        <input
          ref={uploadRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            void onUpload(event.target.files);
            event.target.value = "";
          }}
        />
        <div className="flex flex-wrap items-center gap-2 border-b sui-hairline px-3 py-2 text-[12px]">
          <button
            type="button"
            className={toolbarClass}
            onClick={() => setDialog({ type: "file", value: "" })}
          >
            New file
          </button>
          <button
            type="button"
            className={toolbarClass}
            onClick={() => setDialog({ type: "dir", value: "" })}
          >
            New folder
          </button>
        </div>
        {dialog ? (
          <form
            className="flex items-center gap-2 border-b sui-hairline px-3 py-2 text-[12px]"
            onSubmit={(event) => {
              event.preventDefault();
              void submitDialog();
            }}
          >
            <label className="text-neutral-500">
              {dialog.type === "dir"
                ? "Folder name"
                : dialog.type === "file"
                  ? "File name"
                  : "Rename"}
            </label>
            <input
              autoFocus
              className="sui-input min-w-0 flex-1 rounded-md px-2 py-1 outline-none focus:ring-2 focus:ring-sky-400"
              value={dialog.value}
              onChange={(event) => setDialog({ ...dialog, value: event.target.value })}
            />
            <button type="submit" className={toolbarClass}>
              {dialog.type === "rename" ? "Rename" : "Create"}
            </button>
            <button type="button" className={toolbarClass} onClick={() => setDialog(null)}>
              Cancel
            </button>
          </form>
        ) : null}
        {error ? (
          <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-[12px] text-red-700">
            {error}
          </p>
        ) : null}
        {loading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-neutral-400">
            Loading files…
          </div>
        ) : visible.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-neutral-400">
            This folder is empty
          </div>
        ) : (
          <FileList
            path={path}
            entries={visible}
            selected={selected}
            onSelect={setSelected}
            onOpen={openEntry}
            onParent={() => path !== "/" && goTo(parentPath(path))}
            onContextMenu={openContextMenu}
          />
        )}
        <div className="flex shrink-0 items-center justify-between border-t sui-hairline px-4 py-1.5 text-[11px] sui-muted">
          <span>
            {visible.length} {visible.length === 1 ? "item" : "items"}
          </span>
          <span>{formatSize(totalSize(visible))}</span>
        </div>
      </div>
      {menu ? (
        <FileContextMenu
          x={menu.x}
          y={menu.y}
          entry={menu.entry}
          onOpen={() => {
            if (menu.entry) openEntry(menu.entry);
            else goTo(path);
          }}
          onDownload={() => {
            if (menu.entry?.type === "file") {
              window.location.href = downloadUrl(serverId, menu.entry.path);
            }
          }}
          onCopyPath={() => copyPath(menu.entry?.path || path)}
          onInfo={() => openInfo(menu.entry)}
          onTerminalHere={() => openTerminalHere(menu.entry)}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  );
}
