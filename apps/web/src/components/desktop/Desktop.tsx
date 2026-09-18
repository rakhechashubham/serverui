"use client";

import { useEffect, useState, type MouseEvent, type PointerEvent } from "react";
import { ServerProvider } from "@/src/lib/api/server-context";
import { isDesktopRuntime } from "@/src/lib/runtime";
import { useSession } from "@/src/lib/session";
import { DesktopContextMenu } from "@/src/components/desktop/DesktopContextMenu";
import { Dock } from "@/src/components/desktop/Dock";
import { TopBar } from "@/src/components/desktop/TopBar";
import { WindowManager } from "@/src/components/window/WindowManager";
import { WindowManagerProvider, useWindowManager } from "@/src/components/window/window-context";

export function Desktop() {
  const { selectedServer } = useSession();
  return (
    <ServerProvider serverId={selectedServer?.id || ""}>
      <WindowManagerProvider>
        <DesktopShell />
      </WindowManagerProvider>
    </ServerProvider>
  );
}

function DesktopShell() {
  const { logOut } = useSession();
  const { clearFocus, windows, focusedId, closeWindow, openWindow } = useWindowManager();
  const fullscreen = windows.some((item) => item.maximized && !item.minimized);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [notice, setNotice] = useState(false);
  const desktopRuntime = isDesktopRuntime();

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(false), 1600);
    return () => window.clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      if (target.closest(".xterm") || target.closest(".xterm-helper-textarea")) return true;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
    }

    function onKey(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;
      if (event.key === "Escape") {
        setMenu(null);
        clearFocus();
        return;
      }
      if (!meta) return;
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        window.dispatchEvent(new Event("serverui:toggle-server-menu"));
        return;
      }
      if (event.key.toLowerCase() === ",") {
        event.preventDefault();
        openWindow("settings");
        return;
      }
      if (event.key.toLowerCase() === "w") {
        if (isTypingTarget(event.target)) return;
        if (!focusedId) return;
        event.preventDefault();
        closeWindow(focusedId);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearFocus, closeWindow, focusedId, openWindow]);

  function showComingSoon() {
    setNotice(true);
  }

  function isChrome(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(
      target.closest('[role="dialog"]') ||
      target.closest('[role="menu"]') ||
      target.closest("nav[aria-label='Applications']") ||
      target.closest("header"),
    );
  }

  function onContextMenu(event: MouseEvent<HTMLElement>) {
    if (isChrome(event.target)) return;
    event.preventDefault();
    const width = 210;
    const height = 248;
    const x = Math.min(event.clientX, window.innerWidth - width - 8);
    const y = Math.min(event.clientY, window.innerHeight - height - 8);
    setMenu({ x: Math.max(8, x), y: Math.max(40, y) });
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    const chrome = isChrome(event.target);
    if (!chrome) {
      clearFocus();
    }
    if (!(event.target instanceof HTMLElement && event.target.closest('[role="menu"]'))) {
      setMenu(null);
    }
  }

  return (
    <div
      className="relative h-dvh w-full overflow-hidden bg-background text-foreground"
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/wallpaper.jpg?v=luffy')" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--desktop-scrim)" }}
      />
      <TopBar />
      <p className="pointer-events-none absolute left-6 top-12 z-10 text-white drop-shadow-md">
        <span className="block text-[28px] font-semibold leading-none tracking-tight">
          ServerUI
        </span>
        <span className="mt-2 block text-[13px] leading-5 text-white/85">
          Your servers.
          <br />
          {desktopRuntime ? "On your desktop." : "In your browser."}
        </span>
      </p>
      <p className="pointer-events-none absolute bottom-28 left-6 z-10 max-w-[9rem] text-[13px] leading-5 text-white/80 drop-shadow">
        Control
        <br />
        Deploy
        <br />
        Monitor
        <br />
        {desktopRuntime ? "Locally." : "From anywhere."}
      </p>
      <div
        className={`absolute inset-x-0 top-8 bottom-0 ${fullscreen ? "z-40" : "z-20"}`}
        aria-label="Server desktop"
        role="application"
      >
        <WindowManager />
      </div>
      {fullscreen ? null : <Dock onComingSoon={showComingSoon} />}
      {menu ? (
        <DesktopContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onComingSoon={showComingSoon}
          onLogOut={logOut}
        />
      ) : null}
      {notice ? (
        <div
          role="status"
          className="absolute left-1/2 top-12 z-[90] -translate-x-1/2 rounded-full bg-black/55 px-4 py-1.5 text-sm text-white shadow-lg animate-menu-in backdrop-blur-md"
        >
          Coming soon
        </div>
      ) : null}
    </div>
  );
}
