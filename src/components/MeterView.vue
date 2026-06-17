<script setup>
import { computed } from 'vue'
import DbGraph from './DbGraph.vue'
import { dbToColor } from '../lib/color.js'

const props = defineProps({
  liveSamples: { type: Array, default: () => [] },
  liveStartT: { type: Number, default: null },
  overlays: { type: Array, default: () => [] },
  settings: { type: Object, required: true },
  isRunning: { type: Boolean, default: false },
  currentDb: { type: Number, default: -Infinity },
  peakDb: { type: Number, default: -Infinity },
})
const emit = defineEmits(['clear', 'reset-peak'])

const dbText = computed(() =>
  Number.isFinite(props.currentDb) ? props.currentDb.toFixed(1) : '--.-'
)
const peakText = computed(() =>
  Number.isFinite(props.peakDb) ? props.peakDb.toFixed(1) : '--.-'
)
const color = computed(() =>
  Number.isFinite(props.currentDb)
    ? dbToColor(props.currentDb, props.settings.graphMin, props.settings.maxDb)
    : '#9aa3b8'
)
const fill = computed(() => {
  if (!Number.isFinite(props.currentDb)) return 0
  const n =
    (props.currentDb - props.settings.graphMin) /
    (props.settings.maxDb - props.settings.graphMin || 1)
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
        :is-running="isRunning"
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
  top: 8px;
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
