// Musical key estimation from a pitch-class profile (chromagram).
//
// Uses the Krumhansl-Schmuckler key-finding algorithm: correlate a 12-element
// pitch-class energy vector against empirically-derived major/minor key
// "profiles", once for each of the 12 possible tonics. The tonic+mode whose
// rotated profile best matches (highest Pearson correlation) is the best guess.

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// Krumhansl-Kessler tonal hierarchy profiles (relative weights of each scale
// degree starting from the tonic).
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

// Pearson correlation between two length-12 vectors.
function correlate(a, b) {
  let ma = 0
  let mb = 0
  for (let i = 0; i < 12; i++) {
    ma += a[i]
    mb += b[i]
  }
  ma /= 12
  mb /= 12
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < 12; i++) {
    const xa = a[i] - ma
    const xb = b[i] - mb
    num += xa * xb
    da += xa * xa
    db += xb * xb
  }
  const den = Math.sqrt(da * db)
  return den ? num / den : 0
}

// Estimate the musical key from a 12-element pitch-class energy array (index 0 =
// C). Returns null when there's no tonal energy, otherwise the best match plus a
// `confidence` (margin over the runner-up) and `score` (its raw correlation).
export function estimateKey(chroma) {
  let total = 0
  for (let i = 0; i < 12; i++) total += chroma[i]
  if (!(total > 0)) return null

  let best = null
  let second = null
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const [mode, profile] of [
      ['major', MAJOR_PROFILE],
      ['minor', MINOR_PROFILE],
    ]) {
      // Rotate the profile so its tonic sits at this pitch class, then correlate.
      const rp = new Array(12)
      for (let i = 0; i < 12; i++) rp[(tonic + i) % 12] = profile[i]
      const score = correlate(chroma, rp)
      const cand = { tonic, mode, score }
      if (!best || score > best.score) {
        second = best
        best = cand
      } else if (!second || score > second.score) {
        second = cand
      }
    }
  }

  best.name = PITCH_NAMES[best.tonic] + (best.mode === 'major' ? ' major' : ' minor')
  best.label = PITCH_NAMES[best.tonic] + (best.mode === 'major' ? '' : 'm')
  best.confidence = second ? best.score - second.score : best.score
  best.total = total
  return best
}

// ---- chord detection ----
//
// Each chord type is a set of semitone intervals above its root. `major` marks
// whether the chord has a major third (used to pick the Roman-numeral case).
// `tier` groups them so a setting can widen the vocabulary: 0 = triads,
// 1 = common sevenths, 2 = colour chords.
const CHORD_TYPES = [
  { q: 'maj', ivals: [0, 4, 7], sym: '', major: true, tier: 0 },
  { q: 'min', ivals: [0, 3, 7], sym: 'm', major: false, tier: 0 },
  { q: 'dom7', ivals: [0, 4, 7, 10], sym: '7', major: true, tier: 1 },
  { q: 'maj7', ivals: [0, 4, 7, 11], sym: 'maj7', major: true, tier: 1 },
  { q: 'min7', ivals: [0, 3, 7, 10], sym: 'm7', major: false, tier: 1 },
  { q: 'dim', ivals: [0, 3, 6], sym: 'dim', major: false, tier: 2 },
  { q: 'aug', ivals: [0, 4, 8], sym: 'aug', major: true, tier: 2 },
  { q: 'sus4', ivals: [0, 5, 7], sym: 'sus4', major: true, tier: 2 },
  { q: 'sus2', ivals: [0, 2, 7], sym: 'sus2', major: true, tier: 2 },
  { q: 'm7b5', ivals: [0, 3, 6, 10], sym: 'm7b5', major: false, tier: 2 },
  { q: 'dim7', ivals: [0, 3, 6, 9], sym: 'dim7', major: false, tier: 2 },
]

const CHORD_SETS = {
  triads: CHORD_TYPES.filter((t) => t.tier === 0),
  sevenths: CHORD_TYPES.filter((t) => t.tier <= 1),
  full: CHORD_TYPES,
}

// Estimate the chord sounding in a (short-window) pitch-class energy array.
// Scores each root×type template by cosine similarity to the chroma — which
// rewards energy on the chord tones and naturally normalises for chord size, so
// a 7th only wins when its 7th is actually present. Returns null if there's no
// energy; otherwise the best match plus its runner-up margin (`confidence`).
//
// Note: symmetric chords (dim7, augmented, sus2/sus4) have identical-or-rotated
// templates, so several roots tie and `confidence` collapses toward 0 — the
// caller's margin gate then declines to name them rather than pick an arbitrary
// root. That's intentional: a guessed-wrong root is worse than showing nothing.
export function estimateChord(chroma, level) {
  const set = CHORD_SETS[level] || CHORD_SETS.triads
  let norm = 0
  for (let i = 0; i < 12; i++) norm += chroma[i] * chroma[i]
  norm = Math.sqrt(norm)
  if (!(norm > 0)) return null

  let best = null
  let second = null
  for (let root = 0; root < 12; root++) {
    for (const type of set) {
      let dot = 0
      for (const iv of type.ivals) dot += chroma[(root + iv) % 12]
      const score = dot / (norm * Math.sqrt(type.ivals.length))
      const cand = { root, type, score }
      if (!best || score > best.score) {
        second = best
        best = cand
      } else if (!second || score > second.score) {
        second = cand
      }
    }
  }

  best.name = PITCH_NAMES[best.root] + best.type.sym
  best.confidence = second ? best.score - second.score : best.score
  return best
}

// Roman-numeral function of a chord within a key: the chromatic scale degree of
// the chord root above the tonic, cased by the chord's third (upper = major) and
// suffixed by quality. e.g. tonic C, chord G7 -> "V7"; chord Dm -> "ii".
const ROMAN_DEGREES = ['I', 'bII', 'II', 'bIII', 'III', 'IV', 'bV', 'V', 'bVI', 'VI', 'bVII', 'VII']
const ROMAN_SUFFIX = {
  maj: '',
  min: '',
  dom7: '7',
  maj7: 'maj7',
  min7: '7',
  dim: '°',
  aug: '+',
  sus4: 'sus4',
  sus2: 'sus2',
  m7b5: 'ø7',
  dim7: '°7',
}
export function romanNumeral(tonic, chordRoot, type) {
  const deg = (((chordRoot - tonic) % 12) + 12) % 12
  let r = ROMAN_DEGREES[deg]
  if (!type.major) r = r.toLowerCase()
  return r + (ROMAN_SUFFIX[type.q] || '')
}
