// All persistence goes through localStorage. Settings + saved sessions.

const SETTINGS_KEY = 'dbmeter.settings.v1'
const SESSIONS_KEY = 'dbmeter.sessions.v1'

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
