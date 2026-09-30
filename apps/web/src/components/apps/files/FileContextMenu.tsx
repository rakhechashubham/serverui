"use client";

import type { FileEntry } from "@/src/lib/api/files";

type FileContextMenuProps = {
  x: number;
  y: number;
  entry: FileEntry | null;
  selectedEntries?: FileEntry[];
  onOpen: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
  onCopyPath: () => void;
  onInfo: () => void;
  onTerminalHere: () => void;
  onClearSelection?: () => void;
  onClose: () => void;
};

export function FileContextMenu({
  x,
  y,
  entry,
  selectedEntries = [],
  onOpen,
  onDownload,
  onDelete,
  onCopyPath,
  onInfo,
  onTerminalHere,
  onClearSelection,
  onClose,
}: FileContextMenuProps) {
  const isMultiple = selectedEntries.length > 1;
  const isDir = !entry || entry.type === "dir";

  return (
    <div
      role="menu"
      aria-label="File actions"
      className="sui-menu fixed z-[80] min-w-48 overflow-hidden rounded-xl border py-1 text-sm shadow-2xl animate-menu-in backdrop-blur-xl"
      style={{ left: x, top: y }}
    >
      {isMultiple ? (
        <>
          <MenuItem
            label={`Download (${selectedEntries.length} items)`}
            onSelect={() => {
              onDownload?.();
              onClose();
            }}
          />
          <MenuItem
            label={`Delete (${selectedEntries.length} items)`}
            onSelect={() => {
              onDelete?.();
              onClose();
            }}
          />
          <div className="my-1 h-px bg-black/8 dark:bg-white/10" />
          <MenuItem
            label="Copy Paths"
            onSelect={() => {
              onCopyPath();
              onClose();
            }}
          />
          {onClearSelection ? (
            <MenuItem
              label="Clear Selection"
              onSelect={() => {
                onClearSelection();
                onClose();
              }}
            />
          ) : null}
        </>
      ) : (
        <>
          <MenuItem
            label="Open"
            onSelect={() => {
              onOpen();
              onClose();
            }}
          />
          {isDir ? (
            <MenuItem
              label="Open Terminal Here"
              onSelect={() => {
                onTerminalHere();
                onClose();
              }}
            />
          ) : (
            <MenuItem
              label="Download"
              onSelect={() => {
                onDownload?.();
                onClose();
              }}
            />
          )}
          {entry && onDelete ? (
            <MenuItem
              label="Delete"
              onSelect={() => {
                onDelete();
                onClose();
              }}
            />
          ) : null}
          <div className="my-1 h-px bg-black/8 dark:bg-white/10" />
          <MenuItem
            label="Copy Path"
            onSelect={() => {
              onCopyPath();
              onClose();
            }}
          />
          {entry ? (
            <MenuItem
              label={isDir ? "Folder Information" : "File Information"}
              onSelect={() => {
                onInfo();
                onClose();
              }}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function MenuItem({ label, onSelect }: { label: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      className="block w-full px-3 py-1.5 text-left outline-none hover:bg-sky-500 hover:text-white focus-visible:bg-sky-500 focus-visible:text-white"
      onClick={onSelect}
    >
      {label}
    </button>
  );
}
