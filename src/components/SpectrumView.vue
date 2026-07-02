<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { dbToColor } from '../lib/color.js'
import { applyCalibration } from '../lib/calibration.js'
import {
  freqToMidi,
  midiToFreq,
  isBlackKey,
  noteName,
  PIANO_MIN_MIDI,
  PIANO_MAX_MIDI,
} from '../lib/notes.js'
import { estimateKey, estimateChord, romanNumeral } from '../lib/key.js'
import { createPianoVoice } from '../lib/pianoVoice.js'
import HudControls from './HudControls.vue'
import { resizeCanvasToDpr } from '../lib/canvas.js'

const props = defineProps({
  meter: { type: Object, required: true },
  settings: { type: Object, required: true },
  range: { type: Object, default: null }, // { min, max } effective dB scale
  calibration: { type: Object, required: true }, // { slope, offset } applied
  isRunning: { type: Boolean, default: false },
})
const emit = defineEmits(['toggle-mic'])

const canvas = ref(null)
let ctx = null
let raf = null
let ro = null

const F_MIN = 20 // Hz, low edge of the frequency axis
const FLOOR = -140 // dBFS floor for empty bins / "no data"
const NUM_BUCKETS = 15 // sub-buckets used to compute the rolling recent peak
const LABEL_H = 18 // px reserved below the plot for frequency labels

// Keyboard height (landscape only); 0 in portrait so no keyboard is drawn.
function pianoHeightFor(w, h) {
  return w > h ? Math.min(72, Math.max(44, h * 0.16)) : 0
}

// Per-bin buffers (allocated once we know the analyser's bin count).
let buf = null // latest raw dBFS
let smooth = null // bars: fast attack, slow release ("fade out")
let peakAll = null // max since cleared
let buckets = null // Array(NUM_BUCKETS) of per-bin max
let peak15 = null // max across all buckets (the "recent peak")
let peak15Disp = null // recent peak as drawn: tracks peak15 up instantly, slides down
let curBucket = 0
let bucketStart = 0
let prevWinSec = -1 // detects a live change to the recent-peak window
let lastFrameT = 0 // for time-based (frame-rate independent) release
let lastInfo = null // last analyser config, reused to render while paused

// Dominant note readout (reactive so the HUD updates).
const dominant = ref(null) // { name, freq } | null
let domKey = '' // limits dominant.value writes to actual changes

// Harmony readouts (reactive so the HUD updates).
//   musicKey: best-guess key, e.g. "C major" | null
//   chord:    currently-sounding chord, { name, roman } | null
// Two decaying pitch-class profiles (chromagrams) are accumulated from the
// spectrum each frame: a long one drives a deliberately sticky key estimate, a
// short one drives a responsive chord estimate. Confidently-detected chords also
// feed the key profile, so the harmony informs the song's key.
const musicKey = ref(null)
const chord = ref(null)
const chordEnabled = computed(
  () => (props.settings.spectrumChordLevel || 'triads') !== 'off'
)

const keyChroma = new Float32Array(12) // long memory -> sticky key
const chordChroma = new Float32Array(12) // short memory -> "now" chord
const KEY_TAU = 20 // s, how far back the key estimate remembers (sticky)
const CHORD_TAU = 0.3 // s, chord memory — short so it tracks what's playing now
const DYN_RANGE = 24 // dB below the loudest note still counted toward harmony
// Harmony only reads notes from ~E2 up: below that an FFT bin is wider than a
// semitone, so low notes smear across pitch classes. Their pitch class still
// reaches the chromagram via upper partials (which fold to the same class).
const HARMONY_MIN_MIDI = 40
// Harmonic reinforcement: a note's salience is boosted by energy at its octave,
// octave+fifth and two-octaves partials (2nd/3rd/4th harmonics), so real played
// fundamentals stand out over the chromagram and low roots are reinforced by
// their better-resolved upper partials.
const HARMONIC_OFFSETS = [12, 19, 24]
const HARMONIC_WEIGHTS = [0.5, 0.3, 0.2]
// Reused per-frame note buffers (avoid reallocating in the 60fps analysis loop).
// mLo is always HARMONY_MIN_MIDI, so the note count never exceeds this.
const MAX_NOTES = PIANO_MAX_MIDI - HARMONY_MIN_MIDI + 1
const noteP = new Float64Array(MAX_NOTES) // linear power per note
const noteDb = new Float64Array(MAX_NOTES) // -> dB
const sal = new Float64Array(MAX_NOTES) // -> salience (dB above the cutoff)
// Single-note rejection: count independent fundamentals (a chord has >= 3; one
// note has 1, since its other apparent tones are just its own overtones).
const CHORD_MIN_VOICES = 3
const VOICE_MIN_FRAC = 0.2 // a note counts as a voice at this fraction of the loudest
const VOICE_WINDOW = 24 // ...within 2 octaves of the lowest note (a chord's span;
//                         a single note's tell-tale high partials sit above it)
const HARMONIC_CLAIM_OFFSETS = [12, 19, 24, 28, 31, 34, 36] // partials 2..8
const KEY_MIN_TOTAL = 5 // min accumulated energy before any key is shown
const KEY_MIN_SCORE = 0.5 // min correlation before switching keys (filters noise)
const KEY_SWITCH_SEC = 4 // a new key must lead this long before it's adopted
const KEY_SWITCH_MARGIN = 0.02 // ...and lead the runner-up by at least this much
const CHORD_MIN_SCORE = 0.7 // min template match before a chord is shown
const CHORD_MIN_MARGIN = 0.02 // ...and lead over the runner-up chord (kept modest
//                               so real 7th chords aren't dropped; CHORD_MIN_VOICES
//                               is what rejects single notes)
const CHORD_TONE_FLOOR = 0.18 // each chord tone must reach this fraction of the
//                               loudest pitch class (filters weak / partial chords)
const CHORD_THIRD_RATIO = 1.3 // a triad's third must beat the opposite third by
//                               this much — the maj-vs-min decision, robust to a
//                               weak third
const CHORD_SWITCH_SEC = 0.3 // a different chord must hold this long to replace one
const CHORD_RELEASE_SEC = 0.4 // ...and a shown chord lingers this long once it drops
const CHORD_KEY_ROOT = 8 // per-second weight a detected chord's root adds to key
const CHORD_KEY_TONE = 4 // ...and its other tones add to the key profile

let lastDt = 0.016 // frame delta from updatePeaks, reused for decay
// Hysteresis state. Switch delays are measured by accumulating lastDt (which is
// clamped per frame), not wall-clock timestamps, so a stalled/backgrounded tab
// can't bank elapsed time and bypass the delay on the next frame.
let displayedKey = null // { tonic, mode, label, name } currently shown
let keyCand = '' // label of a challenger key awaiting the switch delay
let keyCandAge = 0 // s the challenger has led
let displayedChord = null // chord object ({ root, type, name, ... }) currently shown
let chordCand = '' // name of a challenger chord awaiting the switch delay
let chordCandAge = 0 // s the challenger has held
let chordMissAge = 0 // s the shown chord has gone undetected (release hold)
let voiceCount = 0 // independent fundamentals in the latest frame

// Tap / slide to play the keyboard (through the shared output voice — the
// mic capture context is never connected to the speakers).
const voice = createPianoVoice()
let pianoKeys = [] // hit-test rects, rebuilt each frame by drawPiano
let pressedMidi = null // the key currently held / slid to (highlighted)
let sliding = false // a press is in progress (track pointer moves)

// Distance of the bottom legend pills from the bottom edge: lifted above the
// keyboard + frequency labels in landscape so the pills stay over the graph.
const footBottom = ref(6)

function resize() {
  const c = canvas.value
  if (!c) return
  resizeCanvasToDpr(c, ctx)
  const ph = pianoHeightFor(c.clientWidth, c.clientHeight)
  footBottom.value = ph > 0 ? ph + LABEL_H + 6 : 6
}

function allocate(n) {
  buf = new Float32Array(n)
  smooth = new Float32Array(n).fill(FLOOR)
  resetPeaks(n)
}

function resetPeaks(n) {
  peakAll = new Float32Array(n).fill(FLOOR)
  peak15 = new Float32Array(n).fill(FLOOR)
  peak15Disp = new Float32Array(n).fill(FLOOR)
  buckets = Array.from({ length: NUM_BUCKETS }, () =>
    new Float32Array(n).fill(FLOOR)
  )
  curBucket = 0
  bucketStart = performance.now()
}

function clearPeaks() {
  if (buf) resetPeaks(buf.length)
}

// Reset only the recent-peak window (buckets) + timing; peakAll is left intact.
function resetRecentWindow() {
  if (!buckets) return
  for (const bk of buckets) bk.fill(FLOOR)
  peak15.fill(FLOOR)
  peak15Disp.fill(FLOOR)
  curBucket = 0
  bucketStart = performance.now()
}

function updatePeaks() {
  const now = performance.now()
  const dt = lastFrameT ? Math.min(0.25, (now - lastFrameT) / 1000) : 0.016
  lastFrameT = now
  lastDt = dt

  const winSec = Math.max(1, props.settings.spectrumPeakSec || 15)
  if (winSec !== prevWinSec) {
    // Re-derive the bucket ring so its age accounting matches the new window.
    prevWinSec = winSec
    resetRecentWindow()
  }
  const bucketMs = (winSec * 1000) / NUM_BUCKETS

  // Bars rise instantly but fall with a configurable time constant ("fade out"),
  // which also lets the highlighted note linger as it decays.
  const decaySec = Math.max(0.05, props.settings.spectrumDecaySec || 2)
  const release = 1 - Math.exp(-dt / decaySec)

  // Roll the bucket ring forward; clearing each newly-current bucket drops data
  // older than the window. The guard caps catch-up after a long stall.
  let rotated = false
  let guard = 0
  while (now - bucketStart >= bucketMs && guard < NUM_BUCKETS) {
    curBucket = (curBucket + 1) % NUM_BUCKETS
    buckets[curBucket].fill(FLOOR)
    bucketStart += bucketMs
    rotated = true
    guard++
  }
  if (guard >= NUM_BUCKETS) bucketStart = now

  const n = buf.length
  const cur = buckets[curBucket]
  for (let i = 0; i < n; i++) {
    let v = buf[i]
    if (!(v > FLOOR)) v = FLOOR // handles -Infinity / NaN / below floor
    buf[i] = v
    smooth[i] = v >= smooth[i] ? v : smooth[i] + release * (v - smooth[i])
    if (v > peakAll[i]) peakAll[i] = v
    if (v > cur[i]) cur[i] = v
    // peak15 = max across buckets. Only a bucket *clear* (on rotation) can lower
    // it, so recompute fully only then; otherwise raise it incrementally.
    if (rotated) {
      let mx = buckets[0][i]
      for (let k = 1; k < NUM_BUCKETS; k++) if (buckets[k][i] > mx) mx = buckets[k][i]
      peak15[i] = mx
    } else if (cur[i] > peak15[i]) {
      peak15[i] = cur[i]
    }
    // Displayed recent peak: jump up with a fresh peak, but ease down (don't
    // snap) when the window expires and peak15 drops, so the white line slides.
    peak15Disp[i] =
      peak15[i] >= peak15Disp[i]
        ? peak15[i]
        : peak15Disp[i] + release * (peak15[i] - peak15Disp[i])
  }
}

// Fold this frame's spectrum into both pitch-class profiles, then re-estimate the
// chord and key. Each FFT bin is binned to its nearest note; notes within
// DYN_RANGE of the loudest contribute salience (dB above the cutoff), reinforced
// by their harmonic partials, to their pitch class — so real fundamentals drive
// the estimate while broadband noise and stray overtones are suppressed.
function analyzeHarmony(sr, fft) {
  if (!buf) return
  const dKey = Math.exp(-lastDt / KEY_TAU)
  const dChord = Math.exp(-lastDt / CHORD_TAU)
  for (let i = 0; i < 12; i++) {
    keyChroma[i] *= dKey
    chordChroma[i] *= dChord
  }

  const fMax = Math.min(20000, sr / 2)
  const mLo = Math.max(HARMONY_MIN_MIDI, Math.ceil(freqToMidi(F_MIN)))
  const mHi = Math.min(PIANO_MAX_MIDI, Math.floor(freqToMidi(fMax)))
  if (mHi < mLo) return // degenerate (sub-audio) sample rate: nothing to analyse
  const nBins = buf.length
  const nNotes = mHi - mLo + 1

  // Per-note level from the *instantaneous* spectrum (buf), not the bar buffer
  // (smooth) — smooth's slow release would blend the previous chord into this one.
  // Assign each FFT bin to its single nearest note rather than summing an
  // outward-rounded band per note: in the low register a semitone is barely one
  // bin wide, so overlapping bands would smear a note into its chromatic neighbour.
  for (let k = 0; k < nNotes; k++) noteP[k] = 0
  const loBin = Math.max(1, Math.floor((midiToFreq(mLo - 0.5) * fft) / sr))
  const hiBin = Math.min(nBins - 1, Math.ceil((midiToFreq(mHi + 0.5) * fft) / sr))
  for (let i = loBin; i <= hiBin; i++) {
    const m = Math.round(freqToMidi((i * sr) / fft))
    if (m >= mLo && m <= mHi) noteP[m - mLo] += Math.pow(10, buf[i] / 10)
  }
  let maxDb = FLOOR
  for (let k = 0; k < nNotes; k++) {
    const db = 10 * Math.log10(noteP[k] + 1e-20)
    noteDb[k] = db
    if (db > maxDb) maxDb = db
  }
  voiceCount = 0
  if (maxDb > FLOOR + 8) {
    // Salience of each note = dB above the cutoff (prominent notes only).
    const cut = maxDb - DYN_RANGE
    for (let k = 0; k < nNotes; k++) {
      const s = noteDb[k] - cut
      sal[k] = s > 0 ? s : 0
    }
    voiceCount = countVoices(nNotes)
    // Fold to pitch classes, reinforcing each present fundamental with the
    // salience at its harmonic partials so real notes outweigh stray overtones.
    // (Notes in the top octave get less reinforcement — their partials fall above
    // mHi — so detection there quietly reverts to the unreinforced behaviour.)
    for (let idx = 0; idx < nNotes; idx++) {
      if (sal[idx] <= 0) continue
      let contribution = sal[idx]
      for (let h = 0; h < HARMONIC_OFFSETS.length; h++) {
        const j = idx + HARMONIC_OFFSETS[h]
        if (j < nNotes) contribution += HARMONIC_WEIGHTS[h] * sal[j]
      }
      const amount = contribution * lastDt
      const pc = (((mLo + idx) % 12) + 12) % 12
      keyChroma[pc] += amount
      chordChroma[pc] += amount
    }
  }

  updateChord() // also boosts keyChroma with the detected chord's tones
  updateKey()
  renderChord() // after both, so the Roman numeral reflects the latest key
}

// Count independent fundamentals within ~2 octaves of the lowest prominent note,
// reading the per-note salience (sal[0..n-1]). Process loudest-first; a note is a
// new fundamental unless it sits at a harmonic offset (±1 semitone) of an already-
// counted louder note. A chord's third/fifth are not harmonic offsets of the root,
// so a triad -> 3; a single note (even a bright one) -> 1, since all of its energy
// is its own overtones. The window excludes a single note's high partials (5th and
// up, which sit more than 2 octaves above it) while spanning a normal chord voicing.
function countVoices(n) {
  let maxSal = 0
  for (let i = 0; i < n; i++) if (sal[i] > maxSal) maxSal = sal[i]
  if (maxSal <= 0) return 0
  const thresh = VOICE_MIN_FRAC * maxSal
  let low = -1
  for (let i = 0; i < n; i++) {
    if (sal[i] >= thresh) {
      low = i
      break
    }
  }
  if (low < 0) return 0
  const hi = Math.min(n - 1, low + VOICE_WINDOW)
  const order = []
  for (let i = low; i <= hi; i++) if (sal[i] >= thresh) order.push(i)
  order.sort((a, b) => sal[b] - sal[a])
  const claimed = new Set()
  let count = 0
  for (const idx of order) {
    if (claimed.has(idx)) continue
    count++
    for (const off of HARMONIC_CLAIM_OFFSETS) {
      claimed.add(idx + off - 1)
      claimed.add(idx + off)
      claimed.add(idx + off + 1)
    }
  }
  return count
}

// Decide the currently-sounding chord from the short-window profile and, when one
// is confidently held, reinforce its tones in the long key profile so the
// harmony informs the song's key.
function updateChord() {
  const level = props.settings.spectrumChordLevel || 'triads'
  if (level === 'off') {
    displayedChord = null
    chordCand = ''
    chordCandAge = 0
    chordMissAge = 0
    return
  }

  let maxPC = 0
  for (let i = 0; i < 12; i++) if (chordChroma[i] > maxPC) maxPC = chordChroma[i]
  const c = estimateChord(chordChroma, level)
  let ok = false
  // voiceCount (this frame) must show a real chord, not a single note's overtones.
  if (c && voiceCount >= CHORD_MIN_VOICES && c.score >= CHORD_MIN_SCORE && c.confidence >= CHORD_MIN_MARGIN) {
    // Every chord tone must be meaningfully present (filters noise/partial chords).
    let minTone = Infinity
    for (const iv of c.type.ivals) {
      const v = chordChroma[(c.root + iv) % 12] / maxPC
      if (v < minTone) minTone = v
    }
    ok = minTone >= CHORD_TONE_FLOOR
    // For chords with a major/minor third, that third must clearly beat the
    // opposite third — the maj-vs-min call, robust to a weak third.
    if (ok) {
      const third = c.type.ivals.includes(4) ? 4 : c.type.ivals.includes(3) ? 3 : -1
      if (third >= 0) {
        const other = third === 4 ? 3 : 4
        const chosen = chordChroma[(c.root + third) % 12]
        const opposite = chordChroma[(c.root + other) % 12]
        if (chosen < CHORD_THIRD_RATIO * opposite) ok = false
      }
    }
  }

  if (ok) {
    chordMissAge = 0
    if (displayedChord && c.name === displayedChord.name) {
      displayedChord = c // keep the latest object (same root/type)
      chordCand = ''
      chordCandAge = 0
    } else {
      // A different (or first) chord: adopt at once if none is shown, else only
      // after it has held for CHORD_SWITCH_SEC.
      if (chordCand !== c.name) {
        chordCand = c.name
        chordCandAge = 0
      } else {
        chordCandAge += lastDt
      }
      if (!displayedChord || chordCandAge >= CHORD_SWITCH_SEC) {
        displayedChord = c
        chordCand = ''
        chordCandAge = 0
      }
    }
  } else {
    // No valid chord this frame: keep showing the last one briefly so a momentary
    // detection dip doesn't blink the readout off.
    chordCand = ''
    chordCandAge = 0
    if (displayedChord) {
      chordMissAge += lastDt
      if (chordMissAge >= CHORD_RELEASE_SEC) {
        displayedChord = null
        chordMissAge = 0
      }
    }
  }

  if (displayedChord) {
    keyChroma[displayedChord.root] += CHORD_KEY_ROOT * lastDt
    for (const iv of displayedChord.type.ivals) {
      keyChroma[(displayedChord.root + iv) % 12] += CHORD_KEY_TONE * lastDt
    }
  }
}

function renderChord() {
  if (!displayedChord) {
    if (chord.value !== null) chord.value = null
    return
  }
  const name = displayedChord.name
  const roman = displayedKey
    ? romanNumeral(displayedKey.tonic, displayedChord.root, displayedChord.type)
    : ''
  if (!chord.value || chord.value.name !== name || chord.value.roman !== roman) {
    chord.value = { name, roman }
  }
}

// Re-estimate the key from the long profile, but switch only when a different key
// has clearly led for a sustained spell (hysteresis) — this is what makes the
// readout sticky. An ambiguous moment leaves the current key untouched.
function updateKey() {
  const k = estimateKey(keyChroma)
  if (!k || k.total < KEY_MIN_TOTAL) {
    displayedKey = null
    keyCand = ''
    keyCandAge = 0
    setKey(null)
    return
  }
  if (k.score < KEY_MIN_SCORE) return // too ambiguous to change anything — hold

  if (!displayedKey) {
    commitKey(k)
    return
  }
  if (k.label === displayedKey.label) {
    keyCand = '' // current key reaffirmed
    keyCandAge = 0
    return
  }
  if (keyCand !== k.label) {
    keyCand = k.label
    keyCandAge = 0
  } else {
    keyCandAge += lastDt
  }
  if (keyCandAge >= KEY_SWITCH_SEC && k.confidence >= KEY_SWITCH_MARGIN) {
    commitKey(k)
  }
}

function commitKey(k) {
  displayedKey = { tonic: k.tonic, mode: k.mode, label: k.label, name: k.name }
  keyCand = ''
  keyCandAge = 0
  setKey(k.name)
}

function setKey(name) {
  if (musicKey.value !== name) musicKey.value = name
}

function draw() {
  const c = canvas.value
  if (!c || !ctx) return
  const w = c.clientWidth
  const h = c.clientHeight

  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#0c0f1a'
  ctx.fillRect(0, 0, w, h)

  const info = props.meter.spectrumInfo ? props.meter.spectrumInfo() : null
  if (info) {
    lastInfo = info
    if (!buf || buf.length !== info.binCount) allocate(info.binCount)
    if (props.isRunning) {
      props.meter.readSpectrum(buf)
      updatePeaks()
    }
  }
  // While paused the analyser is gone; keep the last config so the frozen
  // spectrum stays correctly mapped (the device rate may not be 48 kHz).
  const rinfo = info || lastInfo

  const landscape = w > h
  const cal = props.calibration
  const gMin = props.range ? props.range.min : props.settings.graphMin
  const gMax = props.range ? props.range.max : props.settings.maxDb
  const dRange = gMax - gMin || 1

  // Layout: reserve space for the dB axis (left), frequency labels (bottom) and,
  // in landscape, a piano keyboard below them.
  const padL = 46
  const padR = 12
  const padT = 12
  const labelH = LABEL_H
  const pianoH = pianoHeightFor(w, h)
  const plot = {
    left: padL,
    right: w - padR,
    top: padT,
    bottom: h - labelH - pianoH,
  }
  plot.w = plot.right - plot.left
  plot.h = plot.bottom - plot.top
  if (plot.w <= 0 || plot.h <= 0) return

  const yOf = (db) =>
    plot.bottom - ((Math.max(gMin, Math.min(gMax, db)) - gMin) / dRange) * plot.h

  // Frequency mapping (log x).
  const sr = rinfo ? rinfo.sampleRate : 48000
  const fft = rinfo ? rinfo.fftSize : 8192
  const fMax = Math.min(20000, sr / 2)
  const logMin = Math.log10(F_MIN)
  const logMax = Math.log10(fMax)
  const logSpan = logMax - logMin || 1
  const xOf = (f) => plot.left + ((Math.log10(f) - logMin) / logSpan) * plot.w
  const freqOfX = (x) =>
    Math.pow(10, logMin + ((x - plot.left) / plot.w) * logSpan)
  const binOfFreq = (f) => (f * fft) / sr

  // ---- horizontal dB grid (labels on the left) ----
  ctx.font = '11px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  const step = dRange <= 40 ? 5 : 10
  const first = Math.ceil(gMin / step) * step
  for (let db = first; db <= gMax; db += step) {
    const y = yOf(db)
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(plot.left, y)
    ctx.lineTo(plot.right, y)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.textAlign = 'right'
    ctx.fillText(db + '', plot.left - 6, y)
  }
  ctx.save()
  ctx.translate(12, (plot.top + plot.bottom) / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillText('dB', 0, 0)
  ctx.restore()

  // ---- vertical frequency grid + labels (more labels in landscape) ----
  const FREQS = landscape
    ? [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
    : [125, 500, 1000, 4000, 16000]
  ctx.textBaseline = 'top'
  ctx.textAlign = 'center'
  for (const f of FREQS) {
    if (f < F_MIN || f > fMax) continue
    const x = xOf(f)
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.beginPath()
    ctx.moveTo(x, plot.top)
    ctx.lineTo(x, plot.bottom)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.fillText(f >= 1000 ? f / 1000 + 'k' : '' + f, x, plot.bottom + 3)
  }

  // ---- bars + peak lines ----
  let domBin = -1
  let domVal = FLOOR
  if (buf) {
    // Bar width is a fraction of one piano-note (semitone) width: every semitone
    // is an equal step on the log axis, so N bars per note = semitoneW / N.
    const barsPerNote = Math.max(
      1,
      Math.min(4, Math.round(props.settings.spectrumBarsPerNote || 1))
    )
    const semitoneSpan = freqToMidi(fMax) - freqToMidi(F_MIN)
    const barW = Math.max(1, plot.w / semitoneSpan / barsPerNote)
    const allPts = [] // peak-since-cleared envelope
    const recentPts = [] // recent-window peak envelope
    const bMaxBin = Math.min(buf.length - 1, Math.ceil(binOfFreq(fMax)))
    for (let x = plot.left; x < plot.right; x += barW) {
      const f0 = freqOfX(x)
      const f1 = freqOfX(x + barW)
      let b0 = Math.max(1, Math.floor(binOfFreq(f0)))
      let b1 = Math.min(bMaxBin, Math.ceil(binOfFreq(f1)))
      if (b1 < b0) b1 = b0
      // Sum power across the bins in this bar (then -> dB + calibrate) so each
      // bar's level sits on the same scale as the broadband meter, which sums
      // power across all bins. A single bin would read ~10*log10(binCount) too
      // low against that scale and the bars would flatten against the floor.
      let pCur = 0
      let pAll = 0
      let pRec = 0
      for (let i = b0; i <= b1; i++) {
        pCur += Math.pow(10, smooth[i] / 10)
        pAll += Math.pow(10, peakAll[i] / 10)
        pRec += Math.pow(10, peak15Disp[i] / 10)
        if (smooth[i] > domVal) {
          domVal = smooth[i]
          domBin = i
        }
      }
      const curDb = applyCalibration(10 * Math.log10(pCur + 1e-20), cal)
      const y = yOf(curDb)
      ctx.fillStyle = dbToColor(curDb, gMin, gMax)
      ctx.fillRect(x, y, Math.max(1, barW - 0.5), plot.bottom - y)
      allPts.push([x, yOf(applyCalibration(10 * Math.log10(pAll + 1e-20), cal))])
      recentPts.push([x, yOf(applyCalibration(10 * Math.log10(pRec + 1e-20), cal))])
    }

    // Recent-window peak (thin, bright) then all-time peak (red, on top).
    drawEnvelope(recentPts, 'rgba(255,255,255,0.85)', 1.25)
    drawEnvelope(allPts, '#ff6b81', 1.5)
  }

  // ---- piano keyboard (landscape only) ----
  let domMidi = null
  if (domBin > 0 && domVal > FLOOR + 8) {
    const f = (domBin * sr) / fft
    domMidi = Math.round(freqToMidi(f))
    const name = noteName(domMidi)
    const freq = Math.round(f)
    const key = name + '|' + freq
    if (key !== domKey) {
      domKey = key
      dominant.value = { name, freq } // only write the ref when it changes
    }
  } else if (domKey !== '') {
    domKey = ''
    dominant.value = null
  }
  // Update the key + chord guesses (running only; frozen while paused).
  if (props.isRunning && buf) analyzeHarmony(sr, fft)

  pianoKeys = [] // recomputed below in landscape; empty => taps are ignored
  if (landscape && pianoH > 0) {
    drawPiano(plot.bottom + labelH, h, xOf, fMax, domMidi)
  }

  // ---- frame ----
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 1
  ctx.strokeRect(plot.left, plot.top, plot.w, plot.h)
}

// Draw the peak envelope as a smooth curve rather than straight segments. Each
// span is a quadratic that passes through the midpoint of consecutive points
// using the point itself as the control handle, so corners are rounded off and
// the line reads as a continuous curve instead of a jagged polyline.
function drawEnvelope(pts, color, width) {
  if (pts.length < 2) return
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  if (pts.length === 2) {
    ctx.lineTo(pts[1][0], pts[1][1])
  } else {
    let i
    for (i = 1; i < pts.length - 2; i++) {
      const xc = (pts[i][0] + pts[i + 1][0]) / 2
      const yc = (pts[i][1] + pts[i + 1][1]) / 2
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], xc, yc)
    }
    // Final span: curve through the last two points (control = second-to-last).
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])
  }
  ctx.stroke()
}

function drawPiano(top, bottom, xOf, fMax, domMidi) {
  const mLo = Math.max(PIANO_MIN_MIDI, Math.ceil(freqToMidi(F_MIN)))
  const mHi = Math.min(PIANO_MAX_MIDI, Math.floor(freqToMidi(fMax)))
  if (mHi <= mLo) return

  // Axis bounds; the keyboard never extends past the last note (so the
  // high-frequency region above the piano range simply has no keys).
  const xL = xOf(F_MIN)
  const xR = xOf(fMax)
  const clamp = (x) => Math.max(xL, Math.min(xR, x))
  const centre = (m) => xOf(midiToFreq(m))

  const whites = []
  for (let m = mLo; m <= mHi; m++) if (!isBlackKey(m)) whites.push(m)
  if (!whites.length) return

  // White keys: each centred on its note frequency, with edges at the midpoints
  // to the neighbouring white keys (contiguous + frequency-accurate). End keys
  // mirror their inner edge so the keyboard stops cleanly at the last note.
  for (let j = 0; j < whites.length; j++) {
    const cx = centre(whites[j])
    let left = j > 0 ? (centre(whites[j - 1]) + cx) / 2 : null
    let right = j < whites.length - 1 ? (centre(whites[j + 1]) + cx) / 2 : null
    if (left === null) left = right !== null ? cx - (right - cx) : cx - 6
    if (right === null) right = cx + (cx - left)
    left = clamp(left)
    right = clamp(right)
    const m = whites[j]
    pianoKeys.push({ midi: m, left, right, top, bottom, black: false })
    ctx.fillStyle =
      m === pressedMidi ? '#2bb673' : m === domMidi ? '#3b6cff' : '#e9edf6'
    ctx.fillRect(left, top, Math.max(1, right - left - 1), bottom - top)
  }

  // Black keys: narrower, shorter, centred on their frequency, drawn on top.
  const blackH = (bottom - top) * 0.62
  for (let m = mLo; m <= mHi; m++) {
    if (!isBlackKey(m)) continue
    const cx = centre(m)
    const semi = Math.abs(centre(m + 1) - cx)
    const bw = Math.max(2, semi * 0.9)
    const left = cx - bw / 2
    pianoKeys.push({ midi: m, left, right: left + bw, top, bottom: top + blackH, black: true })
    ctx.fillStyle =
      m === pressedMidi ? '#2bb673' : m === domMidi ? '#6f93ff' : '#11151f'
    ctx.fillRect(left, top, bw, blackH)
  }
}

// Which key (if any) is under the pointer; black keys win since they're on top.
function keyAt(e) {
  if (!pianoKeys.length || !canvas.value) return null
  const r = canvas.value.getBoundingClientRect()
  const px = e.clientX - r.left
  const py = e.clientY - r.top
  const inside = (k) =>
    px >= k.left && px <= k.right && py >= k.top && py <= k.bottom
  return (
    pianoKeys.find((k) => k.black && inside(k)) ||
    pianoKeys.find((k) => !k.black && inside(k)) ||
    null
  )
}

function onPointerDown(e) {
  const hit = keyAt(e)
  if (!hit) return
  sliding = true
  pressedMidi = hit.midi
  voice.change(hit.midi)
  // Capture so a slide keeps tracking even if it strays off the keys.
  try {
    canvas.value.setPointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
}

function onPointerMove(e) {
  if (!sliding) return
  const hit = keyAt(e)
  if (hit && hit.midi !== pressedMidi) {
    pressedMidi = hit.midi
    voice.change(hit.midi)
  }
}

function onPointerUp(e) {
  if (!sliding) return
  sliding = false
  pressedMidi = null
  voice.release()
  try {
    canvas.value.releasePointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
}

function loop() {
  draw()
  raf = requestAnimationFrame(loop)
}

// On a fresh mic start (resume from pause) restart the recent window + the
// fade-out smoothing so they don't replay stale pre-pause data. The
// peak-since-cleared envelope deliberately persists until Clear.
watch(
  () => props.isRunning,
  (running, was) => {
    if (running && !was && buf) {
      smooth.fill(FLOOR)
      lastFrameT = 0
      resetRecentWindow()
      keyChroma.fill(0)
      chordChroma.fill(0)
      displayedKey = null
      displayedChord = null
      keyCand = ''
      keyCandAge = 0
      chordCand = ''
      chordCandAge = 0
      chordMissAge = 0
      musicKey.value = null
      chord.value = null
    }
  }
)

onMounted(() => {
  ctx = canvas.value.getContext('2d')
  resize()
  ro = new ResizeObserver(resize)
  ro.observe(canvas.value)
  loop()
})

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  if (ro) ro.disconnect()
  voice.release() // the shared output context stays open for other views
})
</script>

<template>
  <div class="spectrum">
    <div class="graph-host">
      <canvas
        ref="canvas"
        role="img"
        aria-label="Live frequency spectrum analyser"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      ></canvas>

      <!-- Dominant-note + key readout (top-left over the graph) -->
      <div class="hud-readout">
        <div class="note-row">
          <template v-if="dominant">
            <span class="note">{{ dominant.name }}</span>
            <span class="hz">{{ dominant.freq }} Hz</span>
          </template>
          <span v-else class="note dim">—</span>
        </div>
        <div class="key-row">
          <span class="key-tag">Key</span>
          <span v-if="musicKey" class="key-name">{{ musicKey }}</span>
          <span v-else class="key-name dim">—</span>
        </div>
        <div v-if="chordEnabled" class="key-row">
          <span class="key-tag">Chord</span>
          <template v-if="chord">
            <span class="key-name">{{ chord.name }}</span>
            <span v-if="chord.roman" class="chord-roman">{{ chord.roman }}</span>
          </template>
          <span v-else class="key-name dim">—</span>
        </div>
      </div>

      <!-- Actions (top-right) -->
      <div class="hud-actions">
        <HudControls :is-running="isRunning" @toggle-mic="emit('toggle-mic')" />
        <button class="clear" title="Reset peak hold" @click="clearPeaks">Clear</button>
      </div>

      <!-- Legend / status (bottom-left; lifted above the keyboard in landscape) -->
      <div class="hud-foot" :style="{ bottom: footBottom + 'px' }">
        <span v-if="!isRunning" class="paused">● mic paused</span>
        <span class="chip all">peak</span>
        <span class="chip recent">recent</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.spectrum {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: calc(var(--safe-t) + 6px) 8px 6px;
}
.graph-host {
  position: relative;
  flex: 1;
  min-height: 0;
}
canvas {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: 10px;
  /* keep keyboard slides from scrolling/zooming the page on touch */
  touch-action: none;
}

.hud-readout {
  position: absolute;
  top: 16px;
  left: 56px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  pointer-events: none;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.7);
}
.note-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.note {
  font-size: 34px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.note.dim {
  opacity: 0.4;
}
.hz {
  font-size: 14px;
  opacity: 0.7;
}
.key-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.key-tag {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.5;
}
.key-name {
  font-size: 17px;
  font-weight: 600;
  line-height: 1;
}
.key-name.dim {
  opacity: 0.4;
}
.chord-roman {
  font-size: 13px;
  font-weight: 600;
  opacity: 0.75;
}
.chord-roman::before {
  content: '·';
  margin: 0 5px 0 1px;
  opacity: 0.6;
}

.hud-actions {
  position: absolute;
  top: 18px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 7px;
}
.clear {
  border: none;
  background: rgba(224, 80, 107, 0.92);
  color: #fff;
  border-radius: 8px;
  padding: 5px 11px;
  font-size: 12px;
  font-weight: 600;
  min-height: 28px;
}
.hud-foot {
  position: absolute;
  left: 54px;
  bottom: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  pointer-events: none;
}
.chip {
  font-size: 11px;
  border: 1px solid;
  border-radius: 999px;
  padding: 2px 8px;
  background: rgba(12, 15, 26, 0.6);
}
.chip.all {
  border-color: #ff6b81;
  color: #ff6b81;
}
.chip.recent {
  border-color: rgba(255, 255, 255, 0.85);
  color: rgba(255, 255, 255, 0.85);
}
.paused {
  font-size: 11px;
  color: #ffb3c0;
  background: rgba(12, 15, 26, 0.6);
  border-radius: 999px;
  padding: 2px 8px;
}
</style>
