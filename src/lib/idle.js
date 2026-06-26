// Auto-pause policy: if the app has been hidden (not visited) continuously for
// an hour, pause the microphone to save battery and respect privacy. While the
// page is visible it is considered "visited" and never auto-pauses (so it can
// be left running as a monitor).

const IDLE_PAUSE_MS = 60 * 60 * 1000 // 1 hour

// hiddenSince: timestamp (ms) the page last became hidden, or null if visible.
export function shouldIdlePause(hiddenSince, nowMs, isRunning, thresholdMs = IDLE_PAUSE_MS) {
  if (!isRunning) return false
  if (hiddenSince == null) return false
  return nowMs - hiddenSince >= thresholdMs
}
