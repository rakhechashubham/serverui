"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Server } from "lucide-react";
import { ThemeToggle } from "@/src/components/desktop/ThemeToggle";
import { BrandMark } from "@/src/components/brand/BrandMark";
import { ServerIcon } from "@/src/components/servers/ServerIcon";
import { useWindowManager } from "@/src/components/window/window-context";
import { connectionStatus } from "@/src/lib/servers";
import { useSession } from "@/src/lib/session";

function statusLabel(status: string) {
  switch (status) {
    case "online":
      return "Connected";
    case "connecting":
      return "Connecting";
    case "reconnecting":
      return "Reconnecting";
    case "authentication_failed":
      return "Auth failed";
    case "error":
      return "Error";
    default:
      return "Disconnected";
  }
}

export function TopBar() {
  const { servers } = useSession();
  const { openWindow } = useWindowManager();
  const [time, setTime] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const connected = servers.filter((item) => item.connected).length;

  useEffect(() => {
    const tick = () => setTime(formatTime(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    function onPointer(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    function onToggle(event: Event) {
      event.preventDefault();
      setMenuOpen((open) => !open);
    }
    window.addEventListener("serverui:toggle-server-menu", onToggle);
    return () => window.removeEventListener("serverui:toggle-server-menu", onToggle);
  }, []);

  return (
    <header
      className="relative z-50 flex h-8 items-center justify-between gap-4 px-3 text-[13px] backdrop-blur-xl"
      style={{ background: "var(--topbar-bg)", color: "var(--topbar-fg)" }}
    >
      <span className="shrink-0">
        <BrandMark
          size={16}
          withWordmark
          wordmarkClassName="text-[13px] font-semibold tracking-tight"
        />
      </span>
      <div className="flex min-w-0 items-center justify-end gap-3 overflow-visible whitespace-nowrap text-[12px]">
        <div className="relative flex min-w-0 items-center gap-1.5" ref={menuRef}>
          <span
            className={`size-1.5 shrink-0 rounded-full ${
              connected > 0 ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" : "bg-zinc-400"
            }`}
            aria-hidden
          />
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex min-w-0 max-w-[220px] items-center gap-1 rounded-full px-1.5 py-0.5 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Open server menu"
            data-tour="server-switcher"
          >
            <span className="truncate font-medium">
              {servers.length === 0 ? "No servers" : `${connected} connected`}
            </span>
            <ChevronDown className="size-3 opacity-70" aria-hidden />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              aria-label="Server menu"
              className="sui-menu absolute right-0 top-[calc(100%+6px)] z-[80] w-[260px] overflow-hidden rounded-2xl border py-1 text-left shadow-[0_18px_50px_rgba(0,0,0,0.45)]"
            >
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                Servers
              </p>
              {servers.length === 0 ? (
                <p className="px-3 py-2 text-[12px] text-white/60">No servers configured.</p>
              ) : (
                servers.map((item) => {
                  const status = connectionStatus(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        openWindow("servers");
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-white/90 hover:bg-white/8"
                    >
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${
                          status === "online"
                            ? "bg-emerald-400"
                            : status === "connecting" || status === "reconnecting"
                              ? "bg-amber-300"
                              : status === "authentication_failed" || status === "error"
                                ? "bg-red-400"
                                : "bg-zinc-400"
                        }`}
                        aria-hidden
                      />
                      <ServerIcon
                        iconId={item.iconId}
                        customIcon={item.customIcon}
                        serverId={item.id}
                        updatedAt={item.updatedAt}
                        size={16}
                      />
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      <span className="shrink-0 text-white/45">{statusLabel(status)}</span>
                    </button>
                  );
                })
              )}
              <div className="my-1 h-px bg-white/8" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openWindow("servers");
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-white/90 hover:bg-white/8"
              >
                <Server aria-hidden className="size-3.5 opacity-80" />
                Manage servers
              </button>
            </div>
          ) : null}
        </div>
        <ThemeToggle />
        <time className="w-12 shrink-0 text-right" dateTime={time || undefined}>
          {time}
        </time>
      </div>
    </header>
  );
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
