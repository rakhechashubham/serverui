import { describe, expect, it } from "vitest";
import { formatModified, formatSize, totalSize } from "@/src/lib/files/format";

describe("formatSize", () => {
  it("formats bytes and larger units", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(1536)).toBe("1.5 KB");
    expect(formatSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });

  it("rejects invalid sizes", () => {
    expect(formatSize(-1)).toBe("—");
    expect(formatSize(Number.NaN)).toBe("—");
  });
});

describe("formatModified", () => {
  it("returns the original string when the date is invalid", () => {
    expect(formatModified("not-a-date")).toBe("not-a-date");
  });
});

describe("totalSize", () => {
  it("sums files and ignores directories", () => {
    expect(
      totalSize([
        { type: "file", size: 10 },
        { type: "dir", size: 99 },
        { type: "file", size: 5 },
      ]),
    ).toBe(15);
  });
});
