import { describe, expect, it } from "vitest";
import { filterStoreApps, STORE_CATALOG } from "@/src/data/store-catalog";

describe("filterStoreApps", () => {
  it("filters by category and by name or tagline, case-insensitively", () => {
    const names = (category: Parameters<typeof filterStoreApps>[1], query = "") =>
      filterStoreApps(STORE_CATALOG, category, query).map((app) => app.name);

    expect(names("All")).toHaveLength(STORE_CATALOG.length);
    expect(names("Runtimes")).toEqual(["Node.js", "Bun"]);
    expect(names("All", "  VS CODE ")).toEqual(["VS Code"]);
    expect(names("Tools", "node")).toEqual([]);
  });
});
