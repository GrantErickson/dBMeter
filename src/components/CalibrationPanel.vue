<script setup>
import { computed } from 'vue'
import { computeCalibration } from '../lib/calibration.js'

const props = defineProps({
  settings: { type: Object, required: true },
  currentRaw: { type: Number, default: -Infinity },
  currentDb: { type: Number, default: -Infinity },
  isRunning: { type: Boolean, default: false },
})

const points = computed(() => props.settings.calibration.points)
const cal = computed(() => computeCalibration(points.value))

const labels = ['Quiet reference', 'Loud reference']

function capture(i) {
  if (!Number.isFinite(props.currentRaw)) return
  // Round to 0.1 to keep stored values tidy.
  points.value[i].raw = Math.round(props.currentRaw * 10) / 10
}
function clearPoint(i) {
  points.value[i].raw = null
  points.value[i].known = null
}
</script>

<template>
  <div class="panel">
    <h2>Calibration</h2>
    <p class="hint">
      Play or produce a sound at a known level (measured with a reference meter),
      capture the raw reading, then type the true dB. Two points give a full
      linear calibration; one point gives a simple offset.
    </p>

    <div class="cal-point" v-for="(p, i) in points" :key="i">
      <div class="cal-head">{{ labels[i] }}</div>
      <div class="cal-grid">
        <div class="field">
          <span class="flbl">Raw</span>
          <span class="raw">{{
            Number.isFinite(p.raw) ? p.raw.toFixed(1) : '—'
          }}</span>
        </div>
        <div class="field">
          <span class="flbl">Known dB</span>
          <input
            type="number"
            step="0.1"
            v-model.number="p.known"
            placeholder="e.g. 60"
          />
        </div>
        <button class="cap" :disabled="!isRunning" @click="capture(i)">
          Capture
        </button>
        <button class="clr" @click="clearPoint(i)">Clear</button>
      </div>
    </div>

    <div class="result">
      <div>
        <span class="rlbl">Points:</span> {{ cal.points }} ·
        <span class="rlbl">slope</span> {{ cal.slope.toFixed(3) }} ·
        <span class="rlbl">offset</span> {{ cal.offset.toFixed(1) }}
      </div>
      <div v-if="isRunning" class="live">
        raw {{ Number.isFinite(currentRaw) ? currentRaw.toFixed(1) : '—' }} →
        <b>{{ Number.isFinite(currentDb) ? currentDb.toFixed(1) : '—' }} dB</b>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
h2 {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.55;
  margin: 6px 0 2px;
}
.hint {
  font-size: 12px;
  opacity: 0.6;
  margin: 0;
  line-height: 1.4;
}
.cal-point {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  padding: 8px 10px;
}
.cal-head {
  font-size: 12px;
  opacity: 0.8;
  margin-bottom: 6px;
}
.cal-grid {
  display: grid;
  grid-template-columns: 1fr 1fr auto auto;
  gap: 8px;
  align-items: center;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.flbl {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.5;
}
.raw {
  font-variant-numeric: tabular-nums;
  font-size: 15px;
}
input[type='number'] {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: inherit;
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 13px;
  width: 100%;
}
button.cap,
button.clr {
  border: none;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
}
button.cap {
  background: #3b6cff;
  color: #fff;
}
button.cap:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
button.clr {
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
}
.result {
  font-size: 12px;
  opacity: 0.85;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rlbl {
  opacity: 0.55;
}
.live {
  opacity: 0.9;
}
</style>
