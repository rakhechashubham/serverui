"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ApiError } from "@/src/lib/api/client";
import { px0FrameUrl, startPx0 } from "@/src/lib/api/px0";
import { useSelectedServer } from "@/src/lib/session";
import type { WindowPayload } from "@/src/components/window/window-context";

export function Px0App({ payload }: { payload?: WindowPayload }) {
  // Remounting per server restarts the handshake for the new machine.
  return <Px0 key={useSelectedServer()?.id ?? ""} payload={payload} />;
}

function Px0({ payload }: { payload?: WindowPayload }) {
  const server = useSelectedServer();
  const serverId = server?.id || "";
  const [attempt, setAttempt] = useState(0);
  // Each answer carries the attempt it belongs to, so "starting" is "no answer yet".
  const [answer, setAnswer] = useState<{
    attempt: number;
    base?: string;
    error?: string;
    missing?: boolean;
  } | null>(null);
  const starting = Boolean(serverId) && answer?.attempt !== attempt;

  useEffect(() => {
    if (!serverId) return;
    let cancelled = false;
    startPx0(serverId)
      .then((base) => {
        if (!cancelled) setAnswer({ attempt, base });
      })
      .catch((err) => {
        if (cancelled) return;
        const error = err instanceof ApiError ? err.message : "unable to start px0";
        setAnswer({ attempt, error, missing: err instanceof ApiError && err.status === 409 });
      });
    return () => {
      cancelled = true;
    };
  }, [serverId, attempt]);

  // filePath is already relative to the SSH home, which is px0's root.
  const target = payload?.filePath;
  const src = answer?.base ? px0FrameUrl(answer.base, target) : null;

  if (!serverId) {
    return <Message title="No server selected" />;
  }
  if (starting) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-white/70">
        <Loader2 className="size-6 animate-spin" aria-hidden />
        <p className="text-[13px]" role="status">
          Starting px0 on {server?.name}…
        </p>
      </div>
    );
  }
  if (!src) {
    const missing = answer?.missing;
    return (
      <Message
        title="px0 did not start"
        detail={
          missing
            ? "px0 is not installed on this server. Install it from the Store, then open it again."
            : answer?.error
        }
        onRetry={missing ? undefined : () => setAttempt((n) => n + 1)}
      />
    );
  }
  return (
    <iframe
      title="px0"
      src={src}
      className="size-full border-0 bg-[#1e1e1e]"
      allow="clipboard-read; clipboard-write"
    />
  );
}

function Message({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center text-white/80">
      <p className="text-[15px] font-semibold" role="alert">
        {title}
      </p>
      {detail ? <p className="max-w-[420px] text-[13px] text-white/60">{detail}</p> : null}
      {onRetry ? (
        <button
          type="button"
          className="mt-2 rounded-full bg-white/10 px-4 py-1 text-[12px] font-semibold outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-sky-400"
          onClick={onRetry}
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
