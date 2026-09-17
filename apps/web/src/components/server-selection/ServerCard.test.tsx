import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ServerCard } from "@/src/components/server-selection/ServerCard";
import type { Server } from "@/src/lib/servers";

const server: Server = {
  id: "srv-1",
  name: "Edge Lab",
  hostname: "edge-lab",
  address: "203.0.113.10",
  status: "online",
  sshPort: 22,
  username: "deploy",
};

describe("ServerCard", () => {
  it("renders the server identity and actions", () => {
    render(
      <ServerCard
        server={server}
        onConnect={() => undefined}
        onTest={() => undefined}
        onEdit={() => undefined}
        onDelete={() => undefined}
      />,
    );

    expect(screen.getByText("Edge Lab")).toBeInTheDocument();
    expect(screen.getByText("deploy@203.0.113.10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test Connection" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("invokes connect, test, edit, and delete handlers", async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn();
    const onTest = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(
      <ServerCard
        server={server}
        onConnect={onConnect}
        onTest={onTest}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Connect" }));
    await user.click(screen.getByRole("button", { name: "Test Connection" }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(onTest).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("shows a test result message and a testing label", () => {
    render(
      <ServerCard
        server={server}
        testing
        testMessage="SSH connection successful · Latency: 12 ms"
        onConnect={() => undefined}
        onTest={() => undefined}
        onEdit={() => undefined}
        onDelete={() => undefined}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("SSH connection successful");
    expect(screen.getByRole("button", { name: "Testing…" })).toBeDisabled();
  });
});
