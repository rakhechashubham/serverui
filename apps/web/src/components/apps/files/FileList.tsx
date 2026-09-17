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
  onSelect,
  onOpen,
  onParent,
  onContextMenu,
}: {
  path: string;
  entries: FileEntry[];
  selected: string | null;
  onSelect: (path: string) => void;
  onOpen: (entry: FileEntry) => void;
  onParent: () => void;
  onContextMenu: (event: MouseEvent, entry: FileEntry | null) => void;
}) {
  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto"
      onContextMenu={(event) => {
        if (event.target === event.currentTarget) {
          onContextMenu(event, null);
        }
      }}
    >
      <table className="w-full text-left text-[13px]">
        <thead className="sticky top-0 z-10 sui-app text-[11px] sui-muted">
          <tr className="border-b sui-hairline">
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Size</th>
            <th className="px-4 py-2 font-medium">Modified</th>
          </tr>
        </thead>
        <tbody>
          {path !== "/" ? (
            <tr className="cursor-default border-b sui-hairline sui-hover" onDoubleClick={onParent}>
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
              selected={selected === entry.path}
              onSelect={() => onSelect(entry.path)}
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
  onOpen,
  onContextMenu,
}: {
  entry: FileEntry;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onContextMenu: (event: MouseEvent) => void;
}) {
  return (
    <tr
      className={`cursor-default border-b sui-hairline sui-hover ${selected ? "sui-selected" : ""}`}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onContextMenu={onContextMenu}
    >
      <td className="px-4 py-1.5">
        <button
          type="button"
          className="flex max-w-full items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          onClick={onSelect}
          onDoubleClick={(event) => {
            event.preventDefault();
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
