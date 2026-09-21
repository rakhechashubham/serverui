# ServerUI branding

Canonical brand assets for ServerUI (web + desktop).

| File | Purpose |
| ---- | ------- |
| `serverui-logo.png` | Original mark (source artwork) |
| `serverui-icon-1024.png` | Square 1024×1024 master for OS app icons (white background) |

App icons for macOS, Windows, and Linux use a **white** square background so
transparent areas in the source mark do not become black in Dock / taskbar /
launcher tiles.

## Regenerating platform icons

From the repo root (after updating the master):

```bash
cd apps/desktop
npm run tauri -- icon ../../branding/serverui-icon-1024.png
```

This refreshes `apps/desktop/src-tauri/icons/` (PNG / ICNS / ICO / store logos).

Web favicons and UI copies live under `apps/web/public/brand/` and `apps/web/app/favicon.ico`.

To rebuild the white 1024 master from `serverui-logo.png`, composite the logo
onto a 1024×1024 white canvas (≈8% padding), then run `tauri icon` as above.
