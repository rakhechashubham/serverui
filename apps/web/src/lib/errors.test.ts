import { describe, expect, it } from "vitest";
import { formatConnectionTestMessage, friendlyError } from "./errors";
import {
  formatSSHError,
  isAuthError,
  isNetworkError,
  isKeyError,
  isRetryableError,
  SSHErrorResponse,
  getErrorTitle,
  getErrorHint,
  getErrorDocsUrl,
} from "./ssh-errors";

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

  it("handles structured SSH error response", () => {
    const sshErr: SSHErrorResponse = {
      code: "SSH_AUTH_FAILED",
      message: "Authentication failed",
      hint: "Check your credentials",
      docs_url: "https://docs.example.com/auth",
      retryable: false,
    };
    const result = friendlyError(sshErr);
    expect(result.title).toBe("Authentication Failed");
    expect(result.detail).toContain("password");
    expect(result.hint).toBe("Check your credentials");
    expect(result.docsUrl).toBe("https://docs.example.com/auth");
    expect(result.retryable).toBe(false);
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

describe("ssh-errors", () => {
  describe("formatSSHError", () => {
    it("formats passphrase-protected key error", () => {
      const err: SSHErrorResponse = {
        code: "SSH_KEY_PASSPHRASE_PROTECTED",
        message: "The private key is protected by a passphrase.",
        hint: "Remove the passphrase with ssh-keygen -p",
        docs_url: "https://docs.example.com/ssh-keys",
        retryable: false,
      };
      const result = formatSSHError(err);
      expect(result.title).toBe("Passphrase-Protected Key");
      expect(result.detail).toContain("passphrase");
      expect(result.hint).toContain("ssh-keygen");
      expect(result.docsUrl).toContain("ssh-keys");
      expect(result.retryable).toBe(false);
    });

    it("formats connection timeout error", () => {
      const err: SSHErrorResponse = {
        code: "SSH_CONNECTION_TIMEOUT",
        message: "Connection timed out.",
        hint: "Check the port and firewall",
        docs_url: "https://docs.example.com/timeout",
        retryable: true,
        host: "example.com",
        port: 22,
      };
      const result = formatSSHError(err);
      expect(result.title).toBe("Connection Timed Out");
      expect(result.retryable).toBe(true);
    });

    it("handles legacy error codes", () => {
      const err: SSHErrorResponse = {
        code: "auth_failed",
        message: "Authentication failed",
        retryable: false,
      };
      const result = formatSSHError(err);
      expect(result.title).toBe("Authentication Failed");
      expect(result.retryable).toBe(false);
    });
  });

  describe("isRetryableError", () => {
    it("returns true for network errors", () => {
      expect(
        isRetryableError({ code: "SSH_CONNECTION_TIMEOUT", message: "", retryable: true }),
      ).toBe(true);
      expect(
        isRetryableError({ code: "SSH_DNS_RESOLUTION_FAILED", message: "", retryable: true }),
      ).toBe(true);
      expect(isRetryableError({ code: "timeout", message: "", retryable: true })).toBe(true);
    });

    it("returns false for auth errors", () => {
      expect(isRetryableError({ code: "SSH_AUTH_FAILED", message: "", retryable: false })).toBe(
        false,
      );
      expect(isRetryableError({ code: "auth_failed", message: "", retryable: false })).toBe(false);
    });

    it("returns false for key errors", () => {
      expect(
        isRetryableError({ code: "SSH_KEY_PASSPHRASE_PROTECTED", message: "", retryable: false }),
      ).toBe(false);
      expect(isRetryableError({ code: "invalid_private_key", message: "", retryable: false })).toBe(
        false,
      );
    });
  });

  describe("isAuthError", () => {
    it("returns true for auth errors", () => {
      expect(isAuthError({ code: "SSH_AUTH_FAILED", message: "" })).toBe(true);
      expect(isAuthError({ code: "SSH_AUTH_NO_VALID_METHODS", message: "" })).toBe(true);
      expect(isAuthError({ code: "auth_failed", message: "" })).toBe(true);
    });

    it("returns false for non-auth errors", () => {
      expect(isAuthError({ code: "SSH_CONNECTION_TIMEOUT", message: "" })).toBe(false);
      expect(isAuthError({ code: "SSH_KEY_INVALID_FORMAT", message: "" })).toBe(false);
    });
  });

  describe("isKeyError", () => {
    it("returns true for key errors", () => {
      expect(isKeyError({ code: "SSH_KEY_PASSPHRASE_PROTECTED", message: "" })).toBe(true);
      expect(isKeyError({ code: "SSH_KEY_INVALID_FORMAT", message: "" })).toBe(true);
      expect(isKeyError({ code: "invalid_private_key", message: "" })).toBe(true);
    });

    it("returns false for non-key errors", () => {
      expect(isKeyError({ code: "SSH_AUTH_FAILED", message: "" })).toBe(false);
      expect(isKeyError({ code: "SSH_CONNECTION_TIMEOUT", message: "" })).toBe(false);
    });
  });

  describe("isNetworkError", () => {
    it("returns true for network errors", () => {
      expect(isNetworkError({ code: "SSH_CONNECTION_TIMEOUT", message: "" })).toBe(true);
      expect(isNetworkError({ code: "SSH_DNS_RESOLUTION_FAILED", message: "" })).toBe(true);
      expect(isNetworkError({ code: "connection_refused", message: "" })).toBe(true);
    });

    it("returns false for non-network errors", () => {
      expect(isNetworkError({ code: "SSH_AUTH_FAILED", message: "" })).toBe(false);
      expect(isNetworkError({ code: "SSH_KEY_INVALID_FORMAT", message: "" })).toBe(false);
    });
  });

  describe("getErrorTitle", () => {
    it("returns correct titles for new codes", () => {
      expect(getErrorTitle("SSH_KEY_PASSPHRASE_PROTECTED")).toBe("Passphrase-Protected Key");
      expect(getErrorTitle("SSH_CONNECTION_TIMEOUT")).toBe("Connection Timed Out");
      expect(getErrorTitle("SSH_AUTH_FAILED")).toBe("Authentication Failed");
    });

    it("returns correct titles for legacy codes", () => {
      expect(getErrorTitle("auth_failed")).toBe("Authentication Failed");
      expect(getErrorTitle("timeout")).toBe("Connection Timed Out");
      expect(getErrorTitle("invalid_private_key")).toBe("Invalid Private Key");
    });
  });

  describe("getErrorHint", () => {
    it("returns actionable hints", () => {
      const hint = getErrorHint("SSH_KEY_PASSPHRASE_PROTECTED");
      expect(hint).toContain("ssh-keygen");
      expect(hint).toContain("passphrase");
    });

    it("returns actionable hints for timeout", () => {
      const hint = getErrorHint("SSH_CONNECTION_TIMEOUT");
      expect(hint).toContain("port");
      expect(hint).toContain("firewall");
    });
  });

  describe("getErrorDocsUrl", () => {
    it("returns correct docs URLs", () => {
      expect(getErrorDocsUrl("SSH_KEY_PASSPHRASE_PROTECTED")).toContain("ssh-keys");
      expect(getErrorDocsUrl("SSH_CONNECTION_TIMEOUT")).toContain("troubleshooting");
      expect(getErrorDocsUrl("SSH_AUTH_FAILED")).toContain("troubleshooting");
    });
  });
});
