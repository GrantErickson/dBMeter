import { ref } from 'vue'
import { getAudioOut } from '../lib/audioOut.js'
import { createNoiseBuffer, createWaveSource } from '../lib/generator.js'

// Plays a continuous test signal — a tunable wave voice (basic shapes or
// instrument timbres, see lib/generator.js) or a looped coloured-noise buffer
// — through the shared output context. Owned by App (not the Tone view) so the
// signal keeps sounding while the user switches tabs, e.g. to watch it on the
// Spectrum analyser. Struck timbres (harp, timpani, …) re-hit on their natural
// period for as long as the generator runs.
//
// Config objects ({ type, waveform, freq, volume }) come from settings.tone;
// update() live-applies edits to a running signal.

const FADE = 0.04 // s, source fade in/out — swaps and stops click otherwise

export function useToneGenerator() {
  const isPlaying = ref(false)

  let ctx = null
  let master = null // volume gain, persists across sources
  let src = null // { ws?, node?, env, type, waveform, freq } current source
  const noiseCache = new Map() // type -> AudioBuffer (per generated colour)

  // Squared taper so the slider feels roughly linear in loudness.
  function gainFor(volume) {
    const v = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.5
    return v * v
  }

  function safeFreq(f) {
    return Number.isFinite(f) && f > 0 ? Math.min(20000, Math.max(1, f)) : 440
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
    env.connect(master)
    if (cfg.type === 'wave') {
      const freq = safeFreq(cfg.freq)
      const ws = createWaveSource(ctx, cfg.waveform, freq)
      // sustained instruments get their natural swell; strikes just unmute
      env.gain.linearRampToValueAtTime(1, t + Math.max(FADE, ws.attack))
      ws.out.connect(env)
      ws.start()
      return { ws, env, type: cfg.type, waveform: cfg.waveform, freq }
    }
    env.gain.exponentialRampToValueAtTime(1, t + FADE)
    const node = ctx.createBufferSource()
    node.buffer = noiseBuffer(cfg.type)
    node.loop = true
    node.connect(env)
    node.start()
    return { node, env, type: cfg.type }
  }

  // Fade a source out and stop it (it keeps ringing FADE seconds, harmlessly).
  function killSource(s) {
    if (!s) return
    try {
      const t = ctx.currentTime
      s.env.gain.cancelScheduledValues(t)
      s.env.gain.setValueAtTime(Math.max(0.0001, s.env.gain.value), t)
      s.env.gain.exponentialRampToValueAtTime(0.0001, t + FADE)
      if (s.ws) s.ws.stop(t + FADE + 0.03)
      else s.node.stop(t + FADE + 0.03)
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

  // Live-apply edited settings to the running signal: volume glides, a
  // frequency edit retunes (sustained timbres glide, struck ones re-strike at
  // the new pitch), a type or waveform change swaps sources behind a quick
  // crossfade (waveforms differ in envelope plumbing, so a rebuild is safest).
  function update(cfg) {
    if (!isPlaying.value || !ctx || !src) return
    master.gain.setTargetAtTime(gainFor(cfg.volume), ctx.currentTime, 0.02)
    if (cfg.type !== src.type || (cfg.type === 'wave' && cfg.waveform !== src.waveform)) {
      killSource(src)
      src = makeSource(cfg)
      return
    }
    if (cfg.type === 'wave') {
      const f = safeFreq(cfg.freq)
      if (f !== src.freq) {
        src.freq = f
        src.ws.retune(f)
      }
    }
  }

  return { isPlaying, start, stop, toggle, update }
}
