"use client";

import { useEffect, useState } from "react";
import type { Server } from "@/src/lib/servers";

type LogoutScreenProps = {
  server: Server;
  onComplete: () => void;
};

const STEPS = [
  { delay: 0, label: "Closing windows" },
  { delay: 420, label: "Disconnecting session" },
  { delay: 900, label: "Returning to servers" },
] as const;

export function LogoutScreen({ server, onComplete }: LogoutScreenProps) {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: number[] = [];
    let cancelled = false;

    STEPS.forEach((step, index) => {
      timers.push(
        window.setTimeout(
          () => {
            if (!cancelled) setVisible(index + 1);
          },
          reduced ? 0 : step.delay,
        ),
      );
    });

    timers.push(
      window.setTimeout(
        () => {
          if (!cancelled) onComplete();
        },
        reduced ? 200 : 1600,
      ),
    );

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [onComplete]);

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
        <p className="text-[12px] font-medium uppercase tracking-[0.28em] text-white/45">
          ServerUI
        </p>
        <h1 className="mt-5 text-[28px] font-semibold tracking-tight text-white">Logging off</h1>
        <p className="mt-3 text-[15px] text-white/78">{server.name}</p>
        <p className="font-mono text-[12px] text-white/45">
          {server.hostname}
          <span className="text-white/28"> · </span>
          {server.address}
        </p>
        <ol className="mt-10 w-full max-w-md space-y-2 text-left font-mono text-[13px]">
          {STEPS.map((step, index) => {
            const shown = index < visible;
            return (
              <li
                key={step.label}
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
                <span className="min-w-0 text-white/70">{step.label}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
