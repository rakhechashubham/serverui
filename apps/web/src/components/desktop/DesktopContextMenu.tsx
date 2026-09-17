"use client";

import { useWindowManager } from "@/src/components/window/window-context";

type DesktopContextMenuProps = {
  x: number;
  y: number;
  onClose: () => void;
  onComingSoon: () => void;
  onLogOut: () => void;
};

export function DesktopContextMenu({
  x,
  y,
  onClose,
  onComingSoon,
  onLogOut,
}: DesktopContextMenuProps) {
  const { openWindow } = useWindowManager();

  return (
    <div
      role="menu"
      aria-label="Desktop"
      className="sui-menu absolute z-[80] min-w-48 overflow-hidden rounded-xl border py-1 text-sm shadow-2xl animate-menu-in backdrop-blur-xl"
      style={{ left: x, top: y }}
    >
      <MenuItem
        label="Refresh"
        onSelect={() => {
          onClose();
        }}
      />
      <div className="my-1 h-px bg-black/8" />
      <MenuItem
        label="Open Terminal"
        onSelect={() => {
          openWindow("terminal");
          onClose();
        }}
      />
      <MenuItem
        label="Open Files"
        onSelect={() => {
          openWindow("files");
          onClose();
        }}
      />
      <div className="my-1 h-px bg-black/8" />
      <MenuItem
        label="About ServerUI"
        onSelect={() => {
          openWindow("about");
          onClose();
        }}
      />
      <MenuItem
        label="Server Information"
        onSelect={() => {
          onComingSoon();
          onClose();
        }}
      />
      <div className="my-1 h-px bg-black/8" />
      <MenuItem
        label="Log Out"
        onSelect={() => {
          onLogOut();
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
