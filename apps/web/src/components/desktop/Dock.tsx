"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { APP_META, visibleDockOrder, type DockAppId } from "@/src/data/apps";
import { DOCK_GLYPHS } from "@/src/components/desktop/dock-icons";
import { useWindowManager } from "@/src/components/window/window-context";
import { formatDockBadge, useDockActivity } from "@/src/lib/dock-activity";
import { registerDockIcon } from "@/src/lib/dock-geometry";
import {
  DOCK_GAP,
  DOCK_GAP_COMPACT,
  DOCK_PAD_X,
  DOCK_PAD_Y,
  dockHitTest,
  dockIconSize,
  dockIconShift,
  dockLayout,
  dockLiftSlop,
  dockOverflowSlop,
  scaleForDistance,
  slotOrigin,
} from "@/src/lib/dock-magnify";
import { useDockPrefs } from "@/src/lib/dock-prefs";

type DockProps = {
  onComingSoon?: () => void;
  autoHideOverride?: boolean;
};

type DockItemId = DockAppId | "info";

const COMPACT_QUERY = "(max-width: 720px)";
const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function Dock({ autoHideOverride = false }: DockProps) {
  const { windows, focusedId, toggleDockApp } = useWindowManager();
  const { hideMode, order, setOrder } = useDockPrefs();
  const activity = useDockActivity();
  const visibleOrder = useMemo(() => visibleDockOrder(order), [order]);
  const items = useMemo<DockItemId[]>(() => [...visibleOrder, "info"], [visibleOrder]);

  const [compact, setCompact] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [revealed, setRevealed] = useState(true);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const shellRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const motionRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const mouseX = useRef<number | null>(null);
  const scales = useRef<number[]>([]);
  const raf = useRef<number>(0);
  const bounceTimers = useRef<number[]>([]);
  const drag = useRef<{
    id: DockItemId;
    startX: number;
    from: number;
    active: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const hovering = useRef(false);

  const autoHide = hideMode === "auto" || autoHideOverride;
  const iconSize = dockIconSize(compact);
  const shown = !autoHide || revealed;
  const scheduleMagnifyRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const compactMq = window.matchMedia(COMPACT_QUERY);
    const motionMq = window.matchMedia(MOTION_QUERY);
    const sync = () => {
      setCompact(compactMq.matches);
      setReducedMotion(motionMq.matches);
    };
    sync();
    compactMq.addEventListener("change", sync);
    motionMq.addEventListener("change", sync);
    return () => {
      compactMq.removeEventListener("change", sync);
      motionMq.removeEventListener("change", sync);
    };
  }, []);

  const applyMagnify = useCallback(() => {
    raf.current = 0;
    const buttons = slotRefs.current;
    const motions = motionRefs.current;
    const count = items.length;
    if (!count) return;

    const gap = compact ? DOCK_GAP_COMPACT : DOCK_GAP;
    const padX = compact ? DOCK_PAD_X - 4 : DOCK_PAD_X;
    const next: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const button = buttons[i];
      if (!button || mouseX.current == null || reducedMotion || compact || drag.current?.active) {
        next[i] = 1;
        continue;
      }
      const rect = button.getBoundingClientRect();
      next[i] = scaleForDistance(mouseX.current - (rect.left + rect.width / 2), {
        compact,
        reducedMotion,
      });
    }

    const current = scales.current;
    const smoothing = reducedMotion || compact ? 1 : 0.38;
    let dirty = false;
    for (let i = 0; i < count; i += 1) {
      const target = next[i] ?? 1;
      const prev = current[i] ?? 1;
      const value = prev + (target - prev) * smoothing;
      if (Math.abs(value - prev) > 0.001 || Math.abs(value - 1) > 0.001) dirty = true;
      current[i] = Math.abs(value - 1) < 0.004 ? 1 : value;
    }

    const layout = dockLayout(current, iconSize, gap);
    const base = count * iconSize + Math.max(0, count - 1) * gap;
    const extra = Math.max(0, layout.total - base);
    const track = trackRef.current;
    if (track) {
      track.style.paddingLeft = `${padX + extra / 2}px`;
      track.style.paddingRight = `${padX + extra / 2}px`;
    }

    let hover = -1;
    let hoverScale = 1;
    for (let i = 0; i < count; i += 1) {
      const motion = motions[i];
      if (!motion) continue;
      const origin = slotOrigin(i, count, iconSize, gap);
      const dx = dockIconShift(layout.centers[i]!, layout.total, origin);
      const scale = current[i] ?? 1;
      const lift = layout.lifts[i] ?? 0;
      motion.style.setProperty("--dock-scale", String(scale));
      motion.style.transform = `translateX(${dx}px)`;
      const liftNode = motion.querySelector<HTMLElement>(".sui-dock-lift");
      if (liftNode) liftNode.style.transform = `translateY(${-lift}px)`;
      if (scale > hoverScale) {
        hoverScale = scale;
        hover = i;
      }
    }

    const tooltip = tooltipRef.current;
    if (tooltip) {
      if (hover >= 0 && mouseX.current != null && hoverScale > 1.04) {
        const id = items[hover]!;
        tooltip.textContent = id === "info" ? "Info" : APP_META[id].title;
        tooltip.dataset.show = "true";
        const center = layout.centers[hover]! - layout.total / 2;
        tooltip.style.setProperty("--dock-tooltip-x", `${center}px`);
        // Float above the magnified icon (it grows upward and lifts), as on macOS.
        const rise = (layout.lifts[hover] ?? 0) + (hoverScale - 1) * iconSize;
        tooltip.style.setProperty("--dock-tooltip-y", `${-rise}px`);
      } else {
        tooltip.dataset.show = "false";
      }
    }

    if (dirty) {
      scheduleMagnifyRef.current();
    }
  }, [compact, iconSize, items, reducedMotion]);

  const cancelMagnifyFrame = useCallback(() => {
    if (!raf.current) return;
    window.cancelAnimationFrame(raf.current);
    raf.current = 0;
  }, []);

  const scheduleMagnify = useCallback(() => {
    if (raf.current) return;
    raf.current = window.requestAnimationFrame(applyMagnify);
  }, [applyMagnify]);

  useEffect(() => {
    scheduleMagnifyRef.current = scheduleMagnify;
  }, [scheduleMagnify]);

  useEffect(() => {
    if (scales.current.length !== items.length) {
      scales.current = items.map((_, index) => scales.current[index] ?? 1);
    }
    scheduleMagnify();
    return cancelMagnifyFrame;
  }, [cancelMagnifyFrame, items, scheduleMagnify]);

  useEffect(() => {
    return () => {
      cancelMagnifyFrame();
      bounceTimers.current.forEach((id) => window.clearTimeout(id));
    };
  }, [cancelMagnifyFrame]);

  useEffect(() => {
    if (compact || reducedMotion) return undefined;

    function overDock(event: PointerEvent) {
      const track = trackRef.current;
      if (!track) return false;
      const target = event.target;
      if (target instanceof Node && track.contains(target)) return true;
      return dockHitTest(
        event.clientX,
        event.clientY,
        track.getBoundingClientRect(),
        dockOverflowSlop(iconSize),
        dockLiftSlop(iconSize),
      );
    }

    function onWindowPointerMove(event: PointerEvent) {
      if (drag.current?.active) return;
      if (!overDock(event)) {
        if (mouseX.current == null) return;
        hovering.current = false;
        mouseX.current = null;
        if (tooltipRef.current) tooltipRef.current.dataset.show = "false";
        scheduleMagnify();
        return;
      }
      hovering.current = true;
      mouseX.current = event.clientX;
      scheduleMagnify();
    }

    window.addEventListener("pointermove", onWindowPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", onWindowPointerMove);
  }, [compact, iconSize, reducedMotion, scheduleMagnify]);

  useEffect(() => {
    if (!autoHide) return undefined;

    function onMove(event: PointerEvent) {
      const shell = shellRef.current;
      const nearBottom = event.clientY >= window.innerHeight - 22;
      const overDock = Boolean(shell && shell.contains(event.target as Node));
      setRevealed(nearBottom || overDock || hovering.current);
    }

    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [autoHide]);

  function bounce(index: number) {
    const motion = motionRefs.current[index];
    const lift = motion?.querySelector(".sui-dock-lift");
    if (!lift || reducedMotion) return;
    lift.classList.remove("sui-dock-bounce");
    void (lift as HTMLElement).offsetWidth;
    lift.classList.add("sui-dock-bounce");
    const timer = window.setTimeout(() => lift.classList.remove("sui-dock-bounce"), 420);
    bounceTimers.current.push(timer);
  }

  useEffect(() => {
    function onGenie(event: Event) {
      const app = (event as CustomEvent<{ app?: string }>).detail?.app;
      if (!app) return;
      const id = app === "about" ? "info" : app;
      const index = items.findIndex((item) => item === id);
      if (index < 0) return;
      const motion = motionRefs.current[index];
      const lift = motion?.querySelector(".sui-dock-lift");
      if (!lift || reducedMotion) return;
      lift.classList.remove("sui-dock-bounce");
      void (lift as HTMLElement).offsetWidth;
      lift.classList.add("sui-dock-bounce");
      const timer = window.setTimeout(() => lift.classList.remove("sui-dock-bounce"), 420);
      bounceTimers.current.push(timer);
    }
    window.addEventListener("serverui:dock-genie", onGenie);
    return () => window.removeEventListener("serverui:dock-genie", onGenie);
  }, [items, reducedMotion]);

  function onSelect(id: DockItemId, index: number) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    bounce(index);
    if (id === "info") {
      toggleDockApp("about");
      return;
    }
    toggleDockApp(id);
  }

  function onTrackEnter(event: ReactPointerEvent<HTMLDivElement>) {
    hovering.current = true;
    setRevealed(true);
    if (compact || reducedMotion || drag.current?.active) return;
    mouseX.current = event.clientX;
    scheduleMagnify();
  }

  function onTrackMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (compact || reducedMotion || drag.current?.active) return;
    mouseX.current = event.clientX;
    scheduleMagnify();
  }

  function onTrackLeave(event: ReactPointerEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && trackRef.current?.contains(next)) return;
    const track = trackRef.current;
    if (
      track &&
      dockHitTest(
        event.clientX,
        event.clientY,
        track.getBoundingClientRect(),
        dockOverflowSlop(iconSize),
        dockLiftSlop(iconSize),
      )
    ) {
      return;
    }
    hovering.current = false;
    mouseX.current = null;
    if (tooltipRef.current) tooltipRef.current.dataset.show = "false";
    scheduleMagnify();
  }

  function onItemPointerDown(event: ReactPointerEvent<HTMLButtonElement>, index: number) {
    if (event.button !== 0) return;
    const id = items[index];
    if (id === "info") return;
    drag.current = { id, startX: event.clientX, from: index, active: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onItemPointerMove(event: ReactPointerEvent<HTMLButtonElement>, index: number) {
    const current = drag.current;
    if (!current || current.id !== items[index]) return;
    if (!current.active && Math.abs(event.clientX - current.startX) > 8) {
      current.active = true;
      mouseX.current = null;
      scheduleMagnify();
    }
    if (!current.active) return;
    const over = slotRefs.current.findIndex((node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right;
    });
    if (over < 0 || over === current.from || items[over] === "info") return;
    const nextVisible = [...visibleOrder];
    const [moved] = nextVisible.splice(current.from, 1);
    if (!moved) return;
    nextVisible.splice(Math.min(over, nextVisible.length), 0, moved);
    current.from = nextVisible.indexOf(moved);
    const hidden = order.filter((id) => !nextVisible.includes(id));
    setOrder([...nextVisible, ...hidden]);
  }

  function onItemPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (current?.active) suppressClick.current = true;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  }

  function onDockKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    const last = items.length - 1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      const next = Math.min(last, focusedIndex + 1);
      setFocusedIndex(next);
      slotRefs.current[next]?.focus();
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = Math.max(0, focusedIndex - 1);
      setFocusedIndex(next);
      slotRefs.current[next]?.focus();
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setFocusedIndex(0);
      slotRefs.current[0]?.focus();
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setFocusedIndex(last);
      slotRefs.current[last]?.focus();
      return;
    }
    if (event.key === "Escape") {
      (event.currentTarget as HTMLElement).blur();
      slotRefs.current[focusedIndex]?.blur();
    }
  }

  return (
    <nav
      ref={shellRef}
      aria-label="Applications"
      className={`pointer-events-none absolute inset-x-0 bottom-0 z-60 flex justify-center ${
        autoHide ? "h-16" : ""
      }`}
      onKeyDown={onDockKeyDown}
    >
      {autoHide ? (
        <div
          aria-hidden
          className="pointer-events-auto absolute inset-x-0 bottom-0 h-3"
          onPointerEnter={() => setRevealed(true)}
        />
      ) : null}
      <div
        className={`pointer-events-auto mb-1 flex max-w-[calc(100vw-16px)] justify-center px-2 transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          autoHide && !shown
            ? "translate-y-[calc(100%+10px)] opacity-0"
            : "translate-y-0 opacity-100"
        } ${reducedMotion ? "duration-0" : ""}`}
      >
        <div
          ref={trackRef}
          className={`sui-dock relative flex items-end ${compact ? "overflow-x-auto" : "overflow-visible"}`}
          style={{
            gap: compact ? DOCK_GAP_COMPACT : DOCK_GAP,
            padding: compact
              ? `${DOCK_PAD_Y - 2}px ${DOCK_PAD_X - 4}px ${DOCK_PAD_Y - 3}px`
              : `${DOCK_PAD_Y}px ${DOCK_PAD_X}px ${DOCK_PAD_Y - 2}px`,
          }}
          onPointerEnter={onTrackEnter}
          onPointerMove={onTrackMove}
          onPointerLeave={onTrackLeave}
        >
          {items.map((id, index) => {
            const appWindows =
              id === "info"
                ? windows.filter((item) => item.app === "about")
                : windows.filter((item) => item.app === id);
            const open = appWindows.length > 0;
            const focused = appWindows.some((item) => item.id === focusedId && !item.minimized);
            const label = id === "info" ? "Info" : APP_META[id].title;
            const Glyph = id === "info" ? DOCK_GLYPHS.info : DOCK_GLYPHS[id];
            const badge = id === "info" ? 0 : (activity.badges[id] ?? 0);
            const badgeLabel = formatDockBadge(badge);

            // Tour attributes for first-run experience
            const tourAttrs =
              id === "terminal"
                ? { "data-tour": "dock-terminal" }
                : id === "files"
                ? { "data-tour": "dock-files" }
                : id === "monitor"
                ? { "data-tour": "dock-monitor" }
                : {};

            return (
              <button
                key={id}
                type="button"
                ref={(node) => {
                  slotRefs.current[index] = node;
                }}
                aria-label={label}
                aria-pressed={open}
                aria-current={focused ? "true" : undefined}
                tabIndex={focusedIndex === index ? 0 : -1}
                className="sui-dock-slot group relative outline-none"
                style={{ width: iconSize, height: iconSize + 6 }}
                onClick={() => onSelect(id, index)}
                onFocus={() => setFocusedIndex(index)}
                onPointerDown={(event) => onItemPointerDown(event, index)}
                onPointerMove={(event) => onItemPointerMove(event, index)}
                onPointerUp={(event) => onItemPointerUp(event)}
                onPointerCancel={(event) => onItemPointerUp(event)}
                {...tourAttrs}
              >
                <span
                  ref={(node) => {
                    motionRefs.current[index] = node;
                  }}
                  className="sui-dock-motion"
                  style={{ width: iconSize }}
                >
                  {index === visibleOrder.length ? (
                    <span aria-hidden className="sui-dock-separator" />
                  ) : null}
                  <span className="sui-dock-lift">
                    <span
                      ref={(node) => {
                        registerDockIcon(id === "info" ? "about" : id, node);
                      }}
                      className="sui-dock-icon-shell"
                      style={{ width: iconSize, height: iconSize }}
                      data-dock-icon={id}
                    >
                      <Glyph className="sui-dock-icon" />
                      {badgeLabel ? (
                        <span className="sui-dock-badge" aria-label={`${badge} notifications`}>
                          {badgeLabel}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={`sui-dock-indicator ${
                        focused
                          ? "opacity-100 bg-white"
                          : open
                            ? "opacity-70 bg-white/70"
                            : "opacity-0"
                      }`}
                    />
                  </span>
                </span>
              </button>
            );
          })}
          <div ref={tooltipRef} className="sui-dock-tooltip" data-show="false" aria-hidden />
        </div>
      </div>
    </nav>
  );
}
