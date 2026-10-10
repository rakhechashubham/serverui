import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ServerStatus, statusTone } from "@/src/components/server-selection/ServerStatus";

describe("ServerStatus", () => {
  it("shows Online for a connected server", () => {
    render(<ServerStatus status="online" />);
    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("shows Authentication failed for rejected credentials", () => {
    render(<ServerStatus status="authentication_failed" />);
    expect(screen.getByText("Authentication failed")).toBeInTheDocument();
  });

  it("shows Connecting while a session is starting", () => {
    render(<ServerStatus status="connecting" />);
    expect(screen.getByText("Connecting")).toBeInTheDocument();
  });

  it("shows Unreachable when the last attempt to reach the host failed", () => {
    render(<ServerStatus status="offline" error="unable to connect to server" />);
    expect(screen.getByText("Unreachable")).toBeInTheDocument();
  });

  it("colors failures red and keeps a clean disconnect grey", () => {
    expect(statusTone("online")).toBe("online");
    expect(statusTone("authentication_failed", "authentication failed")).toBe("failed");
    expect(statusTone("error")).toBe("failed");
    expect(statusTone("host_key_changed")).toBe("failed");
    expect(statusTone("offline", "unable to connect to server")).toBe("failed");
    expect(statusTone("offline")).toBe("idle");
    expect(statusTone("unknown")).toBe("idle");
  });

  it("shows Checking instead of the last result while a test runs", () => {
    render(<ServerStatus status="online" checking />);
    expect(screen.getByText("Checking…")).toBeInTheDocument();
    expect(screen.queryByText("Online")).not.toBeInTheDocument();
  });

  it("shows Host key changed when the host key no longer matches", () => {
    render(<ServerStatus status="host_key_changed" />);
    expect(screen.getByText("Host key changed")).toBeInTheDocument();
  });
});
