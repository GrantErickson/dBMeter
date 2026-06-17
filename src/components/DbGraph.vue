<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { computeU, ageToFrac } from '../lib/timescale.js'
import { dbToColor } from '../lib/color.js'

const props = defineProps({
  liveSamples: { type: Array, default: () => [] },
  liveStartT: { type: Number, default: null },
  overlays: { type: Array, default: () => [] },
  settings: { type: Object, required: true },
  isRunning: { type: Boolean, default: false },
})

const canvas = ref(null)
let ctx = null
let raf = null
let ro = null

function resize() {
  const c = canvas.value
  if (!c) return
  const r = c.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  c.width = Math.max(1, Math.round(r.width * dpr))
  c.height = Math.max(1, Math.round(r.height * dpr))
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

const TIME_MARKS_LOG = [0, 0.5, 1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 45, 60]
const TIME_MARKS_LIN = [0, 0.5, 1, 1.5, 2]

function fmtAge(min) {
  if (min === 0) return 'now'
  if (min < 1) return Math.round(min * 60) + 's'
  return min % 1 === 0 ? min + 'm' : min.toFixed(1) + 'm'
}

function draw() {
  const c = canvas.value
  if (!c || !ctx) return
  const w = c.clientWidth
  const h = c.clientHeight
  const s = props.settings

  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#0c0f1a'
  ctx.fillRect(0, 0, w, h)

  const padL = 46
  const padR = 12
  const padT = 12
  const padB = 24
  const plot = {
    left: padL,
    right: w - padR,
    top: padT,
    bottom: h - padB,
  }
  plot.w = plot.right - plot.left
  plot.h = plot.bottom - plot.top
  if (plot.w <= 0 || plot.h <= 0) return

  const gMin = s.graphMin
  const gMax = s.maxDb
  const range = gMax - gMin || 1
  const yOf = (db) => plot.bottom - ((Math.max(gMin, Math.min(gMax, db)) - gMin) / range) * plot.h

  // Time reference: "now" is wall-clock while running, else the newest sample.
  const ls = props.liveSamples
  const newestT = ls.length ? ls[ls.length - 1].t : null
  const nowT = props.isRunning ? Date.now() : newestT || Date.now()
  const liveSpanMin = props.liveStartT ? (nowT - props.liveStartT) / 60000 : 0

  // The axis spans the longest of the live session and any recalled overlay, so
  // a recalled session is always fully visible even if the live one is shorter.
  let spanMin = liveSpanMin
  for (const o of props.overlays) {
    if (o.samples && o.samples.length > 1) {
      const dur = (o.samples[o.samples.length - 1].t - o.samples[0].t) / 60000
      if (dur > spanMin) spanMin = dur
    }
  }

  const mode = s.mode
  // log axis grows from 2 min up to maxTotalMin as data accumulates.
  const axisTotal = mode === 'linear' ? 2 : Math.min(s.maxTotalMin, Math.max(2, spanMin))
  const u = mode === 'linear' ? null : computeU(axisTotal)
  const winMax = mode === 'linear' ? 2 : axisTotal

  const mapX = (ageMin) => {
    if (ageMin < 0 || ageMin > winMax) return null
    const frac = mode === 'linear' ? ageMin / 2 : ageToFrac(ageMin, axisTotal, u)
    if (frac > 1) return null
    return plot.right - frac * plot.w
  }

  // ---- horizontal dB grid ----
  ctx.font = '11px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  const step = range <= 40 ? 5 : 10
  const first = Math.ceil(gMin / step) * step
  for (let db = first; db <= gMax; db += step) {
    const y = yOf(db)
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(plot.left, y)
    ctx.lineTo(plot.right, y)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.textAlign = 'right'
    ctx.fillText(db + '', plot.left - 6, y)
  }
  // y-axis caption
  ctx.save()
  ctx.translate(12, (plot.top + plot.bottom) / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillText('dB SPL', 0, 0)
  ctx.restore()

  // ---- vertical time grid ----
  const marks = mode === 'linear' ? TIME_MARKS_LIN : TIME_MARKS_LOG
  ctx.textBaseline = 'top'
  ctx.textAlign = 'center'
  for (const m of marks) {
    if (m > winMax + 1e-9) continue
    const x = mapX(m)
    if (x === null) continue
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.beginPath()
    ctx.moveTo(x, plot.top)
    ctx.lineTo(x, plot.bottom)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.fillText(fmtAge(m), x, plot.bottom + 4)
  }

  // ---- live data as coloured bars ----
  for (let i = 0; i < ls.length; i++) {
    const sa = ls[i]
    const age = (nowT - sa.t) / 60000
    const x = mapX(age)
    if (x === null) continue
    let xRight
    if (i === ls.length - 1) {
      xRight = plot.right
    } else {
      const xr = mapX((nowT - ls[i + 1].t) / 60000)
      xRight = xr === null ? plot.right : xr
    }
    const bw = Math.max(1, xRight - x)
    const y = yOf(sa.db)
    ctx.fillStyle = dbToColor(sa.db, gMin, gMax)
    ctx.fillRect(x, y, bw, plot.bottom - y)
  }

  // ---- overlay (recalled) sessions as lines; each is anchored so its end sits
  //      at "now" (right edge), aligning the high-detail recent regions ----
  for (const o of props.overlays) {
    if (!o.samples || !o.samples.length) continue
    const oEnd = o.samples[o.samples.length - 1].t
    ctx.strokeStyle = o.color
    ctx.lineWidth = 2
    ctx.globalAlpha = 0.9
    ctx.beginPath()
    let started = false
    for (const sa of o.samples) {
      const age = (oEnd - sa.t) / 60000
      const x = mapX(age)
      if (x === null) {
        started = false
        continue
      }
      const y = yOf(sa.db)
      if (!started) {
        ctx.moveTo(x, y)
        started = true
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // ---- frame ----
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 1
  ctx.strokeRect(plot.left, plot.top, plot.w, plot.h)
}

function loop() {
  draw()
  raf = requestAnimationFrame(loop)
}

onMounted(() => {
  ctx = canvas.value.getContext('2d')
  resize()
  ro = new ResizeObserver(resize)
  ro.observe(canvas.value)
  loop()
})

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  if (ro) ro.disconnect()
})
</script>

<template>
  <div class="graph-wrap">
    <canvas ref="canvas"></canvas>
  </div>
</template>

<style scoped>
.graph-wrap {
  width: 100%;
  height: 100%;
}
canvas {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: 10px;
}
</style>
