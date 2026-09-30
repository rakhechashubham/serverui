import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FilesApp } from "@/src/components/apps/files/FilesApp";
import { WindowManagerProvider } from "@/src/components/window/window-context";
import type { FileEntry } from "@/src/lib/api/files";

const mockEntries: FileEntry[] = [
  {
    name: "alpha.txt",
    path: "/home/alpha.txt",
    type: "file",
    size: 100,
    mode: "-rw-r--r--",
    modified: "2026-03-30T10:00:00Z",
  },
  {
    name: "beta.txt",
    path: "/home/beta.txt",
    type: "file",
    size: 200,
    mode: "-rw-r--r--",
    modified: "2026-03-30T10:00:00Z",
  },
  {
    name: "gamma_folder",
    path: "/home/gamma_folder",
    type: "dir",
    size: 0,
    mode: "drwxr-xr-x",
    modified: "2026-03-30T10:00:00Z",
  },
];

const { listFilesMock, deleteFileMock } = vi.hoisted(() => ({
  listFilesMock: vi.fn(),
  deleteFileMock: vi.fn(),
}));

vi.mock("@/src/lib/api/files", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/api/files")>("@/src/lib/api/files");
  return {
    ...actual,
    listFiles: (...args: unknown[]) => listFilesMock(...args),
    deleteFile: (...args: unknown[]) => deleteFileMock(...args),
    downloadUrl: vi.fn((serverId: string, path: string) => `/mock/download?path=${path}`),
  };
});

vi.mock("@/src/lib/session", () => ({
  useSelectedServer: () => ({ id: "srv-1", name: "Prod", username: "deploy" }),
}));

vi.mock("@/src/lib/api/server-context", () => ({
  useServer: () => ({ server: { username: "deploy" } }),
}));

describe("FilesApp multi-select", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listFilesMock.mockResolvedValue({
      path: "/",
      entries: mockEntries,
    });
    deleteFileMock.mockResolvedValue({ status: "ok" });
  });

  it("selects multiple items and shows item count in toolbar and status bar", async () => {
    const user = userEvent.setup();

    render(
      <WindowManagerProvider>
        <FilesApp />
      </WindowManagerProvider>,
    );

    expect(await screen.findByText("alpha.txt")).toBeInTheDocument();

    const checkAlpha = screen.getByRole("checkbox", { name: "Select alpha.txt" });
    const checkBeta = screen.getByRole("checkbox", { name: "Select beta.txt" });

    await user.click(checkAlpha);
    expect(screen.getAllByText("1 item selected").length).toBeGreaterThanOrEqual(1);

    await user.click(checkBeta);
    expect(screen.getAllByText("2 items selected").length).toBeGreaterThanOrEqual(1);

    // Clear selection
    const clearBtn = screen.getByRole("button", { name: "Clear" });
    await user.click(clearBtn);

    expect(screen.queryByText("2 items selected")).not.toBeInTheDocument();
  });

  it("selects all items via header checkbox", async () => {
    const user = userEvent.setup();

    render(
      <WindowManagerProvider>
        <FilesApp />
      </WindowManagerProvider>,
    );

    expect(await screen.findByText("alpha.txt")).toBeInTheDocument();

    const selectAllCheckbox = screen.getByRole("checkbox", { name: "Select all" });
    await user.click(selectAllCheckbox);

    expect(screen.getAllByText("3 items selected").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("checkbox", { name: "Select alpha.txt" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select beta.txt" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select gamma_folder" })).toBeChecked();
  });

  it("handles multi-item delete confirmation and execution", async () => {
    const user = userEvent.setup();

    render(
      <WindowManagerProvider>
        <FilesApp />
      </WindowManagerProvider>,
    );

    expect(await screen.findByText("alpha.txt")).toBeInTheDocument();

    // Select alpha and beta
    await user.click(screen.getByRole("checkbox", { name: "Select alpha.txt" }));
    await user.click(screen.getByRole("checkbox", { name: "Select beta.txt" }));

    // Click Delete in toolbar
    const deleteBtn = screen.getByRole("button", { name: "Delete" });
    await user.click(deleteBtn);

    // Verify confirmation prompt
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent(/Delete 2 items\? This action cannot be undone\./i);

    // Confirm Delete
    const confirmDeleteBtn = screen.getAllByRole("button", { name: "Delete" })[1];
    await user.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(deleteFileMock).toHaveBeenCalledWith("srv-1", "/home/alpha.txt");
      expect(deleteFileMock).toHaveBeenCalledWith("srv-1", "/home/beta.txt");
    });
  });

  it("handles multi-item download with status feedback", async () => {
    const user = userEvent.setup();

    render(
      <WindowManagerProvider>
        <FilesApp />
      </WindowManagerProvider>,
    );

    expect(await screen.findByText("alpha.txt")).toBeInTheDocument();

    // Select alpha.txt and gamma_folder
    await user.click(screen.getByRole("checkbox", { name: "Select alpha.txt" }));
    await user.click(screen.getByRole("checkbox", { name: "Select gamma_folder" }));

    // Click Download
    const downloadBtn = screen.getByRole("button", { name: "Download" });
    await user.click(downloadBtn);

    // Status feedback communicates downloaded files and skipped folders
    expect(
      await screen.findByText(
        /Downloaded 1 file \(1 folder skipped: folders cannot be downloaded directly\)\./i,
      ),
    ).toBeInTheDocument();
  });

  it("notifies when attempting to download only folders", async () => {
    const user = userEvent.setup();

    render(
      <WindowManagerProvider>
        <FilesApp />
      </WindowManagerProvider>,
    );

    expect(await screen.findByText("gamma_folder")).toBeInTheDocument();

    // Select only gamma_folder
    await user.click(screen.getByRole("checkbox", { name: "Select gamma_folder" }));

    // Click Download
    const downloadBtn = screen.getByRole("button", { name: "Download" });
    await user.click(downloadBtn);

    expect(
      await screen.findByText(
        /Folder “gamma_folder” cannot be downloaded directly with the current download architecture\./i,
      ),
    ).toBeInTheDocument();
  });
});
