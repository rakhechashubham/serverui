# ServerUI Product Audit (Phase 5)

Audit date: 2026-09-18  
Scope: `apps/web` shared UI (web + desktop runtimes). No promotional site.

This document records the pre-change product state. Implementation follows in the
same phase; see [manual-qa.md](manual-qa.md) for verification.

## Information architecture (target)

```
Server selection / first-run
        ↓ Connect
Boot (SSH connect)
        ↓
Desktop shell (TopBar + wallpaper + windows + Dock)
  ├── Current server always visible in TopBar
  ├── Switch / Log out / Back to servers
  └── Apps: Dashboard, Files, Terminal, Settings, About
      (+ Coming soon: Editor, Applications, Domains, Databases)
```

Primary questions the UI must answer:

| Question | Current answer | Gap |
| -------- | -------------- | --- |
| Which server am I managing? | TopBar name + status | No in-desktop switcher list |
| What app am I using? | Window title + dock indicator | OK |
| Server state? | TopBar + Dashboard | No “last updated” |
| Switch servers? | Only via Log Out → selection | **Broken product flow** |
| Add server? | Server selection screen | First-run copy thin |
| Return to desktop? | Close/minimize windows | OK |
| Close/minimize? | Traffic lights | OK |

## Component audit

### AppShell — `components/app/AppShell.tsx`

- Screens: server-selection → booting → desktop → logging-off.
- Desktop remounts with `key={selectedServer.id}` (good for switch isolation).
- **Gap:** No dedicated first-run welcome beyond empty server list.

### Server selection — `ServerSelection.tsx`, `ServerCard.tsx`, `AddServerModal.tsx`

- Loading / error / empty / list states exist.
- Delete confirmation is clear and irreversible about credentials only.
- Test connection exists on cards; **not** inside Add Server before first save.
- Empty state: “No servers yet / Add a server” — functional but not explanatory.
- Connection errors often pass through API messages (usually safe; not always product-toned).

### Boot / logout — `BootScreen.tsx`, `LogoutScreen.tsx`

- Boot calls `connectServer`, shows staged OK lines, Retry / Back.
- “Edit Server” button currently calls `backToServers` (same as Back) — **misleading label**.
- Boot steps include cosmetic “Loading filesystem” even when connect already succeeded.

### Desktop shell — `Desktop.tsx`, `TopBar.tsx`, `Dock.tsx`, `DesktopContextMenu.tsx`

- Wallpaper marketing copy is web-centric (“In your browser”, “From anywhere”).
- TopBar menu only **Log Out** — `switchServer` exists in session but is **not exposed**.
- Dock opens/focuses apps; Trash is Coming soon toast.
- Context menu “Server Information” is Coming soon instead of Dashboard.
- No global keyboard shortcuts.

### Window manager — `window-context.tsx`, `Window.tsx`, `WindowHeader.tsx`

- Open/close/minimize/maximize/restore/focus/z-index/drag/resize present.
- One window per dock app id (viewer keyed by path) — intentional.
- Viewport resize syncs maximized windows.
- **Gap:** No Cmd/Ctrl+W; no Escape-to-close for focused window.

### Terminal — `TerminalApp.tsx`

- Connect / reconnect / resize / cleanup on unmount; depends on `serverId`.
- Errors: generic (“unable to connect”, “terminal disconnected”).
- Does not leak tokens; WS uses desktop auth protocols when injected.

### Files — `files/FilesApp.tsx` (+ toolbar/list/menus)

- Browse, upload, download, rename, create, delete, empty/loading/error exist.
- **Gap:** Delete has **no confirmation** (destructive).
- Path state resets when `serverId` changes (effect) — OK with Desktop remount.

### Metrics / Dashboard — `DashboardApp.tsx` + `server-context.tsx`

- CPU / RAM / Disk / Uptime from live `getServer` polling (5s / 1.5s connecting).
- Shows Online/Offline/Connecting.
- **Gap:** No “Last updated”; Offline vs auth-failed nuance limited on Dashboard.

### Coming soon modules

- Editor, Applications, Domains, Databases: `ComingSoonApp`.
- Settings: desktop has updates; **web still Coming Soon** despite safe About content possible.
- `APP_META.settings.available === false` while Settings is partially real.

### Settings / About

- Desktop Settings: version + updater (Phase 4) — safe (no tokens/keys).
- About: static product blurb + contact email.
- **Gap:** No shared Settings for web; no runtime/environment section; no docs links.

## Cross-cutting issues

### Broken / confusing flows

1. Cannot switch servers from the desktop without logging out.
2. Boot “Edit Server” does not open the edit modal.
3. Add Server cannot test SSH before credentials are saved (test is post-save on card).
4. File delete is one-click destructive.

### Inconsistent UI / terminology

- “Log Out” means leave server session (not an account logout) — OK if documented, confusing for SaaS-trained users; prefer “Switch servers” / “Leave server”.
- Web vs desktop wallpaper copy identical.

### Missing states

- Metrics: last updated / unavailable wording.
- Terminal: productized failure reasons.
- First-run: value proposition + what happens next.

### Server scoping

- Desktop `key={server.id}` remounts shell → windows/WS/pollers reset (**good**).
- Terminal/Files keyed on `selectedServer.id`.
- Risk if future UI switches without remounting: TopBar must call `switchServer`, not mutate id in place.

### Accessibility

- Dialogs generally have `role="dialog"` + labels.
- Traffic lights have aria-labels.
- Form fields use labels; AuthChoice buttons lack `aria-pressed`.
- Focus rings present on many controls; TopBar metrics not keyboard-switchable servers.
- No skip-to-content / shortcut help.

### Keyboard

- Escape closes Add Server modal only.
- Files: Enter opens selection.
- Terminal captures keys when focused (must not steal for global shortcuts blindly).

### Responsive / web

- Server selection: 1–2 column grid, OK down to ~phone width.
- Desktop metaphor: dock + windows assume ≥ ~1024px; narrow browsers get cramped windows (min 360×220).
- **Mobile is not a supported target** for the desktop shell.

### Desktop vs web parity

| Concern | Shared | Differs |
| ------- | ------ | ------- |
| UI components | Yes | Settings updates (desktop only) |
| API client | Yes | Origin + local token injection |
| SSH/SFTP/PTY | Go | Local vs remote Go process |
| Security | Phase 3 desktop extras | Web CORS reflect vs desktop allowlist |

### Performance / cleanup

- Metrics poller aborts on unmount / server change — OK.
- Terminal disposes xterm + closes WS — OK.
- Desktop remount on switch avoids stale windows — OK.
- 1s clock interval in TopBar — fine.

### Security (must not regress)

- No token/credential display in Settings.
- Errors must stay sanitized (no private keys/passwords).
- Do not add analytics/telemetry.

## Priority backlog (Phase 5 implementation)

P0 — product-critical

1. In-desktop server switcher (TopBar).
2. First-run welcome copy + clearer empty state.
3. File delete confirmation.
4. Fix Boot “Edit Server” / leave-server wording.
5. Shared Settings (About + Runtime; Updates on desktop only).

P1 — polish

6. Desktop wallpaper copy by runtime.
7. Metrics last updated + clearer unavailable.
8. Friendlier connection/terminal errors.
9. Keyboard shortcuts (documented; terminal-safe).
10. Context menu → Dashboard instead of Coming soon for server info.
11. Mark Settings available in dock meta.

P2 — document / QA

12. `docs/manual-qa.md`, README / desktop / architecture updates.
13. Tests for first-run, switcher presence, settings web/desktop, error helper.

## Explicit non-goals (this phase)

- SaaS dashboard redesign
- New backend modules (Applications/Domains/Databases)
- CLI / agent / SQLite / Redis / telemetry
- Moving SSH into React or Tauri
