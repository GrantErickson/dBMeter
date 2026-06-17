# dB Meter

A static **Vue 3** web app that listens to your microphone and plots sound level
(dB) over time, using a **logarithmic timeline** that keeps recent detail while
compressing older history. Everything runs in the browser; all settings and
saved measurements live in **localStorage**. It deploys as an **Azure Static Web
App**.

The UI is **mobile-first and app-like**: a full-bleed Graph screen plus a bottom
tab bar (Graph · Options · Calibrate · Saved). It **auto-starts** on open
(showing a one-tap "Enable microphone" gate if the browser needs a gesture) and
keeps running across orientation changes and tab switches.

- **Portrait:** large dB readout above a tall graph.
- **Landscape:** the graph fills the screen with the dB reading **superimposed**
  in the top-left to save space.

## Features

- **In-app help / guide** that explains the graph, options and calibration. It
  opens automatically on first launch (with a *Get started* button) and is
  reachable any time from the **?** on the Graph screen or in any settings header.
- **Live dB meter** with large colour-coded readout and peak hold; a **Clear**
  button on the Meter screen wipes the graph and peak.
- **Logarithmic timeline** — the most recent **2 minutes occupy 50%** of the
  graph; older data is progressively compressed (a distant minute can be ~1% of
  the width) out to **30 minutes** (configurable).
- **Two graph modes:**
  - **Logarithmic** — full compressed timeline. It starts effectively as a
    2-minute window and grows/compresses automatically as the session runs, up
    to the configured length.
  - **Last 2 min** — a plain linear view of the most recent two minutes.
- **Colour scale** — green near the configured minimum, yellow mid-range, red as
  values approach the user-set **max**.
- **Calibration** — one- or two-point calibration (quiet + loud). Capture a raw
  reading, enter the true dB from a reference meter, and the app maps every
  reading onto a real dB scale (`spl = slope·raw + offset`).
- **A / B / Z weighting** with **Fast (125 ms)** and **Slow (1 s)** time response.
- **Interval value** — **Average (Leq)** or **Max** over the sampling interval
  (default **1 s**, configurable).
- **Save & compare** — store a measurement session and overlay it on the graph
  to compare against a live session **without interrupting** the running one.

## Run locally

```bash
npm install
npm run dev
```

Open the printed URL (e.g. `http://localhost:5173`). Microphone capture requires
a **secure context** — `localhost` works, and any production host must be HTTPS
(Azure Static Web Apps is HTTPS by default).

> For accurate measurements, allow the mic and avoid the OS/browser auto-gain.
> The app already requests the stream with echo cancellation, noise suppression,
> and auto gain control **disabled**.

## Build

```bash
npm run build      # outputs static files to dist/
npm run preview    # serve the production build locally
```

## Deploy to Azure Static Web Apps

The repo includes `.github/workflows/azure-static-web-apps.yml` and
`public/staticwebapp.config.json` (copied into `dist/` at build time).

1. In the Azure Portal, create a **Static Web App** linked to this GitHub repo,
   or run:
   ```bash
   az staticwebapp create -n my-dbmeter -g my-rg -s <github-repo-url> -b main \
     --app-location "/" --output-location "dist" --login-with-github
   ```
2. Azure injects the `AZURE_STATIC_WEB_APPS_API_TOKEN` secret and (when created
   from the portal) a workflow. The included workflow uses:
   - `app_location: "/"`
   - `output_location: "dist"`
   - no API.
3. Push to `main` — the action builds with Vite and deploys.

`staticwebapp.config.json` sets `Permissions-Policy: microphone=(self)` and a SPA
navigation fallback.

## How it works (notes)

- Audio is read via the Web Audio API `AnalyserNode` (FFT). Per frame the app
  applies the selected frequency weighting across FFT bins, sums to total power,
  then applies exponential **Fast/Slow** time weighting. Working in the frequency
  domain keeps weighting correct regardless of the device sample rate.
- The displayed "raw" dB is relative; **calibration** maps it to dB SPL. With no
  calibration the numbers are still useful for relative comparison.
- Time axis math lives in `src/lib/timescale.js`. Given the "2 min = 50%"
  constraint and a total `T`, it solves the log curve parameter
  `u = (T − 4) / 4`.

## Project layout

```
index.html
vite.config.js
public/staticwebapp.config.json
src/
  main.js
  App.vue                      tabbed shell, auto-start, mic gate, state
  styles.css                   mobile-first globals + shared control styles
  composables/useAudioMeter.js mic capture, weighting, time weighting, sampling
  lib/
    weighting.js               A/B/Z weighting curves
    calibration.js             1- or 2-point linear calibration
    timescale.js               logarithmic time compression
    color.js                   green→yellow→red mapping + overlay palette
    storage.js                 localStorage settings + sessions
  components/
    TabBar.vue                 bottom navigation (Graph · Options · Calibrate · Saved)
    HelpView.vue               first-run guide + calibration how-to
    MeterView.vue              full-bleed graph + superimposed readout + Clear
    DbGraph.vue                canvas graph (log/linear, colour, overlays)
    ControlsPanel.vue          Options screen settings (via `section` prop)
    CalibrationPanel.vue       capture + enter known dB
    SessionsPanel.vue          save / recall / overlay / delete
```

## Mobile notes

- **Auto-start:** opens straight into a running meter. The first visit (or any
  time permission is needed) shows a one-tap **Enable microphone** gate, since
  browsers require a user gesture and a secure context for the mic.
- The screen is **allowed to sleep** normally (no wake lock).
- **Pause/Resume** the microphone from the Options screen; the meter otherwise
  keeps running while you switch tabs or rotate the device.
- Add it to your home screen for a full-screen, app-like experience.
