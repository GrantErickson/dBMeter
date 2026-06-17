<script setup>
import { WEIGHTINGS } from '../lib/weighting.js'

// `section` lets the same control set back two separate tab screens:
//   'measurement' -> mic / weighting / response / interval
//   'graph'       -> mode / timeline / scale
const props = defineProps({
  settings: { type: Object, required: true },
  section: { type: String, default: 'all' }, // 'measurement' | 'graph' | 'all'
  isRunning: { type: Boolean, default: false },
})
const emit = defineEmits(['toggle-mic'])
</script>

<template>
  <div class="panel">
    <template v-if="section !== 'graph'">
      <h2>Microphone</h2>
      <div class="row">
        <label>
          <span
            class="status-dot"
            :class="{ on: isRunning }"
          ></span>
          {{ isRunning ? 'Listening' : 'Paused' }}
        </label>
        <button class="mic-btn" :class="{ paused: !isRunning }" @click="emit('toggle-mic')">
          {{ isRunning ? 'Pause' : 'Resume' }}
        </button>
      </div>

      <h2>Weighting</h2>
      <div class="row">
        <label>Frequency</label>
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
          <button :class="{ active: settings.response === 'fast' }" @click="settings.response = 'fast'">
            Fast
          </button>
          <button :class="{ active: settings.response === 'slow' }" @click="settings.response = 'slow'">
            Slow
          </button>
        </div>
      </div>

      <h2>Sampling</h2>
      <div class="row">
        <label>Interval value</label>
        <div class="seg">
          <button :class="{ active: settings.aggregation === 'avg' }" @click="settings.aggregation = 'avg'">
            Avg (Leq)
          </button>
          <button :class="{ active: settings.aggregation === 'max' }" @click="settings.aggregation = 'max'">
            Max
          </button>
        </div>
      </div>
      <div class="row">
        <label>Interval length</label>
        <div class="inline">
          <input class="num" type="number" min="0.2" max="10" step="0.1" v-model.number="settings.intervalSec" />
          <span class="suffix">s</span>
        </div>
      </div>
    </template>

    <template v-if="section !== 'measurement'">
      <h2>Timeline</h2>
      <div class="row">
        <label>Graph mode</label>
        <div class="seg">
          <button :class="{ active: settings.mode === 'log' }" @click="settings.mode = 'log'">
            Logarithmic
          </button>
          <button :class="{ active: settings.mode === 'linear' }" @click="settings.mode = 'linear'">
            Last 2 min
          </button>
        </div>
      </div>
      <div class="row">
        <label>Timeline length</label>
        <div class="inline">
          <input class="num" type="number" min="5" max="180" step="1" v-model.number="settings.maxTotalMin" />
          <span class="suffix">min</span>
        </div>
      </div>

      <h2>Scale &amp; colour</h2>
      <div class="row">
        <label>Min (green)</label>
        <div class="inline">
          <input class="num" type="number" step="1" v-model.number="settings.graphMin" />
          <span class="suffix">dB</span>
        </div>
      </div>
      <div class="row">
        <label>Max (red)</label>
        <div class="inline">
          <input class="num" type="number" step="1" v-model.number="settings.maxDb" />
          <span class="suffix">dB</span>
        </div>
      </div>
      <p class="hint">
        Logarithmic mode keeps the most recent 2 minutes at 50% width and
        compresses older history out to the timeline length.
      </p>
    </template>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
h2 {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.5;
  margin: 8px 0 0;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 40px;
}
label {
  font-size: 15px;
  opacity: 0.9;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.inline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.suffix {
  font-size: 13px;
  opacity: 0.6;
}
.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #e0506b;
}
.status-dot.on {
  background: #2bb673;
  box-shadow: 0 0 8px #2bb673;
}
.mic-btn {
  border: none;
  border-radius: 9px;
  padding: 9px 16px;
  font-size: 14px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.1);
  color: inherit;
  min-height: 40px;
}
.mic-btn.paused {
  background: #2bb673;
  color: #fff;
}
.hint {
  font-size: 12px;
  opacity: 0.55;
  line-height: 1.45;
  margin: 4px 0 0;
}
</style>
