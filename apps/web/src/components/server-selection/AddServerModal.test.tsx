import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddServerModal } from "@/src/components/server-selection/AddServerModal";

describe("AddServerModal", () => {
  it("requires name, host, username, and password for a new server", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AddServerModal onClose={() => undefined} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "Save Server" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Server name, host, and username are required.",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a password-authenticated server", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<AddServerModal onClose={() => undefined} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Server Name"), "Edge Lab");
    await user.type(screen.getByLabelText("Host / IP"), "203.0.113.10");
    await user.type(screen.getByLabelText("Username"), "deploy");
    await user.type(screen.getByLabelText("Password"), "example-pass");
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
      },
      { connect: false },
    );
  });

  it("offers save and connect on first-run", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<AddServerModal connectAfterSave onClose={() => undefined} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Server Name"), "Edge Lab");
    await user.type(screen.getByLabelText("Host / IP"), "203.0.113.10");
    await user.type(screen.getByLabelText("Username"), "deploy");
    await user.type(screen.getByLabelText("Password"), "example-pass");
    await user.click(screen.getByRole("button", { name: "Save & Connect" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.any(Object), { connect: true });
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
});
