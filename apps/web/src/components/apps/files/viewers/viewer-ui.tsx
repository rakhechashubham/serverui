"use client";

export type ViewerFile = {
  path: string;
  name: string;
  size: number;
  modified: string;
};

export function ViewerMessage({
  tone = "neutral",
  title,
  detail,
  onRetry,
  onClose,
}: {
  tone?: "neutral" | "danger";
  title: string;
  detail?: string;
  onRetry?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <p className={`text-sm font-medium ${tone === "danger" ? "text-red-500" : "sui-muted"}`}>
        {title}
      </p>
      {detail ? <p className="max-w-md text-[13px] sui-muted">{detail}</p> : null}
      <div className="flex items-center gap-2">
        {onRetry ? (
          <button type="button" className={viewerButtonClass} onClick={onRetry}>
            Retry
          </button>
        ) : null}
        <button type="button" className={viewerButtonClass} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

export const viewerButtonClass =
  "sui-hover rounded-md px-3 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-sky-400";

export const darkViewerButtonClass =
  "rounded-md bg-white/10 px-3 py-1.5 text-[13px] text-white outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-sky-400";
