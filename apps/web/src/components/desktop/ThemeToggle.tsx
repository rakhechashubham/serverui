"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "@/src/lib/theme";

export type ThemeToggleVariant = "compact" | "full";

interface ThemeToggleProps {
  /** Variant: "compact" for top bar (icon only), "full" for settings panel (icon + label) */
  variant?: ThemeToggleVariant;
}

/**
 * ThemeToggle - A three-state theme switcher (Light / Dark / System)
 *
 * Features:
 * - 3 states: Light (Sun), Dark (Moon), System (Monitor)
 * - Keyboard accessible: Arrow keys to navigate, Enter/Space to select, Escape to close
 * - ARIA menu with menuitemradio options
 * - Focus-visible styles for keyboard navigation
 * - Smooth 150ms transition on theme change
 * - Two variants: compact (icon trigger) for top bar, full (icon + label trigger) for settings
 */
export function ThemeToggle({ variant = "compact" }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([null, null, null]);
  const containerRef = useRef<HTMLDivElement>(null);

  const themes: Array<{ value: Theme; icon: React.ReactNode; label: string; ariaLabel: string }> = [
    {
      value: "light",
      icon: <Sun aria-hidden className="size-4" />,
      label: "Light",
      ariaLabel: "Light mode",
    },
    {
      value: "dark",
      icon: <Moon aria-hidden className="size-4" />,
      label: "Dark",
      ariaLabel: "Dark mode",
    },
    {
      value: "system",
      icon: <Monitor aria-hidden className="size-4" />,
      label: "System",
      ariaLabel: "System preference",
    },
  ];

  // Handle keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % themes.length);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + themes.length) % themes.length);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        setTheme(themes[focusedIndex].value);
        setIsOpen(false);
        break;
      case "Escape":
        event.preventDefault();
        setIsOpen(false);
        setFocusedIndex(themes.findIndex((t) => t.value === theme));
        break;
      case "Home":
        event.preventDefault();
        setFocusedIndex(0);
        break;
      case "End":
        event.preventDefault();
        setFocusedIndex(themes.length - 1);
        break;
    }
  };

  // Focus the active option when the menu opens or the focus index changes
  useEffect(() => {
    if (isOpen) buttonRefs.current[focusedIndex]?.focus();
  }, [isOpen, focusedIndex]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setFocusedIndex(themes.findIndex((t) => t.value === theme));
      }
    }
    if (isOpen) {
      document.addEventListener("pointerdown", handleClickOutside);
    }
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, [isOpen, theme]);

  const currentTheme = themes.find((t) => t.value === theme);
  const resolvedThemeInfo = themes.find((t) => t.value === resolvedTheme);

  const compactClasses = `
    relative flex items-center justify-center
    rounded-full p-1
    outline-none
    transition-colors duration-150 ease-out
    focus-visible:ring-2 focus-visible:ring-[var(--topbar-fg)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--topbar-bg)]
    ${isOpen ? "bg-[var(--toggle-bg)]" : "hover:bg-[var(--toggle-bg)]"}
  `;

  const fullClasses = `
    flex items-center gap-3
    w-full px-3 py-2.5
    rounded-xl
    outline-none
    transition-colors duration-150 ease-out
    focus-visible:ring-2 focus-visible:ring-[var(--app-border)] focus-visible:ring-offset-1
    ${isOpen ? "bg-[var(--app-hover)]" : "hover:bg-[var(--app-hover)]"}
  `;

  const buttonClasses =
    variant === "compact"
      ? "flex size-8 items-center justify-center rounded-full outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[var(--topbar-fg)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--topbar-bg)]"
      : "flex size-10 items-center justify-center rounded-full outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[var(--app-border)]";

  const activeButtonClasses =
    variant === "compact"
      ? "bg-[var(--toggle-active)] text-[var(--toggle-active-fg)] shadow-sm"
      : "bg-[var(--app-selected)] text-[var(--finder-accent)]";

  const inactiveButtonClasses =
    variant === "compact"
      ? "text-[var(--topbar-muted)] hover:text-[var(--topbar-fg)]"
      : "text-[var(--app-muted)] hover:text-[var(--app-fg)]";

  const optionButtonClasses =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[var(--app-selected)]";

  const optionActiveClasses = "bg-[var(--app-selected)] text-[var(--menu-fg)]";

  const optionInactiveClasses =
    "text-[var(--menu-fg)] opacity-80 hover:bg-[var(--app-hover)] hover:opacity-100";

  return (
    <div ref={containerRef} className="relative inline-flex" onKeyDown={handleKeyDown}>
      {/* Main toggle button (compact) or selected display (full) */}
      {variant === "compact" ? (
        <button
          type="button"
          className={compactClasses}
          onClick={() => {
            setFocusedIndex(themes.findIndex((t) => t.value === theme));
            setIsOpen((open) => !open);
          }}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={currentTheme?.ariaLabel}
          title={currentTheme?.label}
        >
          {currentTheme?.icon}
        </button>
      ) : (
        <button
          type="button"
          className="flex items-center gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-card)] px-3 py-2 text-[var(--app-fg)] outline-none transition-colors duration-150 ease-out hover:bg-[var(--app-hover)] focus-visible:ring-2 focus-visible:ring-[var(--app-selected)]"
          onClick={() => {
            setFocusedIndex(themes.findIndex((t) => t.value === theme));
            setIsOpen((open) => !open);
          }}
          aria-haspopup="menu"
          aria-expanded={isOpen}
        >
          {currentTheme?.icon}
          <span className="text-sm font-medium">{currentTheme?.label}</span>
          {theme === "system" && (
            <span className="ml-2 rounded-full bg-[var(--app-input)] px-2 py-0.5 text-xs text-[var(--app-muted)]">
              {resolvedThemeInfo?.label}
            </span>
          )}
        </button>
      )}

      {/* Dropdown menu */}
      {isOpen && (
        <div
          role="menu"
          aria-label="Select theme"
          className={`${variant === "compact" ? "right-0" : "left-0"} absolute top-full z-[100] mt-2 min-w-[160px] animate-menu-in rounded-xl border border-[var(--app-border)] bg-[var(--menu-bg)] p-1.5 text-[var(--menu-fg)] shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl`}
        >
          {themes.map((t, index) => (
            <button
              key={t.value}
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={theme === t.value}
              className={`${optionButtonClasses} ${theme === t.value ? optionActiveClasses : optionInactiveClasses}`}
              onClick={() => {
                setTheme(t.value);
                setIsOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  // Select here; keep the parent handler from selecting again
                  e.stopPropagation();
                  e.preventDefault();
                  setTheme(t.value);
                  setIsOpen(false);
                }
              }}
              onFocus={() => setFocusedIndex(index)}
            >
              <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden>
                {t.icon}
              </span>
              <span className="font-medium">{t.label}</span>
              {theme === t.value && <Check aria-hidden className="ml-auto size-3.5 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * ThemeToggleFull - Full variant for settings panel
 * Displays current theme with label and opens dropdown on click
 */
export function ThemeToggleFull() {
  return <ThemeToggle variant="full" />;
}

/**
 * ThemeToggleCompact - Compact variant for top bar
 * Icon-only button that opens dropdown on click
 */
export function ThemeToggleCompact() {
  return <ThemeToggle variant="compact" />;
}
