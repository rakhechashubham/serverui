"use client";

import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import type { WindowPayload } from "@/src/components/window/window-context";
import { wsUrl } from "@/src/lib/api/origin";
import { getInjectedDesktopConfig, localAuthWSProtocols } from "@/src/lib/runtime/config";
import { useSelectedServer } from "@/src/lib/session";

function quotePath(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function TerminalApp({ payload }: { payload?: WindowPayload }) {
  const host = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const selected = useSelectedServer();
  const serverId = selected?.id || "";
  const serverName = selected?.name || "server";
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const cwd = payload?.cwd;

  useEffect(() => {
    const container = host.current;
    if (!container) return;

    let disposed = false;
    let socket: WebSocket | null = null;
    let terminal: import("@xterm/xterm").Terminal | null = null;
    let fitAddon: import("@xterm/addon-fit").FitAddon | null = null;
    let observer: ResizeObserver | null = null;

    async function connect() {
      try {
        const [{ Terminal }, { FitAddon }] = await Promise.all([
          import("@xterm/xterm"),
          import("@xterm/addon-fit"),
        ]);
        if (disposed || !host.current) return;

        terminal = new Terminal({
          cursorBlink: true,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 13,
          theme: {
            background: "#111111",
            foreground: "#d7ffd9",
            cursor: "#5fff6a",
          },
        });
        fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.open(host.current);
        fitAddon.fit();

        if (!serverId) {
          setError("No server selected");
          setStatus("disconnected");
          return;
        }
        socket = new WebSocket(
          wsUrl(`/ws/terminal?serverId=${encodeURIComponent(serverId)}`),
          localAuthWSProtocols(getInjectedDesktopConfig()?.localAuthToken),
        );
        socket.binaryType = "arraybuffer";
        socketRef.current = socket;

        const timeout = window.setTimeout(() => {
          if (disposed || socket?.readyState === WebSocket.OPEN) return;
          setError(
            "ServerUI could not open a terminal session. Check the server connection and retry.",
          );
          setStatus("disconnected");
          socket?.close();
        }, 12000);

        socket.onopen = () => {
          window.clearTimeout(timeout);
          if (!terminal || !fitAddon) return;
          setStatus("connected");
          setError(null);
          fitAddon.fit();
          socket?.send(
            JSON.stringify({
              type: "resize",
              cols: terminal.cols,
              rows: terminal.rows,
            }),
          );
        };

        socket.onmessage = (event) => {
          if (!terminal) return;
          if (typeof event.data === "string") {
            try {
              const message = JSON.parse(event.data) as {
                type?: string;
                message?: string;
                status?: string;
              };
              if (message.type === "error") {
                setError(
                  message.message
                    ? "Terminal session ended. Reconnect to continue."
                    : "Terminal disconnected",
                );
                setStatus("disconnected");
                return;
              }
            } catch {
              terminal.write(event.data);
            }
            return;
          }
          terminal.write(new Uint8Array(event.data as ArrayBuffer));
        };

        socket.onerror = () => {
          window.clearTimeout(timeout);
          if (disposed) return;
          setError("Terminal disconnected. Reconnect when the server is available.");
          setStatus("disconnected");
        };
        socket.onclose = () => {
          window.clearTimeout(timeout);
          if (disposed) return;
          setStatus("disconnected");
        };

        terminal.onData((data) => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(new TextEncoder().encode(data));
          }
        });

        observer = new ResizeObserver(() => {
          if (!terminal || !fitAddon || socket?.readyState !== WebSocket.OPEN) return;
          fitAddon.fit();
          socket.send(
            JSON.stringify({
              type: "resize",
              cols: terminal.cols,
              rows: terminal.rows,
            }),
          );
        });
        observer.observe(host.current);
      } catch {
        if (!disposed) {
          setError("Unable to start the terminal. Retry or reopen the window.");
          setStatus("disconnected");
        }
      }
    }

    void connect();

    return () => {
      disposed = true;
      observer?.disconnect();
      socket?.close();
      socketRef.current = null;
      terminal?.dispose();
    };
  }, [nonce, serverId]);

  useEffect(() => {
    if (status !== "connected" || !cwd || !socketRef.current) return;
    socketRef.current.send(new TextEncoder().encode(`cd ${quotePath(cwd)}\n`));
  }, [cwd, status]);

  return (
    <div className="flex h-full flex-col bg-[#111111] text-[#5fff6a]">
      <div className="flex items-center justify-between gap-3 px-3 py-2 text-[11px] text-white/70">
        <span>
          {status === "connecting"
            ? `Connecting to ${serverName}…`
            : status === "connected"
              ? `Connected to ${serverName}`
              : error || "Terminal disconnected"}
        </span>
        {status !== "connected" ? (
          <button
            type="button"
            className="rounded-md bg-white/10 px-2 py-1 text-white outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-emerald-400"
            onClick={() => {
              setStatus("connecting");
              setError(null);
              setNonce((value) => value + 1);
            }}
          >
            Reconnect
          </button>
        ) : null}
      </div>
      <div ref={host} className="min-h-0 flex-1 px-2 pb-2" />
    </div>
  );
}
