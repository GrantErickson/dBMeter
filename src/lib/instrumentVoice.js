// Keyboard preview voice for the Tone tab: keys audition the *selected*
// waveform, so the keyboard sounds like whatever the generator will play.
// Sustained timbres hold while the key is down and release when it lifts;
// struck ones (harp, timpani, …) hit at once, repeat on their natural period
// for as long as the key is held, and ring out on release. Plays through the
// shared output context.

import { getAudioOut } from './audioOut.js'
import { createWaveSource } from './generator.js'

export function createInstrumentVoice() {
  let ctx = null
  let cur = null // { ws, env, waveform } the held voice

  function press(freq, waveform) {
    stopCurrent(0.06) // quick fade if a previous press is somehow still alive
    try {
      ctx = getAudioOut()
      const ws = createWaveSource(ctx, waveform, freq)
      const env = ctx.createGain()
      const t = ctx.currentTime
      env.gain.setValueAtTime(0.0001, t)
      env.gain.linearRampToValueAtTime(1, t + Math.max(0.015, ws.attack))
      ws.out.connect(env)
      env.connect(ctx.destination)
      ws.start()
      cur = { ws, env, waveform }
    } catch {
      cur = null
    }
  }

  // A press, or a slide onto another key while held. Sliding within the same
  // waveform retunes the held voice (glide or re-strike, as the timbre
  // dictates); anything else starts a fresh press.
  function play(freq, waveform, slide) {
    if (slide && cur && cur.waveform === waveform) cur.ws.retune(freq)
    else press(freq, waveform)
  }

  function stopCurrent(fade) {
    if (!cur || !ctx) return
    const { ws, env } = cur
    cur = null
    try {
      const t = ctx.currentTime
      env.gain.cancelScheduledValues(t)
      env.gain.setValueAtTime(Math.max(0.0002, env.gain.value), t)
      env.gain.exponentialRampToValueAtTime(0.0002, t + fade)
      ws.stop(t + fade + 0.05)
    } catch {
      /* ignore */
    }
  }

  function release() {
    if (!cur || !ctx) return
    if (cur.ws.isStrike) {
      // stop the repeat cycle and let the last hit fade at its natural pace
      const ws = cur.ws
      cur = null
      const tail = ws.ringOut()
      try {
        ws.stop(ctx.currentTime + tail + 0.1)
      } catch {
        /* ignore */
      }
    } else {
      stopCurrent(0.25)
    }
  }

  return { play, release }
}
