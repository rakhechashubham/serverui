"use client";

import {
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  Folder,
} from "lucide-react";
import type { MouseEvent } from "react";
import { getFileType } from "@/src/lib/files/file-type";
import { formatModified, formatSize } from "@/src/lib/files/format";
import type { FileEntry } from "@/src/lib/api/files";

export function FileList({
  path,
  entries,
  selected,
  selectedPaths,
  onSelect,
  onToggleSelect,
  onSelectRange,
  onSelectAll,
  onClearSelection,
  onOpen,
  onParent,
  onContextMenu,
}: {
  path: string;
  entries: FileEntry[];
  selected?: string | null;
  selectedPaths?: Set<string>;
  onSelect: (path: string, event: MouseEvent) => void;
  onToggleSelect?: (path: string) => void;
  onSelectRange?: (path: string) => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  onOpen: (entry: FileEntry) => void;
  onParent: () => void;
  onContextMenu: (event: MouseEvent, entry: FileEntry | null) => void;
}) {
  const activeSelected = selectedPaths ?? (selected ? new Set([selected]) : new Set<string>());
  const allSelected = entries.length > 0 && entries.every((e) => activeSelected.has(e.path));
  const someSelected = entries.some((e) => activeSelected.has(e.path));

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClearSelection?.();
        }
      }}
      onContextMenu={(event) => {
        if (event.target === event.currentTarget) {
          onContextMenu(event, null);
        }
      }}
    >
      <table className="w-full text-left text-[13px]">
        <thead className="sticky top-0 z-10 sui-app text-[11px] sui-muted">
          <tr className="border-b sui-hairline">
            <th className="w-10 px-3 py-2 text-center">
              <input
                type="checkbox"
                aria-label="Select all"
                checked={allSelected}
                ref={(el) => {
                  if (el) {
                    el.indeterminate = someSelected && !allSelected;
                  }
                }}
                onChange={() => {
                  if (allSelected) {
                    onClearSelection?.();
                  } else {
                    onSelectAll?.();
                  }
                }}
                className="size-3.5 rounded border-neutral-300 text-sky-600 focus:ring-sky-400 dark:border-neutral-600 dark:bg-neutral-800"
              />
            </th>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Size</th>
            <th className="px-4 py-2 font-medium">Modified</th>
          </tr>
        </thead>
        <tbody>
          {path !== "/" ? (
            <tr className="cursor-default border-b sui-hairline sui-hover" onDoubleClick={onParent}>
              <td className="w-10 px-3 py-1.5" />
              <td className="px-4 py-1.5" colSpan={3}>
                <button
                  type="button"
                  className="flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                  onClick={onParent}
                >
                  <Folder aria-hidden className="size-4 fill-sky-400 text-sky-500" />
                  ..
                </button>
              </td>
            </tr>
          ) : null}
          {entries.map((entry) => (
            <FileItem
              key={entry.path}
              entry={entry}
              selected={activeSelected.has(entry.path)}
              onSelect={(event) => onSelect(entry.path, event)}
              onToggleSelect={() => onToggleSelect?.(entry.path)}
              onSelectRange={() => onSelectRange?.(entry.path)}
              onOpen={() => onOpen(entry)}
              onContextMenu={(event) => onContextMenu(event, entry)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FileItem({
  entry,
  selected,
  onSelect,
  onToggleSelect,
  onSelectRange,
  onOpen,
  onContextMenu,
}: {
  entry: FileEntry;
  selected: boolean;
  onSelect: (event: MouseEvent) => void;
  onToggleSelect?: () => void;
  onSelectRange?: () => void;
  onOpen: () => void;
  onContextMenu: (event: MouseEvent) => void;
}) {
  return (
    <tr
      className={`cursor-default border-b sui-hairline sui-hover ${selected ? "sui-selected" : ""}`}
      onClick={(e) => onSelect(e)}
      onDoubleClick={onOpen}
      onContextMenu={onContextMenu}
    >
      <td className="w-10 px-3 py-1.5 text-center">
        <input
          type="checkbox"
          aria-label={`Select ${entry.name}`}
          checked={selected}
          onChange={() => {
            onToggleSelect?.();
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (e.shiftKey) {
              onSelectRange?.();
            }
          }}
          className="size-3.5 rounded border-neutral-300 text-sky-600 focus:ring-sky-400 dark:border-neutral-600 dark:bg-neutral-800"
        />
      </td>
      <td className="px-4 py-1.5">
        <button
          type="button"
          className="flex max-w-full items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(e);
          }}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpen();
          }}
        >
          <EntryIcon entry={entry} />
          <span className="truncate">{entry.name}</span>
        </button>
      </td>
      <td className="px-4 py-1.5 whitespace-nowrap sui-muted">
        {entry.type === "dir" ? "—" : formatSize(entry.size)}
      </td>
      <td className="px-4 py-1.5 whitespace-nowrap sui-muted">{formatModified(entry.modified)}</td>
    </tr>
  );
}

function EntryIcon({ entry }: { entry: FileEntry }) {
  if (entry.type === "dir") {
    return <Folder aria-hidden className="size-4 shrink-0 fill-sky-400 text-sky-500" />;
  }
  const kind = getFileType({ name: entry.name, mime: entry.mime });
  const className = "size-4 shrink-0 text-neutral-400";
  switch (kind) {
    case "image":
      return <FileImage aria-hidden className={className} />;
    case "video":
      return <FileVideo aria-hidden className={className} />;
    case "audio":
      return <FileAudio aria-hidden className={className} />;
    case "pdf":
    case "text":
      return <FileText aria-hidden className={className} />;
    case "code":
      return <FileCode aria-hidden className={className} />;
    case "archive":
      return <FileArchive aria-hidden className={className} />;
    default:
      return <FileIcon aria-hidden className={className} />;
  }
}
