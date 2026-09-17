"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiError } from "@/src/lib/api/client";
import { getServer, type ServerInfo } from "@/src/lib/api/server";

type ServerContextValue = {
  server: ServerInfo | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<ServerInfo | null>;
};

const ServerContext = createContext<ServerContextValue | null>(null);

const POLL_MS = 5000;
const CONNECTING_POLL_MS = 1500;

export function ServerProvider({ serverId, children }: { serverId: string; children: ReactNode }) {
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!serverId) return null;
    const seq = ++seqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const next = await getServer(serverId, { signal: controller.signal });
      if (seq !== seqRef.current) return null;
      setServer(next);
      setError(next.error || null);
      return next;
    } catch (err) {
      if (seq !== seqRef.current) return null;
      const message = err instanceof ApiError ? err.message : "network disconnected";
      setError(message);
      setServer((current) =>
        current ? { ...current, status: "offline" as const, error: message } : null,
      );
      return null;
    } finally {
      if (seq === seqRef.current) {
        setLoading(false);
      }
    }
  }, [serverId]);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let generation = 0;

    const tick = async () => {
      const id = ++generation;
      if (cancelled) return;
      const next = await refresh();
      if (cancelled || id !== generation) return;
      const connecting = !next || next.status === "connecting" || next.status === "offline";
      timer = window.setTimeout(
        () => {
          void tick();
        },
        connecting ? CONNECTING_POLL_MS : POLL_MS,
      );
    };

    const restart = () => {
      if (document.visibilityState === "hidden") return;
      window.clearTimeout(timer);
      void tick();
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) restart();
    };

    void tick();
    window.addEventListener("online", restart);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", restart);

    return () => {
      cancelled = true;
      abortRef.current?.abort();
      window.clearTimeout(timer);
      window.removeEventListener("online", restart);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", restart);
    };
  }, [refresh]);

  return (
    <ServerContext.Provider value={{ server, loading, error, refresh }}>
      {children}
    </ServerContext.Provider>
  );
}

export function useServer() {
  const context = useContext(ServerContext);
  if (!context) {
    throw new Error("useServer must be used within ServerProvider");
  }
  return context;
}
