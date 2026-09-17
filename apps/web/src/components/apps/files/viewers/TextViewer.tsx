"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/src/lib/api/client";
import { downloadUrl, readFile } from "@/src/lib/api/files";
import { looksLikeText } from "@/src/lib/files/file-type";
import { useSelectedServer } from "@/src/lib/session";
import { ViewerMessage, type ViewerFile } from "@/src/components/apps/files/viewers/viewer-ui";

export function TextViewer({ file, onClose }: { file: ViewerFile; onClose: () => void }) {
  const serverId = useSelectedServer()?.id || "";
  const preview = useTextPreview(serverId, file.path);

  if (preview.error) {
    return (
      <div className="h-full bg-[#161616]">
        <ViewerMessage
          tone="danger"
          title={preview.error}
          onRetry={preview.reload}
          onClose={onClose}
        />
      </div>
    );
  }

  if (preview.loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#161616] text-sm text-white/50">
        Loading file…
      </div>
    );
  }

  if (preview.binary || !looksLikeText(preview.content)) {
    return (
      <div className="h-full bg-[#161616]">
        <ViewerMessage
          tone="danger"
          title="Unsupported format"
          detail="This file looks binary and cannot be previewed as text."
          onClose={onClose}
        />
      </div>
    );
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

export function useTextPreview(serverId: string, path: string) {
  const [data, setData] = useState<{
    path: string;
    content: string;
    truncated: boolean;
    binary: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!serverId) return;
    let cancelled = false;
    readFile(serverId, path)
      .then((result) => {
        if (cancelled) return;
        setData({
          path,
          content: result.content,
          truncated: Boolean(result.truncated),
          binary: Boolean(result.binary),
        });
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "unable to read file");
      });
    return () => {
      cancelled = true;
    };
  }, [path, nonce, serverId]);

  return {
    content: data?.path === path ? data.content : "",
    truncated: data?.path === path ? data.truncated : false,
    binary: data?.path === path ? data.binary : false,
    loading: data?.path !== path && !error,
    error,
    reload: () => {
      setError(null);
      setNonce((value) => value + 1);
    },
  };
}

export function PreviewToolbar({
  truncated,
  content,
  path,
  serverId,
}: {
  truncated: boolean;
  content: string;
  path: string;
  serverId: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-end gap-2 border-b border-white/10 px-3 py-2">
      {truncated ? (
        <span className="mr-auto text-[11px] text-amber-200">
          Preview only — file is large. Download for the full contents.
        </span>
      ) : null}
      <button
        type="button"
        className={darkCopyClass}
        onClick={async () => {
          await navigator.clipboard.writeText(content);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <a href={downloadUrl(serverId, path)} className={darkCopyClass}>
        Download
      </a>
    </div>
  );
}

const darkCopyClass =
  "rounded-md bg-white/10 px-2 py-1 text-[12px] text-white outline-none hover:bg-white/15";
