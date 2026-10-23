import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ThemeProvider } from "@/src/lib/theme";
import { WallpaperProvider } from "@/src/lib/wallpaper";
import { SettingsApp } from "./SettingsApp";

describe("SettingsApp", () => {
  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    delete document.documentElement.dataset.theme;
    localStorage.removeItem("serverui-theme");
    localStorage.removeItem("serverui-wallpaper");
    localStorage.removeItem("serverui-wallpaper-light");
  });

  it("shows the General tab with wallpaper selection", async () => {
    render(
      <ThemeProvider>
        <WallpaperProvider>
          <SettingsApp />
        </WallpaperProvider>
      </ThemeProvider>,
    );
    expect(screen.getByRole("button", { name: "General" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "General" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Wallpaper" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Crescent" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Valley" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Orbit" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Upload wallpaper" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload wallpaper…" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dock" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Check for updates/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: "Valley" }));
    expect(screen.getByRole("option", { name: "Valley" })).toHaveAttribute("aria-selected", "true");
  });

  it("swaps the built-in scenes for the light set", () => {
    document.documentElement.dataset.theme = "light";
    localStorage.setItem("serverui-theme", "light");
    render(
      <ThemeProvider>
        <WallpaperProvider>
          <SettingsApp />
        </WallpaperProvider>
      </ThemeProvider>,
    );
    expect(screen.getByRole("option", { name: "Fjord" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Sunrise" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("option", { name: "Alpine" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Crescent" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Fjord" }).querySelector("span")).toHaveStyle({
      backgroundImage: 'url("/wallpapers/fjord.png")',
    });
  });
});
