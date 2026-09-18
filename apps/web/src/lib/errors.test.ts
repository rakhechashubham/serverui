import { describe, expect, it } from "vitest";
import { formatConnectionTestMessage, friendlyError } from "./errors";

describe("friendlyError", () => {
  it("maps authentication failures", () => {
    const result = friendlyError(new Error("authentication failed: permission denied"));
    expect(result.title).toBe("Authentication failed");
    expect(result.detail).toMatch(/username|password|private key/i);
  });

  it("maps timeouts", () => {
    const result = friendlyError("dial tcp: i/o timeout");
    expect(result.title).toBe("Server unreachable");
  });

  it("maps refused connections", () => {
    const result = friendlyError("connection refused");
    expect(result.title).toBe("Host unavailable");
  });

  it("redacts credential-like fragments", () => {
    const result = friendlyError("login failed password=super-secret-value");
    expect(result.raw).toMatch(/password=\[redacted\]/i);
    expect(result.raw).not.toMatch(/super-secret/);
  });
});

describe("formatConnectionTestMessage", () => {
  it("formats success with latency", () => {
    expect(formatConnectionTestMessage(true, 42)).toBe("Connection successful · Latency 42 ms");
  });

  it("formats failure with friendly copy", () => {
    expect(formatConnectionTestMessage(false, undefined, "authentication failed")).toMatch(
      /Authentication failed/i,
    );
  });
});
