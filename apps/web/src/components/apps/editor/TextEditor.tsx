"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ApiError } from "@/src/lib/api/client";
import { readFile, writeFile } from "@/src/lib/api/files";
import { looksLikeText } from "@/src/lib/files/file-type";
import { useSelectedServer } from "@/src/lib/session";
import { setCloseGuard } from "@/src/components/window/window-context";
import {
  ViewerMessage,
  darkViewerButtonClass,
} from "@/src/components/apps/files/viewers/viewer-ui";

type Loaded = { text: string; crlf: boolean; writable: boolean };

/** A textarea always reports "\n"; files that used "\r\n" get it back on save. */
export function toDisk(text: string, crlf: boolean) {
  return crlf ? text.replace(/\r?\n/g, "\r\n") : text;
}

export function fromDisk(content: string): { text: string; crlf: boolean } {
  return { text: content.replace(/\r\n/g, "\n"), crlf: content.includes("\r\n") };
}

export function TextEditor({
  filePath,
  fileName,
  windowId,
  onClose,
}: {
  filePath: string;
  fileName: string;
  windowId: string;
  onClose: () => void;
}) {
  const server = useSelectedServer();
  const serverId = server?.id || "";
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [refused, setRefused] = useState<{ title: string; detail: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [nonce, setNonce] = useState(0);
  const gutterRef = useRef<HTMLDivElement>(null);

  const dirty = loaded !== null && value !== loaded.text;
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    if (!serverId) return;
    let cancelled = false;
    readFile(serverId, filePath)
      .then((result) => {
        if (cancelled) return;
        if (result.binary || !looksLikeText(result.content)) {
          setRefused({
            title: "This file can't be edited as text",
            detail: "It looks binary. Download it to work on it locally.",
          });
          return;
        }
        if (result.truncated) {
          // Saving a truncated preview would cut the file, so large files are never editable here.
          setRefused({
            title: "This file is too large to edit here",
            detail: "Only the first 512 KB can be loaded. Use the Terminal or download it instead.",
          });
          return;
        }
        const { text, crlf } = fromDisk(result.content);
        setLoaded({ text, crlf, writable: result.writable !== false });
        setValue(text);
        setLoadError(null);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "unable to read file");
      });
    return () => {
      cancelled = true;
    };
  }, [filePath, serverId, nonce]);

  useEffect(() => {
    setCloseGuard(
      windowId,
      () => !dirtyRef.current || window.confirm(`Discard unsaved changes to “${fileName}”?`),
    );
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      setCloseGuard(windowId, null);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [windowId, fileName]);

  const save = useCallback(async () => {
    if (!loaded || !dirty || saving || !loaded.writable) return;
    setSaving(true);
    setStatus(null);
    const snapshot = value;
    try {
      await writeFile(serverId, filePath, toDisk(snapshot, loaded.crlf));
      setLoaded({ ...loaded, text: snapshot });
      setStatus({ ok: true, message: "Saved" });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "save failed";
      setStatus({ ok: false, message: `Not saved: ${message}` });
    } finally {
      setSaving(false);
    }
  }, [dirty, filePath, loaded, saving, serverId, value]);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void save();
      return;
    }
    if (event.key === "Tab" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      const el = event.currentTarget;
      el.setRangeText("\t", el.selectionStart, el.selectionEnd, "end");
      setValue(el.value);
    }
  }

  if (loadError) {
    return (
      <ViewerMessage
        tone="danger"
        title={loadError}
        onRetry={() => {
          setLoadError(null);
          setNonce((n) => n + 1);
        }}
        onClose={onClose}
      />
    );
  }
  if (refused) {
    return <ViewerMessage title={refused.title} detail={refused.detail} onClose={onClose} />;
  }
  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-white/50">
        Loading file…
      </div>
    );
  }

  const lineCount = value.split("\n").length;

  return (
    <div className="flex h-full flex-col text-[#d7d7d7]">
      <div className="sui-toolbar flex items-center gap-2 border-b sui-hairline px-3 py-2 text-[12px]">
        <span className="min-w-0 flex-1 truncate font-mono text-white/60" title={filePath}>
          {filePath}
          {dirty ? (
            <span aria-label="Unsaved changes" className="ml-2 text-amber-300">
              ●
            </span>
          ) : null}
        </span>
        {status ? (
          <span role="status" className={status.ok ? "text-emerald-300" : "text-red-300"}>
            {status.message}
          </span>
        ) : null}
        <button
          type="button"
          className={darkViewerButtonClass}
          disabled={!dirty || saving || !loaded.writable}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {!loaded.writable ? (
        <p
          role="alert"
          className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200"
        >
          Read-only: {server?.username ? `“${server.username}”` : "the SSH user"} can’t write this
          file. Saving with elevated permissions (sudo) isn’t supported; use the Terminal for this
          file.
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 font-mono text-[12.5px] leading-6">
        <div
          ref={gutterRef}
          aria-hidden
          className="shrink-0 select-none overflow-hidden py-3 pl-3 pr-2 text-right text-white/30"
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          aria-label={`Contents of ${fileName}`}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          readOnly={!loaded.writable}
          className="min-h-0 flex-1 resize-none bg-transparent py-3 pr-3 outline-none"
          style={{ tabSize: 4 }}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setStatus(null);
          }}
          onKeyDown={onKeyDown}
          onScroll={(event) => {
            if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop;
          }}
        />
      </div>
    </div>
  );
}
