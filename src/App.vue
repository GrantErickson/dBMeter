<script setup>
import { reactive, ref, computed, watch } from 'vue'
import { useAudioMeter } from './composables/useAudioMeter.js'
import { computeCalibration } from './lib/calibration.js'
import {
  loadSettings,
  saveSettings,
  loadSessions,
  saveSessions,
  uid,
} from './lib/storage.js'
import { OVERLAY_COLORS } from './lib/color.js'

import MeterReadout from './components/MeterReadout.vue'
import DbGraph from './components/DbGraph.vue'
import ControlsPanel from './components/ControlsPanel.vue'
import CalibrationPanel from './components/CalibrationPanel.vue'
import SessionsPanel from './components/SessionsPanel.vue'

const settings = reactive(loadSettings())
const sessions = ref(loadSessions())
const overlays = ref([]) // [{ id, name, color, startT, samples }]

const liveSamples = ref([])
const liveStartT = ref(null)

const meter = useAudioMeter()

const calibration = computed(() => computeCalibration(settings.calibration.points))

function buildConfig() {
  return {
    weighting: settings.weighting,
    response: settings.response,
    intervalSec: settings.intervalSec > 0 ? settings.intervalSec : 1,
    aggregation: settings.aggregation,
    calibration: calibration.value,
  }
}

async function startMeter() {
  if (liveSamples.value.length === 0) liveStartT.value = Date.now()
  const ok = await meter.start(buildConfig(), onSample)
  if (!ok && liveSamples.value.length === 0) liveStartT.value = null
}

function stopMeter() {
  meter.stop()
}

function onSample(s) {
  liveSamples.value.push(s)
  // Drop anything older than the configured timeline length.
  const cutoff = Date.now() - settings.maxTotalMin * 60000
  const arr = liveSamples.value
  let i = 0
  while (i < arr.length && arr[i].t < cutoff) i++
  if (i > 0) arr.splice(0, i)
}

// Persist settings and push live changes to the running meter.
watch(
  settings,
  () => {
    saveSettings(settings)
    if (meter.isRunning.value) meter.updateConfig(buildConfig())
  },
  { deep: true }
)

// ---- sessions ----
function saveCurrent(name) {
  if (!liveSamples.value.length) return
  const session = {
    id: uid(),
    name,
    savedAt: Date.now(),
    startT: liveStartT.value,
    samples: liveSamples.value.map((x) => ({ t: x.t, db: x.db })),
    settings: {
      weighting: settings.weighting,
      response: settings.response,
      aggregation: settings.aggregation,
      intervalSec: settings.intervalSec,
    },
  }
  sessions.value = [session, ...sessions.value]
  saveSessions(sessions.value)
}

function toggleOverlay(session) {
  const i = overlays.value.findIndex((o) => o.id === session.id)
  if (i >= 0) {
    overlays.value.splice(i, 1)
    return
  }
  const used = new Set(overlays.value.map((o) => o.color))
  const color =
    OVERLAY_COLORS.find((c) => !used.has(c)) ||
    OVERLAY_COLORS[overlays.value.length % OVERLAY_COLORS.length]
  overlays.value.push({
    id: session.id,
    name: session.name,
    color,
    startT: session.startT,
    samples: session.samples,
  })
}

function deleteSession(session) {
  sessions.value = sessions.value.filter((s) => s.id !== session.id)
  overlays.value = overlays.value.filter((o) => o.id !== session.id)
  saveSessions(sessions.value)
}

function clearLive() {
  liveSamples.value = []
  liveStartT.value = meter.isRunning.value ? Date.now() : null
  meter.resetPeak()
}

const elapsedLabel = computed(() => {
  if (!liveStartT.value || !liveSamples.value.length) return '0:00'
  const ms = liveSamples.value[liveSamples.value.length - 1].t - liveStartT.value
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = (total % 60).toString().padStart(2, '0')
  return `${m}:${s}`
})
</script>

<template>
  <div class="app">
    <header>
      <div class="title">
        <h1>dB Meter</h1>
        <span class="elapsed">{{ elapsedLabel }}</span>
      </div>
      <div class="actions">
        <button
          v-if="!meter.isRunning.value"
          class="primary"
          @click="startMeter"
        >
          ● Start
        </button>
        <button v-else class="stop" @click="stopMeter">■ Stop</button>
      </div>
    </header>

    <p v-if="meter.error.value" class="error">{{ meter.error.value }}</p>

    <section class="top">
      <MeterReadout
        :current-db="meter.currentDb.value"
        :peak-db="meter.peakDb.value"
        :settings="settings"
        :is-running="meter.isRunning.value"
      />
    </section>

    <section class="graph">
      <DbGraph
        :live-samples="liveSamples"
        :live-start-t="liveStartT"
        :overlays="overlays"
        :settings="settings"
        :is-running="meter.isRunning.value"
      />
      <div class="legend">
        <span class="lg lo"></span> {{ settings.graphMin }} dB
        <span class="lg mid"></span> mid
        <span class="lg hi"></span> {{ settings.maxDb }} dB
        <span class="sep"></span>
        <template v-for="o in overlays" :key="o.id">
          <span class="lg" :style="{ background: o.color }"></span>{{ o.name }}
        </template>
      </div>
    </section>

    <section class="panels">
      <div class="card">
        <ControlsPanel :settings="settings" />
      </div>
      <div class="card">
        <CalibrationPanel
          :settings="settings"
          :current-raw="meter.currentRaw.value"
          :current-db="meter.currentDb.value"
          :is-running="meter.isRunning.value"
        />
      </div>
      <div class="card">
        <SessionsPanel
          :sessions="sessions"
          :overlays="overlays"
          :can-save="liveSamples.length > 0"
          :live-count="liveSamples.length"
          @save="saveCurrent"
          @toggle="toggleOverlay"
          @delete="deleteSession"
          @clear-live="clearLive"
        />
      </div>
    </section>

    <footer>
      Settings &amp; sessions are stored locally in your browser. Microphone
      access requires HTTPS (or localhost).
    </footer>
  </div>
</template>

<style scoped>
.app {
  max-width: 1100px;
  margin: 0 auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.title {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
h1 {
  font-size: 22px;
  margin: 0;
}
.elapsed {
  font-variant-numeric: tabular-nums;
  opacity: 0.6;
  font-size: 14px;
}
.actions button {
  border: none;
  border-radius: 8px;
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.primary {
  background: #2bb673;
  color: #fff;
}
.stop {
  background: #e0506b;
  color: #fff;
}
.error {
  background: rgba(224, 80, 107, 0.15);
  border: 1px solid rgba(224, 80, 107, 0.4);
  color: #ffb3c0;
  padding: 8px 12px;
  border-radius: 8px;
  margin: 0;
  font-size: 13px;
}
.top {
  background: #141a2b;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 16px;
}
.graph {
  background: #141a2b;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.graph :deep(.graph-wrap) {
  height: 340px;
}
.legend {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  opacity: 0.7;
  flex-wrap: wrap;
}
.legend .lg {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  display: inline-block;
}
.legend .lo {
  background: hsl(120, 85%, 50%);
}
.legend .mid {
  background: hsl(60, 85%, 50%);
}
.legend .hi {
  background: hsl(0, 85%, 50%);
}
.legend .sep {
  width: 1px;
  height: 14px;
  background: rgba(255, 255, 255, 0.2);
  margin: 0 4px;
}
.panels {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 14px;
}
.card {
  background: #141a2b;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 14px;
}
footer {
  text-align: center;
  font-size: 11px;
  opacity: 0.45;
  padding: 8px 0 16px;
}
</style>
