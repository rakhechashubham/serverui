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
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FileEntry[] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingProgress, setDeletingProgress] = useState<{
    current: number;
    total: number;
    name: string;
  } | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<{
    type: "info" | "success" | "error";
    message: string;
  } | null>(null);
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
    clearSelection();
    setQuery("");
    setPath(normalized);
    setMenu(null);
    setDownloadStatus(null);
    void load(normalized);
  }

  function back() {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    clearSelection();
    setPath(history[nextIndex]);
    setDownloadStatus(null);
    void load(history[nextIndex]);
  }

  function forward() {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    clearSelection();
    setPath(history[nextIndex]);
    setDownloadStatus(null);
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

  const selectedEntries = useMemo(() => {
    return entries.filter((entry) => selectedPaths.has(entry.path));
  }, [entries, selectedPaths]);

  const singleSelectedEntry = selectedEntries.length === 1 ? selectedEntries[0] : null;
  const selectedTotalSize = useMemo(() => totalSize(selectedEntries), [selectedEntries]);

  function openSelected() {
    if (singleSelectedEntry) {
      openEntry(singleSelectedEntry);
    }
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) => entry.name.toLowerCase().includes(needle));
  }, [entries, query]);

  function selectSingle(targetPath: string) {
    setSelectedPaths(new Set([targetPath]));
    setLastSelectedPath(targetPath);
  }

  function toggleSelect(targetPath: string) {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(targetPath)) {
        next.delete(targetPath);
      } else {
        next.add(targetPath);
      }
      return next;
    });
    setLastSelectedPath(targetPath);
  }

  function selectRange(targetPath: string) {
    const targetIndex = visible.findIndex((e) => e.path === targetPath);
    if (targetIndex === -1) return;

    const lastIndex = lastSelectedPath ? visible.findIndex((e) => e.path === lastSelectedPath) : -1;

    if (lastIndex === -1) {
      setSelectedPaths(new Set([targetPath]));
      setLastSelectedPath(targetPath);
      return;
    }

    const start = Math.min(lastIndex, targetIndex);
    const end = Math.max(lastIndex, targetIndex);
    const rangePaths = visible.slice(start, end + 1).map((e) => e.path);

    setSelectedPaths((prev) => {
      const next = new Set(prev);
      for (const p of rangePaths) {
        next.add(p);
      }
      return next;
    });
    setLastSelectedPath(targetPath);
  }

  function selectAll() {
    setSelectedPaths(new Set(visible.map((e) => e.path)));
  }

  function clearSelection() {
    setSelectedPaths(new Set());
    setLastSelectedPath(null);
  }

  function handleRowSelect(targetPath: string, event: MouseEvent) {
    if (event.shiftKey) {
      selectRange(targetPath);
    } else if (event.ctrlKey || event.metaKey) {
      toggleSelect(targetPath);
    } else {
      selectSingle(targetPath);
    }
  }

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

  async function onDelete(items: FileEntry[]) {
    if (!items || items.length === 0) return;
    setIsDeleting(true);
    setError(null);
    const errors: string[] = [];
    const successfulPaths = new Set<string>();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      setDeletingProgress({ current: i + 1, total: items.length, name: item.name });
      try {
        await deleteFile(serverId, item.path);
        successfulPaths.add(item.path);
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "operation failed";
        errors.push(`“${item.name}”: ${msg}`);
      }
    }

    setIsDeleting(false);
    setPendingDelete(null);
    setDeletingProgress(null);

    setSelectedPaths((prev) => {
      const next = new Set(prev);
      for (const p of successfulPaths) {
        next.delete(p);
      }
      return next;
    });

    if (errors.length > 0) {
      if (successfulPaths.size > 0) {
        setError(
          `Deleted ${successfulPaths.size} of ${items.length} items. Failed to delete: ${errors.join(", ")}`,
        );
      } else {
        setError(`Failed to delete: ${errors.join(", ")}`);
      }
    }

    await load(path);
  }

  async function onDownloadSelected(itemsToDownload: FileEntry[]) {
    if (!itemsToDownload || itemsToDownload.length === 0) return;

    const files = itemsToDownload.filter((e) => e.type === "file");
    const dirs = itemsToDownload.filter((e) => e.type === "dir");

    if (files.length === 0 && dirs.length > 0) {
      setDownloadStatus({
        type: "error",
        message:
          dirs.length === 1
            ? `Folder “${dirs[0].name}” cannot be downloaded directly with the current download architecture.`
            : `Folders cannot be downloaded directly with the current download architecture (${dirs.length} folders selected).`,
      });
      return;
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setDownloadStatus({
        type: "info",
        message:
          files.length > 1
            ? `Downloading ${i + 1} of ${files.length}: “${file.name}”…`
            : `Downloading “${file.name}”…`,
      });

      const url = downloadUrl(serverId, file.path);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();

      if (i < files.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }

    const skippedText =
      dirs.length > 0
        ? ` (${dirs.length} ${dirs.length === 1 ? "folder" : "folders"} skipped: folders cannot be downloaded directly)`
        : "";

    setDownloadStatus({
      type: "success",
      message: `Downloaded ${files.length} ${files.length === 1 ? "file" : "files"}${skippedText}.`,
    });

    setTimeout(() => {
      setDownloadStatus((current) => (current?.type === "success" ? null : current));
    }, 4000);
  }

  async function onUpload(fileList: globalThis.FileList | null) {
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
    if (entry) {
      if (!selectedPaths.has(entry.path)) {
        setSelectedPaths(new Set([entry.path]));
        setLastSelectedPath(entry.path);
      }
    }
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
        const target = event.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
          return;
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
          event.preventDefault();
          selectAll();
        } else if (event.key === "Escape") {
          event.preventDefault();
          clearSelection();
        } else if (event.key === "Delete" || event.key === "Backspace") {
          if (selectedEntries.length > 0) {
            event.preventDefault();
            setPendingDelete(selectedEntries);
          }
        } else if (event.key === "Enter") {
          if (singleSelectedEntry) {
            event.preventDefault();
            openEntry(singleSelectedEntry);
          }
        }
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
          selectedEntries={selectedEntries}
          totalCount={visible.length}
          onOpen={openSelected}
          onDownload={() => void onDownloadSelected(selectedEntries)}
          onUploadClick={() => uploadRef.current?.click()}
          onRename={() =>
            singleSelectedEntry &&
            setDialog({
              type: "rename",
              value: singleSelectedEntry.name,
              from: singleSelectedEntry.path,
            })
          }
          onDelete={() => selectedEntries.length > 0 && setPendingDelete(selectedEntries)}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
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
        {downloadStatus ? (
          <div
            className={`flex items-center justify-between border-b px-4 py-2 text-[12px] ${
              downloadStatus.type === "error"
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800/40 dark:bg-red-950/30 dark:text-red-300"
                : downloadStatus.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-300"
                  : "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800/40 dark:bg-sky-950/30 dark:text-sky-300"
            }`}
            role="status"
          >
            <span className="min-w-0 flex-1">{downloadStatus.message}</span>
            <button
              type="button"
              className="ml-2 text-xs font-semibold opacity-70 hover:opacity-100"
              onClick={() => setDownloadStatus(null)}
            >
              Dismiss
            </button>
          </div>
        ) : null}
        {error ? (
          <p
            className="border-b border-red-200 bg-red-50 px-4 py-2 text-[12px] text-red-700"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {pendingDelete && pendingDelete.length > 0 ? (
          <div
            className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[12px] text-amber-950 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-200"
            role="alertdialog"
            aria-labelledby="delete-file-title"
          >
            <p id="delete-file-title" className="min-w-0 flex-1">
              {isDeleting ? (
                <span>
                  Deleting {deletingProgress?.current || 1} of {pendingDelete.length}
                  {deletingProgress?.name ? `: “${deletingProgress.name}”` : "…"}
                </span>
              ) : pendingDelete.length === 1 ? (
                <>
                  Delete{" "}
                  <span className="font-medium">
                    {pendingDelete[0].type === "dir" ? "folder" : "file"} “{pendingDelete[0].name}”
                  </span>
                  ? This cannot be undone on the remote server.
                </>
              ) : (
                <>
                  Delete <span className="font-medium">{pendingDelete.length} items</span>? This
                  action cannot be undone.
                </>
              )}
            </p>
            <button
              type="button"
              className={toolbarClass}
              disabled={isDeleting}
              onClick={() => {
                setPendingDelete(null);
                setDeletingProgress(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeleting}
              className="rounded-md bg-red-600 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
              onClick={() => void onDelete(pendingDelete)}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </button>
          </div>
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
            selectedPaths={selectedPaths}
            onSelect={handleRowSelect}
            onToggleSelect={toggleSelect}
            onSelectRange={selectRange}
            onSelectAll={selectAll}
            onClearSelection={clearSelection}
            onOpen={openEntry}
            onParent={() => path !== "/" && goTo(parentPath(path))}
            onContextMenu={openContextMenu}
          />
        )}
        <div className="flex shrink-0 items-center justify-between border-t sui-hairline px-4 py-1.5 text-[11px] sui-muted">
          <span>
            {selectedEntries.length > 0 ? (
              <>
                <span className="font-medium text-sky-600 dark:text-sky-400">
                  {selectedEntries.length} {selectedEntries.length === 1 ? "item" : "items"}{" "}
                  selected
                </span>
                {selectedTotalSize > 0 ? ` (${formatSize(selectedTotalSize)})` : ""}
                <span className="mx-1.5 text-neutral-300 dark:text-neutral-600">|</span>
                <span>
                  {visible.length} {visible.length === 1 ? "item" : "items"} total
                </span>
              </>
            ) : (
              `${visible.length} ${visible.length === 1 ? "item" : "items"}`
            )}
          </span>
          <span>{formatSize(totalSize(visible))}</span>
        </div>
      </div>
      {menu ? (
        <FileContextMenu
          x={menu.x}
          y={menu.y}
          entry={menu.entry}
          selectedEntries={selectedEntries}
          onOpen={() => {
            if (menu.entry) openEntry(menu.entry);
            else goTo(path);
          }}
          onDownload={() => {
            if (selectedEntries.length > 1) {
              void onDownloadSelected(selectedEntries);
            } else if (menu.entry) {
              void onDownloadSelected([menu.entry]);
            }
          }}
          onDelete={() => {
            if (selectedEntries.length > 0) {
              setPendingDelete(selectedEntries);
            } else if (menu.entry) {
              setPendingDelete([menu.entry]);
            }
          }}
          onCopyPath={() => {
            if (selectedEntries.length > 1) {
              copyPath(selectedEntries.map((e) => e.path).join("\n"));
            } else {
              copyPath(menu.entry?.path || path);
            }
          }}
          onInfo={() => openInfo(menu.entry)}
          onTerminalHere={() => openTerminalHere(menu.entry)}
          onClearSelection={clearSelection}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  );
}
