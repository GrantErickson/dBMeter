// Size a canvas's backing store to the device pixel ratio and scale its 2D
// context so all drawing code can work in CSS pixels. Shared by the time-series
// graph and the spectrum analyser.
export function resizeCanvasToDpr(canvas, ctx) {
  const r = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.round(r.width * dpr))
  canvas.height = Math.max(1, Math.round(r.height * dpr))
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}
