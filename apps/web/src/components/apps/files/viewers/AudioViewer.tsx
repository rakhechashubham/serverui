"use client";

import { useState } from "react";
import { mediaUrl } from "@/src/lib/api/files";
import { useSelectedServer } from "@/src/lib/session";
import { ViewerMessage, type ViewerFile } from "@/src/components/apps/files/viewers/viewer-ui";

export function AudioViewer({ file, onClose }: { file: ViewerFile; onClose: () => void }) {
  const [error, setError] = useState(false);
  const src = mediaUrl(useSelectedServer()?.id || "", file.path);

  if (error) {
    return (
      <div className="h-full bg-[#161616]">
        <ViewerMessage
          tone="danger"
          title="Unable to read file"
          detail="This audio file cannot be played."
          onRetry={() => setError(false)}
          onClose={onClose}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-[#161616] px-8 text-white">
      <p className="text-4xl" aria-hidden>
        ♪
      </p>
      <p className="max-w-full truncate text-sm text-white/70">{file.name}</p>
      <audio
        className="w-full max-w-lg"
        src={src}
        controls
        preload="metadata"
        onError={() => setError(true)}
      />
    </div>
  );
}
