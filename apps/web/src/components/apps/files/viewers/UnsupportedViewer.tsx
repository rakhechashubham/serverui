"use client";

import { File as FileIcon } from "lucide-react";
import { downloadUrl } from "@/src/lib/api/files";
import { useSelectedServer } from "@/src/lib/session";
import { formatModified, formatSize } from "@/src/lib/files/format";
import { viewerButtonClass, type ViewerFile } from "@/src/components/apps/files/viewers/viewer-ui";

export function UnsupportedViewer({
  file,
  kind,
  onClose,
}: {
  file: ViewerFile;
  kind: string;
  onClose: () => void;
}) {
  const serverId = useSelectedServer()?.id || "";
  const label =
    kind === "archive"
      ? "Archive"
      : kind === "document"
        ? "Document"
        : kind === "folder"
          ? "Folder"
          : "Unknown file";

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 sui-app px-8 text-center">
      <FileIcon aria-hidden className="size-10 sui-muted" />
      <p className="max-w-full truncate text-base font-medium">{file.name}</p>
      <p className="text-sm sui-muted">
        {kind === "folder" ? "Folder information" : "Preview unavailable"}
      </p>
      <dl className="text-[13px] sui-muted">
        <div>Type: {label}</div>
        {kind === "folder" ? null : <div>Size: {formatSize(file.size)}</div>}
        {file.modified ? <div>Modified: {formatModified(file.modified)}</div> : null}
        <div className="mt-1 font-mono text-[12px] break-all text-neutral-400">{file.path}</div>
      </dl>
      <div className="mt-2 flex items-center gap-2">
        {kind === "folder" ? null : (
          <a href={downloadUrl(serverId, file.path)} className={viewerButtonClass}>
            Download
          </a>
        )}
        <button type="button" className={viewerButtonClass} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
