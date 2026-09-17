"use client";

import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { APP_META } from "@/src/data/apps";
import { WINDOW_MIN_HEIGHT, WINDOW_MIN_WIDTH } from "@/src/lib/desktop";
import { WindowHeader } from "@/src/components/window/WindowHeader";
import { useServer } from "@/src/lib/api/server-context";
import { useSelectedServer } from "@/src/lib/session";
import { useTheme } from "@/src/lib/theme";
import { useWindowManager, type WindowState } from "@/src/components/window/window-context";

type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const EDGES: ResizeEdge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

export function Window({ window: win, children }: { window: WindowState; children: ReactNode }) {
  const {
    focusedId,
    focusWindow,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    restoreWindow,
    updateWindowPosition,
    updateWindowSize,
  } = useWindowManager();
  const { server } = useServer();
  const selected = useSelectedServer();
  const { theme } = useTheme();
  const drag = useRef<{
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const resize = useRef<{
    edge: ResizeEdge;
    startX: number;
    startY: number;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const focused = focusedId === win.id;
  const chrome = win.chrome ?? APP_META[win.app].chrome;
  const light = chrome === "light" && theme === "light";
  const title =
    win.app === "terminal"
      ? `Terminal — ${selected?.hostname || selected?.address || server?.hostname || server?.host || "server"}`
      : win.title;

  function onHeaderPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    focusWindow(win.id);
    if (win.maximized) return;

    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    drag.current = {
      offsetX: event.clientX - win.x,
      offsetY: event.clientY - win.y,
    };

    function onMove(moveEvent: PointerEvent) {
      if (!drag.current) return;
      updateWindowPosition(
        win.id,
        moveEvent.clientX - drag.current.offsetX,
        moveEvent.clientY - drag.current.offsetY,
      );
    }

    function onUp() {
      drag.current = null;
      target.releasePointerCapture(event.pointerId);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
    }

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }

  function onResizePointerDown(event: ReactPointerEvent<HTMLDivElement>, edge: ResizeEdge) {
    if (event.button !== 0 || win.maximized) return;
    event.stopPropagation();
    focusWindow(win.id);
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    resize.current = {
      edge,
      startX: event.clientX,
      startY: event.clientY,
      x: win.x,
      y: win.y,
      width: win.width,
      height: win.height,
    };

    function onMove(moveEvent: PointerEvent) {
      const current = resize.current;
      if (!current) return;
      const dx = moveEvent.clientX - current.startX;
      const dy = moveEvent.clientY - current.startY;
      let { x, y, width, height } = current;

      if (current.edge.includes("e")) width = current.width + dx;
      if (current.edge.includes("s")) height = current.height + dy;
      if (current.edge.includes("w")) {
        width = current.width - dx;
        x = current.x + dx;
        if (width < WINDOW_MIN_WIDTH) {
          x = current.x + current.width - WINDOW_MIN_WIDTH;
          width = WINDOW_MIN_WIDTH;
        }
      }
      if (current.edge.includes("n")) {
        height = current.height - dy;
        y = current.y + dy;
        if (height < WINDOW_MIN_HEIGHT) {
          y = current.y + current.height - WINDOW_MIN_HEIGHT;
          height = WINDOW_MIN_HEIGHT;
        }
      }

      updateWindowSize(win.id, width, height, x, y);
    }

    function onUp() {
      resize.current = null;
      target.releasePointerCapture(event.pointerId);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
    }

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }

  return (
    <article
      role="dialog"
      aria-label={title}
      aria-modal="false"
      className={`absolute flex flex-col overflow-hidden ${
        win.maximized
          ? "inset-0 h-full w-full rounded-none border-0 shadow-none"
          : `rounded-[12px] shadow-[0_24px_80px_rgba(0,0,0,0.35)] animate-window-in ${
              light
                ? "border border-white/70 bg-[var(--window-bg)]"
                : "border border-white/10 bg-[#161616]"
            } ${focused ? "ring-1 ring-black/10" : "opacity-95"}`
      } ${win.maximized ? (light ? "bg-[var(--window-bg)]" : "bg-[#161616]") : ""}`}
      style={
        win.maximized
          ? { zIndex: win.zIndex }
          : {
              left: win.x,
              top: win.y,
              width: win.width,
              height: win.height,
              zIndex: win.zIndex,
            }
      }
      onPointerDown={() => focusWindow(win.id)}
    >
      <WindowHeader
        title={title}
        focused={focused}
        chrome={light ? "light" : "dark"}
        maximized={win.maximized}
        onPointerDown={onHeaderPointerDown}
        onDoubleClick={() => (win.maximized ? restoreWindow(win.id) : maximizeWindow(win.id))}
        onMinimize={() => minimizeWindow(win.id)}
        onMaximize={() => (win.maximized ? restoreWindow(win.id) : maximizeWindow(win.id))}
        onClose={() => closeWindow(win.id)}
      />
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      {!win.maximized
        ? EDGES.map((edge) => (
            <div
              key={edge}
              role="separator"
              aria-label={`Resize ${title} ${edge}`}
              className={resizeHandleClass(edge)}
              onPointerDown={(event) => onResizePointerDown(event, edge)}
            >
              <span className="sr-only">{`Resize ${title} ${edge}`}</span>
            </div>
          ))
        : null}
    </article>
  );
}

function resizeHandleClass(edge: ResizeEdge) {
  const base = "absolute z-20";
  switch (edge) {
    case "n":
      return `${base} inset-x-3 top-0 h-1.5 cursor-n-resize`;
    case "s":
      return `${base} inset-x-3 bottom-0 h-1.5 cursor-s-resize`;
    case "e":
      return `${base} inset-y-3 right-0 w-1.5 cursor-e-resize`;
    case "w":
      return `${base} inset-y-3 left-0 w-1.5 cursor-w-resize`;
    case "ne":
      return `${base} right-0 top-0 size-3 cursor-ne-resize`;
    case "nw":
      return `${base} left-0 top-0 size-3 cursor-nw-resize`;
    case "se":
      return `${base} bottom-0 right-0 size-3 cursor-se-resize`;
    case "sw":
      return `${base} bottom-0 left-0 size-3 cursor-sw-resize`;
  }
}
