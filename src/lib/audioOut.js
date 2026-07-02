// Shared speaker-output AudioContext. The mic capture context (useAudioMeter)
// is deliberately separate and never reaches the speakers; everything the app
// *plays* — keyboard taps, the tone generator — goes through this single
// lazily-created context so it can outlive any one view.

let ctx = null

export function getAudioOut() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    ctx = new Ctx()
  }
  // A context created outside a user gesture starts suspended; callers always
  // run from a tap/click, which is exactly when a resume is allowed.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}
