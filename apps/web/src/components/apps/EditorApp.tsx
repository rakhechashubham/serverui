"use client";

import { ExternalLink } from "lucide-react";
import { EditorMacIcon } from "@/src/components/desktop/mac-icons";
import { TextEditor } from "@/src/components/apps/editor/TextEditor";
import { useWindowManager, type WindowPayload } from "@/src/components/window/window-context";

const PX0_GITHUB = "https://github.com/px0-ai/px0";
const PX0_SITE = "https://px0.ai/";
const ARPIT_SITE = "https://arpitbhayani.me/";

export function EditorApp({ payload, windowId }: { payload?: WindowPayload; windowId: string }) {
  const { closeWindow } = useWindowManager();
  // Opened on a file (Edit from Files): a plain text editor until px0 lands.
  if (payload?.filePath) {
    return (
      <TextEditor
        filePath={payload.filePath}
        fileName={payload.fileName || payload.filePath.split("/").pop() || payload.filePath}
        windowId={windowId}
        onClose={() => closeWindow(windowId)}
      />
    );
  }
  return <Px0Placeholder />;
}

function Px0Placeholder() {
  return (
    <div className="h-full overflow-auto text-[#f4f4f5]">
      <div className="flex min-h-full flex-col items-center justify-center px-8 py-10 text-center">
        <div className="sui-editor-hero relative size-[108px]">
          <EditorMacIcon className="size-full" />
        </div>

        <h3 className="mt-7 text-[34px] font-semibold tracking-tight">Code Editor</h3>
        <p className="mt-3 text-[11px] font-medium tracking-[0.28em] text-white/40">COMING SOON</p>
        <p className="mt-4 max-w-[420px] text-[15px] leading-6 text-white/70">
          We&apos;re planning to integrate px0 as the code editor.
        </p>
        <p className="mt-2 max-w-[380px] text-[13px] leading-6 text-white/40">
          px0 is an open-source, fast and lightweight IDE
          <br />
          built by{" "}
          <a
            href={ARPIT_SITE}
            target="_blank"
            rel="noreferrer"
            className="text-white/55 underline-offset-2 transition-colors hover:text-white/80 hover:underline"
          >
            Arpit Bhayani
          </a>
          .
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href={PX0_GITHUB}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-full sui-card px-5 text-[14px] font-medium text-white/90 transition-colors hover:bg-white/14"
          >
            <GitHubMark />
            GitHub
            <ExternalLink className="size-3.5 text-white/45" strokeWidth={1.75} />
          </a>
          <a
            href={PX0_SITE}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-transparent px-5 text-[14px] font-medium text-white/80 ring-1 ring-white/16 transition-colors hover:bg-white/5"
          >
            Learn about px0
            <ExternalLink className="size-3.5 text-white/45" strokeWidth={1.75} />
          </a>
        </div>

        <div className="mt-10 w-full max-w-[380px]">
          <div className="flex items-center gap-4">
            <span className="h-px flex-1 bg-white/10" />
            <p className="shrink-0 text-[12px] text-white/40">
              Powered by <span className="font-medium text-white/75">px</span>
              <span className="font-medium text-[#FFC107]">0</span>
            </p>
            <span className="h-px flex-1 bg-white/10" />
          </div>
          <p className="mt-1 text-center text-[11px] text-white/30">
            by{" "}
            <a
              href={ARPIT_SITE}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-white/55 hover:underline hover:underline-offset-2"
            >
              Arpit Bhayani
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4 fill-current">
      <path d="M8 0a8 8 0 0 0-2.5 15.6c.4.07.5-.17.5-.38v-1.3c-2.2.48-2.7-1.05-2.7-1.05-.36-.92-.88-1.17-.88-1.17-.72-.5.05-.49.05-.49.8.06 1.22.83 1.22.83.71 1.22 1.86.87 2.31.66.07-.52.28-.87.5-1.07-1.76-.2-3.62-.88-3.62-3.92 0-.87.31-1.58.82-2.13-.08-.2-.36-1.02.08-2.12 0 0 .67-.22 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.55.82 1.26.82 2.13 0 3.05-1.86 3.72-3.64 3.92.29.25.54.73.54 1.48v2.2c0 .21.14.46.55.38A8 8 0 0 0 8 0Z" />
    </svg>
  );
}
