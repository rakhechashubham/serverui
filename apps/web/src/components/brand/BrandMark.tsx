"use client";

type BrandMarkProps = {
  size?: number;
  className?: string;
  /** Show "ServerUI" text beside the mark */
  withWordmark?: boolean;
  wordmarkClassName?: string;
  alt?: string;
};

/**
 * Canonical ServerUI brand mark (shared web + desktop UI).
 * Asset source of truth: branding/serverui-icon-1024.png
 */
export function BrandMark({
  size = 28,
  className = "",
  withWordmark = false,
  wordmarkClassName = "font-semibold tracking-tight",
  alt = "ServerUI",
}: BrandMarkProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/serverui-icon.png"
        width={size}
        height={size}
        alt={alt}
        className="shrink-0 rounded-[22%] shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
        draggable={false}
      />
      {withWordmark ? <span className={wordmarkClassName}>ServerUI</span> : null}
    </span>
  );
}
