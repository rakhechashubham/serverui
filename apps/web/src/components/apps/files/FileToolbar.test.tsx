import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileToolbar } from "@/src/components/apps/files/FileToolbar";
import type { FileEntry } from "@/src/lib/api/files";

const mockFile: FileEntry = {
  name: "test.txt",
  path: "/home/test.txt",
  type: "file",
  size: 1024,
  mode: "-rw-r--r--",
  modified: "2026-03-30T10:00:00Z",
};

const mockDir: FileEntry = {
  name: "docs",
  path: "/home/docs",
  type: "dir",
  size: 0,
  mode: "drwxr-xr-x",
  modified: "2026-03-30T10:00:00Z",
};

describe("FileToolbar", () => {
  it("renders with buttons disabled when no item is selected", () => {
    render(
      <FileToolbar
        selectedEntries={[]}
        onOpen={vi.fn()}
        onDownload={vi.fn()}
        onUploadClick={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        totalCount={5}
      />,
    );

    expect(screen.getByRole("button", { name: "Open" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rename" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /upload/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Select all" })).toBeInTheDocument();
  });

  it("renders with single file selected", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onDownload = vi.fn();
    const onRename = vi.fn();
    const onDelete = vi.fn();
    const onClear = vi.fn();

    render(
      <FileToolbar
        selectedEntries={[mockFile]}
        onOpen={onOpen}
        onDownload={onDownload}
        onUploadClick={vi.fn()}
        onRename={onRename}
        onDelete={onDelete}
        onClearSelection={onClear}
        totalCount={5}
      />,
    );

    expect(screen.getByText("1 item selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Download" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Rename" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("renders with multiple items selected and enables bulk actions", async () => {
    const user = userEvent.setup();
    const onDownload = vi.fn();
    const onDelete = vi.fn();
    const onClear = vi.fn();

    render(
      <FileToolbar
        selectedEntries={[mockFile, mockDir]}
        onOpen={vi.fn()}
        onDownload={onDownload}
        onUploadClick={vi.fn()}
        onRename={vi.fn()}
        onDelete={onDelete}
        onClearSelection={onClear}
        totalCount={5}
      />,
    );

    expect(screen.getByText("2 items selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rename" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Download" }));
    expect(onDownload).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
