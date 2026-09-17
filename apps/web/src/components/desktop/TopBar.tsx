"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { ThemeToggle } from "@/src/components/desktop/ThemeToggle";
import { useServer } from "@/src/lib/api/server-context";
import { useSelectedServer, useSession } from "@/src/lib/session";

function statusLabel(status: string | undefined, loading: boolean) {
  if (loading && !status) return "Connecting";
  switch (status) {
    case "online":
      return "Online";
    case "connecting":
      return "Connecting";
    case "authentication_failed":
      return "Auth failed";
    case "error":
      return "Error";
    default:
      return "Offline";
  }
}

function metric(value: number | undefined, loading: boolean, ready: boolean) {
  if (loading && !ready) return "—";
  if (typeof value !== "number") return "—";
  return `${Math.round(value)}%`;
}

export function TopBar() {
  const selected = useSelectedServer();
  const { logOut } = useSession();
  const { server, loading, error } = useServer();
  const [time, setTime] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const online = server?.status === "online";
  const ready = Boolean(server);
  const name = selected?.name || server?.name || "Server";

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
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, []);

  return (
    <header
      className="relative z-50 flex h-8 items-center justify-between gap-4 px-3 text-[13px] backdrop-blur-xl"
      style={{ background: "var(--topbar-bg)", color: "var(--topbar-fg)" }}
    >
      <span className="shrink-0 font-semibold tracking-tight">ServerUI</span>
      <div className="flex min-w-0 items-center justify-end gap-3 overflow-visible whitespace-nowrap text-[12px]">
        <div
          className="relative flex min-w-0 items-center gap-1.5"
          ref={menuRef}
          title={error || undefined}
        >
          <span
            className={`size-1.5 shrink-0 rounded-full ${
              online
                ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
                : loading && !ready
                  ? "bg-amber-300"
                  : "bg-red-400"
            }`}
          />
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex min-w-0 max-w-[180px] items-center gap-1 rounded-full px-1.5 py-0.5 outline-none hover:bg-white/10"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="truncate font-medium">{name}</span>
            <ChevronDown className="size-3 opacity-70" aria-hidden />
          </button>
          <span className="sui-muted">{statusLabel(server?.status, loading)}</span>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+6px)] z-[80] w-[200px] overflow-hidden rounded-2xl border border-white/12 bg-[#16181d]/95 py-1 text-left shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  logOut();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-white/90 hover:bg-white/8"
              >
                <LogOut aria-hidden className="size-3.5 opacity-80" />
                Log Out
              </button>
            </div>
          ) : null}
        </div>
        <span className="shrink-0 font-medium">
          CPU {metric(server?.cpuUsage, loading, ready && online)}
        </span>
        <span className="shrink-0 font-medium">
          RAM {metric(server?.memoryUsage, loading, ready && online)}
        </span>
        <span className="shrink-0 font-medium">
          Disk {metric(server?.diskUsage, loading, ready && online)}
        </span>
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
