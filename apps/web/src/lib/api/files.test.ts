import { describe, expect, it } from "vitest";
import { baseName, joinPath, parentPath } from "@/src/lib/api/files";

describe("file path helpers", () => {
  it("joins names onto a directory", () => {
    expect(joinPath("/", "etc")).toBe("/etc");
    expect(joinPath("/home/deploy", "notes.txt")).toBe("/home/deploy/notes.txt");
    expect(joinPath("/var/", "log")).toBe("/var/log");
  });

  it("returns the parent directory", () => {
    expect(parentPath("/")).toBe("/");
    expect(parentPath("/etc")).toBe("/");
    expect(parentPath("/home/deploy/notes.txt")).toBe("/home/deploy");
  });

  it("returns the base name", () => {
    expect(baseName("/home/deploy/notes.txt")).toBe("notes.txt");
    expect(baseName("/")).toBe("");
  });
});
