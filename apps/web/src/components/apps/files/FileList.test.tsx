import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileList } from "@/src/components/apps/files/FileList";
import type { FileEntry } from "@/src/lib/api/files";

const entries: FileEntry[] = [
  {
    name: "file1.txt",
    path: "/home/file1.txt",
    type: "file",
    size: 1024,
    mode: "-rw-r--r--",
    modified: "2026-03-30T10:00:00Z",
  },
  {
    name: "file2.txt",
    path: "/home/file2.txt",
    type: "file",
    size: 2048,
    mode: "-rw-r--r--",
    modified: "2026-03-30T10:00:00Z",
  },
  {
    name: "folderA",
    path: "/home/folderA",
    type: "dir",
    size: 0,
    mode: "drwxr-xr-x",
    modified: "2026-03-30T10:00:00Z",
  },
];

describe("FileList", () => {
  it("renders files and select all checkbox", () => {
    render(
      <FileList
        path="/home"
        entries={entries}
        selectedPaths={new Set()}
        onSelect={vi.fn()}
        onToggleSelect={vi.fn()}
        onSelectRange={vi.fn()}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        onOpen={vi.fn()}
        onParent={vi.fn()}
        onContextMenu={vi.fn()}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Select all" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select file1.txt" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select file2.txt" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select folderA" })).not.toBeChecked();
  });

  it("checks select all when all items are selected", () => {
    render(
      <FileList
        path="/home"
        entries={entries}
        selectedPaths={new Set(entries.map((e) => e.path))}
        onSelect={vi.fn()}
        onToggleSelect={vi.fn()}
        onSelectRange={vi.fn()}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        onOpen={vi.fn()}
        onParent={vi.fn()}
        onContextMenu={vi.fn()}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Select all" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select file1.txt" })).toBeChecked();
  });

  it("calls onToggleSelect when row checkbox is clicked", async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();

    render(
      <FileList
        path="/home"
        entries={entries}
        selectedPaths={new Set()}
        onSelect={vi.fn()}
        onToggleSelect={onToggleSelect}
        onSelectRange={vi.fn()}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        onOpen={vi.fn()}
        onParent={vi.fn()}
        onContextMenu={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Select file2.txt" }));
    expect(onToggleSelect).toHaveBeenCalledWith("/home/file2.txt");
  });

  it("calls onSelectAll and onClearSelection when header checkbox is toggled", async () => {
    const user = userEvent.setup();
    const onSelectAll = vi.fn();
    const onClearSelection = vi.fn();

    const { rerender } = render(
      <FileList
        path="/home"
        entries={entries}
        selectedPaths={new Set()}
        onSelect={vi.fn()}
        onToggleSelect={vi.fn()}
        onSelectRange={vi.fn()}
        onSelectAll={onSelectAll}
        onClearSelection={onClearSelection}
        onOpen={vi.fn()}
        onParent={vi.fn()}
        onContextMenu={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(onSelectAll).toHaveBeenCalledTimes(1);

    rerender(
      <FileList
        path="/home"
        entries={entries}
        selectedPaths={new Set(entries.map((e) => e.path))}
        onSelect={vi.fn()}
        onToggleSelect={vi.fn()}
        onSelectRange={vi.fn()}
        onSelectAll={onSelectAll}
        onClearSelection={onClearSelection}
        onOpen={vi.fn()}
        onParent={vi.fn()}
        onContextMenu={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });
});
