"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { ApiError } from "@/src/lib/api/client";
import { codeFrameUrl, startCode, type CodeTarget } from "@/src/lib/api/code";
import { parentPath } from "@/src/lib/api/files";
import { useSelectedServer } from "@/src/lib/session";
import type { WindowPayload } from "@/src/components/window/window-context";

function targetOf(payload?: WindowPayload): CodeTarget {
  const path = payload?.filePath;
  if (!path) return { folder: payload?.cwd };
  if (payload.isDirectory) return { folder: path };
  return { folder: parentPath(path), file: path };
}

export function VsCodeApp({ payload }: { payload?: WindowPayload }) {
  // Remounting per server restarts the handshake for the new machine.
  return <VsCode key={useSelectedServer()?.id ?? ""} payload={payload} />;
}

function VsCode({ payload }: { payload?: WindowPayload }) {
  const server = useSelectedServer();
  const serverId = server?.id || "";
  const [attempt, setAttempt] = useState(0);
  // Each answer carries the attempt it belongs to, so "starting" is "no answer yet".
  const [answer, setAnswer] = useState<{ attempt: number; base?: string; error?: string } | null>(
    null,
  );
  const starting = Boolean(serverId) && answer?.attempt !== attempt;

  useEffect(() => {
    if (!serverId) return;
    let cancelled = false;
    startCode(serverId)
      .then((base) => {
        if (!cancelled) setAnswer({ attempt, base });
      })
      .catch((err) => {
        if (cancelled) return;
        const error = err instanceof ApiError ? err.message : "unable to start VS Code";
        setAnswer({ attempt, error });
      });
    return () => {
      cancelled = true;
    };
  }, [serverId, attempt]);

  const target = useMemo(() => targetOf(payload), [payload]);
  const src = answer?.base ? codeFrameUrl(answer.base, target) : null;

  if (!serverId) {
    return <Message title="No server selected" />;
  }
  if (starting) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-white/70">
        <Loader2 className="size-6 animate-spin" aria-hidden />
        <p className="text-[13px]" role="status">
          Starting VS Code on {server?.name}…
        </p>
      </div>
    );
  }
  if (!src) {
    const missing = answer?.error?.includes("not installed");
    return (
      <Message
        title="VS Code did not start"
        detail={
          missing
            ? "VS Code is not installed on this server. Install it from the Store, then open it again."
            : answer?.error
        }
        onRetry={missing ? undefined : () => setAttempt((n) => n + 1)}
      />
    );
  }
  return (
    <iframe
      title="VS Code"
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
