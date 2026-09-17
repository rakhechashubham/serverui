"use client";

import { ChevronRight } from "lucide-react";

export function Breadcrumbs({
  path,
  onNavigate,
}: {
  path: string;
  onNavigate: (next: string) => void;
}) {
  const parts = path === "/" ? [] : path.split("/").filter(Boolean);
  return (
    <nav
      aria-label="Location"
      className="flex min-w-0 flex-1 items-center overflow-x-auto text-[12px]"
    >
      <button
        type="button"
        className="shrink-0 rounded px-1.5 py-0.5 sui-muted outline-none sui-hover hover:text-[var(--app-title)]"
        onClick={() => onNavigate("/")}
      >
        /
      </button>
      {parts.map((part, index) => {
        const target = `/${parts.slice(0, index + 1).join("/")}`;
        return (
          <span key={target} className="flex min-w-0 items-center">
            <ChevronRight aria-hidden className="size-3 shrink-0 text-neutral-400" />
            <button
              type="button"
              className="truncate rounded px-1.5 py-0.5 sui-muted outline-none sui-hover hover:text-[var(--app-title)]"
              onClick={() => onNavigate(target)}
            >
              {part}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
