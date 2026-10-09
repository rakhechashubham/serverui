export const APP_IDS = [
  "dashboard",
  "files",
  "terminal",
  "editor",
  "applications",
  "domains",
  "databases",
  "settings",
] as const;

export type DockAppId = (typeof APP_IDS)[number];
export type AppId = DockAppId | "about" | "viewer" | "vscode";

/** Apps that stay in the catalog but are not shown on the dock. */
export const DOCK_HIDDEN_IDS: ReadonlySet<DockAppId> = new Set(["domains", "databases"]);

export function visibleDockOrder(order: readonly DockAppId[]): DockAppId[] {
  return order.filter((id) => !DOCK_HIDDEN_IDS.has(id));
}

export type WindowChrome = "light" | "dark";

export const APP_META: Record<
  AppId,
  {
    title: string;
    width: number;
    height: number;
    available: boolean;
    chrome: WindowChrome;
    /** The app draws the traffic lights and drag region itself (Finder style). */
    unifiedTitlebar?: boolean;
  }
> = {
  dashboard: {
    title: "System Monitor",
    width: 1120,
    height: 720,
    available: true,
    chrome: "dark",
  },
  files: {
    title: "Files",
    width: 900,
    height: 600,
    available: true,
    chrome: "light",
    unifiedTitlebar: true,
  },
  terminal: {
    title: "Terminal",
    width: 800,
    height: 480,
    available: true,
    chrome: "dark",
  },
  editor: {
    title: "Editor",
    width: 760,
    height: 560,
    available: false,
    chrome: "dark",
  },
  vscode: {
    title: "VS Code",
    width: 1180,
    height: 740,
    available: true,
    chrome: "dark",
  },
  applications: {
    title: "Store",
    width: 860,
    height: 580,
    available: true,
    chrome: "light",
  },
  domains: {
    title: "Domains",
    width: 850,
    height: 550,
    available: false,
    chrome: "light",
  },
  databases: {
    title: "Databases",
    width: 950,
    height: 600,
    available: false,
    chrome: "light",
  },
  settings: {
    title: "Settings",
    width: 750,
    height: 550,
    available: true,
    chrome: "light",
  },
  about: {
    title: "About",
    width: 740,
    height: 680,
    available: true,
    chrome: "dark",
  },
  viewer: {
    title: "Viewer",
    width: 880,
    height: 620,
    available: true,
    chrome: "light",
  },
};
