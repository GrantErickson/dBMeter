// Helpers for the user-tracked frequency overlay.
//
// The user can configure up to MAX_FREQ_TRACKS frequencies on the Settings
// screen. Each is tracked continuously by the meter (the level of a narrow band
// around the frequency) and can be drawn as a line on the graph when the
// overlay is turned on from the main screen.

export const MAX_FREQ_TRACKS = 5
export const MIN_FREQ = 10 // Hz
export const MAX_FREQ = 20000 // Hz (clamped further to Nyquist by the meter)

// Format a frequency for compact display: 60 -> "60 Hz", 1000 -> "1 kHz",
// 1500 -> "1.5 kHz", 12500 -> "12.5 kHz".
export function fmtFreq(hz) {
  if (!Number.isFinite(hz)) return '— Hz'
  if (hz >= 1000) {
    const k = hz / 1000
    const s = Number.isInteger(k) ? String(k) : k.toFixed(k < 10 ? 2 : 1)
    return s.replace(/\.?0+$/, '') + ' kHz'
  }
  return Math.round(hz) + ' Hz'
}

// A stable signature of the tracked-frequency list (id + frequency) used to
// detect when the set of frequencies changes and the meter/buffers need
// rebuilding.
export function freqTracksSig(tracks) {
  return (tracks || []).map((t) => `${t.id}:${t.freq}`).join('|')
}
