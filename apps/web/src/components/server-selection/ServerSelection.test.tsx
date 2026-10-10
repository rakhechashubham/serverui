import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listServers, testServerConnection, trustServerHostKey } = vi.hoisted(() => ({
  listServers: vi.fn(),
  testServerConnection: vi.fn(),
  trustServerHostKey: vi.fn(),
}));

vi.mock("@/src/lib/api/server", () => ({
  listServers: (...args: unknown[]) => listServers(...args),
  createServer: vi.fn(),
  updateServer: vi.fn(),
  deleteServer: vi.fn(),
  disconnectServer: vi.fn(),
  testServerConnection: (...args: unknown[]) => testServerConnection(...args),
  trustServerHostKey: (...args: unknown[]) => trustServerHostKey(...args),
}));

import { ServerSelection } from "@/src/components/server-selection/ServerSelection";
import { SessionProvider } from "@/src/lib/session";
import { WallpaperProvider } from "@/src/lib/wallpaper";

describe("ServerSelection", () => {
  beforeEach(() => {
    listServers.mockReset();
    testServerConnection.mockReset();
  });

  it("shows a loading state before servers arrive", () => {
    listServers.mockImplementation(() => new Promise(() => {}));

    render(
      <WallpaperProvider>
        <SessionProvider>
          <ServerSelection />
        </SessionProvider>
      </WallpaperProvider>,
    );

    expect(screen.getByText("Loading servers…")).toBeInTheDocument();
  });

  it("shows an empty state when the API returns no servers", async () => {
    listServers.mockResolvedValue([]);

    render(
      <WallpaperProvider>
        <SessionProvider>
          <ServerSelection />
        </SessionProvider>
      </WallpaperProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Welcome to ServerUI" })).toBeInTheDocument();
    expect(screen.getByText(/Add your first Linux server over SSH/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add your first server/i })).toBeInTheDocument();
  });

  it("shows an error state when the server list cannot be loaded", async () => {
    listServers.mockRejectedValue(new Error("network disconnected"));

    render(
      <WallpaperProvider>
        <SessionProvider>
          <ServerSelection />
        </SessionProvider>
      </WallpaperProvider>,
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
      <WallpaperProvider>
        <SessionProvider>
          <ServerSelection />
        </SessionProvider>
      </WallpaperProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Your Servers" })).toBeInTheDocument();
    expect(screen.getByText("Edge Lab")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
  });

  it("shows the failed status and the exact cause after a failed test", async () => {
    const server = {
      id: "srv-1",
      name: "arch",
      hostname: "arch",
      status: "online",
      host: "100.100.10.1",
      port: 22,
      username: "yash",
    };
    listServers.mockResolvedValue([server]);
    testServerConnection.mockResolvedValue({
      ok: false,
      latencyMs: 40,
      code: "auth_failed",
      error: "Authentication failed: the server rejected the username or password.",
      server: { ...server, status: "authentication_failed", error: "authentication failed" },
    });

    render(
      <WallpaperProvider>
        <SessionProvider>
          <ServerSelection />
        </SessionProvider>
      </WallpaperProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Test Connection" }));
    expect(screen.getByText("Checking…")).toBeInTheDocument();
    expect(screen.getByText("Testing connection…")).toBeInTheDocument();

    expect(
      await screen.findByText(
        "Authentication failed: the server rejected the username or password.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Authentication failed")).toBeInTheDocument();
    expect(screen.queryByText("Online")).not.toBeInTheDocument();
  });

  it("trusts a changed host key only after confirmation", async () => {
    const server = { id: "srv-1", name: "arch", host: "203.0.113.10", port: 22, status: "online" };
    listServers.mockResolvedValue([{ ...server, status: "host_key_changed" }]);
    testServerConnection.mockResolvedValue({
      ok: false,
      latencyMs: 5,
      error: "Host key changed",
      hostKeyFingerprint: "SHA256:new",
      server: { ...server, status: "host_key_changed" },
    });
    trustServerHostKey.mockResolvedValue({ ok: true, latencyMs: 5, server });

    render(
      <WallpaperProvider>
        <SessionProvider>
          <ServerSelection />
        </SessionProvider>
      </WallpaperProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Review Key" }));
    expect(await screen.findByText(/now presents SHA256:new/)).toBeInTheDocument();
    expect(trustServerHostKey).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Trust Key" }));
    expect(trustServerHostKey).toHaveBeenCalledWith("srv-1", "SHA256:new");
    expect(await screen.findByText("Online")).toBeInTheDocument();
  });
});
