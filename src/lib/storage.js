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
  graphMin: 30, // bottom of the dB scale / green floor
  maxDb: 100, // top of the dB scale / red threshold
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
    return deepMerge(structuredClone(DEFAULT_SETTINGS), JSON.parse(raw))
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
