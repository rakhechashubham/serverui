import { describe, expect, it, vi } from "vitest";
import { menuItems, type FileMenuActions } from "@/src/components/apps/files/FileContextMenu";
import type { FileEntry } from "@/src/lib/api/files";

const noop = vi.fn();
const actions: FileMenuActions = {
  onOpen: noop,
  onTerminalHere: noop,
  onCopyPath: noop,
  onInfo: noop,
  onDownload: noop,
  onRename: noop,
  onDelete: noop,
  onCopy: noop,
  onCut: noop,
  onPaste: noop,
  onCompress: noop,
  onExtractHere: noop,
  onExtractTo: noop,
  onNewFolder: noop,
  onNewFile: noop,
  onUpload: noop,
};

function entry(name: string, type: "file" | "dir" = "file"): FileEntry {
  return { name, path: `/srv/${name}`, type, size: 1, mode: "", modified: "" };
}

function labels(entryArg: FileEntry | null, selected: FileEntry[] = [], canPaste = false) {
  return menuItems({ ...actions, entry: entryArg, selectedEntries: selected, canPaste })
    .filter((item) => item !== "separator")
    .map((item) => item.label);
}

describe("file context menu", () => {
  it("shows the file actions", () => {
    expect(labels(entry("notes.txt"))).toEqual([
      "Open",
      "Copy Path",
      "Details",
      "Download",
      "Rename",
      "Delete",
      "Copy",
      "Cut",
      "Compress",
    ]);
  });

  it("shows the folder actions without Download", () => {
    expect(labels(entry("www", "dir"))).toEqual([
      "Open",
      "Open Terminal",
      "Copy Path",
      "Details",
      "Rename",
      "Delete",
      "Copy",
      "Cut",
      "Compress",
    ]);
  });

  it("offers Extract Here and Extract To instead of Compress for archives", () => {
    const items = labels(entry("backup.tar.gz"));
    expect(items).toContain("Extract Here");
    expect(items).toContain("Extract To…");
    expect(items).not.toContain("Compress");
    expect(items).toContain("Download");
  });

  it("shows Open Terminal, Paste and create actions on empty space, Paste disabled when nothing to paste", () => {
    const empty = menuItems({ ...actions, entry: null, canPaste: false });
    expect(empty.map((item) => (item === "separator" ? "-" : item.label))).toEqual([
      "Open Terminal",
      "Paste",
      "-",
      "New Folder",
      "New File",
      "Upload…",
    ]);
    expect(empty[1]).toMatchObject({ disabled: true });
    expect(menuItems({ ...actions, entry: null, canPaste: true })[1]).toMatchObject({
      disabled: false,
    });
  });

  it("only offers Download for a multi-selection of files", () => {
    const a = entry("a.txt");
    const b = entry("b.txt");
    const dir = entry("www", "dir");
    expect(labels(a, [a, b])).toEqual([
      "Copy (2 items)",
      "Cut (2 items)",
      "Delete (2 items)",
      "Compress (2 items)",
      "Download (2 items)",
    ]);
    expect(labels(a, [a, dir])).not.toContain("Download (2 items)");
  });

  it("offers VS Code only when the server has it, next to Open", () => {
    const withCode = (entryArg: FileEntry | null) =>
      menuItems({ ...actions, entry: entryArg, canPaste: false, onEditWithCode: noop })
        .filter((item) => item !== "separator")
        .map((item) => item.label);

    expect(labels(entry("notes.txt"))).not.toContain("Edit with Code");
    expect(labels(entry("www", "dir"))).not.toContain("Open in VS Code");
    expect(labels(null)).not.toContain("Open Folder in VS Code");

    expect(withCode(entry("notes.txt")).slice(0, 2)).toEqual(["Open", "Edit with Code"]);
    expect(withCode(entry("www", "dir"))).toContain("Open in VS Code");
    expect(withCode(null)).toContain("Open Folder in VS Code");
  });
});
