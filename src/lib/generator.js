// Signal definitions + DSP for the Tone tab's generator.
//
// Waveforms come in two behaviours. Sustained timbres (basic shapes, winds,
// brass, strings) sound for as long as they're held, some with a slow vibrato.
// Struck/plucked timbres (harp, timpani, bell, …) hit, ring and fade — and
// while held they re-strike on the instrument's natural period. All timbres
// are additive-harmonic recipes rendered as PeriodicWaves; the strike
// behaviour is an amplitude envelope + darkening lowpass sweep on top.
//
// Noise colours are synthesised in the frequency domain: fill a spectrum with
// random-phase bins whose magnitude follows the colour's power law (or the
// inverse A-weighting curve for grey), then inverse-FFT to a time signal. A
// buffer built this way is periodic by construction, so looping it is
// seamless — no crossfade needed. Crackle is the exception: sparse impulses
// placed in the time domain.

import { weightingDb } from './weighting.js'

export const GEN_TYPES = [
  { value: 'wave', label: 'Wave (tone)' },
  { value: 'white', label: 'White noise' },
  { value: 'pink', label: 'Pink noise' },
  { value: 'brown', label: 'Brown noise' },
  { value: 'blue', label: 'Blue noise' },
  { value: 'violet', label: 'Violet noise' },
  { value: 'grey', label: 'Grey noise' },
  { value: 'crackle', label: 'Crackle' },
]

export const WAVEFORM_GROUPS = [
  {
    label: 'Basic',
    items: [
      { value: 'sine', label: 'Sine' },
      { value: 'triangle', label: 'Triangle' },
      { value: 'square', label: 'Square' },
      { value: 'sawtooth', label: 'Sawtooth' },
      { value: 'pulse25', label: 'Pulse 25%' },
      { value: 'pulse10', label: 'Pulse 10%' },
      { value: 'halfsine', label: 'Half sine' },
    ],
  },
  {
    label: 'Synth',
    items: [
      { value: 'organ', label: 'Organ' },
      { value: 'warm', label: 'Warm' },
      { value: 'buzz', label: 'Buzz' },
    ],
  },
  {
    label: 'Wind & brass',
    items: [
      { value: 'trumpet', label: 'Trumpet' },
      { value: 'horn', label: 'French horn' },
      { value: 'flute', label: 'Flute' },
      { value: 'oboe', label: 'Oboe' },
      { value: 'clarinet', label: 'Clarinet' },
      { value: 'sax', label: 'Saxophone' },
    ],
  },
  {
    label: 'Strings',
    items: [
      { value: 'violin', label: 'Violin' },
      { value: 'cello', label: 'Cello' },
    ],
  },
  {
    label: 'Struck & plucked',
    items: [
      { value: 'harp', label: 'Harp' },
      { value: 'musicbox', label: 'Music box' },
      { value: 'marimba', label: 'Marimba' },
      { value: 'timpani', label: 'Timpani' },
      { value: 'bell', label: 'Bell' },
    ],
  },
]

export const WAVEFORMS = WAVEFORM_GROUPS.flatMap((g) => g.items)

// ---- waveform definitions ----
// recipe -> { real?, imag } cosine/sine harmonic amplitudes indexed by harmonic
// number (index 0 = DC, always 0). Only relative amplitudes matter:
// createPeriodicWave normalises, keeping all shapes at similar volume.
// Behaviour fields:
//   native   use the built-in oscillator type instead of a recipe
//   attack   s, fade-in of a sustained timbre (winds swell, strings speak late)
//   vibrato  { rate Hz, cents } slow pitch wobble that eases in after onset
//   strike   { decay, repeat, bright, dark, drop? } percussive envelope:
//            hit -> exponential fade over `decay` s, re-hit every `repeat` s
//            while held; a lowpass sweeps f*bright -> f*dark as the hit rings;
//            `drop` cents of initial pitch sag (timpani's membrane settling)
//   gain     level trim (strikes are transient, so they get a little more)

function harmonics(amps) {
  const imag = new Float32Array(amps.length + 1)
  for (let i = 0; i < amps.length; i++) imag[i + 1] = amps[i]
  return { imag }
}

// Sparse partials: pairs of [harmonic, amplitude].
function partials(pairs) {
  const top = pairs[pairs.length - 1][0]
  const imag = new Float32Array(top + 1)
  for (const [k, a] of pairs) imag[k] = a
  return { imag }
}

function pulseWave(duty, n = 32) {
  const imag = new Float32Array(n + 1)
  for (let k = 1; k <= n; k++) {
    imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty)
  }
  return { imag }
}

const WAVE_DEFS = {
  sine: { native: 'sine' },
  triangle: { native: 'triangle' },
  square: { native: 'square' },
  sawtooth: { native: 'sawtooth' },
  pulse25: { recipe: () => pulseWave(0.25) },
  pulse10: { recipe: () => pulseWave(0.1) },
  // Half-wave rectified sine: fundamental + even cosine harmonics.
  halfsine: {
    recipe: () => {
      const n = 16
      const real = new Float32Array(n + 1)
      const imag = new Float32Array(n + 1)
      imag[1] = Math.PI / 4
      for (let k = 2; k <= n; k += 2) real[k] = -2 / (Math.PI * (k * k - 1))
      return { real, imag }
    },
  },
  // Drawbar-organ-ish: strong low harmonics plus a 6th and 8th on top.
  organ: { recipe: () => harmonics([1, 0.85, 0.6, 0.45, 0, 0.35, 0, 0.4]) },
  // All harmonics rolled off at 1/k^2 — mellow, flute-like.
  warm: {
    recipe: () => {
      const n = 16
      const imag = new Float32Array(n + 1)
      for (let k = 1; k <= n; k++) imag[k] = 1 / (k * k)
      return { imag }
    },
  },
  // Barely-decaying harmonic comb — bright and reedy.
  buzz: {
    recipe: () => {
      const n = 32
      const imag = new Float32Array(n + 1)
      for (let k = 1; k <= n; k++) imag[k] = 1 / Math.sqrt(k)
      return { imag }
    },
  },

  // --- sustained instruments (harmonic balances are approximations) ---
  // Brass: rich, slowly-falling harmonic series that stays strong up high.
  trumpet: {
    attack: 0.06,
    recipe: () =>
      harmonics([1, 0.85, 0.95, 0.8, 0.7, 0.55, 0.45, 0.32, 0.22, 0.15, 0.1, 0.06]),
  },
  horn: {
    attack: 0.09,
    recipe: () => harmonics([1, 0.55, 0.3, 0.18, 0.09, 0.05, 0.03]),
  },
  // Nearly pure tone with a touch of 2nd harmonic and a slow vibrato.
  flute: {
    attack: 0.1,
    vibrato: { rate: 5, cents: 6 },
    recipe: () => harmonics([1, 0.3, 0.12, 0.05, 0.02]),
  },
  // Double reed: 2nd/4th-harmonic formant makes the piercing nasal tone.
  oboe: {
    attack: 0.05,
    vibrato: { rate: 5.5, cents: 5 },
    recipe: () => harmonics([0.55, 1, 0.45, 0.7, 0.3, 0.2, 0.12, 0.06]),
  },
  // Cylindrical bore: odd harmonics dominate — the hollow clarinet sound.
  clarinet: {
    attack: 0.07,
    recipe: () =>
      harmonics([1, 0.04, 0.65, 0.05, 0.45, 0.05, 0.25, 0.04, 0.12, 0.03, 0.06]),
  },
  sax: {
    attack: 0.05,
    vibrato: { rate: 5, cents: 7 },
    recipe: () =>
      harmonics([1, 0.75, 0.85, 0.5, 0.35, 0.28, 0.32, 0.2, 0.12, 0.08, 0.05]),
  },
  // Bowed strings: saw-like spectrum, slow speak, expressive vibrato.
  violin: {
    attack: 0.12,
    vibrato: { rate: 5.5, cents: 10 },
    recipe: () =>
      harmonics([1, 0.72, 0.6, 0.5, 0.45, 0.36, 0.3, 0.24, 0.18, 0.14, 0.1, 0.07]),
  },
  cello: {
    attack: 0.1,
    vibrato: { rate: 4.5, cents: 9 },
    recipe: () => harmonics([1, 0.85, 0.6, 0.38, 0.26, 0.17, 0.11, 0.07, 0.04]),
  },

  // --- struck / plucked instruments (decay, then repeat while held) ---
  harp: {
    gain: 1.4,
    strike: { decay: 2.8, repeat: 3.2, bright: 7, dark: 1.8 },
    recipe: () => harmonics([1, 0.6, 0.42, 0.3, 0.2, 0.14, 0.09, 0.06, 0.04]),
  },
  musicbox: {
    gain: 1.4,
    strike: { decay: 1.6, repeat: 1.8, bright: 12, dark: 4 },
    recipe: () => partials([[1, 1], [3, 0.5], [5, 0.25], [8, 0.15]]),
  },
  // Bar percussion: strong partial near 4x the fundamental, short ring.
  marimba: {
    gain: 1.5,
    strike: { decay: 1.1, repeat: 1.6, bright: 6, dark: 2 },
    recipe: () => partials([[1, 1], [4, 0.5], [10, 0.22]]),
  },
  // Dark, boomy, with the membrane's initial pitch sag on each hit.
  timpani: {
    gain: 1.6,
    strike: { decay: 1.8, repeat: 2.2, bright: 3.5, dark: 1.2, drop: 50 },
    recipe: () => harmonics([1, 0.55, 0.3, 0.15, 0.08]),
  },
  // True bells are inharmonic; a sparse odd-ish comb is a fair stand-in.
  bell: {
    gain: 1.3,
    strike: { decay: 4, repeat: 4.5, bright: 9, dark: 3 },
    recipe: () => partials([[1, 1], [2, 0.5], [3, 0.4], [5, 0.3], [7, 0.2], [10, 0.15]]),
  },
}

const OSC_TRIM = 0.4 // oscillator level vs the RMS-normalised noise buffers
const waveCache = new Map() // name -> PeriodicWave (one shared output context)

function periodicWaveFor(ctx, name) {
  const def = WAVE_DEFS[name]
  if (!def || !def.recipe) return null
  let wave = waveCache.get(name)
  if (!wave) {
    const { real, imag } = def.recipe()
    wave = ctx.createPeriodicWave(real || new Float32Array(imag.length), imag)
    waveCache.set(name, wave)
  }
  return wave
}

// A sounding wave voice: oscillator + trim, plus the timbre's behaviour
// (vibrato LFO, or strike envelope + filter sweep + repeat scheduler). The
// caller owns the overall on/off envelope and connects `out` onward.
//
//   start()    begin sounding (first hit + repeat cycle for struck timbres;
//              sustained ones are already running)
//   retune(f)  move pitch: sustained timbres glide, struck ones re-strike now
//              and restart their repeat cycle from that hit
//   ringOut()  stop scheduling hits and let the current one fade; returns the
//              seconds the tail needs (0 for sustained timbres)
//   stop(t)    silence the voice's oscillators at audio time t
export function createWaveSource(ctx, name, freq) {
  const def = WAVE_DEFS[name] || WAVE_DEFS.sine
  const strike = def.strike || null

  const osc = ctx.createOscillator()
  const wave = periodicWaveFor(ctx, name)
  if (wave) osc.setPeriodicWave(wave)
  else osc.type = def.native || 'sine'
  osc.frequency.value = freq

  const trim = ctx.createGain()
  trim.gain.value = OSC_TRIM * (def.gain || 1)
  osc.connect(trim)
  let out = trim
  let filter = null
  let strikeGain = null
  let lfo = null
  if (strike) {
    filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 0.7
    strikeGain = ctx.createGain()
    strikeGain.gain.value = 0.0001
    trim.connect(filter).connect(strikeGain)
    out = strikeGain
  } else if (def.vibrato) {
    lfo = ctx.createOscillator()
    lfo.frequency.value = def.vibrato.rate
    const depth = ctx.createGain()
    depth.gain.value = 0
    // ease the vibrato in so the note doesn't wobble from its first instant
    depth.gain.setTargetAtTime(def.vibrato.cents, ctx.currentTime + 0.25, 0.3)
    lfo.connect(depth).connect(osc.detune)
  }
  osc.start()
  if (lfo) lfo.start()

  let curFreq = freq
  let timer = null
  let nextT = 0

  function doStrike(f, t) {
    osc.frequency.cancelScheduledValues(t)
    osc.frequency.setValueAtTime(f, t)
    if (strike.drop) {
      osc.detune.cancelScheduledValues(t)
      osc.detune.setValueAtTime(strike.drop, t)
      osc.detune.linearRampToValueAtTime(0, t + 0.25)
    }
    const g = strikeGain.gain
    g.cancelScheduledValues(t)
    g.setValueAtTime(0.0001, t)
    g.exponentialRampToValueAtTime(1, t + 0.006)
    g.exponentialRampToValueAtTime(0.0008, t + strike.decay)
    const c = filter.frequency
    c.cancelScheduledValues(t)
    c.setValueAtTime(Math.min(12000, f * strike.bright), t)
    c.exponentialRampToValueAtTime(Math.max(250, f * strike.dark), t + strike.decay * 0.5)
  }

  // Keep hits queued a couple of seconds ahead so background-tab timer
  // throttling (~1 s granularity while audio plays) can't starve the rhythm.
  function schedule() {
    const horizon = ctx.currentTime + 2
    while (nextT < horizon) {
      doStrike(curFreq, nextT)
      nextT += strike.repeat
    }
  }

  function start() {
    if (!strike) return
    nextT = ctx.currentTime + 0.01
    schedule()
    timer = setInterval(schedule, 500)
  }

  function retune(f) {
    curFreq = f
    if (strike) {
      // re-strike at the new pitch now; doStrike's cancels wipe queued hits
      // that would have sounded at the old pitch
      const t = ctx.currentTime + 0.005
      doStrike(f, t)
      nextT = t + strike.repeat
    } else {
      osc.frequency.setTargetAtTime(f, ctx.currentTime, 0.01)
    }
  }

  function ringOut() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    if (!strike) return 0
    // Cancelling wipes the current hit's decay ramp too (leaving the gain
    // frozen), so re-apply a fade from wherever the level is now.
    const t = ctx.currentTime
    const g = strikeGain.gain
    const level = Math.max(0.0008, g.value)
    g.cancelScheduledValues(t)
    g.setValueAtTime(level, t)
    g.exponentialRampToValueAtTime(0.0008, t + strike.decay)
    filter.frequency.cancelScheduledValues(t)
    osc.frequency.cancelScheduledValues(t)
    if (strike.drop) osc.detune.cancelScheduledValues(t)
    return strike.decay
  }

  function stop(t) {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    try {
      osc.stop(t)
      if (lfo) lfo.stop(t)
    } catch {
      /* already stopped */
    }
  }

  return {
    out,
    attack: def.attack || 0,
    isStrike: !!strike,
    start,
    retune,
    ringOut,
    stop,
  }
}

// ---- noise buffers ----

const NOISE_MIN_SECONDS = 4 // loop length is the next power of two above this

// In-place iterative radix-2 complex FFT; n must be a power of two.
function fft(re, im, inverse) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]
      re[i] = re[j]
      re[j] = tr
      const ti = im[i]
      im[i] = im[j]
      im[j] = ti
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((2 * Math.PI) / len) * (inverse ? 1 : -1)
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    const half = len >> 1
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < half; k++) {
        const a = i + k
        const b = a + half
        const vr = re[b] * cr - im[b] * ci
        const vi = re[b] * ci + im[b] * cr
        re[b] = re[a] - vr
        im[b] = im[a] - vi
        re[a] += vr
        im[a] += vi
        const nr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = nr
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n
      im[i] /= n
    }
  }
}

// Relative spectral amplitude of a noise colour at frequency f, referenced to
// 1 kHz so every colour normalises to a comparable loudness.
function magnitudeFor(type, f) {
  let m
  switch (type) {
    case 'pink':
      m = Math.sqrt(1000 / f) // -3 dB/octave power slope
      break
    case 'brown':
      m = 1000 / f // -6 dB/octave
      break
    case 'blue':
      m = Math.sqrt(f / 1000) // +3 dB/octave
      break
    case 'violet':
      m = f / 1000 // +6 dB/octave
      break
    case 'grey': {
      // Inverse A-weighting = perceptually flat. Cap the deep-bass boost
      // (+50 dB at 20 Hz) so it doesn't swallow the audible band's headroom.
      const db = Math.min(35, -weightingDb('A', f))
      m = Math.pow(10, db / 20)
      break
    }
    default:
      m = 1 // white
  }
  // Roll off the sub-audible bottom end (headroom + speaker protection).
  if (f < 20) m *= (f / 20) * (f / 20)
  return m
}

function spectralNoise(type, n, sampleRate) {
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  const half = n / 2
  for (let k = 1; k < half; k++) {
    const f = (k * sampleRate) / n
    const mag = magnitudeFor(type, f)
    const ph = Math.random() * 2 * Math.PI
    re[k] = mag * Math.cos(ph)
    im[k] = mag * Math.sin(ph)
    re[n - k] = re[k] // hermitian symmetry -> purely real signal
    im[n - k] = -im[k]
  }
  fft(re, im, true)
  return re
}

// Sparse random impulses (vinyl / Geiger-counter crackle). Each pop gets a
// couple of decaying samples so the very hardest edge is softened.
function crackleNoise(n, sampleRate) {
  const out = new Float64Array(n)
  const perSec = 25 // average pops per second
  const p = perSec / sampleRate
  for (let i = 0; i < n; i++) {
    if (Math.random() >= p) continue
    const amp = Math.random() * Math.random() * (Math.random() < 0.5 ? -1 : 1)
    out[i] += amp
    if (i + 1 < n) out[i + 1] += amp * 0.4
    if (i + 2 < n) out[i + 2] += amp * 0.15
  }
  return out
}

// Scale to a common loudness: RMS for the steady colours (hard-clipping only
// rare Gaussian outliers), peak for crackle whose RMS is near zero between pops.
function normalize(x, type) {
  const n = x.length
  if (type === 'crackle') {
    let peak = 0
    for (let i = 0; i < n; i++) {
      const a = Math.abs(x[i])
      if (a > peak) peak = a
    }
    const s = peak > 0 ? 0.8 / peak : 1
    for (let i = 0; i < n; i++) x[i] *= s
    return
  }
  let sum = 0
  for (let i = 0; i < n; i++) sum += x[i] * x[i]
  const rms = Math.sqrt(sum / n)
  const s = rms > 0 ? 0.15 / rms : 1
  for (let i = 0; i < n; i++) {
    const v = x[i] * s
    x[i] = v > 0.95 ? 0.95 : v < -0.95 ? -0.95 : v
  }
}

export function createNoiseBuffer(ctx, type) {
  const sr = ctx.sampleRate
  let n = 1 << 15
  while (n / sr < NOISE_MIN_SECONDS) n <<= 1
  const data = type === 'crackle' ? crackleNoise(n, sr) : spectralNoise(type, n, sr)
  normalize(data, type)
  const buf = ctx.createBuffer(1, n, sr)
  const ch = buf.getChannelData(0)
  for (let i = 0; i < n; i++) ch[i] = data[i]
  return buf
}
