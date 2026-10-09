"use client";

import type { CSSProperties } from "react";
import { isArchive, type FileEntry } from "@/src/lib/api/files";
import { PageLayer } from "@/src/components/window/window-chrome";

export type FileMenuActions = {
  onOpen: () => void;
  onTerminalHere: () => void;
  onCopyPath: () => void;
  onInfo: () => void;
  onDownload: () => void;
  onRename: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onCompress: () => void;
  onExtractHere: () => void;
  onExtractTo: () => void;
  onNewFolder: () => void;
  onNewFile: () => void;
  onUpload: () => void;
};

type FileContextMenuProps = FileMenuActions & {
  x: number;
  y: number;
  entry: FileEntry | null;
  selectedEntries?: FileEntry[];
  canPaste: boolean;
  /** Only given when VS Code is installed on the server; without it the item is hidden. */
  onEditWithCode?: () => void;
  /** True while an extraction runs in this window; Extract items are disabled. */
  extracting?: boolean;
  onClose: () => void;
};

export type MenuAction = {
  label: string;
  run: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

export type MenuEntry = MenuAction | "separator";

export function menuItems({
  entry,
  selectedEntries = [],
  canPaste,
  extracting = false,
  ...a
}: Omit<FileContextMenuProps, "x" | "y" | "onClose">): MenuEntry[] {
  if (!entry) {
    return [
      { label: "Open Terminal", run: a.onTerminalHere },
      ...(a.onEditWithCode ? [{ label: "Open Folder in VS Code", run: a.onEditWithCode }] : []),
      { label: "Paste", run: a.onPaste, disabled: !canPaste },
      "separator",
      { label: "New Folder", run: a.onNewFolder },
      { label: "New File", run: a.onNewFile },
      { label: "Upload…", run: a.onUpload },
    ];
  }

  if (selectedEntries.length > 1) {
    const onlyFiles = selectedEntries.every((item) => item.type === "file");
    const n = selectedEntries.length;
    return [
      { label: `Copy (${n} items)`, run: a.onCopy },
      { label: `Cut (${n} items)`, run: a.onCut },
      { label: `Delete (${n} items)`, run: a.onDelete },
      "separator",
      { label: `Compress (${n} items)`, run: a.onCompress },
      ...(onlyFiles ? [{ label: `Download (${n} items)`, run: a.onDownload }] : []),
    ];
  }

  const dir = entry.type === "dir";
  const archive = isArchive(entry);
  return [
    { label: "Open", run: a.onOpen },
    ...(dir ? [{ label: "Open Terminal", run: a.onTerminalHere }] : []),
    ...(a.onEditWithCode
      ? [{ label: dir ? "Open in VS Code" : "Edit with Code", run: a.onEditWithCode }]
      : []),
    { label: "Copy Path", run: a.onCopyPath },
    { label: "Details", run: a.onInfo },
    ...(dir ? [] : [{ label: "Download", run: a.onDownload }]),
    "separator",
    { label: "Rename", run: a.onRename },
    { label: "Delete", run: a.onDelete },
    "separator",
    { label: "Copy", run: a.onCopy },
    { label: "Cut", run: a.onCut },
    ...(archive
      ? [
          { label: "Extract Here", run: a.onExtractHere, disabled: extracting },
          { label: "Extract To…", run: a.onExtractTo, disabled: extracting },
        ]
      : [{ label: "Compress", run: a.onCompress }]),
  ];
}

export function FileContextMenu({ x, y, onClose, ...props }: FileContextMenuProps) {
  return (
    <PageLayer>
      <MenuList
        label="File actions"
        actions={menuItems(props)}
        onClose={onClose}
        className="fixed"
        style={{ left: x, top: y }}
      />
    </PageLayer>
  );
}

/** macOS-style menu body shared by the context menu and the toolbar's more menu. */
export function MenuList({
  label,
  actions,
  onClose,
  className = "",
  style,
}: {
  label: string;
  actions: MenuEntry[];
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      role="menu"
      aria-label={label}
      className={`sui-menu z-[80] min-w-52 overflow-hidden rounded-[10px] border p-1 text-[13px] shadow-2xl animate-menu-in backdrop-blur-xl ${className}`}
      style={style}
    >
      {actions.map((item, index) =>
        item === "separator" ? (
          <div key={`separator-${index}`} className="mx-2 my-1 h-px bg-black/10 dark:bg-white/10" />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={`block w-full rounded-[5px] px-2.5 py-[3px] text-left outline-none enabled:hover:bg-[var(--finder-accent)] enabled:hover:text-white focus-visible:bg-[var(--finder-accent)] focus-visible:text-white disabled:opacity-40 ${
              item.destructive ? "text-red-500" : ""
            }`}
            onClick={() => {
              item.run();
              onClose();
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
