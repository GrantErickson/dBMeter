<script setup>
import { computed } from 'vue'
import DbGraph from './DbGraph.vue'
import { dbToColor } from '../lib/color.js'
import { fmtFreq } from '../lib/freq.js'
import { useFullscreen } from '../composables/useFullscreen.js'

const {
  isFullscreen,
  supported: fsSupported,
  toggle: toggleFullscreen,
} = useFullscreen()

const props = defineProps({
  liveSamples: { type: Array, default: () => [] },
  liveStartT: { type: Number, default: null },
  overlays: { type: Array, default: () => [] },
  settings: { type: Object, required: true },
  range: { type: Object, default: null }, // { min, max } effective dB scale
  isRunning: { type: Boolean, default: false },
  currentDb: { type: Number, default: -Infinity },
  peakDb: { type: Number, default: -Infinity },
  freqSamples: { type: Object, default: () => ({}) }, // { [id]: [{ t, db }] }
  currentFreqs: { type: Object, default: () => ({}) }, // { [id]: live dB }
})
const emit = defineEmits(['clear', 'reset-peak', 'toggle-mic'])

// Live value text for a tracked frequency (recorded for all tracks regardless
// of whether their line is currently shown).
function freqValText(id) {
  const v = props.currentFreqs[id]
  return Number.isFinite(v) ? v.toFixed(0) : '--'
}

const rng = computed(() =>
  props.range || { min: props.settings.graphMin, max: props.settings.maxDb }
)

const dbText = computed(() =>
  Number.isFinite(props.currentDb) ? props.currentDb.toFixed(1) : '--.-'
)
const peakText = computed(() =>
  Number.isFinite(props.peakDb) ? props.peakDb.toFixed(1) : '--.-'
)
const color = computed(() =>
  Number.isFinite(props.currentDb)
    ? dbToColor(props.currentDb, rng.value.min, rng.value.max)
    : '#9aa3b8'
)
const fill = computed(() => {
  if (!Number.isFinite(props.currentDb)) return 0
  const n =
    (props.currentDb - rng.value.min) / (rng.value.max - rng.value.min || 1)
  return Math.max(0, Math.min(1, n))
})
</script>

<template>
  <div class="meter">
    <!-- Portrait: prominent readout above the graph -->
    <div class="readout-bar">
      <div class="rb-main">
        <span class="rb-db" :style="{ color }">{{ dbText }}</span>
        <span class="rb-unit">dB</span>
      </div>
      <div class="rb-side">
        <div class="rb-meta">
          {{ settings.weighting }} · {{ settings.response === 'slow' ? 'Slow' : 'Fast' }}
        </div>
        <button class="rb-peak" title="Tap to reset peak" @click="emit('reset-peak')">
          peak {{ peakText }}
        </button>
      </div>
    </div>
    <div class="rb-bar">
      <div class="rb-fill" :style="{ width: fill * 100 + '%', background: color }"></div>
    </div>

    <!-- Graph host: fills remaining space; HUD overlays on top -->
    <div class="graph-host">
      <DbGraph
        :live-samples="liveSamples"
        :live-start-t="liveStartT"
        :overlays="overlays"
        :settings="settings"
        :range="rng"
        :is-running="isRunning"
        :freq-samples="freqSamples"
        :show-freq="settings.freqOverlayOn"
      />

      <!-- Landscape HUD readout (top-left over the graph) -->
      <div class="hud-readout">
        <div class="hr-db" :style="{ color }">
          {{ dbText }}<small>dB</small>
        </div>
        <div class="hr-meta">
          {{ settings.weighting }} · {{ settings.response === 'slow' ? 'Slow' : 'Fast' }} ·
          <button class="hr-peak" title="Tap to reset peak" @click="emit('reset-peak')">
            pk {{ peakText }}
          </button>
        </div>
      </div>

      <!-- Actions (top-right over the graph, both orientations) -->
      <div class="hud-actions">
        <button
          class="hud-play"
          :title="isRunning ? 'Pause' : 'Resume'"
          @click="emit('toggle-mic')"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              v-if="isRunning"
              d="M7 5h3v14H7z M14 5h3v14h-3z"
              fill="currentColor"
            />
            <path v-else d="M8 5l12 7-12 7z" fill="currentColor" />
          </svg>
        </button>
        <button
          v-if="fsSupported"
          class="hud-icon"
          :title="isFullscreen ? 'Exit full screen' : 'Full screen'"
          @click="toggleFullscreen"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              :d="
                isFullscreen
                  ? 'M8 3v3a2 2 0 0 1-2 2H3 M21 8h-3a2 2 0 0 1-2-2V3 M3 16h3a2 2 0 0 1 2 2v3 M16 21v-3a2 2 0 0 1 2-2h3'
                  : 'M8 3H5a2 2 0 0 0-2 2v3 M21 8V5a2 2 0 0 0-2-2h-3 M16 21h3a2 2 0 0 0 2-2v-3 M3 16v3a2 2 0 0 0 2 2h3'
              "
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button
          v-if="settings.freqTracks.length"
          class="hud-toggle"
          :class="{ active: settings.freqOverlayOn }"
          :title="
            settings.freqOverlayOn
              ? 'Hide frequency tracking'
              : 'Show frequency tracking'
          "
          @click="settings.freqOverlayOn = !settings.freqOverlayOn"
        >
          Hz
        </button>
        <button
          v-if="settings.freqOverlayOn && settings.freqTracks.length"
          class="hud-icon"
          :class="{ active: settings.freqOnly }"
          :title="
            settings.freqOnly
              ? 'Show the level bars too'
              : 'Show only the frequency lines'
          "
          @click="settings.freqOnly = !settings.freqOnly"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              d="M5 20V11 M12 20V5 M19 20v-6"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
            <path
              v-if="settings.freqOnly"
              d="M4 20 20 4"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </button>
        <div class="seg compact">
          <button
            :class="{ active: settings.mode === 'log' }"
            @click="settings.mode = 'log'"
          >
            Log
          </button>
          <button
            :class="{ active: settings.mode === 'linear' }"
            @click="settings.mode = 'linear'"
          >
            2 min
          </button>
        </div>
        <button class="clear" @click="emit('clear')">Clear</button>
      </div>

      <!-- Status / overlay chips (bottom) -->
      <div class="hud-foot">
        <span v-if="!isRunning" class="paused">● mic paused</span>
        <span
          v-for="o in overlays"
          :key="o.id"
          class="chip"
          :style="{ borderColor: o.color, color: o.color }"
          >{{ o.name }}</span
        >
        <template v-if="settings.freqOverlayOn">
          <button
            v-for="t in settings.freqTracks"
            :key="'f' + t.id"
            class="chip freq-chip"
            :class="{ off: t.enabled === false }"
            :style="
              t.enabled !== false ? { borderColor: t.color, color: t.color } : {}
            "
            :title="t.enabled !== false ? 'Hide this line' : 'Show this line'"
            @click="t.enabled = t.enabled === false"
          >
            {{ fmtFreq(t.freq)
            }}<template v-if="t.enabled !== false">
              · {{ freqValText(t.id) }}</template
            >
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.meter {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: calc(var(--safe-t) + 6px) 8px 6px;
  gap: 6px;
}

/* ----- portrait readout bar ----- */
.readout-bar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 2px 6px 0;
}
.rb-main {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.rb-db {
  font-size: 52px;
  font-weight: 700;
  line-height: 0.95;
  font-variant-numeric: tabular-nums;
}
.rb-unit {
  font-size: 18px;
  opacity: 0.6;
}
.rb-side {
  text-align: right;
  font-size: 12px;
  opacity: 0.7;
  line-height: 1.4;
}
.rb-peak {
  border: none;
  background: rgba(255, 255, 255, 0.07);
  color: inherit;
  border-radius: 7px;
  padding: 4px 9px;
  font-size: 12px;
  margin-top: 2px;
}
.rb-bar {
  height: 8px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
  margin: 0 6px;
}
.rb-fill {
  height: 100%;
  transition: width 0.08s linear;
}

/* ----- graph host ----- */
.graph-host {
  position: relative;
  flex: 1;
  min-height: 0;
}
.graph-host :deep(.graph-wrap) {
  height: 100%;
}

.hud-readout {
  display: none; /* shown in landscape */
  position: absolute;
  top: 20px;
  left: 56px; /* clear of the dB axis labels */
  pointer-events: none;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.7);
}
.hr-db {
  font-size: 40px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.hr-db small {
  font-size: 16px;
  opacity: 0.6;
  margin-left: 4px;
}
.hr-meta {
  font-size: 12px;
  opacity: 0.8;
  margin-top: 6px;
}
.hr-peak {
  pointer-events: auto; /* parent .hud-readout disables pointer events */
  border: none;
  background: rgba(255, 255, 255, 0.12);
  color: inherit;
  border-radius: 6px;
  padding: 2px 7px;
  font: inherit;
  cursor: pointer;
}

.hud-actions {
  position: absolute;
  top: 24px;
  right: 26px;
  display: flex;
  align-items: center;
  gap: 7px;
}
.seg.compact {
  padding: 2px;
  border-radius: 8px;
}
.seg.compact button {
  padding: 4px 9px;
  font-size: 12px;
  min-height: 26px;
}
.clear {
  border: none;
  background: rgba(224, 80, 107, 0.92);
  color: #fff;
  border-radius: 8px;
  padding: 5px 11px;
  font-size: 12px;
  font-weight: 600;
  min-height: 28px;
}
.hud-toggle {
  border: none;
  background: rgba(20, 26, 43, 0.85);
  color: rgba(255, 255, 255, 0.75);
  border-radius: 8px;
  padding: 5px 11px;
  font-size: 12px;
  font-weight: 700;
  min-height: 28px;
  letter-spacing: 0.02em;
}
.hud-toggle.active {
  background: var(--accent);
  color: #fff;
}
.hud-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: rgba(20, 26, 43, 0.85);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.hud-icon.active {
  background: var(--accent);
  color: #fff;
}
/* Pause/play: a bit larger than the icon buttons, smaller than the readout. */
.hud-play {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: rgba(20, 26, 43, 0.9);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin-right: 2px;
}

.hud-foot {
  position: absolute;
  left: 54px; /* clear of the dB axis labels */
  bottom: 32px; /* clear of the time (x) axis labels */
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  pointer-events: none;
}
.chip {
  font-size: 11px;
  border: 1px solid;
  border-radius: 999px;
  padding: 2px 8px;
  background: rgba(12, 15, 26, 0.6);
}
/* Frequency chips are tappable to show/hide their line (the foot is otherwise
   pointer-events:none so it never blocks the graph underneath). */
.chip.freq-chip {
  pointer-events: auto;
  cursor: pointer;
  font-family: inherit;
  line-height: 1.4;
}
.chip.off {
  border-color: rgba(255, 255, 255, 0.22);
  color: rgba(255, 255, 255, 0.4);
}
.paused {
  font-size: 11px;
  color: #ffb3c0;
  background: rgba(12, 15, 26, 0.6);
  border-radius: 999px;
  padding: 2px 8px;
}

/* ----- landscape: graph takes the screen, readout superimposed ----- */
@media (orientation: landscape) {
  .readout-bar,
  .rb-bar {
    display: none;
  }
  .meter {
    padding: 4px 8px 4px;
  }
  .hud-readout {
    display: block;
  }
}
</style>
