# Store: how it works and how to add an app

The Store window shows which tools are installed on the selected server and lets you
install, update, or remove them. px0 is the one app that also opens inside ServerUI.

![The Store window on a server with px0, Docker, and Git installed](images/store.jpg)

Everything the Store can do is a fixed list that lives in the code. The browser never sends a
shell command: it sends an app id and an action (`install`, `update`, `remove`), and the
backend runs the script it already has for that pair.

## How it works

1. **Detection.** Opening the Store (or pressing the refresh button) runs one script over SSH.
   For each app it checks `command -v <bin>` and, when found, runs the app's version command.
   The result is a list of `{ id, installed, version, actions }`.
2. **Actions offered.** Not installed: `install`. Installed: `update` and `remove`. An action is
   only offered if the app has a script for it. An app with no scripts is detect-only (Docker
   and Node.js are).
3. **Jobs.** An action runs in the background as a job. The card shows its log tail and the
   result. Only one job per app and server runs at a time.
4. **Verification.** When a script exits with 0, the backend detects again. `install` and
   `update` must leave the app on the PATH, `remove` must take it off. Otherwise the job fails.
   This matters: some installers print their usage and still exit 0.

Code map:

| Part | File |
|---|---|
| Catalogue and scripts | `apps/server/internal/appstore/catalog.go` |
| Detection, jobs, verification | `apps/server/internal/appstore/service.go` |
| HTTP routes | `apps/server/internal/api/store.go` |
| Cards, filters, job log | `apps/web/src/components/apps/ApplicationsApp.tsx` |
| Names, icons, descriptions | `apps/web/src/data/store-catalog.ts` |
| API client | `apps/web/src/lib/api/store.ts` |

## Add an app

An app needs two entries that share the same `id`. The Go entry decides what runs, the web
entry decides how the card looks.

### 1. The Go entry (`catalog.go`)

Add an `App` to `Catalog`:

```go
{
	ID:      "tmux",
	Bin:     "tmux",
	Version: `tmux -V | awk '{print $2}'`,
	Install: distroPkg("install", "tmux"),
	Update:  distroPkg("update", "tmux"),
	Remove:  distroPkg("remove", "tmux"),
},
```

tmux is only an illustration and is not in the catalogue. Check your own version command on a
real server before relying on it.

| Field | Meaning |
|---|---|
| `ID` | Stable id, lowercase. Must match the web entry. |
| `Bin` | The executable looked up with `command -v`. This is what "installed" means. |
| `Version` | A pipeline that prints the version on one line. If it prints nothing, the card says "installed" without a number. |
| `Install`, `Update`, `Remove` | Shell scripts. Leave one empty to not offer that action. |

Script rules:

- **POSIX `sh`.** Scripts run through `sh -c`, which is `dash` on Debian. Use bash only by
  calling it explicitly, as `fetchAndRun(url, "bash", "")` does.
- **Never interactive.** There is no terminal and no stdin. Pass non-interactive flags
  (`-y`, `DEBIAN_FRONTEND=noninteractive`).
- **Prefer user-level installs** (`~/.local`, as px0, Claude Code, and Bun do). They need
  no root and are easy to remove.
- **System packages** use the helpers: `distroPkg(op, pkg)` handles apt, dnf, and apk and starts
  with `needRoot`, which sets `$SUDO` to nothing (root), `sudo -n`, or stops with
  "root or passwordless sudo is required".
- **Downloaded installers** go through `fetchAndRun(url, interpreter, args)`. It saves the file
  first, so a failed download stops the script instead of hiding behind a pipe.
- **The PATH.** The prelude adds `~/.local/bin` and `~/.bun/bin`. If your app installs
  somewhere else, add it to `prelude`, or detection and verification will not find it.
- **Be idempotent.** Running install twice must be safe.
- **Explain failures on the last line.** If a script fails, the last line of its output becomes
  the error shown on the card. `echo "<reason>"; exit 1` is better than a raw exit status.
- **Remove what you installed, keep what the user made.** px0's remove stops the process
  and deletes the binary but keeps `~/.px0`. Claude Code keeps `~/.claude`.
- **Be careful with destructive apps.** If removing the app can break other things (containers,
  databases), make it detect-only: give it no scripts.

### 2. The web entry (`store-catalog.ts`)

Add a `StoreApp` to `STORE_CATALOG`:

```ts
{
  id: "tmux",
  name: "tmux",
  tagline: "Terminal multiplexer: keep sessions alive when you disconnect.",
  category: "Tools",
  icon: Terminal,
  tint: "from-green-400 to-emerald-700",
  footprint: "CLI · ~1 MB disk",
},
```

- `category` must be one of `STORE_CATEGORIES` (`Editors`, `AI`, `Runtimes`, `Tools`). To add a
  category, add it to that list and it appears in the sidebar.
- `icon` is any [lucide-react](https://lucide.dev) icon, imported at the top of the file.
- `tint` is a Tailwind gradient (`from-... to-...`) for the icon tile.
- `footprint` is one short line that tells the user what lands on their server.

The card shows actions from the backend, so nothing else is needed in the UI.

### 3. Check it

```bash
go -C apps/server test ./internal/appstore   # also syntax-checks every script with sh -n
cd apps/web && npm test && npm run lint && npx tsc --noEmit
```

`make test` and `make lint` run the same checks for the whole repository.

`TestEveryScriptParsesAsShell` loops over the whole catalogue, so a typo in your script fails
the test without running anything. Then try it for real on a **throwaway server**: install,
refresh, update, remove, and check the version command prints what you expect. Unit tests
use a fake runner and do not run your installer.

## Apps that open inside ServerUI (px0)

Installing a binary is enough for a command-line tool. Some apps also have a web interface you
may want in a window. px0 (AI code review console) is the example, in `apps/server/internal/px0`:

- ServerUI starts px0 on the server over SSH:
  `px0 -host 127.0.0.1 -port 0 -base-path /api/px0/<id>/ -no-open -no-update -no-color -no-telemetry "$HOME"`.
  px0 picks the port itself and ServerUI reads it from px0's log (`~/.local/share/serverui/px0.log`).
  The port is remembered in `~/.local/share/serverui/px0.port` and reused while px0 still
  answers there. The start script uses `curl` to check this, so `curl` is needed on the server.
- px0 is rooted at `$HOME` of the SSH user.
- The backend reaches that port through an SSH tunnel (direct-tcpip), so sshd must allow
  `AllowTcpForwarding`. It reverse-proxies HTTP under `/api/px0/{serverId}/`:
  - `Host` is rewritten to `127.0.0.1:<port>`.
  - `Origin` is rewritten to `http://127.0.0.1:<port>` only when it matches the host the browser
    used for ServerUI, so px0's own CSRF protection stays on for any other origin.
  - The `frame-ancestors` CSP is rewritten to `'self'` and `X-Frame-Options` is removed, so the
    page can show in a ServerUI window. When the parent page is on loopback (`localhost`,
    `127.0.0.1`, or `::1`, read from the `Referer`), its origin is added too, for development
    with the UI on `localhost:3000` and the API on another port. A public origin is never added.
  - Server-sent events are flushed at once, not buffered.
- The web app has a `px0` window (`Px0App.tsx`) that calls `POST /api/px0/{id}/start` and
  shows the proxied page in an iframe.
- Files shows "Open in px0" on a file, but only when the Store detected px0 on that server and
  the file is under `$HOME`. It opens that file with `?path=<path>`, relative to `$HOME`. px0
  cannot target a folder. "Open Folder in px0", with nothing selected, opens px0 on `$HOME`.

![Files context menu with Open in px0](images/store-files-menu.jpg)

![px0 in a ServerUI window, showing a file opened from Files](images/store-px0.jpg)

To do the same for another app, it has to cooperate with a proxy:

- Prefer a Unix socket or its own authentication. px0 offers neither: it listens on a TCP port
  on `127.0.0.1`, which every local user on the server can reach.
- It must work under a URL prefix (`/api/px0/<id>/`). Many web apps do not. Test this first.
- It must use relative URLs, since the browser URL keeps the trailing slash and the apps resolve
  against it. This is also why `next.config.ts` sets `skipTrailingSlashRedirect: true`.
- It must work through the proxy (server-sent events for px0) and accept the rewritten `Host`
  and `Origin` described above.

## Limits

- "Update" reinstalls the latest version. There is no "update available" indicator and no
  version pinning yet.
- Installers are the vendors' own scripts (`px0.ai`, `claude.ai`, `bun.sh`) and need
  `curl` on the server. Git needs apt, dnf, or apk.
- px0 works in the web app only. The desktop app sends its local auth token as a header,
  which an iframe cannot do.
- Closing the px0 window does not stop px0 on the server. Removing it from the Store does.
- px0 has no authentication and listens on `127.0.0.1` of the server, so every local user on
  that server can reach it. Unlike a Unix socket with mode 600, this is not limited to the SSH user.
- ServerUI has no login of its own, so anyone who can reach ServerUI can reach the px0 it
  proxies. Protect ServerUI itself accordingly.

## API

| Route | Purpose |
|---|---|
| `GET /api/store/apps?serverId=` | Detection: `{ apps: [{ id, installed, version?, actions }] }` |
| `POST /api/store/jobs` | Body `{ serverId, appId, action }`. Returns a job, or `404` unknown app, `400` action not offered, `409` already running |
| `GET /api/store/jobs/{job}?serverId=` | Job state: `running`, `done`, or `failed`, with `log` and `error` |
| `POST /api/px0/{id}/start` | Starts px0, returns `{ path }`. `409` if it is not installed |
| `/api/px0/{id}/...` | The proxied px0 |

Jobs live in memory only. A finished job is kept at least 10 minutes (it is dropped when the
next job starts), keeps the last 200 log lines, and a running job times out after 15 minutes.
