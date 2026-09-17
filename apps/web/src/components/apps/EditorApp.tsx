"use client";

import { Code } from "lucide-react";

export function EditorApp() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 sui-app px-8 text-center">
      <Code aria-hidden className="size-10 sui-muted" />
      <h3 className="text-2xl font-semibold tracking-tight sui-title">Code Editor</h3>
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] sui-muted">Coming Soon</p>
      <p className="max-w-sm text-sm leading-6 sui-muted">
        Files can be opened in read-only viewers. A full editor lands in a later phase.
      </p>
    </div>
  );
}
