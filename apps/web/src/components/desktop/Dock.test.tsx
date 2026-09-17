import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Dock } from "@/src/components/desktop/Dock";
import { WindowManagerProvider } from "@/src/components/window/window-context";

function renderDock(onComingSoon = vi.fn()) {
  render(
    <WindowManagerProvider>
      <Dock onComingSoon={onComingSoon} />
    </WindowManagerProvider>,
  );
  return onComingSoon;
}

describe("Dock", () => {
  it("renders working and coming-soon apps", () => {
    renderDock();
    expect(screen.getByRole("button", { name: "Files" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Terminal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editor" })).toBeInTheDocument();
  });

  it("marks an app as open after it is selected", async () => {
    const user = userEvent.setup();
    renderDock();
    const files = screen.getByRole("button", { name: "Files" });
    expect(files).toHaveAttribute("aria-pressed", "false");
    await user.click(files);
    expect(files).toHaveAttribute("aria-pressed", "true");
  });

  it("notifies when trash is clicked", async () => {
    const user = userEvent.setup();
    const onComingSoon = renderDock();
    await user.click(screen.getByRole("button", { name: "Trash" }));
    expect(onComingSoon).toHaveBeenCalledTimes(1);
  });
});
