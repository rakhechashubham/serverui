"use client";

import { useState } from "react";
import { mediaUrl } from "@/src/lib/api/files";
import { useSelectedServer } from "@/src/lib/session";
import { ViewerMessage, type ViewerFile } from "@/src/components/apps/files/viewers/viewer-ui";

export function ImageViewer({ file, onClose }: { file: ViewerFile; onClose: () => void }) {
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const src = mediaUrl(useSelectedServer()?.id || "", file.path);

  if (error) {
    return (
      <ViewerMessage
        tone="danger"
        title="Image cannot be loaded"
        detail={file.name}
        onRetry={() => setError(false)}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="flex h-full flex-col sui-app">
      <div className="flex items-center justify-end gap-2 border-b sui-hairline px-3 py-2 text-[12px]">
        <button
          type="button"
          className="sui-hover rounded-md px-2 py-1 sui-muted outline-none"
          onClick={() => setZoom((value) => Math.max(0.25, value - 0.25))}
        >
          −
        </button>
        <span className="w-12 text-center tabular-nums sui-muted">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className="sui-hover rounded-md px-2 py-1 sui-muted outline-none"
          onClick={() => setZoom((value) => Math.min(4, value + 0.25))}
        >
          +
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto sui-app-2 p-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={file.name}
          className="max-h-full max-w-full object-contain"
          style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
          onError={() => setError(true)}
        />
      </div>
    </div>
  );
}
