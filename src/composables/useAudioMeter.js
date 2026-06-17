import { ref } from 'vue'
import { weightingDb } from '../lib/weighting.js'
import { applyCalibration } from '../lib/calibration.js'

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

  function computeWeights() {
    const n = analyser.frequencyBinCount
    const sr = audioCtx.sampleRate
    weights = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      weights[i] = weightingDb(cfg.weighting, (i * sr) / analyser.fftSize)
    }
  }

  function resetAccum(t) {
    accum = { startT: t, sumPower: 0, count: 0, maxDb: -Infinity }
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

    smoothedPower = 0
    peakDb.value = -Infinity
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

    if (t - accum.startT >= cfg.intervalSec * 1000) {
      let db
      if (cfg.aggregation === 'max') {
        db = accum.maxDb
      } else {
        const avgPower = accum.sumPower / Math.max(1, accum.count)
        db = applyCalibration(10 * Math.log10(avgPower + 1e-12), cfg.calibration)
      }
      if (onSampleCb) onSampleCb({ t: Date.now(), db })
      resetAccum(t)
    }
  }

  // Live update of settings while running (weighting recomputes the curve).
  function updateConfig(config) {
    const prevWeighting = cfg ? cfg.weighting : null
    cfg = { ...cfg, ...config }
    if (analyser && config.weighting && config.weighting !== prevWeighting) {
      computeWeights()
    }
  }

  function resetPeak() {
    peakDb.value = -Infinity
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
    error,
    start,
    stop,
    updateConfig,
    resetPeak,
  }
}
