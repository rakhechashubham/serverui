"use client";

import { Upload } from "lucide-react";
import type { FileEntry } from "@/src/lib/api/files";

export const toolbarClass =
  "sui-hover inline-flex items-center gap-1 rounded-md px-2 py-1 sui-muted outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-40";

export function FileToolbar({
  selected,
  selectedEntries,
  onOpen,
  onDownload,
  onUploadClick,
  onRename,
  onDelete,
  onSelectAll,
  onClearSelection,
  totalCount,
}: {
  selected?: FileEntry | null;
  selectedEntries?: FileEntry[];
  onOpen: () => void;
  onDownload: () => void;
  onUploadClick: () => void;
  onRename: () => void;
  onDelete: () => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  totalCount?: number;
}) {
  const entries = selectedEntries ?? (selected ? [selected] : []);
  const count = entries.length;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b sui-hairline px-3 py-2 text-[12px]">
      {count > 0 ? (
        <span className="inline-flex items-center gap-1 rounded bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-950/80 dark:text-sky-300">
          {count} {count === 1 ? "item" : "items"} selected
        </span>
      ) : null}
      <button type="button" className={toolbarClass} disabled={count !== 1} onClick={onOpen}>
        Open
      </button>
      <button type="button" className={toolbarClass} disabled={count === 0} onClick={onDownload}>
        Download
      </button>
      <button type="button" className={toolbarClass} onClick={onUploadClick}>
        <Upload aria-hidden className="size-3.5" />
        Upload
      </button>
      <button type="button" className={toolbarClass} disabled={count !== 1} onClick={onRename}>
        Rename
      </button>
      <button type="button" className={toolbarClass} disabled={count === 0} onClick={onDelete}>
        Delete
      </button>
      {count > 0 ? (
        <button type="button" className={toolbarClass} onClick={onClearSelection}>
          Clear
        </button>
      ) : totalCount && totalCount > 0 ? (
        <button type="button" className={toolbarClass} onClick={onSelectAll}>
          Select all
        </button>
      ) : null}
    </div>
  );
}
