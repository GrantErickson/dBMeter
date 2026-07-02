import { ref } from 'vue'
import { getAudioOut } from '../lib/audioOut.js'
import { createNoiseBuffer, periodicWaveFor } from '../lib/generator.js'

// Plays a continuous test signal — a tunable oscillator ("wave") or a looped
// coloured-noise buffer — through the shared output context. Owned by App (not
// the Tone view) so the signal keeps sounding while the user switches tabs,
// e.g. to watch it on the Spectrum analyser.
//
// Config objects ({ type, waveform, freq, volume }) come from settings.tone;
// update() live-applies edits to a running signal.

const OSC_TRIM = 0.4 // oscillator level vs the RMS-normalised noise buffers
const FADE = 0.04 // s, source fade in/out — swaps and stops click otherwise

export function useToneGenerator() {
  const isPlaying = ref(false)

  let ctx = null
  let master = null // volume gain, persists across sources
  let src = null // { node, env, type, waveform } current source
  const noiseCache = new Map() // type -> AudioBuffer (per generated colour)

  // Squared taper so the slider feels roughly linear in loudness.
  function gainFor(volume) {
    const v = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.5
    return v * v
  }

  function safeFreq(f) {
    return Number.isFinite(f) && f > 0 ? Math.min(20000, Math.max(1, f)) : 440
  }

  function applyWaveform(osc, name) {
    const wave = periodicWaveFor(ctx, name)
    if (wave) osc.setPeriodicWave(wave)
    else osc.type = ['sine', 'triangle', 'square', 'sawtooth'].includes(name) ? name : 'sine'
  }

  function noiseBuffer(type) {
    let buf = noiseCache.get(type)
    if (!buf) {
      buf = createNoiseBuffer(ctx, type)
      noiseCache.set(type, buf)
    }
    return buf
  }

  // Build + start a new source behind its own fade-in envelope.
  function makeSource(cfg) {
    const t = ctx.currentTime
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(1, t + FADE)
    env.connect(master)
    let node
    if (cfg.type === 'wave') {
      node = ctx.createOscillator()
      applyWaveform(node, cfg.waveform)
      node.frequency.value = safeFreq(cfg.freq)
      const trim = ctx.createGain()
      trim.gain.value = OSC_TRIM
      node.connect(trim).connect(env)
    } else {
      node = ctx.createBufferSource()
      node.buffer = noiseBuffer(cfg.type)
      node.loop = true
      node.connect(env)
    }
    node.start()
    return { node, env, type: cfg.type, waveform: cfg.waveform }
  }

  // Fade a source out and stop it (it keeps ringing FADE seconds, harmlessly).
  function killSource(s) {
    if (!s) return
    try {
      const t = ctx.currentTime
      s.env.gain.cancelScheduledValues(t)
      s.env.gain.setValueAtTime(Math.max(0.0001, s.env.gain.value), t)
      s.env.gain.exponentialRampToValueAtTime(0.0001, t + FADE)
      s.node.stop(t + FADE + 0.03)
    } catch {
      /* already stopped */
    }
  }

  function start(cfg) {
    try {
      ctx = getAudioOut()
      if (!master) {
        master = ctx.createGain()
        master.connect(ctx.destination)
      }
      master.gain.value = gainFor(cfg.volume)
      killSource(src)
      src = makeSource(cfg)
      isPlaying.value = true
    } catch {
      isPlaying.value = false
    }
  }

  function stop() {
    killSource(src)
    src = null
    isPlaying.value = false
  }

  function toggle(cfg) {
    if (isPlaying.value) stop()
    else start(cfg)
  }

  // Live-apply edited settings to the running signal: volume and frequency
  // glide smoothly, a waveform change is instant, a type change swaps sources
  // behind a quick crossfade.
  function update(cfg) {
    if (!isPlaying.value || !ctx || !src) return
    master.gain.setTargetAtTime(gainFor(cfg.volume), ctx.currentTime, 0.02)
    if (cfg.type !== src.type) {
      killSource(src)
      src = makeSource(cfg)
      return
    }
    if (cfg.type === 'wave') {
      if (cfg.waveform !== src.waveform) {
        applyWaveform(src.node, cfg.waveform)
        src.waveform = cfg.waveform
      }
      src.node.frequency.setTargetAtTime(safeFreq(cfg.freq), ctx.currentTime, 0.01)
    }
  }

  return { isPlaying, start, stop, toggle, update }
}
