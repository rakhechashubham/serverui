"use client";

import type { PointerEvent, ReactNode } from "react";
import type { WindowChrome } from "@/src/data/apps";

type WindowHeaderProps = {
  title: string;
  focused: boolean;
  chrome: WindowChrome;
  maximized: boolean;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onDoubleClick: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
};

export function WindowHeader({
  title,
  focused,
  chrome,
  maximized,
  onPointerDown,
  onDoubleClick,
  onMinimize,
  onMaximize,
  onClose,
}: WindowHeaderProps) {
  const light = chrome === "light";

  return (
    <header
      className={`relative flex h-11 shrink-0 cursor-grab items-center px-3 select-none active:cursor-grabbing ${
        light
          ? focused
            ? "bg-[var(--window-header)]"
            : "bg-[var(--window-header-inactive)]"
          : focused
            ? "bg-[#2b2b2e]"
            : "bg-[#242426]"
      }`}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      <div className="group/traffic z-10 flex items-center gap-[7px]">
        <TrafficLight
          label="Close"
          className={
            focused
              ? "bg-[#ff5f57] text-[#4d0000]"
              : "bg-[#8e8e93] text-[#4d0000] group-hover/traffic:bg-[#ff5f57]"
          }
          onClick={onClose}
        >
          <CloseGlyph />
        </TrafficLight>
        <TrafficLight
          label="Minimize"
          className={
            focused
              ? "bg-[#febc2e] text-[#9a5f00]"
              : "bg-[#8e8e93] text-[#9a5f00] group-hover/traffic:bg-[#febc2e]"
          }
          onClick={onMinimize}
        >
          <MinimizeGlyph />
        </TrafficLight>
        <TrafficLight
          label={maximized ? "Restore" : "Maximize"}
          className={
            focused
              ? "bg-[#28c840] text-[#0b5a12]"
              : "bg-[#8e8e93] text-[#0b5a12] group-hover/traffic:bg-[#28c840]"
          }
          onClick={onMaximize}
        >
          <ZoomGlyph restore={maximized} />
        </TrafficLight>
      </div>
      <h2
        className={`pointer-events-none absolute inset-x-16 truncate text-center text-[13px] font-medium ${
          light ? "text-[var(--window-title)]" : "text-white/80"
        }`}
      >
        {title}
      </h2>
    </header>
  );
}

function TrafficLight({
  label,
  className,
  onClick,
  children,
}: {
  label: string;
  className: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`flex size-3 items-center justify-center rounded-full outline-none ${className}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <span className="flex opacity-0 transition-opacity duration-75 group-hover/traffic:opacity-100 group-focus-within/traffic:opacity-100">
        {children}
      </span>
    </button>
  );
}

function CloseGlyph() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden className="size-[7px]">
      <path
        d="M3 3l6 6M9 3l-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MinimizeGlyph() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden className="size-[7px]">
      <path
        d="M2.5 6.1h7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ZoomGlyph({ restore }: { restore: boolean }) {
  if (restore) {
    return (
      <svg viewBox="0 0 12 12" aria-hidden className="size-[8px]">
        <path fill="currentColor" d="M1.6 6.6h3.8V2.8L1.6 6.6Z" />
        <path fill="currentColor" d="M10.4 5.4H6.6v3.8l3.8-3.8Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 12 12" aria-hidden className="size-[8px]">
      <path fill="currentColor" d="M6.4 1.4h4.2v4.2L6.4 1.4Z" />
      <path fill="currentColor" d="M5.6 10.6H1.4V6.4l4.2 4.2Z" />
    </svg>
  );
}
