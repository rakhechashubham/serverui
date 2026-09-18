import { afterEach, describe, expect, it } from "vitest";
import { clearInjectedDesktopConfig } from "@/src/lib/runtime/config";
import { currentRuntime, isDesktopRuntime } from "@/src/lib/runtime/mode";

afterEach(() => {
  clearInjectedDesktopConfig();
});

describe("currentRuntime", () => {
  it("defaults to web", () => {
    expect(currentRuntime({})).toBe("web");
    expect(isDesktopRuntime({})).toBe(false);
  });

  it("accepts an explicit desktop override without enabling Tauri", () => {
    expect(currentRuntime({ NEXT_PUBLIC_SERVERUI_RUNTIME: "desktop" })).toBe("desktop");
    expect(isDesktopRuntime({ NEXT_PUBLIC_SERVERUI_RUNTIME: "DESKTOP" })).toBe(true);
  });

  it("ignores unknown values", () => {
    expect(currentRuntime({ NEXT_PUBLIC_SERVERUI_RUNTIME: "mobile" })).toBe("web");
  });
});
