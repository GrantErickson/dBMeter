<script setup>
import { computed } from 'vue'
import { dbToColor } from '../lib/color.js'

const props = defineProps({
  currentDb: { type: Number, default: -Infinity },
  peakDb: { type: Number, default: -Infinity },
  settings: { type: Object, required: true },
  isRunning: { type: Boolean, default: false },
})

const display = computed(() =>
  Number.isFinite(props.currentDb) ? props.currentDb.toFixed(1) : '--.-'
)
const peak = computed(() =>
  Number.isFinite(props.peakDb) ? props.peakDb.toFixed(1) : '--.-'
)
const color = computed(() =>
  Number.isFinite(props.currentDb)
    ? dbToColor(props.currentDb, props.settings.graphMin, props.settings.maxDb)
    : '#888'
)
// bar fill 0..1 across the configured scale
const fill = computed(() => {
  if (!Number.isFinite(props.currentDb)) return 0
  const n =
    (props.currentDb - props.settings.graphMin) /
    (props.settings.maxDb - props.settings.graphMin || 1)
  return Math.max(0, Math.min(1, n))
})
</script>

<template>
  <div class="readout">
    <div class="big" :style="{ color }">
      {{ display }}<span class="unit">dB</span>
    </div>
    <div class="meta">
      <span>{{ settings.weighting }}-weighted</span>
      <span>·</span>
      <span>{{ settings.response === 'slow' ? 'Slow' : 'Fast' }}</span>
      <span>·</span>
      <span>peak {{ peak }}</span>
    </div>
    <div class="bar">
      <div
        class="bar-fill"
        :style="{ width: fill * 100 + '%', background: color }"
      ></div>
    </div>
  </div>
</template>

<style scoped>
.readout {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.big {
  font-size: 56px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.unit {
  font-size: 20px;
  font-weight: 500;
  opacity: 0.7;
  margin-left: 6px;
}
.meta {
  display: flex;
  gap: 8px;
  font-size: 12px;
  opacity: 0.7;
  flex-wrap: wrap;
}
.bar {
  height: 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  transition: width 0.08s linear;
}
</style>
