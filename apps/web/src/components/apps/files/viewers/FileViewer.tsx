"use client";

import { useWindowManager, type WindowPayload } from "@/src/components/window/window-context";
import { getFileViewer } from "@/src/lib/files/file-type";
import { AudioViewer } from "@/src/components/apps/files/viewers/AudioViewer";
import { CodeViewer } from "@/src/components/apps/files/viewers/CodeViewer";
import { ImageViewer } from "@/src/components/apps/files/viewers/ImageViewer";
import { PdfViewer } from "@/src/components/apps/files/viewers/PdfViewer";
import { TextViewer } from "@/src/components/apps/files/viewers/TextViewer";
import { UnknownViewer } from "@/src/components/apps/files/viewers/UnknownViewer";
import { UnsupportedViewer } from "@/src/components/apps/files/viewers/UnsupportedViewer";
import { VideoViewer } from "@/src/components/apps/files/viewers/VideoViewer";

export function FileViewer({ payload, windowId }: { payload?: WindowPayload; windowId: string }) {
  const { closeWindow } = useWindowManager();
  const path = payload?.filePath;
  if (!path) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        No file selected.
      </div>
    );
  }

  const onClose = () => closeWindow(windowId);
  const file = {
    path,
    name: payload.fileName || path.split("/").pop() || path,
    size: payload.fileSize ?? 0,
    modified: payload.modified || "",
  };

  if (payload.isDirectory || payload.infoOnly) {
    return (
      <UnsupportedViewer
        file={file}
        kind={
          payload.isDirectory ? "folder" : getFileViewer({ name: file.name, mime: payload.mime })
        }
        onClose={onClose}
      />
    );
  }

  const kind = getFileViewer({ name: payload.fileName || path, mime: payload.mime });
  switch (kind) {
    case "image":
      return <ImageViewer file={file} onClose={onClose} />;
    case "video":
      return <VideoViewer file={file} onClose={onClose} />;
    case "audio":
      return <AudioViewer file={file} onClose={onClose} />;
    case "pdf":
      return <PdfViewer file={file} onClose={onClose} />;
    case "code":
      return <CodeViewer file={file} onClose={onClose} />;
    case "text":
      return <TextViewer file={file} onClose={onClose} />;
    case "archive":
    case "document":
      return <UnsupportedViewer file={file} kind={kind} onClose={onClose} />;
    default:
      return <UnknownViewer file={file} kind={kind} onClose={onClose} />;
  }
}
