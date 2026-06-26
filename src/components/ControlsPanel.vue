<script setup>
import { WEIGHTINGS } from '../lib/weighting.js'
import { uid } from '../lib/storage.js'
import { nextFreqColor } from '../lib/color.js'
import { MAX_FREQ_TRACKS, MIN_FREQ, MAX_FREQ } from '../lib/freq.js'

const props = defineProps({
  settings: { type: Object, required: true },
  isRunning: { type: Boolean, default: false },
})
const emit = defineEmits(['toggle-mic'])

function addFreqTrack() {
  const tracks = props.settings.freqTracks
  if (tracks.length >= MAX_FREQ_TRACKS) return
  tracks.push({
    id: uid(),
    freq: 1000,
    color: nextFreqColor(tracks.map((t) => t.color)),
    enabled: true,
  })
}

function removeFreqTrack(i) {
  props.settings.freqTracks.splice(i, 1)
}
</script>

<template>
  <div class="panel">
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
      <p v-if="settings.autoMode" class="hint">
        Auto mode is on — the graph scale follows the quietest and loudest sounds
        heard. These values apply once you switch to Calibrated mode using the
        Calibration controls at the top of this page.
      </p>
      <div class="row">
        <label>Min (green)</label>
        <div class="inline">
          <input
            class="num"
            type="number"
            step="1"
            :disabled="settings.autoMode"
            v-model.number="settings.graphMin"
          />
          <span class="suffix">dB</span>
        </div>
      </div>
      <div class="row">
        <label>Max (red)</label>
        <div class="inline">
          <input
            class="num"
            type="number"
            step="1"
            :disabled="settings.autoMode"
            v-model.number="settings.maxDb"
          />
          <span class="suffix">dB</span>
        </div>
      </div>
      <p class="hint">
        Logarithmic mode keeps the most recent 2 minutes at 50% width and
        compresses older history out to the timeline length.
      </p>

      <h2>Frequency tracking</h2>
      <p class="hint">
        Track the level of up to {{ MAX_FREQ_TRACKS }} specific frequencies.
        They are always recorded; switch the overlay on with the
        <b>Hz</b> button on the graph to draw them as lines. Use the coloured
        dot to show or hide an individual frequency.
      </p>
      <ul class="freq-list">
        <li v-if="!settings.freqTracks.length" class="freq-empty">
          No frequencies yet — add one below.
        </li>
        <li v-for="(t, i) in settings.freqTracks" :key="t.id">
          <button
            class="freq-dot"
            :class="{ on: t.enabled !== false }"
            :style="
              t.enabled !== false
                ? { background: t.color, borderColor: t.color }
                : { borderColor: t.color }
            "
            :aria-pressed="t.enabled !== false"
            :aria-label="
              (t.enabled !== false ? 'Hide' : 'Show') + ' this frequency line'
            "
            :title="t.enabled !== false ? 'Shown when overlay is on' : 'Hidden'"
            @click="t.enabled = t.enabled === false"
          ></button>
          <div class="inline freq-input">
            <input
              class="num"
              type="number"
              :min="MIN_FREQ"
              :max="MAX_FREQ"
              step="1"
              aria-label="Frequency in hertz"
              v-model.number="t.freq"
            />
            <span class="suffix">Hz</span>
          </div>
          <button class="freq-del" title="Remove" :aria-label="'Remove frequency'" @click="removeFreqTrack(i)">
            ✕
          </button>
        </li>
      </ul>
      <button
        class="add-freq"
        :disabled="settings.freqTracks.length >= MAX_FREQ_TRACKS"
        @click="addFreqTrack"
      >
        + Add frequency
      </button>

      <h2>Spectrum</h2>
      <p class="hint">
        The Spectrum tab shows a live frequency analyser. It holds two peak
        lines: the loudest level each frequency has reached since you cleared it,
        and the loudest within a recent window.
      </p>
      <div class="row">
        <label>Recent peak window</label>
        <div class="inline">
          <input
            class="num"
            type="number"
            min="1"
            max="120"
            step="1"
            v-model.number="settings.spectrumPeakSec"
          />
          <span class="suffix">s</span>
        </div>
      </div>
      <div class="row">
        <label>Note fade-out</label>
        <div class="inline">
          <input
            class="num"
            type="number"
            min="0.1"
            max="10"
            step="0.1"
            v-model.number="settings.spectrumDecaySec"
          />
          <span class="suffix">s</span>
        </div>
      </div>
      <div class="row">
        <label>Bars per note</label>
        <div class="seg">
          <button
            v-for="n in 4"
            :key="n"
            :class="{ active: (settings.spectrumBarsPerNote || 1) === n }"
            @click="settings.spectrumBarsPerNote = n"
          >
            {{ n }}
          </button>
        </div>
      </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
h2 {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
  color: #9ab4ff;
  margin: 22px 0 6px;
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
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
  background: var(--danger);
}
.status-dot.on {
  background: var(--go);
  box-shadow: 0 0 8px var(--go);
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
  background: var(--go);
  color: #fff;
}
.hint {
  font-size: 12px;
  opacity: 0.7;
  line-height: 1.45;
  margin: 4px 0 0;
}

/* ----- frequency tracking ----- */
.freq-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.freq-list li {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
}
.freq-empty {
  opacity: 0.5;
  font-size: 13px;
}
.freq-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.4);
  background: transparent;
  cursor: pointer;
  flex: none;
}
.freq-input {
  flex: 1;
}
.freq-del {
  border: none;
  background: transparent;
  color: inherit;
  opacity: 0.5;
  cursor: pointer;
  font-size: 14px;
  padding: 6px 8px;
}
.freq-del:hover {
  opacity: 1;
  color: #ff6b81;
}
.add-freq {
  align-self: flex-start;
  border: 1px dashed rgba(255, 255, 255, 0.25);
  background: transparent;
  color: inherit;
  border-radius: 9px;
  padding: 9px 14px;
  font-size: 14px;
  margin-top: 8px;
}
.add-freq:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
