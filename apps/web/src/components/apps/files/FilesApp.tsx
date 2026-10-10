"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ApiError } from "@/src/lib/api/client";
import {
  ARCHIVE_FORMATS,
  archiveStem,
  archiveSuffix,
  baseName,
  buildMoveDestination,
  cancelExtract,
  compressItems,
  copyItem,
  createDirectory,
  createFile,
  deleteFile,
  getExtractJob,
  isExtractFinished,
  isValidMove,
  joinPath,
  listFiles,
  moveItem,
  parentPath,
  renameFile,
  resolveExtract,
  startExtract,
  suggestUniqueName,
  uploadFile,
  type ArchiveFormat,
  type ConflictPolicy,
  type ExtractJob,
  type FileEntry,
} from "@/src/lib/api/files";
import { useWindowManager, type WindowPayload } from "@/src/components/window/window-context";
import { addDesktopShortcut } from "@/src/lib/desktop-shortcuts";
import { useServer } from "@/src/lib/api/server-context";
import { useSelectedServer } from "@/src/lib/session";
import { formatSize, totalSize } from "@/src/lib/files/format";
import { Breadcrumbs } from "@/src/components/apps/files/Breadcrumbs";
import { DownloadPanel, useDownloadQueue } from "@/src/components/apps/files/DownloadQueue";
import { FileContextMenu } from "@/src/components/apps/files/FileContextMenu";
import { FileGrid } from "@/src/components/apps/files/FileGrid";
import { FileList } from "@/src/components/apps/files/FileList";
import { FileToolbar, toolbarClass, type FilesView } from "@/src/components/apps/files/FileToolbar";
import { FilesSidebar } from "@/src/components/apps/files/FilesSidebar";

type Dialog =
  | { type: "file"; value: string }
  | { type: "dir"; value: string }
  | { type: "rename"; value: string; from: string }
  | { type: "extract"; value: string; archive: FileEntry };

const DIALOG_TEXT: Record<Dialog["type"], { label: string; submit: string }> = {
  dir: { label: "Folder name", submit: "Create" },
  file: { label: "File name", submit: "Create" },
  rename: { label: "Rename", submit: "Rename" },
  extract: { label: "Extract to", submit: "Extract" },
};

const EXTRACT_POLL_MS = 750;
const HOME_PATH = "~";
const VIEW_STORAGE_KEY = "serverui-files-view";

function readStoredView(): FilesView {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "icons";
  } catch {
    return "icons";
  }
}

type MenuState = {
  x: number;
  y: number;
  entry: FileEntry | null;
};

type PendingMove = {
  from: string;
  to: string;
  destDir: string;
  name: string;
  destNames: string[];
};

type Clipboard = { mode: "copy" | "cut"; items: FileEntry[] };

type PendingPaste = { items: FileEntry[]; conflicts: FileEntry[] };

type CompressState = {
  items: FileEntry[];
  name: string;
  format: ArchiveFormat;
  conflict: boolean;
  busy: boolean;
};

function withArchiveExt(name: string, format: ArchiveFormat) {
  const ext = ARCHIVE_FORMATS.find((f) => f.id === format)!.ext;
  const suffix = archiveSuffix(name);
  return (suffix ? name.slice(0, -suffix.length) : name) + ext;
}

export function FilesApp({ payload }: { payload?: WindowPayload }) {
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
  // Bumped on every open so the name input remounts and autoFocus runs again,
  // even when a dialog is already showing (#12).
  const [dialogKey, setDialogKey] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<FileEntry[] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingProgress, setDeletingProgress] = useState<{
    current: number;
    total: number;
    name: string;
  } | null>(null);
  const [notice, setNotice] = useState<{
    type: "info" | "success" | "error";
    message: string;
    downloadPath?: string;
  } | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);
  const [pendingPaste, setPendingPaste] = useState<PendingPaste | null>(null);
  const [compress, setCompress] = useState<CompressState | null>(null);
  const [folderDownload, setFolderDownload] = useState<FileEntry[] | null>(null);
  // The job as started; ExtractStatus owns its live progress so polling only
  // re-renders the banner, not every row of the folder.
  const [extractJob, setExtractJob] = useState<ExtractJob | null>(null);
  const [extractBusy, setExtractBusy] = useState(false);
  const [view, setView] = useState<FilesView>(readStoredView);
  const uploadRef = useRef<HTMLInputElement>(null);
  // The folder on screen, read when a background extraction finishes.
  const pathRef = useRef(path);
  const compressInputRef = useRef<HTMLInputElement>(null);
  const serverId = selectedServer?.id || "";
  const downloads = useDownloadQueue(serverId);
  // The server resolves "~" to the user's real home (e.g. /root for root);
  // remember it so the sidebar can highlight Home.
  const [homeDir, setHomeDir] = useState<string | null>(null);

  async function load(nextPath: string) {
    if (!serverId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listFiles(serverId, nextPath);
      if (nextPath === HOME_PATH) setHomeDir(result.path);
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
    pathRef.current = path;
  }, [path]);

  useEffect(() => {
    if (!serverId) return;
    let cancelled = false;
    const start = payload?.cwd || "/";
    listFiles(serverId, start)
      .then((result) => {
        if (cancelled) return;
        const sorted = [...result.entries].sort((a, b) => {
          if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        const resolved = result.path || start;
        setEntries(sorted);
        setPath(resolved);
        setHistory([resolved]);
        setHistoryIndex(0);
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
    // payload identity changes on each openWindow("files", ...), so a shortcut re-navigates an open window.
  }, [serverId, payload]);

  function goTo(next: string) {
    const normalized = next.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    const nextHistory = [...history.slice(0, historyIndex + 1), normalized];
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
    clearSelection();
    setQuery("");
    setPath(normalized);
    setMenu(null);
    setNotice(null);
    setPendingMove(null);
    void load(normalized);
  }

  function back() {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    clearSelection();
    setPath(history[nextIndex]);
    setNotice(null);
    void load(history[nextIndex]);
  }

  function forward() {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    clearSelection();
    setPath(history[nextIndex]);
    setNotice(null);
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

  function handleSelectionChange(paths: Set<string>) {
    setSelectedPaths(paths);
    if (paths.size > 0) {
      const last = visible.filter((e) => paths.has(e.path)).pop();
      if (last) setLastSelectedPath(last.path);
    }
  }

  function handleRowSelect(targetPath: string, event?: MouseEvent) {
    if (event?.shiftKey) {
      selectRange(targetPath);
    } else if (event?.ctrlKey || event?.metaKey) {
      toggleSelect(targetPath);
    } else {
      selectSingle(targetPath);
    }
  }

  async function submitDialog() {
    if (!dialog || !dialog.value.trim()) return;
    const name = dialog.value.trim();
    if (dialog.type === "extract") {
      const destination = name.startsWith("/") ? name : joinPath(path, name);
      setDialog(null);
      await onExtract(dialog.archive, "to", destination);
      return;
    }
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

  // Folders are never downloaded directly: the user is told up front and offered compression instead.
  function onDownloadSelected(itemsToDownload: FileEntry[]) {
    if (!itemsToDownload || itemsToDownload.length === 0) return;
    if (itemsToDownload.some((e) => e.type === "dir")) {
      setFolderDownload(itemsToDownload);
      return;
    }
    downloads.start(itemsToDownload);
  }

  function errorMessage(err: unknown, fallback: string) {
    return err instanceof ApiError ? err.message : fallback;
  }

  function copyToClipboard(mode: Clipboard["mode"], items: FileEntry[]) {
    if (items.length === 0) return;
    setClipboard({ mode, items });
    const what = items.length === 1 ? `“${items[0].name}”` : `${items.length} items`;
    setNotice({
      type: "info",
      message: `${mode === "copy" ? "Copied" : "Cut"} ${what}. Open the destination folder and choose Paste.`,
    });
  }

  function paste() {
    if (!clipboard) return;
    const { mode } = clipboard;
    // Cutting into the folder the items already live in is a no-op.
    const items = clipboard.items.filter(
      (item) => !(mode === "cut" && parentPath(item.path) === path),
    );
    if (items.length === 0) {
      setNotice({ type: "info", message: "The items are already in this folder." });
      return;
    }
    const nested = items.find(
      (item) => item.type === "dir" && (path === item.path || path.startsWith(`${item.path}/`)),
    );
    if (nested) {
      setError(`cannot paste “${nested.name}” into itself`);
      return;
    }
    const names = entries.map((e) => e.name);
    // A copy into its own folder is a duplicate, never a conflict: it always keeps both.
    const conflicts = items.filter(
      (item) => names.includes(item.name) && parentPath(item.path) !== path,
    );
    if (conflicts.length > 0) {
      setPendingPaste({ items, conflicts });
      return;
    }
    void runPaste(items, "keep");
  }

  async function runPaste(items: FileEntry[], resolution: "replace" | "keep") {
    if (!clipboard) return;
    const { mode } = clipboard;
    const op = mode === "copy" ? copyItem : moveItem;
    const verb = mode === "copy" ? "Copying" : "Moving";
    const taken = entries.map((e) => e.name);
    const failed: FileEntry[] = [];
    const errors: string[] = [];
    setPendingPaste(null);
    setError(null);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let name = item.name;
      let overwrite = false;
      if (taken.includes(name)) {
        if (resolution === "replace" && parentPath(item.path) !== path) overwrite = true;
        else name = suggestUniqueName(taken, name);
      }
      taken.push(name);
      setNotice({
        type: "info",
        message: `${verb} ${items.length > 1 ? `${i + 1} of ${items.length}: ` : ""}“${item.name}”…`,
      });
      try {
        await op(serverId, item.path, joinPath(path, name), overwrite);
      } catch (err) {
        failed.push(item);
        errors.push(`“${item.name}”: ${errorMessage(err, "operation failed")}`);
      }
    }

    // A cut stays on the clipboard only for the items that failed to move.
    if (mode === "cut") setClipboard(failed.length > 0 ? { mode, items: failed } : null);
    const done = items.length - failed.length;
    if (errors.length > 0) {
      setNotice(null);
      setError(
        `${done > 0 ? `${mode === "copy" ? "Copied" : "Moved"} ${done} of ${items.length} items. ` : ""}Failed: ${errors.join(", ")}`,
      );
    } else {
      setNotice({
        type: "success",
        message: `${mode === "copy" ? "Copied" : "Moved"} ${items.length} ${items.length === 1 ? "item" : "items"}.`,
      });
    }
    clearSelection();
    await load(path);
  }

  function openCompress(items: FileEntry[]) {
    if (items.length === 0) return;
    setFolderDownload(null);
    const base = items.length === 1 ? items[0].name : "Archive";
    setCompress({
      items,
      name: withArchiveExt(base, "zip"),
      format: "zip",
      conflict: false,
      busy: false,
    });
  }

  async function submitCompress(overwrite: boolean) {
    if (!compress || !compress.name.trim() || compress.busy) return;
    const { items, format } = compress;
    const name = withArchiveExt(compress.name.trim(), format);
    setCompress({ ...compress, name, busy: true, conflict: false });
    setError(null);
    setNotice({
      type: "info",
      message: `Compressing ${items.length === 1 ? `“${items[0].name}”` : `${items.length} items`} into “${name}”… Large folders can take a while.`,
    });
    try {
      const result = await compressItems(
        serverId,
        path,
        items.map((item) => item.name),
        name,
        format,
        overwrite,
      );
      setCompress(null);
      setNotice({
        type: "success",
        message: `Created “${baseName(result.path)}”.`,
        downloadPath: result.path,
      });
      await load(path);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setNotice(null);
        setCompress({ ...compress, name, busy: false, conflict: true });
        return;
      }
      setNotice(null);
      const message = errorMessage(err, "operation failed");
      // zip and 7z are often missing on minimal servers; tar.gz always works, so offer it in one click.
      if (message.includes("is not installed") && format !== "tar.gz") {
        setCompress({
          ...compress,
          name: withArchiveExt(name, "tar.gz"),
          format: "tar.gz",
          busy: false,
        });
        setError(
          `Compression failed: ${message}. Switched to TAR.GZ, which works on any Linux server: press Compress again.`,
        );
        return;
      }
      setCompress({ ...compress, name, busy: false });
      setError(`Compression failed: ${message}`);
    }
  }

  async function onExtract(entry: FileEntry, mode: "here" | "to", destination?: string) {
    setError(null);
    try {
      const job = await startExtract(serverId, entry.path, mode, destination);
      setExtractJob(job);
      setExtractBusy(!isExtractFinished(job.state));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `unable to extract ${entry.name}`);
    }
  }

  async function showExtracted(job: ExtractJob) {
    const here = pathRef.current;
    const prefix = here === "/" ? "/" : `${here}/`;
    if (job.destination !== here && !job.destination.startsWith(prefix)) return;
    await load(here);
    const inView = job.extracted.filter((item) => parentPath(item) === here);
    if (inView.length > 0) {
      setSelectedPaths(new Set(inView));
      setLastSelectedPath(inView[inView.length - 1]);
    }
  }
  function onExtractFinished(job: ExtractJob) {
    setExtractBusy(false);
    if (job.state === "done") void showExtracted(job);
  }

  function downloadCreated(archivePath: string) {
    const entry = entries.find((e) => e.path === archivePath);
    downloads.start([
      entry ?? {
        name: baseName(archivePath),
        path: archivePath,
        type: "file",
        size: 0,
        mode: "",
        modified: "",
      },
    ]);
    setNotice(null);
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

  async function handleMove(sourcePath: string, destDir: string, sourceType?: "file" | "dir") {
    const source = entries.find((entry) => entry.path === sourcePath);
    const type = source?.type ?? sourceType ?? "file";
    const name = source?.name ?? baseName(sourcePath);
    if (!isValidMove(sourcePath, type, destDir)) {
      setError("cannot move an item into itself or its current location");
      return;
    }
    const to = buildMoveDestination(destDir, sourcePath);
    if (sourcePath === to) return;
    try {
      setError(null);
      const destEntries = destDir === path ? entries : (await listFiles(serverId, destDir)).entries;
      if (destEntries.some((entry) => entry.name === name && entry.path !== sourcePath)) {
        setPendingMove({
          from: sourcePath,
          to,
          destDir,
          name,
          destNames: destEntries.map((entry) => entry.name),
        });
        return;
      }
      await renameFile(serverId, sourcePath, to);
      clearSelection();
      await load(path);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `unable to move ${baseName(sourcePath)}`);
    }
  }

  async function resolveMove(mode: "replace" | "rename") {
    if (!pendingMove) return;
    try {
      setError(null);
      const to =
        mode === "replace"
          ? pendingMove.to
          : joinPath(
              pendingMove.destDir,
              suggestUniqueName(pendingMove.destNames, pendingMove.name),
            );
      // SFTP rename refuses an existing target, so Replace goes through the server-side move.
      if (mode === "replace") await moveItem(serverId, pendingMove.from, to, true);
      else await renameFile(serverId, pendingMove.from, to);
      setPendingMove(null);
      clearSelection();
      await load(path);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `unable to move ${pendingMove.name}`);
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
    const height = 360;
    setMenu({
      x: Math.min(event.clientX, window.innerWidth - width - 8),
      y: Math.min(event.clientY, window.innerHeight - height - 8),
      entry,
    });
  }

  function menuTargets(entry: FileEntry | null) {
    if (selectedEntries.length > 1) return selectedEntries;
    return entry ? [entry] : [];
  }

  function copyPath(value: string) {
    void navigator.clipboard.writeText(value);
  }

  /** Copies every selected path when several are selected, otherwise `single`. */
  function copySelectionPaths(single: string) {
    copyPath(
      selectedEntries.length > 1 ? selectedEntries.map((entry) => entry.path).join("\n") : single,
    );
  }

  function changeView(next: FilesView) {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // The view is a per-viewer convenience; ignore unavailable storage.
    }
  }

  function openDialog(next: Dialog) {
    setDialog(next);
    setDialogKey((key) => key + 1);
  }

  const newFolder = () => openDialog({ type: "dir", value: "" });
  const newFile = () => openDialog({ type: "file", value: "" });
  const pickUpload = () => uploadRef.current?.click();

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

  const viewProps = {
    path,
    entries: visible,
    selectedPaths,
    onSelect: handleRowSelect,
    onToggleSelect: toggleSelect,
    onSelectRange: selectRange,
    onSelectionChange: handleSelectionChange,
    onClearSelection: clearSelection,
    onOpen: openEntry,
    onContextMenu: openContextMenu,
    onMove: (source: string, dest: string, type: "file" | "dir") =>
      void handleMove(source, dest, type),
  };
  const serverName = selectedServer?.name || server?.hostname || "Server";
  const title = path === "/" ? serverName : baseName(path);
  const statusText =
    selectedEntries.length > 0
      ? `${selectedEntries.length} of ${visible.length} selected${
          selectedTotalSize > 0 ? `, ${formatSize(selectedTotalSize)}` : ""
        }`
      : `${visible.length} ${visible.length === 1 ? "item" : "items"}, ${formatSize(totalSize(visible))}`;

  return (
    <div
      className="sui-finder flex h-full min-h-0 overflow-hidden"
      onClick={() => setMenu(null)}
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
          return;
        }

        const meta = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        if (meta && key === "a") {
          event.preventDefault();
          selectAll();
        } else if (meta && (key === "c" || key === "x") && selectedEntries.length > 0) {
          event.preventDefault();
          copyToClipboard(key === "c" ? "copy" : "cut", selectedEntries);
        } else if (meta && key === "v" && clipboard) {
          event.preventDefault();
          paste();
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
      <FilesSidebar
        path={path}
        homePath={homeDir ?? HOME_PATH}
        serverName={serverName}
        onNavigate={goTo}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--finder-content)]">
        <FileToolbar
          title={title}
          canGoBack={historyIndex > 0}
          canGoForward={historyIndex < history.length - 1}
          onBack={back}
          onForward={forward}
          view={view}
          onViewChange={changeView}
          selectedCount={selectedEntries.length}
          query={query}
          onQueryChange={setQuery}
          onUploadClick={pickUpload}
          onNewFolder={newFolder}
          onNewFile={newFile}
          onOpen={openSelected}
          onDownload={() => onDownloadSelected(selectedEntries)}
          onRename={() =>
            singleSelectedEntry &&
            openDialog({
              type: "rename",
              value: singleSelectedEntry.name,
              from: singleSelectedEntry.path,
            })
          }
          onDelete={() => selectedEntries.length > 0 && setPendingDelete(selectedEntries)}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
          onCopyPath={() => copySelectionPaths(path)}
          onTerminalHere={() => openTerminalHere(null)}
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
        {clipboard ? (
          <div className="sui-finder-sheet flex items-center gap-2 px-4 py-1.5 text-[12px]">
            <span className="sui-finder-muted min-w-0 flex-1 truncate">
              {clipboard.mode === "cut" ? "Cut" : "Copied"}{" "}
              {clipboard.items.length === 1
                ? `“${clipboard.items[0].name}”`
                : `${clipboard.items.length} items`}
            </span>
            <button type="button" className={toolbarClass} onClick={paste}>
              Paste{" "}
              {clipboard.items.length === 1
                ? `“${clipboard.items[0].name}”`
                : `${clipboard.items.length} items`}
            </button>
            <button
              type="button"
              aria-label="Clear clipboard"
              className={toolbarClass}
              onClick={() => setClipboard(null)}
            >
              ×
            </button>
          </div>
        ) : null}
        {dialog ? (
          <form
            className="sui-finder-sheet flex items-center gap-2 px-4 py-2 text-[12px]"
            onSubmit={(event) => {
              event.preventDefault();
              void submitDialog();
            }}
          >
            <label className="sui-finder-muted">{DIALOG_TEXT[dialog.type].label}</label>
            <input
              key={dialogKey}
              autoFocus
              className="sui-input min-w-0 flex-1 rounded-md px-2 py-1 outline-none focus:ring-2 focus:ring-sky-400"
              value={dialog.value}
              onChange={(event) => setDialog({ ...dialog, value: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setDialog(null);
                }
              }}
            />
            <button type="submit" className={toolbarClass}>
              {DIALOG_TEXT[dialog.type].submit}
            </button>
            <button type="button" className={toolbarClass} onClick={() => setDialog(null)}>
              Cancel
            </button>
          </form>
        ) : null}
        {notice ? (
          <div
            className={`flex items-center justify-between border-b px-4 py-2 text-[12px] ${
              notice.type === "error"
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800/40 dark:bg-red-950/30 dark:text-red-300"
                : notice.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-300"
                  : "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800/40 dark:bg-sky-950/30 dark:text-sky-300"
            }`}
            role="status"
          >
            <span className="min-w-0 flex-1">{notice.message}</span>
            {notice.downloadPath ? (
              <button
                type="button"
                className="ml-2 text-xs font-semibold underline"
                onClick={() => downloadCreated(notice.downloadPath!)}
              >
                Download
              </button>
            ) : null}
            <button
              type="button"
              className="ml-2 text-xs font-semibold opacity-70 hover:opacity-100"
              onClick={() => setNotice(null)}
            >
              Dismiss
            </button>
          </div>
        ) : null}
        {extractJob ? (
          <ExtractStatus
            key={extractJob.id}
            serverId={serverId}
            initial={extractJob}
            onFinished={onExtractFinished}
            onError={setError}
            onDismiss={() => {
              setExtractJob(null);
              setExtractBusy(false);
            }}
          />
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
        {pendingMove ? (
          <div
            className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[12px] text-amber-950"
            role="alertdialog"
            aria-labelledby="move-conflict-title"
          >
            <p id="move-conflict-title" className="min-w-0 flex-1">
              An item named <span className="font-medium">“{pendingMove.name}”</span> already
              exists.
            </p>
            <button type="button" className={toolbarClass} onClick={() => setPendingMove(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={toolbarClass}
              onClick={() => void resolveMove("replace")}
            >
              Replace
            </button>
            <button
              type="button"
              className={toolbarClass}
              onClick={() => void resolveMove("rename")}
            >
              Rename
            </button>
          </div>
        ) : null}
        {pendingPaste ? (
          <div
            className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[12px] text-amber-950 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-200"
            role="alertdialog"
            aria-labelledby="paste-conflict-title"
          >
            <p id="paste-conflict-title" className="min-w-0 flex-1">
              {pendingPaste.conflicts.length === 1 ? (
                <>
                  An item named{" "}
                  <span className="font-medium">“{pendingPaste.conflicts[0].name}”</span> already
                  exists.
                </>
              ) : (
                <>
                  <span className="font-medium">{pendingPaste.conflicts.length} items</span> already
                  exist in this folder. Your choice applies to all of them.
                </>
              )}
            </p>
            <button type="button" className={toolbarClass} onClick={() => setPendingPaste(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={toolbarClass}
              onClick={() => void runPaste(pendingPaste.items, "replace")}
            >
              Replace
            </button>
            <button
              type="button"
              className={toolbarClass}
              onClick={() => void runPaste(pendingPaste.items, "keep")}
            >
              Keep Both
            </button>
          </div>
        ) : null}
        {folderDownload ? (
          <div
            className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[12px] text-amber-950 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-200"
            role="alertdialog"
            aria-labelledby="folder-download-title"
          >
            <p id="folder-download-title" className="min-w-0 flex-1">
              Folders can’t be downloaded directly. Compress the selection into one archive, then
              download the archive.
            </p>
            <button type="button" className={toolbarClass} onClick={() => setFolderDownload(null)}>
              Cancel
            </button>
            {folderDownload.some((e) => e.type === "file") ? (
              <button
                type="button"
                className={toolbarClass}
                onClick={() => {
                  downloads.start(folderDownload.filter((e) => e.type === "file"));
                  setFolderDownload(null);
                }}
              >
                Download files only
              </button>
            ) : null}
            <button
              type="button"
              className={toolbarClass}
              onClick={() => openCompress(folderDownload)}
            >
              Compress…
            </button>
          </div>
        ) : null}
        {compress ? (
          <form
            className="flex flex-wrap items-center gap-2 border-b sui-hairline px-3 py-2 text-[12px]"
            aria-label="Compress"
            onSubmit={(event) => {
              event.preventDefault();
              void submitCompress(false);
            }}
          >
            <label htmlFor="compress-name" className="text-neutral-500">
              Archive name
            </label>
            <input
              id="compress-name"
              ref={compressInputRef}
              autoFocus
              disabled={compress.busy}
              className="sui-input min-w-0 flex-1 rounded-md px-2 py-1 outline-none focus:ring-2 focus:ring-sky-400"
              value={compress.name}
              onChange={(event) =>
                setCompress({ ...compress, name: event.target.value, conflict: false })
              }
            />
            <label htmlFor="compress-format" className="text-neutral-500">
              Format
            </label>
            <select
              id="compress-format"
              disabled={compress.busy}
              className="sui-input rounded-md px-2 py-1 outline-none focus:ring-2 focus:ring-sky-400"
              value={compress.format}
              onChange={(event) => {
                const format = event.target.value as ArchiveFormat;
                setCompress({
                  ...compress,
                  format,
                  name: withArchiveExt(compress.name, format),
                  conflict: false,
                });
              }}
            >
              {ARCHIVE_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
            {compress.conflict ? (
              <>
                <span role="alert" className="w-full text-amber-800 dark:text-amber-300">
                  “{compress.name}” already exists.
                </span>
                <button type="button" className={toolbarClass} onClick={() => setCompress(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={toolbarClass}
                  onClick={() => void submitCompress(true)}
                >
                  Replace
                </button>
                <button
                  type="button"
                  className={toolbarClass}
                  onClick={() => {
                    setCompress({ ...compress, conflict: false });
                    compressInputRef.current?.focus();
                    compressInputRef.current?.select();
                  }}
                >
                  Choose another name
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={toolbarClass}
                  disabled={compress.busy}
                  onClick={() => setCompress(null)}
                >
                  Cancel
                </button>
                <button type="submit" className={toolbarClass} disabled={compress.busy}>
                  {compress.busy ? "Compressing…" : "Compress"}
                </button>
              </>
            )}
          </form>
        ) : null}
        <DownloadPanel
          items={downloads.items}
          onRetry={downloads.retryFailed}
          onDismiss={downloads.dismiss}
        />
        <div className="relative flex min-h-0 flex-1 flex-col">
          {view === "icons" ? (
            <FileGrid {...viewProps} />
          ) : (
            <FileList {...viewProps} onParent={() => path !== "/" && goTo(parentPath(path))} />
          )}
          {!loading && !error && visible.length === 0 ? (
            <p className="sui-finder-muted pointer-events-none absolute inset-x-0 top-1/3 text-center text-[13px]">
              {query.trim() ? `No items match “${query.trim()}”` : "This folder is empty"}
            </p>
          ) : null}
          {loading ? (
            <div className="sui-finder-muted pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--finder-content)]/60 text-[13px]">
              Loading files…
            </div>
          ) : null}
        </div>
        <div className="flex h-[28px] shrink-0 items-center gap-3 border-t border-[var(--finder-hairline)] bg-[var(--finder-toolbar)] px-3 text-[11.5px]">
          <Breadcrumbs path={path} rootLabel={serverName} onNavigate={goTo} />
          <span className="sui-finder-muted shrink-0">{statusText}</span>
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
          onCopyPath={() => copySelectionPaths(menu.entry?.path || path)}
          onInfo={() => openInfo(menu.entry)}
          onTerminalHere={() => openTerminalHere(menu.entry)}
          onRename={() =>
            menu.entry &&
            openDialog({ type: "rename", value: menu.entry.name, from: menu.entry.path })
          }
          onCopy={() => copyToClipboard("copy", menuTargets(menu.entry))}
          onCut={() => copyToClipboard("cut", menuTargets(menu.entry))}
          onPaste={paste}
          onNewFolder={newFolder}
          onNewFile={newFile}
          onUpload={pickUpload}
          canPaste={Boolean(clipboard)}
          onAddToDesktop={() => addDesktopShortcut(serverId, menu.entry?.path || path)}
          onCompress={() => openCompress(menuTargets(menu.entry))}
          onExtractHere={() => menu.entry && void onExtract(menu.entry, "here")}
          onExtractTo={() =>
            menu.entry &&
            openDialog({
              type: "extract",
              value: joinPath(path, archiveStem(menu.entry.name)),
              archive: menu.entry,
            })
          }
          extracting={extractBusy}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  );
}

/** Live extraction banner: polls its job and owns the conflict / cancel actions. */
function ExtractStatus({
  serverId,
  initial,
  onFinished,
  onError,
  onDismiss,
}: {
  serverId: string;
  initial: ExtractJob;
  onFinished: (job: ExtractJob) => void;
  onError: (message: string) => void;
  onDismiss: () => void;
}) {
  const [job, setJob] = useState(initial);
  // A cancel finishes asynchronously, so keep polling past a pending decision.
  const [cancelling, setCancelling] = useState(false);
  const onFinishedRef = useRef(onFinished);
  const name = baseName(job.archive);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  });

  useEffect(() => {
    if (isExtractFinished(job.state)) return;
    if (job.state === "awaiting_decision" && !cancelling) return;
    let stopped = false;
    const timer = window.setTimeout(async () => {
      let next: ExtractJob;
      try {
        next = await getExtractJob(serverId, job.id);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) {
          if (!stopped) setJob((current) => ({ ...current })); // retry next tick
          return;
        }
        next = { ...job, state: "failed", error: "extraction status is no longer available" };
      }
      if (stopped) return;
      setJob(next);
      if (isExtractFinished(next.state)) onFinishedRef.current(next);
    }, EXTRACT_POLL_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [job, cancelling, serverId]);

  async function onResolve(policy: ConflictPolicy) {
    try {
      setJob(await resolveExtract(serverId, job.id, policy));
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "unable to continue extraction");
    }
  }

  async function onCancel() {
    setCancelling(true);
    try {
      setJob(await cancelExtract(serverId, job.id));
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "unable to cancel extraction");
    }
  }

  if (job.state === "awaiting_decision" && !cancelling) {
    const shown = job.conflicts.slice(0, 3).map((item) => `“${item}”`);
    const more = job.conflicts.length - shown.length;
    return (
      <div
        className={`flex flex-wrap items-center gap-2 border-b px-4 py-2 text-[12px] ${BANNER_TONES.warning}`}
        role="alertdialog"
        aria-labelledby="extract-conflict-title"
      >
        <p id="extract-conflict-title" className="min-w-0 flex-1">
          {job.conflicts.length === 1 ? (
            <>
              <span className="font-medium">{shown[0]}</span> already exists in {job.destination}.
            </>
          ) : (
            <>
              <span className="font-medium">{job.conflicts.length} items</span> already exist in{" "}
              {job.destination}: {shown.join(", ")}
              {more > 0 ? ` and ${more} more` : ""}.
            </>
          )}
        </p>
        <button type="button" className={toolbarClass} onClick={() => void onCancel()}>
          Cancel
        </button>
        <button type="button" className={toolbarClass} onClick={() => void onResolve("keep-both")}>
          Keep both
        </button>
        <button
          type="button"
          className="rounded-md bg-red-600 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-red-700"
          onClick={() => void onResolve("replace")}
        >
          Replace
        </button>
      </div>
    );
  }

  if (!isExtractFinished(job.state)) {
    const percent = job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;
    return (
      <div
        className={`flex items-center gap-3 border-b px-4 py-2 text-[12px] ${BANNER_TONES.info}`}
        role="status"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate">
            {cancelling
              ? `Cancelling “${name}”…`
              : job.state === "scanning"
                ? `Checking “${name}”…`
                : `Extracting “${name}”… ${job.done} of ${job.total} (${percent}%)`}
          </p>
          {job.state === "extracting" ? (
            <div
              className="mt-1 h-1 overflow-hidden rounded-full bg-sky-200 dark:bg-sky-900"
              role="progressbar"
              aria-label="Extraction progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div
                className="h-full bg-sky-500 transition-[width]"
                style={{ width: `${percent}%` }}
              />
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className={toolbarClass}
          disabled={cancelling}
          onClick={() => void onCancel()}
        >
          Cancel
        </button>
      </div>
    );
  }

  const message =
    job.state === "done"
      ? job.extracted.length === 1
        ? `Extracted “${name}” to ${job.extracted[0]}.`
        : `Extracted “${name}” into ${job.destination}.`
      : job.state === "failed"
        ? `Couldn’t extract “${name}”: ${job.error || "extraction failed"}.`
        : `Extraction of “${name}” was cancelled. Nothing was changed.`;
  return (
    <StatusBanner
      tone={job.state === "done" ? "success" : job.state === "failed" ? "error" : "neutral"}
      message={message}
      onDismiss={onDismiss}
    />
  );
}

const BANNER_TONES = {
  info: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800/40 dark:bg-sky-950/30 dark:text-sky-300",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-300",
  error:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-800/40 dark:bg-red-950/30 dark:text-red-300",
  neutral:
    "border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-300",
  warning:
    "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-200",
};

function StatusBanner({
  tone,
  message,
  onDismiss,
}: {
  tone: Exclude<keyof typeof BANNER_TONES, "warning">;
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between border-b px-4 py-2 text-[12px] ${BANNER_TONES[tone]}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <span className="min-w-0 flex-1">{message}</span>
      <button
        type="button"
        className="ml-2 text-xs font-semibold opacity-70 hover:opacity-100"
        onClick={onDismiss}
      >
        Dismiss
      </button>
    </div>
  );
}
