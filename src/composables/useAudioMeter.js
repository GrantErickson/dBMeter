import { ref } from 'vue'
import { weightingDb } from '../lib/weighting.js'
import { applyCalibration } from '../lib/calibration.js'
import { freqTracksSig } from '../lib/freq.js'

// Captures the microphone and produces a continuously time-weighted dB value
// plus aggregated samples (one per sampling interval) via an onSample callback.
//
// Pipeline per frame:
//   1. analyser.getFloatFrequencyData -> per-bin magnitude (dB)
//   2. apply A/B/Z frequency weighting, sum to total power
//   3. exponential time weighting (Fast = 125 ms, Slow = 1 s)
//   4. raw dB = 10*log10(power); apply calibration -> dB SPL
//   5. accumulate over the sampling interval -> emit avg (Leq) or max sample
//
// The raw (uncalibrated) value is exposed so the calibration panel can capture
// a reference reading.

export function useAudioMeter() {
  const isRunning = ref(false)
  const currentDb = ref(-Infinity) // calibrated, time-weighted
  const currentRaw = ref(-Infinity) // uncalibrated (for calibration capture)
  const peakDb = ref(-Infinity)
  // Live, time-weighted level per tracked frequency: { [trackId]: dB }.
  const currentFreqs = ref({})
  const error = ref('')

  let audioCtx = null
  let analyser = null
  let source = null
  let stream = null
  let timer = null

  let freqData = null
  let weights = null
  let smoothedPower = 0
  let lastT = 0
  let accum = null
  let cfg = null
  let onSampleCb = null
  // Per-tracked-frequency state, parallel to cfg.freqTracks. Each entry holds
  // the FFT bin window for the frequency plus its own smoothing + interval
  // accumulators, mirroring the broadband pipeline above.
  let freqState = []

  function computeWeights() {
    const n = analyser.frequencyBinCount
    const sr = audioCtx.sampleRate
    weights = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      weights[i] = weightingDb(cfg.weighting, (i * sr) / analyser.fftSize)
    }
  }

  // Build the bin window for each tracked frequency. We sum power across a
  // narrow band (~±3%, at least one bin) so a tone falling between bins is still
  // captured. Frequencies above Nyquist (or invalid) are marked lo = -1.
  //
  // Bands whose id + frequency are unchanged keep their existing smoothing and
  // in-progress interval accumulators, so editing one frequency doesn't disturb
  // the others' lines. Live values for removed tracks are pruned.
  function buildFreqState() {
    const tracks = (cfg && cfg.freqTracks) || []
    const n = analyser.frequencyBinCount
    const binWidth = audioCtx.sampleRate / analyser.fftSize
    const prev = new Map(freqState.map((fs) => [fs.id, fs]))
    freqState = tracks.map((t) => {
      const f = t.freq
      const kept = prev.get(t.id)
      if (kept && kept.freq === f) return kept // same band – preserve its state
      let lo = -1
      let hi = -1
      if (Number.isFinite(f) && f > 0) {
        const bw = Math.max(binWidth, f * 0.03)
        lo = Math.max(1, Math.round((f - bw) / binWidth))
        hi = Math.min(n - 1, Math.round((f + bw) / binWidth))
        if (lo > n - 1) {
          lo = -1 // above Nyquist – nothing to measure
          hi = -1
        } else if (hi < lo) {
          hi = lo
        }
      }
      return { id: t.id, freq: f, lo, hi, smoothedPower: 0, sumPower: 0, count: 0, maxDb: -Infinity }
    })
    // Drop live readouts for frequencies that no longer exist.
    const live = {}
    for (const fs of freqState) {
      if (fs.id in currentFreqs.value) live[fs.id] = currentFreqs.value[fs.id]
    }
    currentFreqs.value = live
  }

  function resetFreqAccum() {
    for (const fs of freqState) {
      fs.sumPower = 0
      fs.count = 0
      fs.maxDb = -Infinity
    }
  }

  function resetAccum(t) {
    accum = { startT: t, sumPower: 0, count: 0, maxDb: -Infinity }
    resetFreqAccum()
  }

  async function start(config, onSample) {
    cfg = { ...config }
    onSampleCb = onSample
    error.value = ''

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      error.value = 'This browser does not support microphone capture.'
      return false
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Disable processing that would distort level measurements.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
    } catch (e) {
      error.value = 'Microphone access failed: ' + (e && e.message ? e.message : e)
      return false
    }

    // If anything in the audio-graph setup throws, release the mic stream we
    // just acquired (and any partially-created context) instead of leaking it.
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      audioCtx = new Ctx()
      if (audioCtx.state === 'suspended') {
        try {
          await audioCtx.resume()
        } catch {
          /* ignore */
        }
      }
      source = audioCtx.createMediaStreamSource(stream)
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 8192
      analyser.smoothingTimeConstant = 0 // we do our own time weighting
      source.connect(analyser)
      // Intentionally NOT connected to destination (avoids feedback / echo).
      freqData = new Float32Array(analyser.frequencyBinCount)
      computeWeights()
    } catch (e) {
      error.value = 'Audio setup failed: ' + (e && e.message ? e.message : e)
      stop()
      return false
    }

    smoothedPower = 0
    peakDb.value = -Infinity
    // Start each mic session with fresh band state (no carry-over from a prior
    // run); buildFreqState's preservation only applies to live config edits.
    currentFreqs.value = {}
    freqState = []
    buildFreqState()
    lastT = performance.now()
    resetAccum(lastT)
    isRunning.value = true

    // setInterval keeps running when the tab is backgrounded (throttled but
    // alive), unlike requestAnimationFrame which pauses entirely.
    timer = setInterval(tick, 33)
    return true
  }

  function tick() {
    const t = performance.now()
    let dt = (t - lastT) / 1000
    lastT = t
    if (dt > 0.5) dt = 0.5
    if (dt <= 0) dt = 0.001

    analyser.getFloatFrequencyData(freqData)

    let power = 0
    for (let i = 1; i < freqData.length; i++) {
      const b = freqData[i]
      if (b === -Infinity || b < -160) continue
      power += Math.pow(10, (b + weights[i]) / 10)
    }

    const tau = cfg.response === 'slow' ? 1.0 : 0.125
    const alpha = 1 - Math.exp(-dt / tau)
    smoothedPower += alpha * (power - smoothedPower)

    const rawDb = 10 * Math.log10(smoothedPower + 1e-12)
    currentRaw.value = rawDb
    const calDb = applyCalibration(rawDb, cfg.calibration)
    currentDb.value = calDb
    if (calDb > peakDb.value) peakDb.value = calDb

    accum.sumPower += smoothedPower
    accum.count += 1
    if (calDb > accum.maxDb) accum.maxDb = calDb

    // ---- tracked frequencies ----
    // Band level around each frequency, with the same time smoothing and
    // calibration as the broadband reading, but no frequency weighting (we want
    // the true level at that exact frequency, not its perceptual contribution).
    for (const fs of freqState) {
      if (fs.lo < 0) {
        currentFreqs.value[fs.id] = -Infinity
        continue
      }
      let p = 0
      for (let i = fs.lo; i <= fs.hi; i++) {
        const b = freqData[i]
        if (b === -Infinity || b < -160) continue
        p += Math.pow(10, b / 10)
      }
      fs.smoothedPower += alpha * (p - fs.smoothedPower)
      const fCal = applyCalibration(10 * Math.log10(fs.smoothedPower + 1e-12), cfg.calibration)
      currentFreqs.value[fs.id] = fCal
      fs.sumPower += fs.smoothedPower
      fs.count += 1
      if (fCal > fs.maxDb) fs.maxDb = fCal
    }

    if (t - accum.startT >= cfg.intervalSec * 1000) {
      let db
      if (cfg.aggregation === 'max') {
        db = accum.maxDb
      } else {
        const avgPower = accum.sumPower / Math.max(1, accum.count)
        db = applyCalibration(10 * Math.log10(avgPower + 1e-12), cfg.calibration)
      }
      const freqs = freqState.map((fs) => {
        if (fs.lo < 0) return { id: fs.id, db: -Infinity }
        if (cfg.aggregation === 'max') return { id: fs.id, db: fs.maxDb }
        const avgPower = fs.sumPower / Math.max(1, fs.count)
        return {
          id: fs.id,
          db: applyCalibration(10 * Math.log10(avgPower + 1e-12), cfg.calibration),
        }
      })
      if (onSampleCb) onSampleCb({ t: Date.now(), db, freqs })
      resetAccum(t)
    }
  }

  // Live update of settings while running (weighting recomputes the curve;
  // changing the tracked frequencies rebuilds their bin windows).
  function updateConfig(config) {
    const prevWeighting = cfg ? cfg.weighting : null
    const prevFreqSig = freqTracksSig(cfg && cfg.freqTracks)
    cfg = { ...cfg, ...config }
    if (analyser && config.weighting && config.weighting !== prevWeighting) {
      computeWeights()
    }
    if (analyser && freqTracksSig(cfg.freqTracks) !== prevFreqSig) {
      buildFreqState()
    }
  }

  function resetPeak() {
    peakDb.value = -Infinity
  }

  // ---- raw spectrum access (for the spectrum analyser view) ----
  // The analyser is owned here, so the spectrum view reads it through these:
  // spectrumInfo() reports the buffer size needed (null when the mic is off),
  // and readSpectrum(out) fills the caller's own Float32Array with per-bin dBFS.
  function spectrumInfo() {
    if (!analyser || !audioCtx) return null
    return {
      binCount: analyser.frequencyBinCount,
      fftSize: analyser.fftSize,
      sampleRate: audioCtx.sampleRate,
    }
  }

  function readSpectrum(out) {
    if (!analyser || !out) return false
    analyser.getFloatFrequencyData(out)
    return true
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    try {
      if (source) source.disconnect()
    } catch {
      /* ignore */
    }
    if (stream) stream.getTracks().forEach((tr) => tr.stop())
    if (audioCtx) audioCtx.close()
    audioCtx = analyser = source = stream = null
    isRunning.value = false
  }

  return {
    isRunning,
    currentDb,
    currentRaw,
    peakDb,
    currentFreqs,
    error,
    start,
    stop,
    updateConfig,
    resetPeak,
    spectrumInfo,
    readSpectrum,
  }
}
