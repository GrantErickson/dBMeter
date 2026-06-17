<script setup>
import {
  reactive,
  ref,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
} from "vue";
import { useAudioMeter } from "./composables/useAudioMeter.js";
import { computeCalibration } from "./lib/calibration.js";
import { shouldIdlePause } from "./lib/idle.js";
import {
  loadSettings,
  saveSettings,
  loadSessions,
  saveSessions,
  uid,
} from "./lib/storage.js";
import { OVERLAY_COLORS } from "./lib/color.js";

import TabBar from "./components/TabBar.vue";
import MeterView from "./components/MeterView.vue";
import ControlsPanel from "./components/ControlsPanel.vue";
import CalibrationPanel from "./components/CalibrationPanel.vue";
import SessionsPanel from "./components/SessionsPanel.vue";
import HelpView from "./components/HelpView.vue";
import PWAInstallPrompt from "./components/PWAInstallPrompt.vue";
import PWAInstallButton from "./components/PWAInstallButton.vue";

const HELP_KEY = "dbmeter.helpseen.v1";
let helpSeenInitially = false;
try {
  helpSeenInitially = !!localStorage.getItem(HELP_KEY);
} catch {
  /* storage unavailable */
}

const settings = reactive(loadSettings());
const sessions = ref(loadSessions());
const overlays = ref([]); // [{ id, name, color, startT, samples }]

const liveSamples = ref([]);
const liveStartT = ref(null);

// First launch opens the Help screen; afterwards it goes straight to the graph.
const activeTab = ref(helpSeenInitially ? "meter" : "help");
const helpFirstRun = ref(!helpSeenInitially);
const userPaused = ref(false); // true only when the user explicitly pauses
const starting = ref(false); // true while a mic-start attempt is in flight
const idlePaused = ref(false); // true when the 1-hour idle timer paused the mic

function closeHelp() {
  helpFirstRun.value = false;
  try {
    localStorage.setItem(HELP_KEY, "1");
  } catch {
    /* ignore */
  }
  activeTab.value = "meter";
}

const meter = useAudioMeter();

// Calibration actually applied to readings. In Auto mode we deliberately leave
// readings uncalibrated (relative) and let the graph range auto-scale instead.
const IDENTITY_CAL = { slope: 1, offset: 0, points: 0 };
const appliedCalibration = computed(() =>
  settings.autoMode
    ? IDENTITY_CAL
    : computeCalibration(settings.calibration.points),
);

// Effective dB range for the y-axis and colours.
//  - calibrated: the fixed Min/Max the user set in Options
//  - auto: fits the quietest..loudest levels heard so far (live + overlays)
const displayRange = computed(() => {
  if (!settings.autoMode) {
    return { min: settings.graphMin, max: settings.maxDb };
  }
  let lo = Infinity;
  let hi = -Infinity;
  const scan = (arr) => {
    for (const s of arr) {
      if (s.db < lo) lo = s.db;
      if (s.db > hi) hi = s.db;
    }
  };
  scan(liveSamples.value);
  for (const o of overlays.value) scan(o.samples);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    return { min: -90, max: -20 }; // neutral relative window until sound arrives
  }
  let span = hi - lo;
  if (span < 6) {
    const mid = (hi + lo) / 2;
    lo = mid - 3;
    hi = mid + 3;
    span = 6;
  }
  const pad = span * 0.12;
  return { min: Math.floor(lo - pad), max: Math.ceil(hi + pad) };
});

const TITLES = {
  options: "Options",
  cal: "Calibration",
  sessions: "Saved sessions",
};

function buildConfig() {
  return {
    weighting: settings.weighting,
    response: settings.response,
    intervalSec: settings.intervalSec > 0 ? settings.intervalSec : 1,
    aggregation: settings.aggregation,
    calibration: appliedCalibration.value,
  };
}

async function tryStart() {
  userPaused.value = false;
  idlePaused.value = false; // resuming clears the idle-pause prompt
  if (meter.isRunning.value) return;
  // Mark the attempt as in-flight in the same tick we clear userPaused, so the
  // mic gate doesn't flash during the (async) getUserMedia handshake. It only
  // reappears below if the start actually fails (e.g. permission denied).
  starting.value = true;
  try {
    if (liveSamples.value.length === 0) liveStartT.value = Date.now();
    const ok = await meter.start(buildConfig(), onSample);
    if (!ok && liveSamples.value.length === 0) liveStartT.value = null;
  } finally {
    starting.value = false;
  }
}

function pauseMic() {
  if (meter.isRunning.value) {
    meter.stop();
    userPaused.value = true;
  }
}

function toggleMic() {
  if (meter.isRunning.value) pauseMic();
  else tryStart();
}

// ---- auto-pause after an hour hidden / not visited ----
let hiddenSince =
  typeof document !== "undefined" && document.hidden ? Date.now() : null;
let idleTimer = null;

function onVisibility() {
  if (document.hidden) {
    if (hiddenSince === null) hiddenSince = Date.now();
  } else {
    hiddenSince = null; // a visit resets the idle clock
  }
}

function checkIdle() {
  if (shouldIdlePause(hiddenSince, Date.now(), meter.isRunning.value)) {
    pauseMic();
    // Flag it as an automatic pause so we can show a clear resume prompt,
    // unlike a manual pause which just shows the small ▶ button.
    idlePaused.value = true;
  }
}

function onSample(s) {
  liveSamples.value.push(s);
  const cutoff = Date.now() - settings.maxTotalMin * 60000;
  const arr = liveSamples.value;
  let i = 0;
  while (i < arr.length && arr[i].t < cutoff) i++;
  if (i > 0) arr.splice(0, i);
}

watch(
  settings,
  () => {
    saveSettings(settings);
    if (meter.isRunning.value) meter.updateConfig(buildConfig());
  },
  { deep: true },
);

// Changing the applied calibration (Auto <-> Calibrated, or editing points)
// changes the dB scale, so the existing buffer would mix scales. Clear it.
watch(
  () => `${appliedCalibration.value.slope}:${appliedCalibration.value.offset}`,
  () => clearLive(),
);

// Auto-start on open (the gate handles the case where a tap is required).
onMounted(() => {
  tryStart();
  document.addEventListener("visibilitychange", onVisibility);
  idleTimer = setInterval(checkIdle, 60000); // check every minute
});
onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", onVisibility);
  if (idleTimer) clearInterval(idleTimer);
});

// ---- sessions ----
function saveCurrent(name) {
  if (!liveSamples.value.length) return;
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
  };
  sessions.value = [session, ...sessions.value];
  saveSessions(sessions.value);
}

function toggleOverlay(session) {
  const i = overlays.value.findIndex((o) => o.id === session.id);
  if (i >= 0) {
    overlays.value.splice(i, 1);
    return;
  }
  const used = new Set(overlays.value.map((o) => o.color));
  const color =
    OVERLAY_COLORS.find((c) => !used.has(c)) ||
    OVERLAY_COLORS[overlays.value.length % OVERLAY_COLORS.length];
  overlays.value.push({
    id: session.id,
    name: session.name,
    color,
    startT: session.startT,
    samples: session.samples,
  });
}

function deleteSession(session) {
  sessions.value = sessions.value.filter((s) => s.id !== session.id);
  overlays.value = overlays.value.filter((o) => o.id !== session.id);
  saveSessions(sessions.value);
}

function clearLive() {
  liveSamples.value = [];
  liveStartT.value = meter.isRunning.value ? Date.now() : null;
  meter.resetPeak();
}

const showGate = computed(
  () =>
    activeTab.value === "meter" &&
    !meter.isRunning.value &&
    !userPaused.value &&
    !starting.value,
);

// Deliberate, persistent prompt shown after the 1-hour idle auto-pause (a
// manual pause stays out of the way with just the ▶ button). Mutually exclusive
// with showGate, which requires !userPaused.
const showIdleResume = computed(
  () =>
    activeTab.value === "meter" &&
    idlePaused.value &&
    !meter.isRunning.value &&
    !starting.value,
);
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
        :range="displayRange"
        :is-running="meter.isRunning.value"
        :current-db="meter.currentDb.value"
        :peak-db="meter.peakDb.value"
        @clear="clearLive"
        @reset-peak="meter.resetPeak()"
        @toggle-mic="toggleMic"
      />

      <!-- Help / first-run guide -->
      <HelpView
        v-else-if="activeTab === 'help'"
        :first-run="helpFirstRun"
        @close="closeHelp"
      />

      <!-- Settings screens -->
      <div v-else class="settings-screen">
        <header class="sh">
          <h1>{{ TITLES[activeTab] }}</h1>
        </header>
        <div class="sh-body">
          <template v-if="activeTab === 'options'">
            <ControlsPanel
              :settings="settings"
              section="all"
              :is-running="meter.isRunning.value"
              @toggle-mic="toggleMic"
            />
            <PWAInstallButton />
          </template>
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
              "Tap to allow microphone access and start measuring. Requires HTTPS or localhost."
            }}
          </p>
          <button class="gate-btn" @click="tryStart">Enable &amp; start</button>
        </div>
      </div>

      <!-- Resume prompt after the 1-hour idle auto-pause -->
      <div v-if="showIdleResume" class="mic-gate">
        <div class="gate-card">
          <svg viewBox="0 0 24 24" width="46" height="46">
            <circle
              cx="12"
              cy="12"
              r="9"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
            />
            <path
              d="M10 9.5v5 M14 9.5v5"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
            />
          </svg>
          <h2>Monitoring paused</h2>
          <p>
            The microphone was paused after an hour in the background, to save
            battery and protect your privacy.
          </p>
          <button class="gate-btn" @click="tryStart">Resume monitoring</button>
        </div>
      </div>
    </main>

    <!-- Offer to install as an app (Android/desktop button, iOS instructions).
         Sits above the tab bar so it never covers navigation. -->
    <PWAInstallPrompt />

    <!-- Tab bar stays visible everywhere except the first-run welcome guide. -->
    <TabBar
      v-if="!(activeTab === 'help' && helpFirstRun)"
      v-model="activeTab"
      :overlay-count="overlays.length"
    />
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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
