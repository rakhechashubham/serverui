import { describe, expect, it } from "vitest";
import { px0FrameUrl } from "@/src/lib/api/px0";

describe("px0FrameUrl", () => {
  const base = "/api/px0/s1/";

  it("opens px0 bare when there is no target", () => {
    expect(px0FrameUrl(base)).toBe(base);
  });

  it("opens a file through ?path=", () => {
    expect(px0FrameUrl(base, "projects/app/a.ts")).toBe(`${base}?path=projects%2Fapp%2Fa.ts`);
  });
});
