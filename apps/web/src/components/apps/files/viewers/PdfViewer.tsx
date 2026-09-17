"use client";

import { useState } from "react";
import { mediaUrl } from "@/src/lib/api/files";
import { useSelectedServer } from "@/src/lib/session";
import { ViewerMessage, type ViewerFile } from "@/src/components/apps/files/viewers/viewer-ui";

export function PdfViewer({ file, onClose }: { file: ViewerFile; onClose: () => void }) {
  const [error, setError] = useState(false);
  const src = mediaUrl(useSelectedServer()?.id || "", file.path);

  if (error) {
    return (
      <ViewerMessage
        tone="danger"
        title="PDF cannot be displayed"
        detail={file.name}
        onRetry={() => setError(false)}
        onClose={onClose}
      />
    );
  }

  return (
    <iframe
      title={file.name}
      src={src}
      className="h-full w-full border-0 bg-white"
      onError={() => setError(true)}
    />
  );
}
