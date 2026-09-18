/**
 * Map API / network failures to short, actionable product copy.
 * Never include credentials, tokens, or private key material.
 */
export function sanitizeErrorText(value: string) {
  return value
    .replace(/-----BEGIN[\s\S]*?-----END [^-]+-----/g, "[redacted key]")
    .replace(/(password|passwd|pwd|token|secret|authorization)\s*[=:]\s*\S+/gi, "$1=[redacted]")
    .trim();
}

export function friendlyError(err: unknown, fallback = "Something went wrong.") {
  const raw = sanitizeErrorText(
    err instanceof Error ? err.message : typeof err === "string" ? err : fallback,
  );
  const message = raw || fallback;
  const lower = message.toLowerCase();

  if (
    lower.includes("authentication") ||
    lower.includes("auth failed") ||
    lower.includes("permission denied") ||
    lower.includes("unable to authenticate")
  ) {
    return {
      title: "Authentication failed",
      detail: "Check the username, password, or private key, then try again.",
      raw: message,
    };
  }

  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("i/o timeout") ||
    lower.includes("deadline exceeded")
  ) {
    return {
      title: "Server unreachable",
      detail: "The host did not respond in time. Check the address, port, and network.",
      raw: message,
    };
  }

  if (
    lower.includes("connection refused") ||
    lower.includes("no route") ||
    lower.includes("network is unreachable") ||
    lower.includes("host unavailable") ||
    lower.includes("dial tcp") ||
    lower.includes("connect:")
  ) {
    return {
      title: "Host unavailable",
      detail: "ServerUI could not reach this host. Verify the IP/hostname and SSH port.",
      raw: message,
    };
  }

  if (
    lower.includes("failed to fetch") ||
    lower.includes("network disconnected") ||
    lower.includes("load failed") ||
    lower.includes("backend")
  ) {
    return {
      title: "ServerUI backend unavailable",
      detail: "The local or remote API did not respond. Retry in a moment.",
      raw: message,
    };
  }

  if (lower.includes("invalid") || lower.includes("validation")) {
    return {
      title: "Invalid configuration",
      detail: "Review the server name, host, port, and credentials.",
      raw: message,
    };
  }

  return {
    title: fallback,
    detail: message,
    raw: message,
  };
}

export function formatConnectionTestMessage(
  ok: boolean,
  latencyMs?: number,
  error?: string | null,
) {
  if (ok) {
    const latency =
      typeof latencyMs === "number" && Number.isFinite(latencyMs)
        ? ` · Latency ${Math.max(0, Math.round(latencyMs))} ms`
        : "";
    return `Connection successful${latency}`;
  }
  const mapped = friendlyError(error || "Connection failed", "Connection failed");
  return `${mapped.title}. ${mapped.detail}`;
}
