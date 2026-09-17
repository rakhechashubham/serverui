"use client";

import { getHighlightLanguage } from "@/src/lib/files/file-type";
import { PreviewToolbar, useTextPreview } from "@/src/components/apps/files/viewers/TextViewer";
import { ViewerMessage, type ViewerFile } from "@/src/components/apps/files/viewers/viewer-ui";
import { useSelectedServer } from "@/src/lib/session";

export function CodeViewer({ file, onClose }: { file: ViewerFile; onClose: () => void }) {
  const serverId = useSelectedServer()?.id || "";
  const preview = useTextPreview(serverId, file.path);
  const language = getHighlightLanguage(file.name);

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

  if (preview.binary) {
    return (
      <div className="h-full bg-[#161616]">
        <ViewerMessage
          tone="danger"
          title="Unsupported format"
          detail="This file looks binary and cannot be previewed as code."
          onClose={onClose}
        />
      </div>
    );
  }

  const lines = preview.content.split("\n");
  const width = String(Math.max(lines.length, 1)).length;

  return (
    <div className="flex h-full flex-col bg-[#161616] text-[#d7d7d7]">
      <PreviewToolbar
        truncated={preview.truncated}
        content={preview.content}
        path={file.path}
        serverId={serverId}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        <pre className="min-w-full p-3 font-mono text-[12.5px] leading-6">
          {lines.map((line, index) => (
            <div key={index} className="flex">
              <span className="w-12 shrink-0 select-none pr-3 text-right text-white/30">
                {String(index + 1).padStart(width, " ")}
              </span>
              <code
                className="grow whitespace-pre"
                dangerouslySetInnerHTML={{
                  __html: highlightLine(line, language),
                }}
              />
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function highlightLine(line: string, language: string) {
  let html = escapeHtml(line);
  html = html.replace(
    /(&quot;.*?&quot;|&#39;.*?&#39;|`.*?`)/g,
    '<span class="text-amber-200">$1</span>',
  );
  html = html.replace(/(\/\/.*$|#.*$)/g, '<span class="text-white/40">$1</span>');
  if (language) {
    html = html.replace(
      /\b(const|let|var|function|return|import|export|from|class|if|else|for|while|switch|case|break|package|func|type|struct|def|async|await|public|private|new)\b/g,
      '<span class="text-sky-300">$1</span>',
    );
  }
  return html || " ";
}
