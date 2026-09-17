"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError } from "@/src/lib/api/client";
import { type NewServerInput, type Server, type ServerStatus } from "@/src/lib/servers";
import {
  createServer,
  deleteServer as deleteServerApi,
  disconnectServer as disconnectServerApi,
  listServers,
  testServerConnection,
  updateServer as updateServerApi,
  type ConnectionTestResult,
  type ServerInfo,
} from "@/src/lib/api/server";

export type AppScreen = "server-selection" | "booting" | "logging-off" | "desktop";

type SessionContextValue = {
  screen: AppScreen;
  servers: Server[];
  selectedServer: Server | null;
  loadingServers: boolean;
  serversError: string | null;
  refreshServers: () => Promise<Server[]>;
  selectServer: (server: Server) => boolean;
  addServer: (input: NewServerInput) => Promise<Server>;
  updateServer: (id: string, input: NewServerInput) => Promise<Server>;
  deleteServer: (id: string) => Promise<void>;
  testConnection: (id: string) => Promise<ConnectionTestResult>;
  completeBoot: () => void;
  logOut: () => void;
  completeLogOut: () => void;
  backToServers: () => void;
  retryBoot: () => void;
  switchServer: (server: Server) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function asStatus(value: string | undefined): ServerStatus {
  switch (value) {
    case "online":
    case "offline":
    case "connecting":
    case "error":
    case "authentication_failed":
    case "unknown":
      return value;
    default:
      return "unknown";
  }
}

export function toSessionServer(info: ServerInfo): Server {
  const hostname = info.hostname || info.host;
  return {
    id: info.id,
    name: info.name || hostname,
    hostname,
    address: info.host,
    status: asStatus(info.status),
    sshPort: info.port,
    username: info.username,
    authType: info.authType,
    error: info.error,
    lastSeen: info.lastSeen,
  };
}

function toWriteInput(input: NewServerInput) {
  return {
    name: input.name.trim(),
    host: input.address.trim(),
    port: input.sshPort,
    username: input.username.trim(),
    authType: input.authType,
    password: input.password,
    privateKey: input.privateKey,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<AppScreen>("server-selection");
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [loadingServers, setLoadingServers] = useState(true);
  const [serversError, setServersError] = useState<string | null>(null);

  const refreshServers = useCallback(async () => {
    try {
      const items = await listServers();
      const next = items.map(toSessionServer);
      setServers(next);
      setServersError(null);
      setSelectedServer((current) => {
        if (!current) return current;
        return next.find((item) => item.id === current.id) || current;
      });
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : "unable to load servers";
      setServersError(message);
      setServers([]);
      return [];
    } finally {
      setLoadingServers(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listServers()
      .then((items) => {
        if (cancelled) return;
        setServers(items.map(toSessionServer));
        setServersError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "unable to load servers";
        setServersError(message);
        setServers([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingServers(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectServer = useCallback((server: Server) => {
    setSelectedServer(server);
    setScreen("booting");
    return true;
  }, []);

  const addServer = useCallback(async (input: NewServerInput) => {
    const created = toSessionServer(await createServer(toWriteInput(input)));
    setServers((current) => {
      if (current.some((item) => item.id === created.id)) return current;
      return [...current, created];
    });
    return created;
  }, []);

  const updateServer = useCallback(async (id: string, input: NewServerInput) => {
    const updated = toSessionServer(await updateServerApi(id, toWriteInput(input)));
    setServers((current) => current.map((item) => (item.id === id ? updated : item)));
    setSelectedServer((current) => (current?.id === id ? updated : current));
    return updated;
  }, []);

  const deleteServer = useCallback(
    async (id: string) => {
      await deleteServerApi(id);
      setServers((current) => current.filter((item) => item.id !== id));
      setSelectedServer((current) => {
        if (current?.id !== id) return current;
        return null;
      });
      setScreen((current) => {
        if (selectedServer?.id === id && current !== "server-selection") {
          return "server-selection";
        }
        return current;
      });
    },
    [selectedServer?.id],
  );

  const testConnection = useCallback(async (id: string) => {
    const result = await testServerConnection(id);
    const next = toSessionServer(result.server);
    setServers((current) => current.map((item) => (item.id === id ? next : item)));
    return result;
  }, []);

  const completeBoot = useCallback(() => {
    setScreen("desktop");
  }, []);

  const logOut = useCallback(() => {
    setScreen("logging-off");
  }, []);

  const completeLogOut = useCallback(() => {
    const id = selectedServer?.id;
    setSelectedServer(null);
    setScreen("server-selection");
    if (id) {
      void disconnectServerApi(id).catch(() => undefined);
    }
    void refreshServers();
  }, [refreshServers, selectedServer?.id]);

  const backToServers = useCallback(() => {
    const id = selectedServer?.id;
    setSelectedServer(null);
    setScreen("server-selection");
    if (id) {
      void disconnectServerApi(id).catch(() => undefined);
    }
    void refreshServers();
  }, [refreshServers, selectedServer?.id]);

  const retryBoot = useCallback(() => {
    if (!selectedServer) {
      setScreen("server-selection");
      return;
    }
    setScreen("booting");
  }, [selectedServer]);

  const switchServer = useCallback(
    (server: Server) => {
      const previous = selectedServer?.id;
      if (previous && previous !== server.id) {
        void disconnectServerApi(previous).catch(() => undefined);
      }
      setSelectedServer(server);
      setScreen("booting");
    },
    [selectedServer?.id],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      screen,
      servers,
      selectedServer,
      loadingServers,
      serversError,
      refreshServers,
      selectServer,
      addServer,
      updateServer,
      deleteServer,
      testConnection,
      completeBoot,
      logOut,
      completeLogOut,
      backToServers,
      retryBoot,
      switchServer,
    }),
    [
      screen,
      servers,
      selectedServer,
      loadingServers,
      serversError,
      refreshServers,
      selectServer,
      addServer,
      updateServer,
      deleteServer,
      testConnection,
      completeBoot,
      logOut,
      completeLogOut,
      backToServers,
      retryBoot,
      switchServer,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return context;
}

export function useSelectedServer() {
  const context = useContext(SessionContext);
  return context?.selectedServer ?? null;
}

export function formatApiError(err: unknown, fallback = "request failed") {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
