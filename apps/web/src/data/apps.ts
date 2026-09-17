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
export type AppId = DockAppId | "about" | "viewer";

export type WindowChrome = "light" | "dark";

export const APP_META: Record<
  AppId,
  {
    title: string;
    width: number;
    height: number;
    available: boolean;
    chrome: WindowChrome;
  }
> = {
  dashboard: {
    title: "Dashboard",
    width: 900,
    height: 600,
    available: true,
    chrome: "light",
  },
  files: {
    title: "Files",
    width: 850,
    height: 600,
    available: true,
    chrome: "light",
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
    width: 720,
    height: 480,
    available: false,
    chrome: "light",
  },
  applications: {
    title: "Applications",
    width: 480,
    height: 520,
    available: false,
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
    available: false,
    chrome: "light",
  },
  about: {
    title: "About",
    width: 440,
    height: 380,
    available: true,
    chrome: "light",
  },
  viewer: {
    title: "Viewer",
    width: 880,
    height: 620,
    available: true,
    chrome: "light",
  },
};
