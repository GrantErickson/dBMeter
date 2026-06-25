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

// Distinct colours for tracked-frequency lines. Kept visually separate from the
// session OVERLAY_COLORS so the two kinds of line are easy to tell apart when
// both are shown at once.
export const FREQ_COLORS = [
  '#ffd166', // amber
  '#06d6a0', // teal
  '#ef476f', // rose
  '#4cc9f0', // sky
  '#b388ff', // lavender
]

// Pick the first FREQ_COLOR not already in `used`, falling back to cycling.
export function nextFreqColor(used) {
  const taken = new Set(used)
  return (
    FREQ_COLORS.find((c) => !taken.has(c)) ||
    FREQ_COLORS[(used.length || 0) % FREQ_COLORS.length]
  )
}
