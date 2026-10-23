"use client";

import { useRef, useState } from "react";

import { AppearanceSettings } from "@/src/components/shell/AppearanceSettings";
import { ThemeToggleFull } from "@/src/components/desktop/ThemeToggle";
import { useAppearance, type AppearanceId } from "@/src/lib/appearance";
import { useWallpaper, type WallpaperId } from "@/src/lib/wallpaper";

/**
 * Settings: General tab with wallpaper selection.
 * Never displays tokens, encryption keys, passwords, or private keys.
 */
export function SettingsApp() {
  const {
    wallpaperId,
    wallpaperSrc,
    wallpapers,
    customSrc,
    hasCustom,
    setWallpaper,
    setCustomWallpaper,
    clearCustomWallpaper,
  } = useWallpaper();
  const [wallpaperError, setWallpaperError] = useState<string | null>(null);
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const { appearance, setAppearance } = useAppearance();

  return (
    <div className="flex h-full min-h-0 overflow-hidden sui-app">
      <aside className="sui-sidebar flex w-[176px] shrink-0 flex-col gap-0.5 px-3 py-4 text-[13px]">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] sui-muted">
          Settings
        </p>
        <button
          type="button"
          aria-current="page"
          className="sui-selected rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          General
        </button>
        <button
          type="button"
          className="rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-sky-400 hover:bg-[var(--app-hover)]"
        >
          Appearance
        </button>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto px-6 py-8">
        <h3 className="text-2xl font-semibold tracking-tight sui-title">General</h3>

        {/* Appearance Section */}
        <section
          className="sui-card mt-6 max-w-2xl space-y-3 rounded-[14px] p-4"
          aria-labelledby="settings-appearance"
        >
          <h4 id="settings-appearance" className="text-sm font-medium sui-title">
            Appearance
          </h4>
          <p className="text-sm leading-6 sui-muted">
            Choose your preferred color scheme. System preference will automatically match your OS
            setting.
          </p>
          <div className="flex items-center gap-3">
            <ThemeToggleFull />
          </div>
        </section>

        <section
          className="sui-card mt-6 max-w-2xl space-y-3 rounded-[14px] p-4"
          aria-label="Theme"
        >
          <h4 className="text-sm font-medium sui-title">Theme</h4>
          <p className="text-sm leading-6 sui-muted">
            macOS is the current desktop. Aura uses a side rail and tinted surfaces. Light and Dark
            apply to both.
          </p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Theme">
            <ThemeChoice
              id="macos"
              label="macOS"
              selected={appearance === "macos"}
              onSelect={() => setAppearance("macos")}
            />
            <ThemeChoice
              id="aura"
              label="Aura"
              selected={appearance === "aura"}
              onSelect={() => setAppearance("aura")}
            />
          </div>
          {appearance === "aura" ? <AppearanceSettings /> : null}
        </section>
        <section
          className="sui-card mt-6 max-w-2xl space-y-3 rounded-[14px] p-4"
          aria-labelledby="settings-wallpaper"
        >
          <h4 id="settings-wallpaper" className="text-sm font-medium sui-title">
            Wallpaper
          </h4>
          <p className="text-sm leading-6 sui-muted">
            Choose one of the built-in scenes, or upload your own image. The selection is saved in
            this browser.
          </p>
          <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-3"
            role="listbox"
            aria-label="Wallpaper"
          >
            {wallpapers.map((option) => (
              <WallpaperChoice
                key={option.id}
                id={option.id}
                name={option.name}
                src={option.src}
                selected={wallpaperId === option.id}
                onSelect={() => {
                  setWallpaperError(null);
                  setWallpaper(option.id);
                }}
              />
            ))}
            {hasCustom ? (
              <WallpaperChoice
                id="custom"
                name="Custom"
                src={customSrc || wallpaperSrc}
                selected={wallpaperId === "custom"}
                onSelect={() => {
                  setWallpaperError(null);
                  setWallpaper("custom");
                }}
              />
            ) : (
              <button
                type="button"
                role="option"
                aria-selected={false}
                aria-label="Upload wallpaper"
                onClick={() => wallpaperInputRef.current?.click()}
                className="flex aspect-16/10 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/20 text-[12px] sui-muted outline-none transition hover:border-white/40 hover:bg-white/6"
              >
                <span className="text-[18px] leading-none text-white/55">+</span>
                Upload
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={wallpaperInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setWallpaperError(null);
                void setCustomWallpaper(file).catch((err) => {
                  setWallpaperError(
                    err instanceof Error ? err.message : "Unable to use that image.",
                  );
                });
              }}
            />
            <button
              type="button"
              className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm sui-title hover:bg-white/10"
              onClick={() => wallpaperInputRef.current?.click()}
            >
              Upload wallpaper…
            </button>
            {hasCustom ? (
              <button
                type="button"
                className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm sui-title hover:bg-white/10"
                onClick={() => {
                  setWallpaperError(null);
                  void clearCustomWallpaper().catch((err) => {
                    setWallpaperError(
                      err instanceof Error ? err.message : "Unable to remove custom wallpaper.",
                    );
                  });
                }}
              >
                Remove custom
              </button>
            ) : null}
          </div>
          {wallpaperError ? (
            <p className="text-sm text-red-300/90" role="alert">
              {wallpaperError}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function ThemeChoice({
  label,
  selected,
  onSelect,
}: {
  id: AppearanceId;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`rounded-full px-4 py-1.5 text-sm outline-none ${
        selected ? "bg-[var(--toggle-active)] text-[var(--toggle-active-fg)]" : "sui-card sui-title"
      }`}
    >
      {label}
    </button>
  );
}

function WallpaperChoice({
  name,
  src,
  selected,
  onSelect,
}: {
  id: WallpaperId;
  name: string;
  src: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-label={name}
      onClick={onSelect}
      className={`overflow-hidden rounded-xl border text-left outline-none transition ${
        selected ? "border-sky-400 ring-2 ring-sky-400/50" : "border-white/15 hover:border-white/35"
      }`}
    >
      <span
        className="block aspect-16/10 bg-cover bg-center"
        style={src ? { backgroundImage: `url("${src}")` } : undefined}
      />
      <span className="block px-2.5 py-2 text-[12px] sui-title">{name}</span>
    </button>
  );
}
