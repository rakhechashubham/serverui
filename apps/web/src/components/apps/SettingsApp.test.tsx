import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/src/lib/runtime", () => ({
  isDesktopRuntime: vi.fn(),
  currentRuntime: vi.fn(),
}));

vi.mock("@/src/lib/session", () => ({
  useSelectedServer: vi.fn(() => null),
}));

import { isDesktopRuntime, currentRuntime } from "@/src/lib/runtime";
import { SettingsApp } from "./SettingsApp";

describe("SettingsApp", () => {
  beforeEach(() => {
    vi.mocked(isDesktopRuntime).mockReset();
    vi.mocked(currentRuntime).mockReset();
  });

  it("shows about and runtime on web without updater controls", () => {
    vi.mocked(isDesktopRuntime).mockReturnValue(false);
    vi.mocked(currentRuntime).mockReturnValue("web");
    render(<SettingsApp />);
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText("Remote / shared Go API")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Check for updates/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Web deployment" })).toBeInTheDocument();
  });

  it("shows update controls in desktop runtime", () => {
    vi.mocked(isDesktopRuntime).mockReturnValue(true);
    vi.mocked(currentRuntime).mockReturnValue("desktop");
    render(<SettingsApp />);
    expect(screen.getByRole("button", { name: /Check for updates/i })).toBeInTheDocument();
    expect(screen.getByText("Local Go (loopback)")).toBeInTheDocument();
  });
});
