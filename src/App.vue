<script setup>
import { reactive, ref, computed, watch, onMounted } from 'vue'
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

import TabBar from './components/TabBar.vue'
import MeterView from './components/MeterView.vue'
import ControlsPanel from './components/ControlsPanel.vue'
import CalibrationPanel from './components/CalibrationPanel.vue'
import SessionsPanel from './components/SessionsPanel.vue'

const settings = reactive(loadSettings())
const sessions = ref(loadSessions())
const overlays = ref([]) // [{ id, name, color, startT, samples }]

const liveSamples = ref([])
const liveStartT = ref(null)

const activeTab = ref('meter')
const userPaused = ref(false) // true only when the user explicitly pauses

const meter = useAudioMeter()

const calibration = computed(() => computeCalibration(settings.calibration.points))

const TITLES = {
  options: 'Options',
  cal: 'Calibration',
  sessions: 'Saved sessions',
}

function buildConfig() {
  return {
    weighting: settings.weighting,
    response: settings.response,
    intervalSec: settings.intervalSec > 0 ? settings.intervalSec : 1,
    aggregation: settings.aggregation,
    calibration: calibration.value,
  }
}

async function tryStart() {
  userPaused.value = false
  if (meter.isRunning.value) return
  if (liveSamples.value.length === 0) liveStartT.value = Date.now()
  const ok = await meter.start(buildConfig(), onSample)
  if (!ok && liveSamples.value.length === 0) liveStartT.value = null
}

function toggleMic() {
  if (meter.isRunning.value) {
    meter.stop()
    userPaused.value = true
  } else {
    tryStart()
  }
}

function onSample(s) {
  liveSamples.value.push(s)
  const cutoff = Date.now() - settings.maxTotalMin * 60000
  const arr = liveSamples.value
  let i = 0
  while (i < arr.length && arr[i].t < cutoff) i++
  if (i > 0) arr.splice(0, i)
}

watch(
  settings,
  () => {
    saveSettings(settings)
    if (meter.isRunning.value) meter.updateConfig(buildConfig())
  },
  { deep: true }
)

// Auto-start on open (the gate handles the case where a tap is required).
onMounted(() => {
  tryStart()
})

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

const showGate = computed(
  () => activeTab.value === 'meter' && !meter.isRunning.value && !userPaused.value
)
</script>

<template>
  <div class="app">
    <main class="screen">
      <!-- Meter -->
      <MeterView
        v-if="activeTab === 'meter'"
        :live-samples="liveSamples"
        :live-start-t="liveStartT"
        :overlays="overlays"
        :settings="settings"
        :is-running="meter.isRunning.value"
        :current-db="meter.currentDb.value"
        :peak-db="meter.peakDb.value"
        @clear="clearLive"
        @reset-peak="meter.resetPeak()"
      />

      <!-- Settings screens -->
      <div v-else class="settings-screen">
        <header class="sh">
          <h1>{{ TITLES[activeTab] }}</h1>
        </header>
        <div class="sh-body">
          <ControlsPanel
            v-if="activeTab === 'options'"
            :settings="settings"
            section="all"
            :is-running="meter.isRunning.value"
            @toggle-mic="toggleMic"
          />
          <CalibrationPanel
            v-else-if="activeTab === 'cal'"
            :settings="settings"
            :current-raw="meter.currentRaw.value"
            :current-db="meter.currentDb.value"
            :is-running="meter.isRunning.value"
          />
          <SessionsPanel
            v-else-if="activeTab === 'sessions'"
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
      </div>

      <!-- Microphone permission / start gate -->
      <div v-if="showGate" class="mic-gate">
        <div class="gate-card">
          <svg viewBox="0 0 24 24" width="46" height="46">
            <path
              d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M5 11a7 7 0 0 0 14 0 M12 18v3"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <h2>Enable microphone</h2>
          <p>
            {{
              meter.error.value ||
              'Tap to allow microphone access and start measuring. Requires HTTPS or localhost.'
            }}
          </p>
          <button class="gate-btn" @click="tryStart">Enable &amp; start</button>
        </div>
      </div>
    </main>

    <TabBar v-model="activeTab" :overlay-count="overlays.length" />
  </div>
</template>

<style scoped>
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.screen {
  flex: 1;
  min-height: 0;
  position: relative;
}

.settings-screen {
  height: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 20px;
}
.sh {
  position: sticky;
  top: 0;
  background: linear-gradient(#0f1320 70%, rgba(15, 19, 32, 0));
  padding: calc(var(--safe-t) + 14px) 16px 10px;
  z-index: 2;
}
.sh h1 {
  margin: 0;
  font-size: 22px;
}
.sh-body {
  padding: 0 16px;
  max-width: 640px;
  margin: 0 auto;
}

.mic-gate {
  position: absolute;
  inset: 0;
  background: rgba(8, 11, 20, 0.86);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 5;
}
.gate-card {
  text-align: center;
  max-width: 320px;
  color: var(--fg);
}
.gate-card svg {
  color: var(--accent);
}
.gate-card h2 {
  margin: 10px 0 6px;
  font-size: 20px;
}
.gate-card p {
  font-size: 14px;
  opacity: 0.7;
  line-height: 1.5;
  margin: 0 0 18px;
}
.gate-btn {
  border: none;
  background: #2bb673;
  color: #fff;
  border-radius: 12px;
  padding: 14px 26px;
  font-size: 16px;
  font-weight: 600;
}

/* On a wide (desktop) screen, keep it centered like an app frame. */
@media (min-width: 900px) and (orientation: landscape) {
  .app {
    max-width: 1200px;
    margin: 0 auto;
  }
}
</style>
