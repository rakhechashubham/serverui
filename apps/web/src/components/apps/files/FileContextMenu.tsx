"use client";

import type { FileEntry } from "@/src/lib/api/files";

type FileContextMenuProps = {
  x: number;
  y: number;
  entry: FileEntry | null;
  onOpen: () => void;
  onDownload?: () => void;
  onCopyPath: () => void;
  onInfo: () => void;
  onTerminalHere: () => void;
  onClose: () => void;
};

export function FileContextMenu({
  x,
  y,
  entry,
  onOpen,
  onDownload,
  onCopyPath,
  onInfo,
  onTerminalHere,
  onClose,
}: FileContextMenuProps) {
  const isDir = !entry || entry.type === "dir";

  return (
    <div
      role="menu"
      aria-label="File actions"
      className="sui-menu fixed z-[80] min-w-48 overflow-hidden rounded-xl border py-1 text-sm shadow-2xl animate-menu-in backdrop-blur-xl"
      style={{ left: x, top: y }}
    >
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
      <div className="my-1 h-px bg-black/8" />
      <MenuItem
        label="Copy Path"
        onSelect={() => {
          onCopyPath();
          onClose();
        }}
      />
      <MenuItem
        label={isDir ? "Folder Information" : "File Information"}
        onSelect={() => {
          onInfo();
          onClose();
        }}
      />
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
