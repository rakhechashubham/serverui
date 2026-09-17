"use client";

import { Upload } from "lucide-react";
import type { FileEntry } from "@/src/lib/api/files";

export const toolbarClass =
  "sui-hover inline-flex items-center gap-1 rounded-md px-2 py-1 sui-muted outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-40";

export function FileToolbar({
  selected,
  onOpen,
  onDownload,
  onUploadClick,
  onRename,
  onDelete,
}: {
  selected: FileEntry | null;
  onOpen: () => void;
  onDownload: () => void;
  onUploadClick: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b sui-hairline px-3 py-2 text-[12px]">
      <button type="button" className={toolbarClass} disabled={!selected} onClick={onOpen}>
        Open
      </button>
      <button
        type="button"
        className={toolbarClass}
        disabled={!selected || selected.type !== "file"}
        onClick={onDownload}
      >
        Download
      </button>
      <button type="button" className={toolbarClass} onClick={onUploadClick}>
        <Upload aria-hidden className="size-3.5" />
        Upload
      </button>
      <button type="button" className={toolbarClass} disabled={!selected} onClick={onRename}>
        Rename
      </button>
      <button type="button" className={toolbarClass} disabled={!selected} onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}
