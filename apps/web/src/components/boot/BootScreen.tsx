"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Server } from "@/src/lib/servers";
import { connectServer } from "@/src/lib/api/server";
import { friendlyError } from "@/src/lib/errors";
import { useSession } from "@/src/lib/session";

type BootScreenProps = {
  server: Server;
  onComplete: () => void;
};

const STEPS = [
  "Connecting to server",
  "Resolving server",
  "Establishing SSH connection",
  "Authenticating",
  "Checking server environment",
  "Loading filesystem",
  "Starting ServerUI session",
] as const;

export function BootScreen({ server, onComplete }: BootScreenProps) {
  const { backToServers } = useSession();
  const [visible, setVisible] = useState(1);
  const [status, setStatus] = useState<"running" | "ready" | "error">("running");
  const [error, setError] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState("Unable to connect");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cancelled = false;
    const timers: number[] = [];

    void (async () => {
      try {
        await connectServer(server.id);
        if (cancelled) return;
        STEPS.forEach((_, index) => {
          const delay = reduced ? 0 : 180 * index;
          timers.push(
            window.setTimeout(() => {
              if (!cancelled) setVisible(index + 1);
            }, delay),
          );
        });
        timers.push(
          window.setTimeout(
            () => {
              if (cancelled) return;
              setStatus("ready");
              timers.push(
                window.setTimeout(
                  () => {
                    if (!cancelled) onComplete();
                  },
                  reduced ? 40 : 280,
                ),
              );
            },
            reduced ? 80 : 180 * STEPS.length + 120,
          ),
        );
      } catch (err) {
        if (cancelled) return;
        const mapped = friendlyError(err, `Unable to connect to ${server.name}.`);
        setStatus("error");
        setErrorTitle(mapped.title);
        setError(mapped.detail);
      }
    })();

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [attempt, onComplete, server.id, server.name]);

  if (status === "error") {
    return (
      <BootFrame>
        <p className="text-[12px] font-medium uppercase tracking-[0.28em] text-white/45">
          ServerUI
        </p>
        <h1 className="mt-5 text-[28px] font-semibold tracking-tight text-white">{errorTitle}</h1>
        <p className="mt-2 max-w-md text-[14px] leading-6 text-white/62">
          ServerUI couldn&apos;t connect to {server.name}.{" "}
          {error || "Try again or edit the server."}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setErrorTitle("Unable to connect");
              setStatus("running");
              setVisible(1);
              setAttempt((value) => value + 1);
            }}
            className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-zinc-900"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={backToServers}
            className="rounded-full bg-white/10 px-4 py-2 text-[13px] font-medium text-white"
          >
            Back to Servers
          </button>
        </div>
      </BootFrame>
    );
  }

  return (
    <BootFrame>
      <p className="text-[12px] font-medium uppercase tracking-[0.28em] text-white/45">ServerUI</p>
      <h1 className="mt-5 text-[28px] font-semibold tracking-tight text-white">
        Connecting to {server.name}
      </h1>
      <p className="mt-3 text-[15px] text-white/78">{server.name}</p>
      <p className="font-mono text-[12px] text-white/45">
        {server.hostname}
        <span className="text-white/28"> · </span>
        {server.address}
      </p>

      <ol className="mt-10 w-full max-w-md space-y-2 text-left font-mono text-[13px]">
        {STEPS.map((step, index) => {
          const shown = index < visible;
          const current = index === visible - 1 && status === "running";
          return (
            <li
              key={step}
              className={`flex items-baseline gap-3 transition-opacity duration-300 ${
                shown ? "opacity-100" : "opacity-0"
              }`}
            >
              <span
                className={`w-12 shrink-0 whitespace-nowrap text-[11px] ${
                  shown ? "text-emerald-400" : "text-white/25"
                }`}
              >
                {shown ? "[ OK ]" : "[    ]"}
              </span>
              <span className={`min-w-0 ${current ? "text-white" : "text-white/70"}`}>
                {index === 0 ? `Connecting to ${server.name}` : step}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-10 text-[13px] text-white/42">
        {status === "ready" ? "Welcome to ServerUI" : "Initializing environment…"}
      </p>
    </BootFrame>
  );
}

function BootFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-dvh w-full items-center justify-center overflow-hidden bg-[#07090c] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-25"
        style={{ backgroundImage: "url('/wallpaper.jpg?v=luffy')" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_48%),linear-gradient(to_bottom,rgba(0,0,0,0.35),rgba(0,0,0,0.78))]"
      />
      <div className="relative flex w-full max-w-xl flex-col items-center px-6 text-center animate-boot-in">
        {children}
      </div>
    </div>
  );
}
