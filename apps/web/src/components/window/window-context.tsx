"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { APP_META, type AppId, type WindowChrome } from "@/src/data/apps";
import { getFileType } from "@/src/lib/files/file-type";
import { desktopBounds, WINDOW_MIN_HEIGHT, WINDOW_MIN_WIDTH } from "@/src/lib/desktop";

export type WindowPayload = {
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  modified?: string;
  mime?: string;
  cwd?: string;
  isDirectory?: boolean;
  infoOnly?: boolean;
};

export type WindowState = {
  id: string;
  title: string;
  app: AppId;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  maximized: boolean;
  zIndex: number;
  payload?: WindowPayload;
  chrome?: WindowChrome;
  restoreBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

type ManagerState = {
  windows: WindowState[];
  focusedId: string | null;
  zCounter: number;
};

type Action =
  | { type: "open"; app: AppId; payload?: WindowPayload }
  | { type: "close"; id: string }
  | { type: "minimize"; id: string }
  | { type: "maximize"; id: string }
  | { type: "restore"; id: string }
  | { type: "focus"; id: string }
  | { type: "clearFocus" }
  | { type: "move"; id: string; x: number; y: number }
  | {
      type: "resize";
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | { type: "syncMaximized" };

function nextZ(state: ManagerState) {
  return state.zCounter + 1;
}

function clampPosition(x: number, y: number, width: number) {
  const { width: vw, workHeight } = desktopBounds();
  const maxX = Math.max(8, vw - 80);
  const maxY = Math.max(0, workHeight - 40);
  return {
    x: Math.min(Math.max(x, 8 - Math.max(0, width - 80)), maxX),
    y: Math.min(Math.max(y, 0), maxY),
  };
}

function fitSize(width: number, height: number) {
  const { width: vw, workHeight } = desktopBounds();
  return {
    width: Math.min(width, Math.max(WINDOW_MIN_WIDTH, vw - 32)),
    height: Math.min(height, Math.max(WINDOW_MIN_HEIGHT, workHeight)),
  };
}

function maximizedRect() {
  const { width, fullscreenHeight } = desktopBounds();
  return {
    x: 0,
    y: 0,
    width,
    height: fullscreenHeight,
  };
}

function reducer(state: ManagerState, action: Action): ManagerState {
  switch (action.type) {
    case "open": {
      const id = windowId(action.app, action.payload);
      const existing = state.windows.find((item) => item.id === id);
      if (existing) {
        const zIndex = nextZ(state);
        return {
          windows: state.windows.map((item) =>
            item.id === existing.id
              ? {
                  ...item,
                  minimized: false,
                  zIndex,
                  payload: action.payload ?? item.payload,
                  title: windowTitle(action.app, action.payload ?? item.payload),
                  chrome: windowChrome(action.app, action.payload ?? item.payload),
                }
              : item,
          ),
          focusedId: existing.id,
          zCounter: zIndex,
        };
      }

      const meta = APP_META[action.app];
      const size = fitSize(meta.width, meta.height);
      const cascade = (state.windows.length % 6) * 28;
      const pos = clampPosition(64 + cascade, 20 + cascade, size.width);
      const zIndex = nextZ(state);
      const windowState: WindowState = {
        id,
        title: windowTitle(action.app, action.payload),
        app: action.app,
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
        minimized: false,
        maximized: false,
        zIndex,
        payload: action.payload,
        chrome: windowChrome(action.app, action.payload),
      };

      return {
        windows: [...state.windows, windowState],
        focusedId: windowState.id,
        zCounter: zIndex,
      };
    }
    case "close":
      return {
        windows: state.windows.filter((item) => item.id !== action.id),
        focusedId:
          state.focusedId === action.id
            ? (state.windows.filter((item) => item.id !== action.id).at(-1)?.id ?? null)
            : state.focusedId,
        zCounter: state.zCounter,
      };
    case "minimize":
      return {
        windows: state.windows.map((item) =>
          item.id === action.id ? { ...item, minimized: true } : item,
        ),
        focusedId: state.focusedId === action.id ? null : state.focusedId,
        zCounter: state.zCounter,
      };
    case "maximize": {
      const max = maximizedRect();
      const zIndex = nextZ(state);
      return {
        windows: state.windows.map((item) => {
          if (item.id !== action.id) return item;
          if (item.maximized) return item;
          return {
            ...item,
            maximized: true,
            minimized: false,
            zIndex,
            restoreBounds: {
              x: item.x,
              y: item.y,
              width: item.width,
              height: item.height,
            },
            ...max,
          };
        }),
        focusedId: action.id,
        zCounter: zIndex,
      };
    }
    case "restore": {
      const zIndex = nextZ(state);
      return {
        windows: state.windows.map((item) => {
          if (item.id !== action.id) return item;
          if (item.minimized && item.maximized) {
            return { ...item, minimized: false, zIndex };
          }
          if (item.minimized) {
            return { ...item, minimized: false, zIndex };
          }
          if (item.maximized && item.restoreBounds) {
            return {
              ...item,
              maximized: false,
              minimized: false,
              zIndex,
              ...item.restoreBounds,
              restoreBounds: undefined,
            };
          }
          return { ...item, minimized: false, zIndex };
        }),
        focusedId: action.id,
        zCounter: zIndex,
      };
    }
    case "focus": {
      const zIndex = nextZ(state);
      return {
        windows: state.windows.map((item) =>
          item.id === action.id ? { ...item, minimized: false, zIndex } : item,
        ),
        focusedId: action.id,
        zCounter: zIndex,
      };
    }
    case "clearFocus":
      return { ...state, focusedId: null };
    case "move": {
      const pos = clampPosition(action.x, action.y, 80);
      return {
        windows: state.windows.map((item) =>
          item.id === action.id && !item.maximized ? { ...item, x: pos.x, y: pos.y } : item,
        ),
        zCounter: state.zCounter,
        focusedId: state.focusedId,
      };
    }
    case "resize": {
      const width = Math.max(WINDOW_MIN_WIDTH, action.width);
      const height = Math.max(WINDOW_MIN_HEIGHT, action.height);
      const pos = clampPosition(action.x, action.y, width);
      return {
        windows: state.windows.map((item) =>
          item.id === action.id && !item.maximized ? { ...item, ...pos, width, height } : item,
        ),
        zCounter: state.zCounter,
        focusedId: state.focusedId,
      };
    }
    case "syncMaximized": {
      const max = maximizedRect();
      return {
        ...state,
        windows: state.windows.map((item) => (item.maximized ? { ...item, ...max } : item)),
      };
    }
    default:
      return state;
  }
}

type WindowManagerApi = {
  windows: WindowState[];
  focusedId: string | null;
  openWindow: (app: AppId, payload?: WindowPayload) => void;
  closeWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  maximizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  clearFocus: () => void;
  updateWindowPosition: (id: string, x: number, y: number) => void;
  updateWindowSize: (id: string, width: number, height: number, x: number, y: number) => void;
};

const WindowManagerContext = createContext<WindowManagerApi | null>(null);

export function WindowManagerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    windows: [],
    focusedId: null,
    zCounter: 10,
  });

  useEffect(() => {
    const onResize = () => dispatch({ type: "syncMaximized" });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const openWindow = useCallback((app: AppId, payload?: WindowPayload) => {
    dispatch({ type: "open", app, payload });
  }, []);
  const closeWindow = useCallback((id: string) => {
    dispatch({ type: "close", id });
  }, []);
  const minimizeWindow = useCallback((id: string) => {
    dispatch({ type: "minimize", id });
  }, []);
  const maximizeWindow = useCallback((id: string) => {
    dispatch({ type: "maximize", id });
  }, []);
  const restoreWindow = useCallback((id: string) => {
    dispatch({ type: "restore", id });
  }, []);
  const focusWindow = useCallback((id: string) => {
    dispatch({ type: "focus", id });
  }, []);
  const clearFocus = useCallback(() => {
    dispatch({ type: "clearFocus" });
  }, []);
  const updateWindowPosition = useCallback((id: string, x: number, y: number) => {
    dispatch({ type: "move", id, x, y });
  }, []);
  const updateWindowSize = useCallback(
    (id: string, width: number, height: number, x: number, y: number) => {
      dispatch({ type: "resize", id, x, y, width, height });
    },
    [],
  );

  const value = useMemo<WindowManagerApi>(
    () => ({
      windows: state.windows,
      focusedId: state.focusedId,
      openWindow,
      closeWindow,
      minimizeWindow,
      maximizeWindow,
      restoreWindow,
      focusWindow,
      clearFocus,
      updateWindowPosition,
      updateWindowSize,
    }),
    [
      state.windows,
      state.focusedId,
      openWindow,
      closeWindow,
      minimizeWindow,
      maximizeWindow,
      restoreWindow,
      focusWindow,
      clearFocus,
      updateWindowPosition,
      updateWindowSize,
    ],
  );

  return <WindowManagerContext.Provider value={value}>{children}</WindowManagerContext.Provider>;
}

export function useWindowManager() {
  const context = useContext(WindowManagerContext);
  if (!context) {
    throw new Error("useWindowManager must be used within WindowManagerProvider");
  }
  return context;
}

function windowId(app: AppId, payload?: WindowPayload) {
  if (app === "viewer" && payload?.filePath) {
    if (payload.infoOnly || payload.isDirectory) {
      return `viewer:info:${payload.filePath}`;
    }
    return `viewer:${payload.filePath}`;
  }
  return app;
}

function windowTitle(app: AppId, payload?: WindowPayload) {
  if (app === "viewer") {
    return payload?.fileName || payload?.filePath?.split("/").filter(Boolean).pop() || "Viewer";
  }
  return APP_META[app].title;
}

function windowChrome(app: AppId, payload?: WindowPayload): WindowChrome | undefined {
  if (app !== "viewer") return undefined;
  const kind = getFileType({
    name: payload?.fileName || payload?.filePath || "",
    mime: payload?.mime,
  });
  if (kind === "video" || kind === "audio" || kind === "code" || kind === "text") {
    return "dark";
  }
  return "light";
}
