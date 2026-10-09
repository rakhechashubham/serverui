import type { LucideIcon } from "lucide-react";
import { Code2, Container, GitBranch, Hexagon, Sparkles, Zap } from "lucide-react";

export const STORE_CATEGORIES = ["Editors", "AI", "Runtimes", "Tools"] as const;
export type StoreCategory = (typeof STORE_CATEGORIES)[number];

export type StoreApp = {
  id: string;
  name: string;
  tagline: string;
  category: StoreCategory;
  icon: LucideIcon;
  /** Tailwind gradient classes for the tile behind the icon. */
  tint: string;
  /** Shown on the card so the user knows what lands on the server. */
  footprint: string;
};

// A closed list on purpose: install scripts live server side, never from the client.
export const STORE_CATALOG: readonly StoreApp[] = [
  {
    id: "code-server",
    name: "VS Code",
    tagline: "The full VS Code editor, served from your server and opened in a window.",
    category: "Editors",
    icon: Code2,
    tint: "from-sky-500 to-blue-700",
    footprint: "code-server · ~400 MB RAM",
  },
  {
    id: "claude-code",
    name: "Claude Code",
    tagline: "Anthropic's coding agent in your server's terminal.",
    category: "AI",
    icon: Sparkles,
    tint: "from-orange-400 to-amber-600",
    footprint: "CLI · installs in ~/.local, no root",
  },
  {
    id: "docker",
    name: "Docker",
    tagline: "Run containers and Compose stacks on this machine.",
    category: "Tools",
    icon: Container,
    tint: "from-cyan-400 to-sky-600",
    footprint: "Detected only, managed on the server",
  },
  {
    id: "nodejs",
    name: "Node.js",
    tagline: "JavaScript runtime, LTS release.",
    category: "Runtimes",
    icon: Hexagon,
    tint: "from-emerald-400 to-green-700",
    footprint: "Detected only, managed on the server",
  },
  {
    id: "bun",
    name: "Bun",
    tagline: "Fast JavaScript runtime, bundler and package manager.",
    category: "Runtimes",
    icon: Zap,
    tint: "from-stone-300 to-stone-500",
    footprint: "Runtime · ~90 MB disk",
  },
  {
    id: "git",
    name: "Git",
    tagline: "Version control, the way you already know it.",
    category: "Tools",
    icon: GitBranch,
    tint: "from-red-400 to-rose-600",
    footprint: "CLI · ~30 MB disk",
  },
];

export function filterStoreApps(
  apps: readonly StoreApp[],
  category: StoreCategory | "All",
  query: string,
): StoreApp[] {
  const needle = query.trim().toLowerCase();
  return apps.filter(
    (app) =>
      (category === "All" || app.category === category) &&
      (!needle || `${app.name} ${app.tagline}`.toLowerCase().includes(needle)),
  );
}
