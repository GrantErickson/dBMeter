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

function setAuto(on) {
  props.settings.autoMode = on
}

function capture(i) {
  if (!Number.isFinite(props.currentRaw)) return
  // Round to 0.1 to keep stored values tidy.
  points.value[i].raw = Math.round(props.currentRaw * 10) / 10
  // Capturing a reference means the user is calibrating -> leave Auto mode.
  props.settings.autoMode = false
}
function clearPoint(i) {
  points.value[i].raw = null
  points.value[i].known = null
}
</script>

<template>
  <div class="panel">
    <div class="seg mode">
      <button :class="{ active: settings.autoMode }" @click="setAuto(true)">
        Auto (relative)
      </button>
      <button :class="{ active: !settings.autoMode }" @click="setAuto(false)">
        Calibrated
      </button>
    </div>

    <p v-if="settings.autoMode" class="mode-note">
      <b>Auto mode.</b> Readings are uncalibrated, so the numbers are
      <em>probably not true dB</em> — but the graph automatically scales to the
      quietest and loudest sounds it has heard, which makes it easy to read
      <b>relative</b> levels. Capture a reference below to switch to real dB.
    </p>
    <p v-else class="mode-note">
      <b>Calibrated mode.</b> Readings are mapped to real dB SPL using the
      reference points below, and the graph uses the fixed Min/Max scale from
      Settings. Switch back to <b>Auto</b> any time for relative levels.
    </p>

    <p class="hint">
      To calibrate: play a sound at a known level (measured with a reference
      meter), capture the raw reading, then type the true dB. Two points give a
      full linear calibration; one point gives a simple offset.
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
.seg.mode {
  display: flex;
  width: 100%;
}
.seg.mode button {
  flex: 1;
}
.mode-note {
  font-size: 13px;
  line-height: 1.5;
  opacity: 0.85;
  margin: 0;
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
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  align-items: end;
}
.cal-grid button {
  width: 100%;
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
  border-radius: 8px;
  padding: 9px 10px;
  font-size: 16px;
  width: 100%;
}
button.cap,
button.clr {
  border: none;
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  font-size: 13px;
  min-height: 40px;
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
