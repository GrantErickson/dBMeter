<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { freqToMidi, midiToFreq, isBlackKey, noteName } from '../lib/notes.js'
import { resizeCanvasToDpr } from '../lib/canvas.js'

// A playable piano keyboard (canvas) with equal-width keys, used by the Tone
// tab. Shows as many whole octaves as fit the width; ‹ › shift the window an
// octave at a time. Tap or slide to play: emits 'note' ({ midi, freq }) on
// every new key under the pointer and 'release' when it lifts — what the
// sound *is* (piano voice or generator retune) is the parent's decision.

const props = defineProps({
  // Frequency (Hz) whose nearest key is highlighted — the generator's tone.
  activeFreq: { type: Number, default: null },
})
const emit = defineEmits(['note', 'release'])

const canvas = ref(null)
let ctx = null
let ro = null
let keys = [] // hit-test rects, rebuilt by draw()
let pressed = null // midi of the key under the pointer, or null
let sliding = false

const MIN_START = 24 // C1
const TOP = 108 // C8 — the shown window never extends past the piano's top
const WHITE_W = 25 // px, minimum white-key width used to pick the octave count

const startMidi = ref(48) // always a C; default C3 keeps A4 on screen
const octaves = ref(2)

const maxStart = computed(() => TOP - octaves.value * 12)
const rangeLabel = computed(
  () =>
    noteName(startMidi.value) +
    ' – ' +
    noteName(startMidi.value + octaves.value * 12 - 1)
)

function shift(dir) {
  const next = startMidi.value + dir * 12
  startMidi.value = Math.max(MIN_START, Math.min(maxStart.value, next))
  draw()
}

function activeMidi() {
  const f = props.activeFreq
  if (!Number.isFinite(f) || f <= 0) return null
  return Math.round(freqToMidi(f))
}

function resize() {
  const c = canvas.value
  if (!c || !ctx) return
  resizeCanvasToDpr(c, ctx)
  octaves.value = Math.max(1, Math.min(5, Math.floor(c.clientWidth / (7 * WHITE_W))))
  if (startMidi.value > maxStart.value) startMidi.value = maxStart.value
  draw()
}

function draw() {
  const c = canvas.value
  if (!c || !ctx) return
  const w = c.clientWidth
  const h = c.clientHeight
  ctx.clearRect(0, 0, w, h)
  keys = []
  if (w <= 0 || h <= 0) return

  const lo = startMidi.value
  const hi = lo + octaves.value * 12 - 1
  const kw = w / (octaves.value * 7)
  const active = activeMidi()

  // White keys: equal widths, C labels along the bottom.
  ctx.font = '10px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  let x = 0
  for (let m = lo; m <= hi; m++) {
    if (isBlackKey(m)) continue
    keys.push({ midi: m, left: x, right: x + kw, top: 0, bottom: h, black: false })
    ctx.fillStyle =
      m === pressed ? '#2bb673' : m === active ? '#3b6cff' : '#e9edf6'
    ctx.fillRect(x + 0.5, 0, kw - 1, h)
    if (m % 12 === 0) {
      ctx.fillStyle = m === pressed || m === active ? '#fff' : '#8a8f9c'
      ctx.fillText(noteName(m), x + kw / 2, h - 5)
    }
    x += kw
  }

  // Black keys: centred on the boundary between their neighbours, on top.
  const bw = kw * 0.62
  const bh = h * 0.62
  let whitesBefore = 0
  for (let m = lo; m <= hi; m++) {
    if (!isBlackKey(m)) {
      whitesBefore++
      continue
    }
    const left = whitesBefore * kw - bw / 2
    keys.push({ midi: m, left, right: left + bw, top: 0, bottom: bh, black: true })
    ctx.fillStyle =
      m === pressed ? '#2bb673' : m === active ? '#6f93ff' : '#11151f'
    ctx.fillRect(left, 0, bw, bh)
  }
}

// Which key (if any) is under the pointer; black keys win since they're on top.
function keyAt(e) {
  if (!keys.length || !canvas.value) return null
  const r = canvas.value.getBoundingClientRect()
  const px = e.clientX - r.left
  const py = e.clientY - r.top
  const inside = (k) =>
    px >= k.left && px <= k.right && py >= k.top && py <= k.bottom
  return (
    keys.find((k) => k.black && inside(k)) ||
    keys.find((k) => !k.black && inside(k)) ||
    null
  )
}

function press(midi) {
  pressed = midi
  emit('note', { midi, freq: midiToFreq(midi) })
  draw()
}

function onPointerDown(e) {
  const hit = keyAt(e)
  if (!hit) return
  sliding = true
  press(hit.midi)
  // Capture so a slide keeps tracking even if it strays off the keys.
  try {
    canvas.value.setPointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
}

function onPointerMove(e) {
  if (!sliding) return
  const hit = keyAt(e)
  if (hit && hit.midi !== pressed) press(hit.midi)
}

function onPointerUp(e) {
  if (!sliding) return
  sliding = false
  pressed = null
  emit('release')
  draw()
  try {
    canvas.value.releasePointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
}

watch(() => props.activeFreq, draw)

onMounted(() => {
  ctx = canvas.value.getContext('2d')
  resize()
  ro = new ResizeObserver(resize)
  ro.observe(canvas.value)
})

onBeforeUnmount(() => {
  if (ro) ro.disconnect()
})
</script>

<template>
  <div class="kb">
    <div class="kb-bar">
      <button
        class="oct"
        :disabled="startMidi <= MIN_START"
        aria-label="Shift keyboard an octave down"
        @click="shift(-1)"
      >
        ‹
      </button>
      <span class="range">{{ rangeLabel }}</span>
      <button
        class="oct"
        :disabled="startMidi >= maxStart"
        aria-label="Shift keyboard an octave up"
        @click="shift(1)"
      >
        ›
      </button>
    </div>
    <canvas
      ref="canvas"
      role="img"
      aria-label="Piano keyboard — tap a key to play it and set the frequency"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    ></canvas>
  </div>
</template>

<style scoped>
.kb {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
}
.kb-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex: none;
}
.oct {
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: inherit;
  border-radius: 8px;
  width: 40px;
  min-height: 32px;
  font-size: 18px;
  line-height: 1;
}
.oct:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.range {
  font-size: 12px;
  opacity: 0.65;
  min-width: 72px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
canvas {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: block;
  border-radius: 8px;
  /* keep key slides from scrolling/zooming the page on touch */
  touch-action: none;
}
</style>
