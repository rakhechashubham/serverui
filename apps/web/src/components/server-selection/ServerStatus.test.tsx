import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ServerStatus } from "@/src/components/server-selection/ServerStatus";

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
});
