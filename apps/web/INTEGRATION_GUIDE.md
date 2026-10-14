# ServerUI Design Tokens Integration Guide

## Overview

This guide explains how to migrate from the existing `globals.css` to the new semantic design token system in `src/lib/design-tokens.css` with full Light/Dark/System theme support.

---

## Files Created

| File | Purpose |
|------|---------|
| `src/lib/design-tokens.css` | Complete semantic token system with 3-theme support |
| `src/lib/theme.tsx` | Updated theme provider with "system" option |
| `src/components/desktop/ThemeToggle.tsx` | 3-option toggle (☀️ Light / 🌙 Dark / 💻 System) |

---

## Migration Steps

### 1. Import Design Tokens in `globals.css`

**Current `globals.css`** (line 1):
```css
@import "tailwindcss";
```

**Updated `globals.css`** - Add import after tailwindcss:
```css
@import "tailwindcss";
@import "@/lib/design-tokens.css";  /* Add this line */

/* ... rest of existing globals.css ... */
```

**Why this works with Tailwind v4:**
- Tailwind v4 uses CSS-first configuration via `@theme inline`
- The design tokens file defines `@theme inline` mappings that Tailwind will pick up
- Semantic tokens become available as Tailwind utilities (e.g., `bg-bg-primary`, `text-fg-primary`)

---

### 2. Update `layout.tsx` Theme Script

**Current theme script** (lines 27-39) only handles "light"/"dark". Update to support "system":

```tsx
const themeScript = `try {
  var theme = localStorage.getItem("serverui-theme");
  var resolved = theme;
  if (theme === "system" || !theme) {
    resolved = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  if (resolved !== "light" && resolved !== "dark") resolved = "dark";
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
} catch (e) {
  document.documentElement.dataset.theme = "dark";
  document.documentElement.style.colorScheme = "dark";
}`;
```

**Also update the initial `data-theme` attribute** on `<html>` (line 66):
```tsx
// Change from hardcoded "dark" to dynamic:
<html
  lang="en"
  suppressHydrationWarning
  data-theme="system"  {/* Changed from "dark" */}
  className={`${geistSans.variable} ${geistMono.variable} h-full overflow-hidden antialiased`}
>
```

> **Note**: The `data-theme="system"` on the HTML element tells the CSS to use the `@media (prefers-color-scheme)` rules. The inline script will immediately resolve it to "light" or "dark" before paint.

---

### 3. Verify ThemeProvider Wraps the App

Ensure `ThemeProvider` wraps your app in a client component. If you don't have a client layout wrapper, create one:

**Create `app/providers.tsx`:**
```tsx
"use client";

import { ThemeProvider } from "@/src/lib/theme";
import { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
```

**Update `app/layout.tsx`:**
```tsx
import { Providers } from "./providers";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html ...>
      <head>...</head>
      <body ...>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

---

### 4. Semantic Token Mapping Reference

Use this table to migrate existing CSS custom properties to semantic tokens:

| Old Variable | New Semantic Token | Tailwind Utility |
|--------------|-------------------|------------------|
| `--background` | `--color-bg-primary` | `bg-bg-primary` |
| `--foreground` | `--color-fg-primary` | `text-fg-primary` |
| `--app-bg` | `--color-bg-secondary` | `bg-bg-secondary` |
| `--app-bg-2` | `--color-bg-tertiary` | `bg-bg-tertiary` |
| `--app-sidebar` | `--color-bg-sidebar` | `bg-bg-sidebar` |
| `--app-fg` | `--color-fg-secondary` | `text-fg-secondary` |
| `--app-title` | `--color-fg-title` | `text-fg-title` |
| `--app-muted` | `--color-fg-muted` | `text-fg-muted` |
| `--app-card` | `--color-bg-card` | `bg-bg-card` |
| `--app-input` | `--color-bg-input` | `bg-bg-input` |
| `--app-border` | `--color-border-primary` | `border-border-primary` |
| `--app-hover` | `--color-hover` | `hover:bg-hover` |
| `--app-selected` | `--color-selected` | `bg-selected` |
| `--window-bg` | `--color-bg-window` | `bg-bg-window` |
| `--window-border` | `--color-border-window` | `border-border-window` |
| `--window-header` | `--color-window-header` | `bg-window-header` |
| `--topbar-bg` | `--color-bg-topbar` | `bg-bg-topbar` |
| `--topbar-fg` | `--color-fg-topbar` | `text-fg-topbar` |
| `--topbar-muted` | `--color-fg-topbar-muted` | `text-fg-topbar-muted` |
| `--toggle-bg` | `--color-bg-toggle` | `bg-bg-toggle` |
| `--toggle-active` | `--color-toggle-active` | `bg-toggle-active` |
| `--toggle-active-fg` | `--color-toggle-active-fg` | `text-toggle-active-fg` |
| `--finder-accent` / `--app-selected` | `--color-primary` | `bg-primary` |
| `--dock-glass` | `--color-bg-dock` | `bg-bg-dock` |
| `--dock-border` | `--color-border-dock` | `border-border-dock` |
| `--finder-text` | `--color-fg-finder` | `text-fg-finder` |
| `--finder-muted` | `--color-fg-finder-muted` | `text-fg-finder-muted` |
| `--finder-hairline` | `--color-border-finder` | `border-border-finder` |

---

### 5. Tailwind v4 Utility Classes

After importing design-tokens.css, these utilities are available:

```tsx
// Backgrounds
<div className="bg-bg-primary" />
<div className="bg-bg-secondary" />
<div className="bg-bg-card" />
<div className="bg-bg-window" />
<div className="bg-bg-toggle" />

// Text colors
<span className="text-fg-primary" />
<span className="text-fg-secondary" />
<span className="text-fg-title" />
<span className="text-fg-muted" />
<span className="text-fg-topbar" />
<span className="text-fg-topbar-muted" />

// Borders
<div className="border border-border-primary" />
<div className="border border-border-window" />

// Interactive states
<button className="hover:bg-hover active:bg-active" />
<div className="bg-selected" />

// Brand/Primary
<button className="bg-primary text-primary-fg hover:bg-primary-hover" />

// Glass effects
<div className="glass-lg" />
<div className="window-glass" />

// Transitions
<div className="transition-base" />
<div className="transition-slow" />
```

---

### 6. Theme Toggle Usage

The updated `ThemeToggle` component works out of the box:

```tsx
import { ThemeToggle } from "@/src/components/desktop/ThemeToggle";
import { useTheme } from "@/src/lib/theme";

function MyComponent() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  
  return (
    <div>
      <p>Current: {theme} (resolved: {resolvedTheme})</p>
      <ThemeToggle />
      <button onClick={() => setTheme("light")}>Force Light</button>
      <button onClick={() => setTheme("dark")}>Force Dark</button>
      <button onClick={() => setTheme("system")}>Follow System</button>
    </div>
  );
}
```

---

### 7. Testing Checklist

After integration, verify:

- [ ] **Light theme**: All colors readable, WCAG AA contrast
- [ ] **Dark theme**: All colors readable, WCAG AA contrast
- [ ] **System theme**: Follows OS preference, updates on change
- [ ] **Persistence**: Theme choice survives page reload
- [ ] **Toggle UI**: All 3 buttons work, active state visible
- [ ] **No flash**: Initial load doesn't show wrong theme (inline script handles this)
- [ ] **Tailwind utilities**: `bg-bg-primary`, `text-fg-primary`, etc. work
- [ ] **Reduced motion**: Animations respect `prefers-reduced-motion`

---

### 8. Gradual Migration Strategy

You don't need to migrate everything at once:

1. **Phase 1**: Import design-tokens.css, update theme script, verify ThemeToggle works
2. **Phase 2**: Replace `--background`/`--foreground` with semantic tokens in globals.css
3. **Phase 3**: Migrate component-by-component to semantic tokens
4. **Phase 4**: Remove legacy variables from globals.css once unused

The old variables in globals.css will continue working alongside new tokens during migration.

---

### 9. Browser Support

| Feature | Support |
|---------|---------|
| CSS Custom Properties | All modern browsers |
| `prefers-color-scheme` | All modern browsers |
| `color-scheme` | All modern browsers |
| `@media (prefers-color-scheme)` in `:root:not([data-theme])` | All modern browsers |
| Tailwind v4 `@theme inline` | Requires Tailwind v4+ |

---

### 10. Troubleshooting

**Theme not persisting:**
- Check `localStorage` for `serverui-theme` key
- Verify `ThemeProvider` wraps the component using `useTheme()`

**System theme not updating:**
- Ensure `mediaQuery.addEventListener("change", ...)` is registered (in theme.tsx)
- Check that `data-theme="system"` is on `<html>` initially

**Tailwind utilities not working:**
- Verify `@import "@/lib/design-tokens.css"` is in globals.css AFTER `@import "tailwindcss"`
- Run `npm run dev` to regenerate Tailwind CSS

**Flash of wrong theme on load:**
- Ensure inline script in `layout.tsx` runs before paint (it's in `<head>`)
- Script must handle "system" → resolved theme correctly

---

## Summary

The design token system provides:
- ✅ Semantic naming (intent-based, not value-based)
- ✅ 3-theme support (Light/Dark/System)
- ✅ Tailwind v4 integration via `@theme inline`
- ✅ WCAG AA contrast in both themes
- ✅ System preference detection and auto-switching
- ✅ Persistence via localStorage
- ✅ Accessible theme toggle component
- ✅ No runtime CSS-in-JS
- ✅ Backwards compatible with existing globals.css