// All persistence goes through localStorage. Settings + saved sessions.

import { FREQ_COLORS } from './color.js'

const SETTINGS_KEY = 'dbmeter.settings.v1'
const SESSIONS_KEY = 'dbmeter.sessions.v1'

// Default tracked frequencies: five ISO octave-band centres spaced two octaves
// apart, spanning the spectrum the way an audio engineer would monitor it —
// sub-bass/power, low-mid body, the 1 kHz reference, presence, and air.
const DEFAULT_FREQ_TRACKS = [
  { id: 'def-63', freq: 63, color: FREQ_COLORS[0], enabled: true }, // power / hum
  { id: 'def-250', freq: 250, color: FREQ_COLORS[1], enabled: true }, // low-mid body
  { id: 'def-1k', freq: 1000, color: FREQ_COLORS[2], enabled: true }, // midrange ref
  { id: 'def-4k', freq: 4000, color: FREQ_COLORS[3], enabled: true }, // presence
  { id: 'def-16k', freq: 16000, color: FREQ_COLORS[4], enabled: true }, // air
]

export const DEFAULT_SETTINGS = {
  weighting: 'A', // 'A' | 'B' | 'Z'
  response: 'fast', // 'fast' (125ms) | 'slow' (1s)
  intervalSec: 1, // sampling interval for the graph
  aggregation: 'avg', // 'avg' (Leq) | 'max' over the interval
  mode: 'log', // 'log' (compressed timeline) | 'linear' (last 2 min)
  maxTotalMin: 30, // full timeline length in log mode
  autoMode: true, // true = uncalibrated + auto-scaling graph range (relative)
  graphMin: 30, // bottom of the dB scale / green floor (used when calibrated)
  maxDb: 100, // top of the dB scale / red threshold (used when calibrated)
  freqOverlayOn: false, // master on/off for the tracked-frequency line overlay
  freqOnly: false, // when overlaying, hide the broadband bars (show only lines)
  spectrumPeakSec: 15, // spectrum tab: rolling "recent peak" window, seconds
  spectrumDecaySec: 2, // spectrum tab: bar/note fade-out (release) time, seconds
  spectrumBarsPerNote: 1, // spectrum tab: bar resolution, 1–4 bars per semitone
  spectrumChordLevel: 'triads', // spectrum tab: chord vocabulary 'off'|'triads'|'sevenths'|'full'
  // Tone tab's generator (see lib/generator.js for the type/waveform lists).
  tone: {
    type: 'wave', // 'wave' | a noise colour ('white'|'pink'|'brown'|...)
    waveform: 'sine', // oscillator shape, applies when type === 'wave'
    freq: 440, // Hz, applies when type === 'wave'
    volume: 0.5, // 0..1
  },
  // Up to MAX_FREQ_TRACKS entries: { id, freq (Hz), color, enabled }.
  // Always recorded by the meter; only drawn when freqOverlayOn and enabled.
  freqTracks: structuredClone(DEFAULT_FREQ_TRACKS),
  calibration: {
    points: [
      { raw: null, known: null }, // quiet reference
      { raw: null, known: null }, // loud reference
    ],
  },
}

function deepMerge(base, override) {
  const out = Array.isArray(base) ? [...base] : { ...base }
  for (const k of Object.keys(override || {})) {
    const ov = override[k]
    if (ov && typeof ov === 'object' && !Array.isArray(ov) && typeof out[k] === 'object') {
      out[k] = deepMerge(out[k], ov)
    } else if (ov !== undefined) {
      out[k] = ov
    }
  }
  return out
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return structuredClone(DEFAULT_SETTINGS)
    const parsed = JSON.parse(raw)
    const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), parsed)
    // Upgrade: if a returning user had calibration but no stored autoMode flag,
    // keep them in calibrated mode rather than silently flipping to Auto.
    if (parsed.autoMode === undefined) {
      const pts = (merged.calibration?.points || []).filter(
        (p) => p && Number.isFinite(p.raw) && Number.isFinite(p.known)
      )
      merged.autoMode = pts.length < 1
    }
    return merged
  } catch {
    return structuredClone(DEFAULT_SETTINGS)
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* quota or disabled storage - ignore */
  }
}

export function loadSessions() {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function saveSessions(sessions) {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
  } catch {
    /* ignore */
  }
}

export function uid() {
  return 's' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36)
}
