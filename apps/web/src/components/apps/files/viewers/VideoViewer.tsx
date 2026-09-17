"use client";

import { useState } from "react";
import { mediaUrl } from "@/src/lib/api/files";
import { useSelectedServer } from "@/src/lib/session";
import {
  darkViewerButtonClass,
  ViewerMessage,
  type ViewerFile,
} from "@/src/components/apps/files/viewers/viewer-ui";

export function VideoViewer({ file, onClose }: { file: ViewerFile; onClose: () => void }) {
  const [error, setError] = useState(false);
  const src = mediaUrl(useSelectedServer()?.id || "", file.path);

  if (error) {
    return (
      <div className="h-full bg-[#111]">
        <ViewerMessage
          tone="danger"
          title="Video cannot be played"
          detail={file.name}
          onRetry={() => setError(false)}
          onClose={onClose}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-black">
      <video
        className="h-full w-full bg-black object-contain"
        src={src}
        controls
        playsInline
        preload="metadata"
        onError={() => setError(true)}
      >
        <a href={src} className={darkViewerButtonClass}>
          Download
        </a>
      </video>
    </div>
  );
}
