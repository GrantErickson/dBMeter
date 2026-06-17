# PWA / install support

dB Meter is a Progressive Web App: it can be installed to the home screen /
Start menu, runs full-screen, and works offline after the first load.

## Files

| File                                   | Purpose                                              |
| -------------------------------------- | ---------------------------------------------------- |
| `public/manifest.json`                 | App metadata, icons, theme, shortcuts                |
| `public/service-worker.js`             | Offline caching (registered only in production)      |
| `public/icons/`                        | Generated icons (see below)                          |
| `src/main.js`                          | Registers the service worker when `import.meta.env.PROD` |
| `src/composables/usePWAInstall.js`     | Install detection (Android event vs. iOS Safari)     |
| `src/components/PWAInstallPrompt.vue`  | The "Install" banner shown above the tab bar         |

## Icons

All icons are generated from a single pure-Node script — **no `sharp`,
ImageMagick or other native tooling required**:

```bash
npm run generate-icons
```

This (re)writes, into `public/icons/`:

- `icon.svg` — scalable source, also referenced by the manifest
- `icon-192x192.png`, `icon-512x512.png` — standard ("any") icons
- `icon-192x192-maskable.png`, `icon-512x512-maskable.png` — Android adaptive icons (content kept inside the safe zone)
- `apple-touch-icon.png` — 180×180 home-screen icon for iOS

To change the look, edit the design constants near the top of
[`scripts/generate-icons.mjs`](scripts/generate-icons.mjs) and re-run the
command. The mark mirrors `public/favicon.svg` (an EQ bar meter).

## How install works

- **Android (Chrome/Edge) & desktop:** the browser fires `beforeinstallprompt`
  once the app is installable; the banner shows an **Install** button that
  triggers the native prompt.
- **iOS (Safari):** there is no install event — the banner instead shows the
  **Share → Add to Home Screen** steps. (Chrome/Firefox/Edge on iOS can't add to
  the home screen, so the banner is suppressed there.)
- The banner is hidden when already running installed (standalone), and stays
  hidden for 14 days after the user dismisses it.

## Testing locally

The service worker and install prompt only run in a production build (this keeps
the Vite dev server's hot-reload intact):

```bash
npm run build
npm run preview   # serves http://localhost:4173 — localhost counts as a secure context
```

Then open DevTools → **Application**:

- **Manifest** — should list the icons with no errors.
- **Service Workers** — should show the worker as activated.
- Toggle **Offline** in the Network tab and reload — the app should still load.

## Deployment

Requires HTTPS (localhost is exempt). `start_url`, `scope`, and the icon/manifest
paths all assume the app is served from the domain root, which matches the
existing Azure Static Web Apps config (`public/staticwebapp.config.json`).
