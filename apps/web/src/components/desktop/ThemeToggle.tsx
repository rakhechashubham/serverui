"use client";

import { useEffect, useRef, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "@/src/lib/theme";

export type ThemeToggleVariant = "compact" | "full";

interface ThemeToggleProps {
  /** Variant: "compact" for top bar (icon only), "full" for settings panel (icon + label) */
  variant?: ThemeToggleVariant;
  /** Optional custom tooltip message */
  tooltip?: string;
}

/**
 * ThemeToggle - A three-state theme switcher (Light / Dark / System)
 *
 * Features:
 * - 3 states: Light (Sun), Dark (Moon), System (Monitor)
 * - Keyboard accessible: Arrow keys to navigate, Enter/Space to select, Escape to close
 * - ARIA radiogroup pattern for accessibility
 * - Focus-visible styles for keyboard navigation
 * - Tooltip on hover showing current theme
 * - Smooth 150ms transition on theme change
 * - Two variants: compact (icon only) for top bar, full (icon + label) for settings
 */
export function ThemeToggle({ variant = "compact", tooltip }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([null, null, null]);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  const themes: Array<{ value: Theme; icon: React.ReactNode; label: string; ariaLabel: string }> = [
    { value: "light", icon: <Sun aria-hidden className="size-4" />, label: "Light", ariaLabel: "Light mode" },
    { value: "dark", icon: <Moon aria-hidden className="size-4" />, label: "Dark", ariaLabel: "Dark mode" },
    { value: "system", icon: <Monitor aria-hidden className="size-4" />, label: "System", ariaLabel: "System preference" },
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

  // Focus the active button when focusIndex changes
  useEffect(() => {
    buttonRefs.current[focusedIndex]?.focus();
  }, [focusedIndex]);

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

  // Handle tooltip visibility
  useEffect(() => {
    const tooltipEl = tooltipRef.current;
    if (!tooltipEl) return;

    const handleMouseEnter = () => setShowTooltip(true);
    const handleMouseLeave = () => setShowTooltip(false);

    tooltipEl.addEventListener("mouseenter", handleMouseEnter);
    tooltipEl.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      tooltipEl.removeEventListener("mouseenter", handleMouseEnter);
      tooltipEl.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  const currentTheme = themes.find((t) => t.value === theme);
  const resolvedThemeInfo = themes.find((t) => t.value === resolvedTheme);

  // Tooltip content: shows current theme and resolved theme if different
  const tooltipContent = tooltip || (
    <>
      <span className="font-medium">{currentTheme?.label}</span>
      {theme === "system" && (
        <span className="text-[11px] opacity-70 ml-1">({resolvedThemeInfo?.label})</span>
      )}
    </>
  );

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

  const buttonClasses = variant === "compact"
    ? "flex size-8 items-center justify-center rounded-full outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[var(--topbar-fg)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--topbar-bg)]"
    : "flex size-10 items-center justify-center rounded-full outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[var(--app-border)]";

  const activeButtonClasses = variant === "compact"
    ? "bg-[var(--toggle-active)] text-[var(--toggle-active-fg)] shadow-sm"
    : "bg-[var(--app-selected)] text-[var(--finder-accent)]";

  const inactiveButtonClasses = variant === "compact"
    ? "text-[var(--topbar-muted)] hover:text-[var(--topbar-fg)]"
    : "text-[var(--app-muted)] hover:text-[var(--app-fg)]";

  const optionButtonClasses = variant === "compact"
    ? "flex size-8 items-center justify-center rounded-full outline-none transition-all duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[var(--topbar-fg)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--topbar-bg)]"
    : "flex w-full items-center gap-3 px-3 py-2 rounded-lg outline-none transition-all duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[var(--app-border)] focus-visible:ring-offset-1";

  const optionActiveClasses = variant === "compact"
    ? "bg-[var(--toggle-active)] text-[var(--toggle-active-fg)] shadow-sm"
    : "bg-[var(--app-selected)] text-[var(--finder-accent)]";

  const optionInactiveClasses = variant === "compact"
    ? "text-[var(--topbar-muted)] hover:text-[var(--topbar-fg)] hover:bg-[var(--topbar-bg)]"
    : "text-[var(--app-muted)] hover:text-[var(--app-fg)] hover:bg-[var(--app-hover)]";

  return (
    <div
      ref={containerRef}
      className="relative inline-flex"
      role="radiogroup"
      aria-label="Appearance"
      onKeyDown={handleKeyDown}
    >
      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className={`
          absolute bottom-full left-1/2 -translate-x-1/2 mb-2
          px-3 py-1.5
          rounded-md
          text-[11px] font-medium text-white
          whitespace-nowrap
          opacity-0 pointer-events-none
          transition-opacity duration-150 ease-out
          z-[100]
          ${variant === "compact"
            ? "bg-gray-900/95 border border-white/10 shadow-lg backdrop-blur-sm"
            : "bg-gray-800/95 border border-white/10 shadow-lg backdrop-blur-sm"
          }
          ${showTooltip ? "opacity-100" : "opacity-0"}
        `}
        style={{ transform: "translateX(-50%) translateY(-4px)" }}
        role="tooltip"
        aria-hidden={!showTooltip}
      >
        {tooltipContent}
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 size-2 rotate-45"
          style={{
            background: variant === "compact"
              ? "rgba(17, 24, 39, 0.95)"
              : "rgba(31, 41, 55, 0.95)",
            borderRight: "1px solid rgba(255, 255, 255, 0.1)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
          }}
          aria-hidden
        />
      </div>

      {/* Main toggle button (compact) or selected display (full) */}
      {variant === "compact" ? (
        <button
          type="button"
          className={compactClasses}
          onClick={() => setIsOpen((open) => !open)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={currentTheme?.ariaLabel}
          title={currentTheme?.label}
        >
          {currentTheme?.icon}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[var(--app-card)] border border-[var(--app-border)]">
          {currentTheme?.icon}
          <span className="text-sm font-medium text-[var(--app-fg)]">{currentTheme?.label}</span>
          {theme === "system" && (
            <span className="text-xs text-[var(--app-muted)] ml-auto px-2 py-0.5 rounded-full bg-[var(--app-input)]">
              {resolvedThemeInfo?.label}
            </span>
          )}
        </div>
      )}

      {/* Dropdown menu */}
      {isOpen && (
        <div
          role="listbox"
          aria-label="Select theme"
          className={`
            absolute right-0 top-full z-[100] mt-2 min-w-[140px]
            rounded-xl border border-[var(--app-border)]
            bg-[var(--menu-bg)] text-[var(--menu-fg)]
            shadow-[0_18px_50px_rgba(0,0,0,0.45)]
            backdrop-blur-xl
            animate-menu-in
            ${variant === "compact" ? "p-1.5" : "p-2"}
          `}
          style={{ minWidth: variant === "compact" ? "140px" : "200px" }}
        >
          {themes.map((t, index) => (
            <button
              key={t.value}
              ref={(el) => { buttonRefs.current[index] = el; }}
              type="button"
              role="option"
              aria-selected={theme === t.value}
              aria-label={t.ariaLabel}
              className={`
                ${optionButtonClasses}
                ${theme === t.value ? optionActiveClasses : optionInactiveClasses}
                ${index === focusedIndex ? "ring-2 ring-[var(--app-selected)]" : ""}
              `}
              onClick={() => {
                setTheme(t.value);
                setIsOpen(false);
              }}
              onKeyDown={(e) => {
                // Prevent event bubbling to parent keydown handler
                e.stopPropagation();
                if (e.key === "Enter" || e.key === " ") {
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
              {variant === "full" && <span className="text-sm font-medium">{t.label}</span>}
              {theme === t.value && (
                <span className={variant === "compact" ? "ml-auto" : "ml-auto"}>
                  ✓
                </span>
              )}
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