"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/src/lib/theme";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="group"
      aria-label="Appearance"
      className="flex shrink-0 items-center rounded-full p-0.5"
      style={{ background: "var(--toggle-bg)" }}
    >
      <button
        type="button"
        aria-label="Light mode"
        title="Light mode"
        aria-pressed={theme === "light"}
        className={`flex size-5 items-center justify-center rounded-full outline-none transition ${
          theme === "light"
            ? "bg-[var(--toggle-active)] text-[var(--toggle-active-fg)] shadow-sm"
            : "text-[var(--topbar-muted)] hover:text-[var(--topbar-fg)]"
        }`}
        onClick={() => setTheme("light")}
      >
        <Sun aria-hidden className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Dark mode"
        title="Dark mode"
        aria-pressed={theme === "dark"}
        className={`flex size-5 items-center justify-center rounded-full outline-none transition ${
          theme === "dark"
            ? "bg-[var(--toggle-active)] text-[var(--toggle-active-fg)] shadow-sm"
            : "text-[var(--topbar-muted)] hover:text-[var(--topbar-fg)]"
        }`}
        onClick={() => setTheme("dark")}
      >
        <Moon aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}
