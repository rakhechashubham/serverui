"use client";

import { APP_IDS, APP_META, type AppId } from "@/src/data/apps";
import { DOCK_GLYPHS } from "@/src/components/desktop/dock-icons";
import { useWindowManager } from "@/src/components/window/window-context";

type DockProps = {
  onComingSoon: () => void;
};

const iconClass =
  "size-11 overflow-hidden rounded-[13px] shadow-md transition-transform duration-150 group-hover:-translate-y-1 group-focus-visible:ring-2 group-focus-visible:ring-white";

export function Dock({ onComingSoon }: DockProps) {
  const { windows, focusedId, openWindow, restoreWindow, focusWindow } = useWindowManager();

  function onSelect(app: AppId) {
    const existing = windows.find((item) => item.app === app);
    if (!existing) {
      openWindow(app);
      return;
    }
    if (existing.minimized) {
      restoreWindow(existing.id);
      return;
    }
    focusWindow(existing.id);
  }

  return (
    <nav
      aria-label="Applications"
      className="pointer-events-none absolute inset-x-0 bottom-3 z-50 flex justify-center"
    >
      <div className="pointer-events-auto flex items-end gap-2.5 rounded-[26px] border border-white/15 bg-black/35 px-3.5 py-2 shadow-2xl shadow-black/40 backdrop-blur-2xl">
        {APP_IDS.map((app) => {
          const Glyph = DOCK_GLYPHS[app];
          const open = windows.find((item) => item.app === app);
          const focused = open?.id === focusedId && !open?.minimized;

          return (
            <button
              key={app}
              type="button"
              aria-label={APP_META[app].title}
              title={APP_META[app].title}
              aria-pressed={Boolean(open)}
              className="group relative flex w-[52px] flex-col items-center gap-1 outline-none"
              onClick={() => onSelect(app)}
            >
              <Glyph className={iconClass} />
              <span className="text-[10px] font-medium text-white/95 drop-shadow">
                {APP_META[app].title}
              </span>
              <span
                className={`absolute -bottom-0.5 size-1 rounded-full ${
                  focused ? "bg-white" : open ? "bg-white/55" : "bg-transparent"
                }`}
              />
            </button>
          );
        })}
        <span aria-hidden className="mb-6 ml-0.5 h-9 w-px bg-white/25" />
        <button
          type="button"
          aria-label="Trash"
          title="Trash"
          className="group flex w-[52px] flex-col items-center gap-1 outline-none"
          onClick={onComingSoon}
        >
          <DOCK_GLYPHS.trash className={iconClass} />
          <span className="text-[10px] font-medium text-white/95 drop-shadow">Trash</span>
        </button>
      </div>
    </nav>
  );
}
