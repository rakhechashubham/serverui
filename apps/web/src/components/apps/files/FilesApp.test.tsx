import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FilesApp } from "@/src/components/apps/files/FilesApp";
import { WindowManagerProvider } from "@/src/components/window/window-context";
import { ApiError } from "@/src/lib/api/client";
import type { ExtractJob, FileEntry } from "@/src/lib/api/files";

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

const {
  listFilesMock,
  deleteFileMock,
  copyItemMock,
  moveItemMock,
  compressItemsMock,
  createDirectoryMock,
  fetchMock,
  mocks,
} = vi.hoisted(() => ({
  listFilesMock: vi.fn(),
  deleteFileMock: vi.fn(),
  copyItemMock: vi.fn(),
  moveItemMock: vi.fn(),
  compressItemsMock: vi.fn(),
  createDirectoryMock: vi.fn(),
  fetchMock: vi.fn(),
  mocks: {
    startExtract: vi.fn(),
    getExtractJob: vi.fn(),
    resolveExtract: vi.fn(),
    cancelExtract: vi.fn(),
  },
}));

vi.mock("@/src/lib/api/files", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/api/files")>("@/src/lib/api/files");
  return {
    ...actual,
    listFiles: (...args: unknown[]) => listFilesMock(...args),
    deleteFile: (...args: unknown[]) => deleteFileMock(...args),
    copyItem: (...args: unknown[]) => copyItemMock(...args),
    moveItem: (...args: unknown[]) => moveItemMock(...args),
    compressItems: (...args: unknown[]) => compressItemsMock(...args),
    createDirectory: (...args: unknown[]) => createDirectoryMock(...args),
    startExtract: (...args: unknown[]) => mocks.startExtract(...args),
    getExtractJob: (...args: unknown[]) => mocks.getExtractJob(...args),
    resolveExtract: (...args: unknown[]) => mocks.resolveExtract(...args),
    cancelExtract: (...args: unknown[]) => mocks.cancelExtract(...args),
    downloadUrl: vi.fn((_serverId: string, path: string) => `/mock/download?path=${path}`),
  };
});

function renderApp() {
  return render(
    <WindowManagerProvider>
      <FilesApp />
    </WindowManagerProvider>,
  );
}

function select(name: string, modifiers: { ctrlKey?: boolean } = {}) {
  const row = screen.getByText(name).closest("tr")!;
  fireEvent.mouseDown(row, { clientX: 10, clientY: 10, ...modifiers });
  fireEvent.mouseUp(row, { clientX: 10, clientY: 10, ...modifiers });
  return row;
}

vi.mock("@/src/lib/session", () => ({
  useSelectedServer: () => ({ id: "srv-1", name: "Prod", username: "deploy" }),
}));

vi.mock("@/src/lib/api/server-context", () => ({
  useServer: () => ({ server: { username: "deploy" } }),
}));

// Most tests here drive the list view (rows are <tr>); Finder icon-view tests set their own view.
beforeEach(() => {
  localStorage.setItem("serverui-files-view", "list");
});

describe("FilesApp multi-select", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listFilesMock.mockResolvedValue({
      path: "/",
      entries: mockEntries,
    });
    deleteFileMock.mockResolvedValue({ status: "ok" });
    copyItemMock.mockResolvedValue({ status: "ok" });
    moveItemMock.mockResolvedValue({ status: "ok" });
    fetchMock.mockImplementation(async () => new Response("data"));
    vi.stubGlobal("fetch", fetchMock);
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
  });

  it("selects multiple items and shows item count in toolbar and status bar", async () => {
    const user = userEvent.setup();

    render(
      <WindowManagerProvider>
        <FilesApp />
      </WindowManagerProvider>,
    );

    expect(await screen.findByText("alpha.txt")).toBeInTheDocument();

    const rowAlpha = screen.getByText("alpha.txt").closest("tr")!;
    const rowBeta = screen.getByText("beta.txt").closest("tr")!;

    // Select alpha.txt
    fireEvent.mouseDown(rowAlpha, { clientX: 10, clientY: 10 });
    fireEvent.mouseUp(rowAlpha, { clientX: 10, clientY: 10 });
    expect(screen.getByText(/1 of 3 selected/)).toBeInTheDocument();

    // Ctrl+Click beta.txt
    fireEvent.mouseDown(rowBeta, { clientX: 10, clientY: 20, ctrlKey: true });
    fireEvent.mouseUp(rowBeta, { clientX: 10, clientY: 20, ctrlKey: true });
    expect(screen.getByText(/2 of 3 selected/)).toBeInTheDocument();

    // Clear selection
    // Clear selection from the toolbar's more menu
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Clear Selection" }));

    expect(screen.queryByText(/2 of 3 selected/)).not.toBeInTheDocument();
  });

  it("selects all items via the toolbar more menu", async () => {
    const user = userEvent.setup();

    render(
      <WindowManagerProvider>
        <FilesApp />
      </WindowManagerProvider>,
    );

    expect(await screen.findByText("alpha.txt")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Select All" }));

    expect(screen.getByText(/3 of 3 selected/)).toBeInTheDocument();
    expect(screen.getByText("alpha.txt").closest("tr")).toHaveClass("sui-selected");
    expect(screen.getByText("beta.txt").closest("tr")).toHaveClass("sui-selected");
    expect(screen.getByText("gamma_folder").closest("tr")).toHaveClass("sui-selected");
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
    const rowAlpha = screen.getByText("alpha.txt").closest("tr")!;
    const rowBeta = screen.getByText("beta.txt").closest("tr")!;

    fireEvent.mouseDown(rowAlpha, { clientX: 10, clientY: 10 });
    fireEvent.mouseUp(rowAlpha, { clientX: 10, clientY: 10 });

    fireEvent.mouseDown(rowBeta, { clientX: 10, clientY: 20, ctrlKey: true });
    fireEvent.mouseUp(rowBeta, { clientX: 10, clientY: 20, ctrlKey: true });

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

  it("warns before downloading a selection with folders and offers compression", async () => {
    const user = userEvent.setup();
    renderApp();
    expect(await screen.findByText("alpha.txt")).toBeInTheDocument();

    select("alpha.txt");
    select("gamma_folder", { ctrlKey: true });
    await user.click(screen.getByRole("button", { name: "Download" }));

    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      /Folders can’t be downloaded directly/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Compress…" }));
    expect(screen.getByLabelText("Archive name")).toHaveValue("Archive.zip");
  });

  it("downloads files with progress and retries only the failed ones", async () => {
    const user = userEvent.setup();
    let betaAttempts = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("beta") && betaAttempts++ === 0) {
        return new Response(JSON.stringify({ error: "permission denied" }), { status: 403 });
      }
      return new Response("data");
    });
    renderApp();
    expect(await screen.findByText("alpha.txt")).toBeInTheDocument();

    select("alpha.txt");
    select("beta.txt", { ctrlKey: true });
    await user.click(screen.getByRole("button", { name: "Download" }));

    const panel = await screen.findByRole("status", { name: "Downloads" });
    await waitFor(() => expect(panel).toHaveTextContent("1 of 2 complete, 1 failed"));
    expect(panel).toHaveTextContent("Failed: permission denied");

    await user.click(screen.getByRole("button", { name: "Retry failed" }));
    await waitFor(() => expect(panel).toHaveTextContent("2 of 2 complete"));
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.filter((u) => u.includes("alpha"))).toHaveLength(1);
    expect(urls.filter((u) => u.includes("beta"))).toHaveLength(2);
  });

  it("copies with the keyboard and asks before replacing on paste", async () => {
    const user = userEvent.setup();
    renderApp();
    expect(await screen.findByText("alpha.txt")).toBeInTheDocument();

    const row = select("alpha.txt");
    fireEvent.keyDown(row, { key: "c", ctrlKey: true });
    fireEvent.keyDown(row, { key: "v", ctrlKey: true });

    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      /An item named “alpha.txt” already exists/,
    );
    await user.click(screen.getByRole("button", { name: "Keep Both" }));
    await waitFor(() =>
      expect(copyItemMock).toHaveBeenCalledWith(
        "srv-1",
        "/home/alpha.txt",
        "/alpha (1).txt",
        false,
      ),
    );

    fireEvent.keyDown(select("alpha.txt"), { key: "v", ctrlKey: true });
    await user.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() =>
      expect(copyItemMock).toHaveBeenCalledWith("srv-1", "/home/alpha.txt", "/alpha.txt", true),
    );
  });

  it("moves cut items and empties the clipboard", async () => {
    const user = userEvent.setup();
    renderApp();
    expect(await screen.findByText("beta.txt")).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText("beta.txt"));
    await user.click(screen.getByRole("menuitem", { name: "Cut" }));
    expect(screen.getByRole("button", { name: "Paste “beta.txt”" })).toBeInTheDocument();

    // The listing already holds a "beta.txt", so pasting here asks first.
    fireEvent.keyDown(select("alpha.txt"), { key: "v", ctrlKey: true });
    await user.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() =>
      expect(moveItemMock).toHaveBeenCalledWith("srv-1", "/home/beta.txt", "/beta.txt", true),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /^Paste/ })).not.toBeInTheDocument(),
    );
  });

  it("asks before replacing an existing archive", async () => {
    const user = userEvent.setup();
    compressItemsMock
      .mockRejectedValueOnce(new ApiError("already exists", 409))
      .mockResolvedValueOnce({ status: "ok", path: "/gamma_folder.zip" });
    renderApp();
    expect(await screen.findByText("gamma_folder")).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText("gamma_folder"));
    await user.click(screen.getByRole("menuitem", { name: "Compress" }));
    expect(screen.getByLabelText("Archive name")).toHaveValue("gamma_folder.zip");
    await user.selectOptions(screen.getByLabelText("Format"), "tar.gz");
    expect(screen.getByLabelText("Archive name")).toHaveValue("gamma_folder.tar.gz");
    await user.selectOptions(screen.getByLabelText("Format"), "zip");
    await user.click(screen.getByRole("button", { name: "Compress" }));

    expect(await screen.findByText("“gamma_folder.zip” already exists.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() =>
      expect(compressItemsMock).toHaveBeenLastCalledWith(
        "srv-1",
        "/",
        ["gamma_folder"],
        "gamma_folder.zip",
        "zip",
        true,
      ),
    );
    expect(await screen.findByText("Created “gamma_folder.zip”.")).toBeInTheDocument();
  });

  it("switches to tar.gz when zip is missing on the server", async () => {
    const user = userEvent.setup();
    compressItemsMock
      .mockRejectedValueOnce(new ApiError("zip is not installed on the server", 400))
      .mockResolvedValueOnce({ status: "ok", path: "/gamma_folder.tar.gz" });
    renderApp();
    expect(await screen.findByText("gamma_folder")).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText("gamma_folder"));
    await user.click(screen.getByRole("menuitem", { name: "Compress" }));
    await user.click(screen.getByRole("button", { name: "Compress" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Switched to TAR.GZ/);
    expect(screen.getByLabelText("Format")).toHaveValue("tar.gz");
    expect(screen.getByLabelText("Archive name")).toHaveValue("gamma_folder.tar.gz");

    await user.click(screen.getByRole("button", { name: "Compress" }));
    await waitFor(() =>
      expect(compressItemsMock).toHaveBeenLastCalledWith(
        "srv-1",
        "/",
        ["gamma_folder"],
        "gamma_folder.tar.gz",
        "tar.gz",
        false,
      ),
    );
  });
});

const archiveEntries: FileEntry[] = [
  {
    name: "notes.txt",
    path: "/notes.txt",
    type: "file",
    size: 10,
    mode: "-rw-r--r--",
    modified: "2026-10-01T10:00:00Z",
  },
  {
    name: "site.zip",
    path: "/site.zip",
    type: "file",
    size: 2048,
    mode: "-rw-r--r--",
    modified: "2026-10-01T10:00:00Z",
  },
];

function job(overrides: Partial<ExtractJob>): ExtractJob {
  return {
    id: "job-1",
    state: "scanning",
    archive: "/site.zip",
    destination: "/",
    done: 0,
    total: 0,
    conflicts: [],
    extracted: [],
    ...overrides,
  };
}

const POLL_WAIT = { timeout: 3000 };

async function renderFiles() {
  render(
    <WindowManagerProvider>
      <FilesApp />
    </WindowManagerProvider>,
  );
  expect(await screen.findByText("site.zip")).toBeInTheDocument();
}

function openMenu(name: string) {
  fireEvent.contextMenu(screen.getByText(name).closest("tr")!, { clientX: 20, clientY: 20 });
}

describe("FilesApp archive extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listFilesMock.mockResolvedValue({ path: "/", entries: archiveEntries });
  });

  it("offers extraction only for supported archives", async () => {
    await renderFiles();

    openMenu("notes.txt");
    expect(screen.queryByRole("menuitem", { name: "Extract Here" })).not.toBeInTheDocument();

    openMenu("site.zip");
    expect(screen.getByRole("menuitem", { name: "Extract Here" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Extract To…" })).toBeInTheDocument();
  });

  it("extracts here, refreshes the folder, and selects the result", async () => {
    const user = userEvent.setup();
    mocks.startExtract.mockResolvedValue(job({ state: "scanning" }));
    mocks.getExtractJob.mockResolvedValue(
      job({ state: "done", done: 3, total: 3, extracted: ["/site"] }),
    );
    await renderFiles();
    const extracted: FileEntry = { ...archiveEntries[0], name: "site", path: "/site", type: "dir" };
    listFilesMock.mockResolvedValue({ path: "/", entries: [...archiveEntries, extracted] });

    openMenu("site.zip");
    await user.click(screen.getByRole("menuitem", { name: "Extract Here" }));

    expect(mocks.startExtract).toHaveBeenCalledWith("srv-1", "/site.zip", "here", undefined);
    expect(await screen.findByText("Checking “site.zip”…")).toBeInTheDocument();
    expect(
      await screen.findByText("Extracted “site.zip” to /site.", {}, POLL_WAIT),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("site").closest("tr")).toHaveClass("sui-selected"));
  });

  it("extracts to a chosen folder", async () => {
    const user = userEvent.setup();
    mocks.startExtract.mockResolvedValue(job({ state: "scanning", destination: "/srv/out" }));
    mocks.getExtractJob.mockResolvedValue(
      job({ state: "done", destination: "/srv/out", extracted: ["/srv/out/site"] }),
    );
    await renderFiles();

    openMenu("site.zip");
    await user.click(screen.getByRole("menuitem", { name: "Extract To…" }));
    const input = screen.getByDisplayValue("/site");
    await user.clear(input);
    await user.type(input, "/srv/out");
    await user.click(screen.getByRole("button", { name: "Extract" }));

    expect(mocks.startExtract).toHaveBeenCalledWith("srv-1", "/site.zip", "to", "/srv/out");
    expect(
      await screen.findByText("Extracted “site.zip” to /srv/out/site.", {}, POLL_WAIT),
    ).toBeInTheDocument();
  });

  it("asks before overwriting and continues with keep both", async () => {
    const user = userEvent.setup();
    mocks.startExtract.mockResolvedValue(
      job({ state: "awaiting_decision", total: 2, conflicts: ["site"] }),
    );
    mocks.resolveExtract.mockResolvedValue(job({ state: "extracting", total: 2 }));
    mocks.getExtractJob.mockResolvedValue(
      job({ state: "done", done: 2, total: 2, extracted: ["/site (1)"] }),
    );
    await renderFiles();

    openMenu("site.zip");
    await user.click(screen.getByRole("menuitem", { name: "Extract Here" }));

    const prompt = await screen.findByRole("alertdialog");
    expect(prompt).toHaveTextContent("“site” already exists in /.");
    await user.click(screen.getByRole("button", { name: "Keep both" }));

    expect(mocks.resolveExtract).toHaveBeenCalledWith("srv-1", "job-1", "keep-both");
    expect(
      await screen.findByText("Extracted “site.zip” to /site (1).", {}, POLL_WAIT),
    ).toBeInTheDocument();
  });

  it("shows progress and lets the user cancel", async () => {
    const user = userEvent.setup();
    mocks.startExtract.mockResolvedValue(job({ state: "extracting", done: 1, total: 4 }));
    mocks.getExtractJob.mockResolvedValue(job({ state: "extracting", done: 1, total: 4 }));
    mocks.cancelExtract.mockResolvedValue(job({ state: "extracting", done: 1, total: 4 }));
    await renderFiles();

    openMenu("site.zip");
    await user.click(screen.getByRole("menuitem", { name: "Extract Here" }));

    expect(await screen.findByText("Extracting “site.zip”… 1 of 4 (25%)")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");

    mocks.getExtractJob.mockResolvedValue(job({ state: "cancelled", done: 1, total: 4 }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mocks.cancelExtract).toHaveBeenCalledWith("srv-1", "job-1");
    expect(
      await screen.findByText(
        "Extraction of “site.zip” was cancelled. Nothing was changed.",
        {},
        POLL_WAIT,
      ),
    ).toBeInTheDocument();
  });

  it("reports extraction failures", async () => {
    const user = userEvent.setup();
    mocks.startExtract.mockResolvedValue(job({ state: "scanning" }));
    mocks.getExtractJob.mockResolvedValue(
      job({ state: "failed", error: "archive is corrupted or is not a valid ZIP archive" }),
    );
    await renderFiles();

    openMenu("site.zip");
    await user.click(screen.getByRole("menuitem", { name: "Extract Here" }));

    expect(
      await screen.findByText(
        "Couldn’t extract “site.zip”: archive is corrupted or is not a valid ZIP archive.",
        {},
        POLL_WAIT,
      ),
    ).toBeInTheDocument();
  });
});

describe("FilesApp Finder layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem("serverui-files-view");
    listFilesMock.mockResolvedValue({ path: "/", entries: mockEntries });
  });

  it("switches to list view, remembers it, and navigates from the sidebar", async () => {
    const user = userEvent.setup();
    localStorage.removeItem("serverui-files-view");

    render(
      <WindowManagerProvider>
        <FilesApp />
      </WindowManagerProvider>,
    );

    expect(await screen.findByRole("listbox", { name: "Files" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "List view" }));
    expect(screen.getByText("Date Modified")).toBeInTheDocument();
    expect(localStorage.getItem("serverui-files-view")).toBe("list");

    const places = screen.getByRole("navigation", { name: "Places" });
    expect(places).toHaveTextContent("Prod");
    await user.click(screen.getByRole("button", { name: "tmp" }));
    await waitFor(() => expect(listFilesMock).toHaveBeenCalledWith("srv-1", "/tmp"));
    localStorage.removeItem("serverui-files-view");
  });

  it("opens the context menu at the cursor, outside the window's layout", async () => {
    render(
      <WindowManagerProvider>
        <FilesApp />
      </WindowManagerProvider>,
    );

    const item = await screen.findByRole("option", { name: "beta.txt" });
    fireEvent.contextMenu(item, { clientX: 140, clientY: 120 });

    const menu = screen.getByRole("menu", { name: "File actions" });
    // Rendered on <body> so position: fixed is relative to the viewport, not
    // to the window (whose backdrop-filter would otherwise offset it).
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveStyle({ left: "140px", top: "120px" });
  });

  it("opens the user's real home directory from the sidebar", async () => {
    const user = userEvent.setup();
    listFilesMock.mockImplementation(async (_serverId: string, path: string) =>
      path === "~" ? { path: "/root", entries: [] } : { path: "/", entries: mockEntries },
    );

    render(
      <WindowManagerProvider>
        <FilesApp />
      </WindowManagerProvider>,
    );
    expect(await screen.findByText("alpha.txt")).toBeInTheDocument();

    // Home asks the server for "~" instead of guessing /home/<user>.
    await user.click(screen.getByRole("button", { name: "Home" }));
    await waitFor(() => expect(listFilesMock).toHaveBeenCalledWith("srv-1", "~"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page"),
    );
    expect(screen.getByRole("heading", { name: "root" })).toBeInTheDocument();
  });

  it("keeps typing and Enter in the name field when switching dialogs, and Escape cancels (#12)", async () => {
    const user = userEvent.setup();
    localStorage.setItem("serverui-files-view", "list");
    createDirectoryMock.mockResolvedValue({ status: "ok" });
    renderApp();
    await screen.findByText("gamma_folder");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "New File" }));
    select("gamma_folder");
    await user.click(screen.getByRole("button", { name: "New folder" }));
    await user.keyboard("newdir{Enter}");

    await waitFor(() => expect(createDirectoryMock).toHaveBeenCalledWith("srv-1", "/newdir"));
    expect(listFilesMock).not.toHaveBeenCalledWith("srv-1", "/home/gamma_folder");

    await user.click(screen.getByRole("button", { name: "New folder" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Folder name")).not.toBeInTheDocument();
    localStorage.removeItem("serverui-files-view");
  });
});
