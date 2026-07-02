// Signal definitions + DSP for the Tone tab's generator.
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

export const WAVEFORMS = [
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'square', label: 'Square' },
  { value: 'sawtooth', label: 'Sawtooth' },
  { value: 'pulse25', label: 'Pulse 25%' },
  { value: 'pulse10', label: 'Pulse 10%' },
  { value: 'halfsine', label: 'Half sine' },
  { value: 'organ', label: 'Organ' },
  { value: 'warm', label: 'Warm' },
  { value: 'buzz', label: 'Buzz' },
]

// ---- custom waveforms (harmonic recipes -> PeriodicWave) ----
// Each recipe returns { real, imag } cosine/sine harmonic amplitudes indexed by
// harmonic number (index 0 = DC, always 0). Only the relative amplitudes
// matter: createPeriodicWave normalises, keeping all shapes at similar volume.

function pulseWave(duty, n = 32) {
  const imag = new Float32Array(n + 1)
  for (let k = 1; k <= n; k++) {
    imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty)
  }
  return { imag }
}

const CUSTOM_WAVES = {
  pulse25: () => pulseWave(0.25),
  pulse10: () => pulseWave(0.1),
  // Half-wave rectified sine: fundamental + even cosine harmonics.
  halfsine: () => {
    const n = 16
    const real = new Float32Array(n + 1)
    const imag = new Float32Array(n + 1)
    imag[1] = Math.PI / 4
    for (let k = 2; k <= n; k += 2) real[k] = -2 / (Math.PI * (k * k - 1))
    return { real, imag }
  },
  // Drawbar-organ-ish: strong low harmonics plus a 6th and 8th on top.
  organ: () => ({
    imag: Float32Array.from([0, 1, 0.85, 0.6, 0.45, 0, 0.35, 0, 0.4]),
  }),
  // All harmonics rolled off at 1/k^2 — mellow, flute-like.
  warm: () => {
    const n = 16
    const imag = new Float32Array(n + 1)
    for (let k = 1; k <= n; k++) imag[k] = 1 / (k * k)
    return { imag }
  },
  // Barely-decaying harmonic comb — bright and reedy.
  buzz: () => {
    const n = 32
    const imag = new Float32Array(n + 1)
    for (let k = 1; k <= n; k++) imag[k] = 1 / Math.sqrt(k)
    return { imag }
  },
}

const waveCache = new Map() // name -> PeriodicWave (one shared output context)

// PeriodicWave for a custom waveform name, or null for the native oscillator
// types (sine/triangle/square/sawtooth), which the caller sets directly.
export function periodicWaveFor(ctx, name) {
  const recipe = CUSTOM_WAVES[name]
  if (!recipe) return null
  let wave = waveCache.get(name)
  if (!wave) {
    const { real, imag } = recipe()
    wave = ctx.createPeriodicWave(real || new Float32Array(imag.length), imag)
    waveCache.set(name, wave)
  }
  return wave
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
