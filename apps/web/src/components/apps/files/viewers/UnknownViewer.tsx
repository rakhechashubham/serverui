"use client";

import { looksLikeText } from "@/src/lib/files/file-type";
import { PreviewToolbar, useTextPreview } from "@/src/components/apps/files/viewers/TextViewer";
import { UnsupportedViewer } from "@/src/components/apps/files/viewers/UnsupportedViewer";
import { ViewerMessage, type ViewerFile } from "@/src/components/apps/files/viewers/viewer-ui";
import { useSelectedServer } from "@/src/lib/session";

export function UnknownViewer({
  file,
  kind,
  onClose,
}: {
  file: ViewerFile;
  kind: string;
  onClose: () => void;
}) {
  const serverId = useSelectedServer()?.id || "";
  const preview = useTextPreview(serverId, file.path);

  if (preview.error) {
    return (
      <ViewerMessage
        tone="danger"
        title={preview.error}
        onRetry={preview.reload}
        onClose={onClose}
      />
    );
  }

  if (preview.loading) {
    return (
      <div className="flex h-full items-center justify-center sui-app text-sm sui-muted">
        Loading file…
      </div>
    );
  }

  if (preview.binary || !looksLikeText(preview.content)) {
    return <UnsupportedViewer file={file} kind={kind} onClose={onClose} />;
  }

  return (
    <div className="flex h-full flex-col bg-[#161616] text-[#d7d7d7]">
      <PreviewToolbar
        truncated={preview.truncated}
        content={preview.content}
        path={file.path}
        serverId={serverId}
      />
      <pre className="min-h-0 flex-1 overflow-auto p-4 font-mono text-[12.5px] leading-6 whitespace-pre">
        {preview.content || " "}
      </pre>
    </div>
  );
}
