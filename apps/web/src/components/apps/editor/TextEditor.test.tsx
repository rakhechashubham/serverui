import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditorApp } from "@/src/components/apps/EditorApp";
import { fromDisk, toDisk } from "@/src/components/apps/editor/TextEditor";
import {
  WindowManagerProvider,
  editorWindowId,
  useWindowManager,
} from "@/src/components/window/window-context";

const { readFileMock, writeFileMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  writeFileMock: vi.fn(),
}));

vi.mock("@/src/lib/api/files", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/api/files")>("@/src/lib/api/files");
  return {
    ...actual,
    readFile: (...args: unknown[]) => readFileMock(...args),
    writeFile: (...args: unknown[]) => writeFileMock(...args),
  };
});

vi.mock("@/src/lib/session", () => ({
  useSelectedServer: () => ({ id: "srv-1", name: "Prod", username: "deploy" }),
}));

const payload = { filePath: "/etc/app.conf", fileName: "app.conf" };
const id = editorWindowId(payload.filePath);

// Renders the editor the way WindowManager does, with a stand-in for the window's close button.
function OpenEditor() {
  const { openWindow, closeWindow, windows } = useWindowManager();
  useEffect(() => {
    openWindow("editor", payload);
  }, [openWindow]);
  if (!windows.some((w) => w.id === id)) return null;
  return (
    <>
      <button type="button" onClick={() => closeWindow(id)}>
        Close window
      </button>
      <EditorApp payload={payload} windowId={id} />
    </>
  );
}

function renderEditor() {
  return render(
    <WindowManagerProvider>
      <OpenEditor />
    </WindowManagerProvider>,
  );
}

describe("line endings", () => {
  it("round-trips CRLF files and leaves LF files alone", () => {
    const { text, crlf } = fromDisk("a\r\nb\r\n");
    expect(text).toBe("a\nb\n");
    expect(toDisk(`${text}c\n`, crlf)).toBe("a\r\nb\r\nc\r\n");
    expect(toDisk("a\nb", false)).toBe("a\nb");
  });
});

describe("TextEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeFileMock.mockResolvedValue({ status: "ok" });
  });

  it("saves with Cmd+S, keeps CRLF and clears the unsaved marker", async () => {
    readFileMock.mockResolvedValue({
      path: "/etc/app.conf",
      content: "port=80\r\n",
      writable: true,
    });
    renderEditor();
    const area = await screen.findByLabelText("Contents of app.conf");
    expect(area).toHaveValue("port=80\n");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(area, { target: { value: "port=8080\n" } });
    expect(screen.getByLabelText("Unsaved changes")).toBeInTheDocument();
    fireEvent.keyDown(area, { key: "s", metaKey: true });

    await waitFor(() =>
      expect(writeFileMock).toHaveBeenCalledWith("srv-1", "/etc/app.conf", "port=8080\r\n"),
    );
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.queryByLabelText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("shows a clear error when saving fails", async () => {
    const { ApiError } = await import("@/src/lib/api/client");
    readFileMock.mockResolvedValue({ path: "/etc/app.conf", content: "a", writable: true });
    writeFileMock.mockRejectedValue(new ApiError("permission denied", 403));
    renderEditor();
    const area = await screen.findByLabelText("Contents of app.conf");
    fireEvent.change(area, { target: { value: "b" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Not saved: permission denied")).toBeInTheDocument();
    expect(screen.getByLabelText("Unsaved changes")).toBeInTheDocument();
  });

  it("opens files the SSH user can't write as read-only", async () => {
    readFileMock.mockResolvedValue({ path: "/etc/app.conf", content: "a", writable: false });
    renderEditor();
    const area = await screen.findByLabelText("Contents of app.conf");
    expect(area).toHaveAttribute("readonly");
    expect(screen.getByRole("alert")).toHaveTextContent(
      /Read-only: “deploy” can’t write this file/,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("refuses truncated files instead of saving a partial copy", async () => {
    readFileMock.mockResolvedValue({
      path: "/etc/app.conf",
      content: "x",
      truncated: true,
      writable: true,
    });
    renderEditor();
    expect(await screen.findByText("This file is too large to edit here")).toBeInTheDocument();
    expect(screen.queryByLabelText("Contents of app.conf")).not.toBeInTheDocument();
  });

  it("asks before closing with unsaved changes", async () => {
    readFileMock.mockResolvedValue({ path: "/etc/app.conf", content: "a", writable: true });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderEditor();
    const area = await screen.findByLabelText("Contents of app.conf");
    fireEvent.change(area, { target: { value: "changed" } });

    await userEvent.click(screen.getByRole("button", { name: "Close window" }));
    expect(confirm).toHaveBeenCalledWith("Discard unsaved changes to “app.conf”?");
    expect(screen.getByLabelText("Contents of app.conf")).toBeInTheDocument();

    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: "Close window" }));
    await waitFor(() =>
      expect(screen.queryByLabelText("Contents of app.conf")).not.toBeInTheDocument(),
    );
    confirm.mockRestore();
  });
});
