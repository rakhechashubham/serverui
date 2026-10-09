import { describe, expect, it } from "vitest";
import { codeFrameUrl } from "@/src/lib/api/code";

describe("codeFrameUrl", () => {
  const base = "/api/code/s1/";

  it("opens the bare workbench when there is no target", () => {
    expect(codeFrameUrl(base, {})).toBe(base);
  });

  it("opens a folder", () => {
    expect(codeFrameUrl(base, { folder: "/etc/nginx" })).toBe(`${base}?folder=%2Fetc%2Fnginx`);
  });

  it("opens a file inside its folder with the payload code-server expects", () => {
    const url = new URL(codeFrameUrl(base, { folder: "/etc", file: "/etc/hostname" }), "http://x");
    expect(url.searchParams.get("folder")).toBe("/etc");
    expect(JSON.parse(url.searchParams.get("payload") ?? "")).toEqual([
      ["openFile", "vscode-remote:///etc/hostname"],
    ]);
  });
});
