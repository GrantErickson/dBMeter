<script setup>
import { WEIGHTINGS } from '../lib/weighting.js'

// The settings object is the shared reactive store from App; binding v-model to
// its fields mutates it in place (and App persists it on change).
const props = defineProps({
  settings: { type: Object, required: true },
})
</script>

<template>
  <div class="panel">
    <h2>Measurement</h2>

    <div class="row">
      <label>Weighting</label>
      <div class="seg">
        <button
          v-for="w in WEIGHTINGS"
          :key="w.value"
          :class="{ active: settings.weighting === w.value }"
          @click="settings.weighting = w.value"
        >
          {{ w.label }}
        </button>
      </div>
    </div>

    <div class="row">
      <label>Time response</label>
      <div class="seg">
        <button
          :class="{ active: settings.response === 'fast' }"
          @click="settings.response = 'fast'"
        >
          Fast
        </button>
        <button
          :class="{ active: settings.response === 'slow' }"
          @click="settings.response = 'slow'"
        >
          Slow
        </button>
      </div>
    </div>

    <div class="row">
      <label>Interval value</label>
      <div class="seg">
        <button
          :class="{ active: settings.aggregation === 'avg' }"
          @click="settings.aggregation = 'avg'"
        >
          Average (Leq)
        </button>
        <button
          :class="{ active: settings.aggregation === 'max' }"
          @click="settings.aggregation = 'max'"
        >
          Max
        </button>
      </div>
    </div>

    <div class="row">
      <label>Sampling interval</label>
      <div class="inline">
        <input
          type="number"
          min="0.2"
          max="10"
          step="0.1"
          v-model.number="settings.intervalSec"
        />
        <span class="suffix">s</span>
      </div>
    </div>

    <h2>Graph</h2>

    <div class="row">
      <label>Mode</label>
      <div class="seg">
        <button
          :class="{ active: settings.mode === 'log' }"
          @click="settings.mode = 'log'"
        >
          Logarithmic
        </button>
        <button
          :class="{ active: settings.mode === 'linear' }"
          @click="settings.mode = 'linear'"
        >
          Last 2 min
        </button>
      </div>
    </div>

    <div class="row">
      <label>Timeline length</label>
      <div class="inline">
        <input
          type="number"
          min="5"
          max="180"
          step="1"
          v-model.number="settings.maxTotalMin"
        />
        <span class="suffix">min</span>
      </div>
    </div>

    <div class="row">
      <label>Scale min (green)</label>
      <div class="inline">
        <input type="number" step="1" v-model.number="settings.graphMin" />
        <span class="suffix">dB</span>
      </div>
    </div>

    <div class="row">
      <label>Scale max (red)</label>
      <div class="inline">
        <input type="number" step="1" v-model.number="settings.maxDb" />
        <span class="suffix">dB</span>
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
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
label {
  font-size: 13px;
  opacity: 0.85;
}
.seg {
  display: inline-flex;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 2px;
}
.seg button {
  border: none;
  background: transparent;
  color: inherit;
  padding: 5px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}
.seg button.active {
  background: #3b6cff;
  color: #fff;
}
.inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.inline input {
  width: 64px;
}
.suffix {
  font-size: 12px;
  opacity: 0.6;
}
input[type='number'] {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: inherit;
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 13px;
}
</style>
