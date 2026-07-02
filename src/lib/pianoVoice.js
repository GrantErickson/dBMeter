// Piano-ish tap voice for the on-screen keyboards (Spectrum + Tone tabs): a
// single voice with a percussive (hammer) attack, a quick initial decay then a
// long ringing tail, plus a brightness sweep that mellows — roughly a piano's
// amplitude + timbre envelope. Striking retriggers the voice; sliding to a new
// key retunes it. Plays through the shared output context (never the mic
// capture context).

import { midiToFreq } from './notes.js'
import { getAudioOut } from './audioOut.js'

export function createPianoVoice() {
  let ctx = null
  let voice = null // { osc1, osc2, env, filter } — the single sounding voice

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

  function start(midi) {
    const osc1 = ctx.createOscillator()
    osc1.type = 'triangle'
    const osc2 = ctx.createOscillator()
    osc2.type = 'sine' // octave partial adds a little brightness/body
    const partial2 = ctx.createGain()
    partial2.gain.value = 0.35
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 0.7
    const env = ctx.createGain()
    env.gain.value = 0.0001
    osc1.connect(env)
    osc2.connect(partial2).connect(env)
    env.connect(filter).connect(ctx.destination)
    voice = { osc1, osc2, env, filter }
    osc1.start()
    osc2.start()
    strike(midi, ctx.currentTime)
  }

  // Sound a note, retriggering the existing voice when sliding to a new key.
  function change(midi) {
    try {
      ctx = getAudioOut()
      if (!voice) start(midi)
      else strike(midi, ctx.currentTime)
    } catch {
      /* output unavailable */
    }
  }

  // Let the current note ring out, then stop its oscillators.
  function release() {
    if (!voice || !ctx) return
    const v = voice
    voice = null
    try {
      const t = ctx.currentTime
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

  return { change, release }
}
