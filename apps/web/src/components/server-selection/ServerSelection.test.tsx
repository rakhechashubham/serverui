import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listServers } = vi.hoisted(() => ({
  listServers: vi.fn(),
}));

vi.mock("@/src/lib/api/server", () => ({
  listServers: (...args: unknown[]) => listServers(...args),
  createServer: vi.fn(),
  updateServer: vi.fn(),
  deleteServer: vi.fn(),
  disconnectServer: vi.fn(),
  testServerConnection: vi.fn(),
}));

import { ServerSelection } from "@/src/components/server-selection/ServerSelection";
import { SessionProvider } from "@/src/lib/session";

describe("ServerSelection", () => {
  beforeEach(() => {
    listServers.mockReset();
  });

  it("shows a loading state before servers arrive", () => {
    listServers.mockImplementation(() => new Promise(() => {}));

    render(
      <SessionProvider>
        <ServerSelection />
      </SessionProvider>,
    );

    expect(screen.getByText("Loading servers…")).toBeInTheDocument();
  });

  it("shows an empty state when the API returns no servers", async () => {
    listServers.mockResolvedValue([]);

    render(
      <SessionProvider>
        <ServerSelection />
      </SessionProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Welcome to ServerUI" })).toBeInTheDocument();
    expect(screen.getByText(/Add your first Linux server over SSH/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add your first server/i })).toBeInTheDocument();
  });

  it("shows an error state when the server list cannot be loaded", async () => {
    listServers.mockRejectedValue(new Error("network disconnected"));

    render(
      <SessionProvider>
        <ServerSelection />
      </SessionProvider>,
    );

    expect(await screen.findByText("Unable to load servers.")).toBeInTheDocument();
    expect(screen.getByText(/local or remote API did not respond/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("renders returned servers", async () => {
    listServers.mockResolvedValue([
      {
        id: "srv-1",
        name: "Edge Lab",
        hostname: "edge-lab",
        status: "online",
        host: "203.0.113.10",
        port: 22,
        username: "deploy",
        cpuUsage: 0,
        memoryUsage: 0,
        diskUsage: 0,
        uptimeSeconds: 0,
      },
    ]);

    render(
      <SessionProvider>
        <ServerSelection />
      </SessionProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Your Servers" })).toBeInTheDocument();
    expect(screen.getByText("Edge Lab")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
  });
});
