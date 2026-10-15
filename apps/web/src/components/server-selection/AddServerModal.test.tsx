import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddServerModal } from "@/src/components/server-selection/AddServerModal";
import { ApiError } from "@/src/lib/api/client";
import { testServerDraft } from "@/src/lib/api/server";
import type { Server } from "@/src/lib/servers";

vi.mock("@/src/lib/api/server", () => ({ testServerDraft: vi.fn() }));
const testDraft = vi.mocked(testServerDraft);

beforeEach(() => {
  testDraft.mockReset();
});

describe("AddServerModal", () => {
  it("requires name, host, username, and password for a new server", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AddServerModal onClose={() => undefined} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "Save Server" }));

    expect(screen.getByText("Server name is required.")).toBeInTheDocument();
    expect(screen.getByText("Host / IP is required.")).toBeInTheDocument();
    expect(screen.getByText("Username is required.")).toBeInTheDocument();
    expect(screen.getByText("Password is required.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Fix the 4 highlighted fields to continue.",
    );
    expect(screen.getByLabelText("Server Name")).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a password-authenticated server", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    testDraft
      .mockResolvedValueOnce({
        ok: false,
        latencyMs: 12,
        code: "host_key_unverified",
        hostKeyFingerprint: "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        error: "Verify the SSH host fingerprint before trusting this server.",
      })
      .mockResolvedValueOnce({ ok: true, latencyMs: 42 });

    render(<AddServerModal onClose={() => undefined} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Server Name"), "Edge Lab");
    await user.type(screen.getByLabelText("Host / IP"), "203.0.113.10");
    await user.type(screen.getByLabelText("Username"), "deploy");
    await user.type(screen.getByLabelText("Password"), "example-pass");
    await user.click(screen.getByRole("button", { name: "Save Server" }));
    await user.click(await screen.findByRole("button", { name: "Trust fingerprint and test" }));
    await screen.findByText("Connection successful · Latency 42 ms");
    await user.click(screen.getByRole("button", { name: "Save Server" }));

    expect(onSubmit).toHaveBeenCalledWith(
      {
        name: "Edge Lab",
        address: "203.0.113.10",
        hostname: "203.0.113.10",
        sshPort: 22,
        username: "deploy",
        authType: "password",
        password: "example-pass",
        privateKey: undefined,
        hostKeyFingerprint: "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      },
      { connect: false },
    );
  });

  it("offers save and connect on first-run", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    testDraft
      .mockResolvedValueOnce({
        ok: false,
        latencyMs: 12,
        code: "host_key_unverified",
        hostKeyFingerprint: "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        error: "Verify the SSH host fingerprint before trusting this server.",
      })
      .mockResolvedValueOnce({ ok: true, latencyMs: 42 });

    render(<AddServerModal connectAfterSave onClose={() => undefined} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Server Name"), "Edge Lab");
    await user.type(screen.getByLabelText("Host / IP"), "203.0.113.10");
    await user.type(screen.getByLabelText("Username"), "deploy");
    await user.type(screen.getByLabelText("Password"), "example-pass");
    await user.click(screen.getByRole("button", { name: "Save & Connect" }));
    await user.click(await screen.findByRole("button", { name: "Trust fingerprint and test" }));
    await screen.findByText("Connection successful · Latency 42 ms");
    await user.click(screen.getByRole("button", { name: "Save & Connect" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        hostKeyFingerprint: "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      }),
      { connect: true },
    );
  });

  it("switches to the private key form", async () => {
    const user = userEvent.setup();

    render(<AddServerModal onClose={() => undefined} onSubmit={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "SSH Private Key" }));

    expect(screen.getByPlaceholderText(/BEGIN OPENSSH PRIVATE KEY/)).toBeInTheDocument();
    expect(
      screen.getByText(/Your private key is encrypted before being stored/),
    ).toBeInTheDocument();
  });

  it("disables autocapitalization, autocorrect, and spellcheck on host and username inputs", () => {
    render(<AddServerModal onClose={() => undefined} onSubmit={() => undefined} />);

    const hostInput = screen.getByLabelText("Host / IP");
    expect(hostInput).toHaveAttribute("autocapitalize", "none");
    expect(hostInput).toHaveAttribute("autocorrect", "off");
    expect(hostInput).toHaveAttribute("spellcheck", "false");

    const usernameInput = screen.getByLabelText("Username");
    expect(usernameInput).toHaveAttribute("autocapitalize", "none");
    expect(usernameInput).toHaveAttribute("autocorrect", "off");
    expect(usernameInput).toHaveAttribute("spellcheck", "false");
  });

  describe("Test Connection", () => {
    async function fillConnection(user: ReturnType<typeof userEvent.setup>) {
      await user.type(screen.getByLabelText("Host / IP"), "203.0.113.10");
      await user.type(screen.getByLabelText("Username"), "deploy");
      await user.type(screen.getByLabelText("Password"), "example-pass");
    }

    it("tests the typed details without saving", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      testDraft.mockResolvedValue({ ok: true, latencyMs: 42 });

      render(<AddServerModal onClose={() => undefined} onSubmit={onSubmit} />);
      await fillConnection(user);
      await user.click(screen.getByRole("button", { name: "Test Connection" }));

      expect(testDraft).toHaveBeenCalledWith(
        {
          host: "203.0.113.10",
          port: 22,
          username: "deploy",
          authType: "password",
          password: "example-pass",
          privateKey: undefined,
        },
        undefined,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(await screen.findByRole("status")).toHaveTextContent(
        "Connection successful · Latency 42 ms",
      );
      expect(screen.getByRole("button", { name: "Test Connection" })).toHaveAttribute(
        "data-result",
        "ok",
      );
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("does not need a server name", async () => {
      const user = userEvent.setup();
      testDraft.mockResolvedValue({ ok: true, latencyMs: 5 });

      render(<AddServerModal onClose={() => undefined} onSubmit={() => undefined} />);
      await fillConnection(user);
      await user.click(screen.getByRole("button", { name: "Test Connection" }));

      expect(testDraft).toHaveBeenCalledTimes(1);
    });

    it("shows the backend's failure message", async () => {
      const user = userEvent.setup();
      testDraft.mockResolvedValue({
        ok: false,
        latencyMs: 300,
        code: "auth_failed",
        error: "Authentication failed. Check the username and password or private key.",
      });

      render(<AddServerModal onClose={() => undefined} onSubmit={() => undefined} />);
      await fillConnection(user);
      await user.click(screen.getByRole("button", { name: "Test Connection" }));

      expect(await screen.findByRole("status")).toHaveTextContent(/^Authentication failed\./);
    });

    it("explains a backend validation error", async () => {
      const user = userEvent.setup();
      testDraft.mockRejectedValue(new ApiError("invalid host", 400));

      render(<AddServerModal onClose={() => undefined} onSubmit={() => undefined} />);
      await fillConnection(user);
      await user.click(screen.getByRole("button", { name: "Test Connection" }));

      expect(await screen.findByRole("status")).toHaveTextContent(
        "Invalid configuration. Review the server name, host, port, and credentials.",
      );
    });

    it("checks required fields before calling the backend", async () => {
      const user = userEvent.setup();

      render(<AddServerModal onClose={() => undefined} onSubmit={() => undefined} />);
      await user.click(screen.getByRole("button", { name: "Test Connection" }));

      expect(screen.getByText("Host / IP is required.")).toBeInTheDocument();
      expect(screen.queryByText("Server name is required.")).not.toBeInTheDocument();
      expect(testDraft).not.toHaveBeenCalled();
    });

    it("hides a result once the tested fields change", async () => {
      const user = userEvent.setup();
      testDraft.mockResolvedValue({ ok: true, latencyMs: 42 });

      render(<AddServerModal onClose={() => undefined} onSubmit={() => undefined} />);
      await fillConnection(user);
      await user.click(screen.getByRole("button", { name: "Test Connection" }));
      expect(await screen.findByRole("status")).toBeInTheDocument();

      await user.type(screen.getByLabelText("Host / IP"), "1");
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("uses the saved credential when editing with a blank password", async () => {
      const user = userEvent.setup();
      testDraft.mockResolvedValue({ ok: true, latencyMs: 12 });
      const server: Server = {
        id: "srv-1",
        name: "Prod",
        hostname: "prod",
        address: "203.0.113.10",
        status: "online",
        sshPort: 22,
        username: "deploy",
        authType: "password",
      };

      render(
        <AddServerModal server={server} onClose={() => undefined} onSubmit={() => undefined} />,
      );
      await user.click(screen.getByRole("button", { name: "Test Connection" }));

      expect(testDraft).toHaveBeenCalledWith(
        expect.objectContaining({ host: "203.0.113.10", password: undefined }),
        "srv-1",
        expect.anything(),
      );
    });
  });

  describe("inline validation", () => {
    it("shows a field error after leaving the field and links it to the input", async () => {
      const user = userEvent.setup();
      render(<AddServerModal onClose={() => undefined} onSubmit={() => undefined} />);

      const host = screen.getByLabelText("Host / IP");
      await user.type(host, "203.0.113.300");
      expect(screen.queryByText(/valid IPv4/)).not.toBeInTheDocument();
      await user.tab();

      const message = screen.getByText("Enter a valid IPv4 address: four numbers from 0 to 255.");
      expect(host).toHaveAttribute("aria-invalid", "true");
      expect(host).toHaveAttribute("aria-describedby", message.id);
    });

    it("clears the error as soon as the value is fixed", async () => {
      const user = userEvent.setup();
      render(<AddServerModal onClose={() => undefined} onSubmit={() => undefined} />);

      const port = screen.getByLabelText("SSH Port");
      await user.clear(port);
      await user.type(port, "70000");
      await user.tab();
      expect(screen.getByText("SSH port must be between 1 and 65535.")).toBeInTheDocument();

      await user.clear(port);
      await user.type(port, "2222");
      expect(screen.queryByText(/SSH port must be/)).not.toBeInTheDocument();
      expect(port).not.toHaveAttribute("aria-invalid");
    });

    it("explains a port typed into the host field", async () => {
      const user = userEvent.setup();
      render(<AddServerModal onClose={() => undefined} onSubmit={() => undefined} />);

      await user.type(screen.getByLabelText("Host / IP"), "203.0.113.10:22");
      await user.tab();
      expect(
        screen.getByText("Put the port in the SSH Port field, not in the host."),
      ).toBeInTheDocument();
    });

    it("rejects a pasted value that is not a private key", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<AddServerModal onClose={() => undefined} onSubmit={onSubmit} />);

      await user.type(screen.getByLabelText("Server Name"), "Edge Lab");
      await user.type(screen.getByLabelText("Host / IP"), "203.0.113.10");
      await user.type(screen.getByLabelText("Username"), "deploy");
      await user.click(screen.getByRole("button", { name: "SSH Private Key" }));
      await user.type(screen.getByLabelText("Private Key"), "ssh-ed25519 AAAA");
      await user.click(screen.getByRole("button", { name: "Save Server" }));

      expect(screen.getByText(/including the -----BEGIN and -----END lines/)).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("lets an edit keep the saved password", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(
        <AddServerModal
          server={{
            id: "srv-1",
            name: "Prod",
            hostname: "prod",
            address: "203.0.113.10",
            status: "online",
            sshPort: 22,
            username: "deploy",
            authType: "password",
          }}
          onClose={() => undefined}
          onSubmit={onSubmit}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Save Server" }));
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Prod", password: undefined }),
        { connect: false },
      );
    });
  });
});
