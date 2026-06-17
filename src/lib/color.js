// Map a dB value to a colour: green (low) -> yellow (mid) -> red (near max).
// `min` is the green floor, `max` is the red threshold the user configures.

export function dbToColor(db, min, max, alpha = 1) {
  let n = (db - min) / (max - min || 1)
  n = Math.max(0, Math.min(1, n))
  const hue = 120 * (1 - n) // 120 = green, 60 = yellow, 0 = red
  return `hsla(${hue}, 85%, 50%, ${alpha})`
}

// Distinct colours for overlay (recalled) sessions.
export const OVERLAY_COLORS = [
  '#7aa2ff',
  '#c792ea',
  '#00d3c7',
  '#ff9e64',
  '#f7768e',
  '#e0d96a',
]
