import type { ServerStatus as Status } from "@/src/lib/servers";

type StatusTone = "online" | "connecting" | "failed" | "idle";

export function statusTone(status: Status, error?: string): StatusTone {
  if (status === "online") return "online";
  if (status === "connecting") return "connecting";
  if (status === "authentication_failed" || status === "host_key_changed" || status === "error") {
    return "failed";
  }
  if (status === "offline" && error) return "failed";
  return "idle";
}

const STATUS_DOT: Record<StatusTone, string> = {
  online: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]",
  connecting: "bg-amber-300",
  failed: "bg-red-400",
  idle: "bg-zinc-400",
};

export function statusDot(status: Status, error?: string, checking?: boolean) {
  return STATUS_DOT[checking ? "connecting" : statusTone(status, error)];
}

export function ServerStatus({
  status,
  error,
  checking,
}: {
  status: Status;
  error?: string;
  checking?: boolean;
}) {
  const label = checking
    ? "Checking…"
    : status === "online"
      ? "Online"
      : status === "connecting"
        ? "Connecting"
        : status === "authentication_failed"
          ? "Authentication failed"
          : status === "host_key_changed"
            ? "Host key changed"
            : status === "error"
              ? "Error"
              : status === "unknown"
                ? "Unknown"
                : error
                  ? "Unreachable"
                  : "Offline";

  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-white/78">
      <span className={`size-1.5 rounded-full ${statusDot(status, error, checking)}`} aria-hidden />
      <span>{label}</span>
    </span>
  );
}
