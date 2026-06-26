<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
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
let curBucket = 0
let bucketStart = 0
let prevWinSec = -1 // detects a live change to the recent-peak window
let lastFrameT = 0 // for time-based (frame-rate independent) release
let lastInfo = null // last analyser config, reused to render while paused

// Dominant note readout (reactive so the HUD updates).
const dominant = ref(null) // { name, freq } | null
let domKey = '' // limits dominant.value writes to actual changes

// Tap / slide to play the keyboard.
let playCtx = null // dedicated output context (created on first press)
let pianoKeys = [] // hit-test rects, rebuilt each frame by drawPiano
let pressedMidi = null // the key currently held / slid to (highlighted)
let voice = null // the single sounding voice, or null
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
  curBucket = 0
  bucketStart = performance.now()
}

function updatePeaks() {
  const now = performance.now()
  const dt = lastFrameT ? Math.min(0.25, (now - lastFrameT) / 1000) : 0.016
  lastFrameT = now

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
  }
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
        pRec += Math.pow(10, peak15[i] / 10)
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
  pianoKeys = [] // recomputed below in landscape; empty => taps are ignored
  if (landscape && pianoH > 0) {
    drawPiano(plot.bottom + labelH, h, xOf, fMax, domMidi)
  }

  // ---- frame ----
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 1
  ctx.strokeRect(plot.left, plot.top, plot.w, plot.h)
}

function drawEnvelope(pts, color, width) {
  if (pts.length < 2) return
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
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

// The keyboard plays through a dedicated output context (the mic context is
// never connected to the speakers), created lazily on the first press — the
// user gesture browsers require to start audio output.
function ensurePlayCtx() {
  if (!playCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    playCtx = new Ctx()
  }
  if (playCtx.state === 'suspended') playCtx.resume().catch(() => {})
  return playCtx
}

// Shape a freshly "struck" key on the current voice: a percussive (hammer)
// attack, a quick initial decay then a long ringing tail, plus a brightness
// sweep that mellows — roughly a piano's amplitude + timbre envelope.
function strike(midi, t) {
  const f = midiToFreq(midi)
  voice.osc1.frequency.setValueAtTime(f, t)
  voice.osc2.frequency.setValueAtTime(f * 2, t)
  const g = voice.env.gain
  g.cancelScheduledValues(t)
  g.setValueAtTime(0.0001, t)
  g.exponentialRampToValueAtTime(0.3, t + 0.005)
  g.exponentialRampToValueAtTime(0.08, t + 0.35)
  g.exponentialRampToValueAtTime(0.0002, t + 3)
  const lp = voice.filter.frequency
  lp.cancelScheduledValues(t)
  lp.setValueAtTime(Math.min(9000, f * 9), t)
  lp.exponentialRampToValueAtTime(Math.max(700, f * 2.5), t + 0.5)
}

function startVoice(midi) {
  const ac = ensurePlayCtx()
  const osc1 = ac.createOscillator()
  osc1.type = 'triangle'
  const osc2 = ac.createOscillator()
  osc2.type = 'sine' // octave partial adds a little brightness/body
  const partial2 = ac.createGain()
  partial2.gain.value = 0.35
  const filter = ac.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 0.7
  const env = ac.createGain()
  env.gain.value = 0.0001
  osc1.connect(env)
  osc2.connect(partial2).connect(env)
  env.connect(filter).connect(ac.destination)
  voice = { osc1, osc2, env, filter }
  osc1.start()
  osc2.start()
  strike(midi, ac.currentTime)
}

// Sound a note, retriggering the existing voice when sliding to a new key.
function changeNote(midi) {
  try {
    if (!voice) startVoice(midi)
    else strike(midi, playCtx.currentTime)
  } catch {
    /* output unavailable */
  }
}

// Let the current note ring out, then stop its oscillators.
function releaseVoice() {
  if (!voice || !playCtx) return
  const v = voice
  voice = null
  try {
    const t = playCtx.currentTime
    const g = v.env.gain
    g.cancelScheduledValues(t)
    g.setValueAtTime(Math.max(0.0002, g.value), t)
    g.exponentialRampToValueAtTime(0.0002, t + 0.25)
    v.osc1.stop(t + 0.3)
    v.osc2.stop(t + 0.3)
  } catch {
    /* ignore */
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
  changeNote(hit.midi)
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
    changeNote(hit.midi)
  }
}

function onPointerUp(e) {
  if (!sliding) return
  sliding = false
  pressedMidi = null
  releaseVoice()
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
  releaseVoice()
  if (playCtx) {
    try {
      playCtx.close()
    } catch {
      /* ignore */
    }
    playCtx = null
  }
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

      <!-- Dominant-note readout (top-left over the graph) -->
      <div class="hud-readout">
        <template v-if="dominant">
          <span class="note">{{ dominant.name }}</span>
          <span class="hz">{{ dominant.freq }} Hz</span>
        </template>
        <span v-else class="note dim">—</span>
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
  align-items: baseline;
  gap: 8px;
  pointer-events: none;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.7);
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
