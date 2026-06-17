<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  sessions: { type: Array, default: () => [] },
  overlays: { type: Array, default: () => [] },
  canSave: { type: Boolean, default: false },
  liveCount: { type: Number, default: 0 },
})

const emit = defineEmits(['save', 'toggle', 'delete', 'clear-live'])

const name = ref('')

function save() {
  const n = name.value.trim() || defaultName()
  emit('save', n)
  name.value = ''
}
function defaultName() {
  const d = new Date()
  return (
    'Session ' +
    d.toLocaleDateString() +
    ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  )
}
const overlayIds = computed(() => new Set(props.overlays.map((o) => o.id)))
function colorOf(id) {
  const o = props.overlays.find((x) => x.id === id)
  return o ? o.color : null
}
function fmtDur(s) {
  if (!s.samples || !s.samples.length) return '0s'
  const ms = s.samples[s.samples.length - 1].t - s.startT
  const min = ms / 60000
  return min >= 1 ? min.toFixed(1) + ' min' : Math.round(ms / 1000) + ' s'
}
</script>

<template>
  <div class="panel">
    <h2>Saved sessions</h2>

    <div class="save-row">
      <input
        type="text"
        v-model="name"
        placeholder="Name this measurement…"
        @keyup.enter="save"
      />
      <button class="save" :disabled="!canSave" @click="save">
        Save current ({{ liveCount }})
      </button>
    </div>
    <p class="hint">
      Recalled sessions overlay on the graph as lines so you can compare them
      against the running session without interrupting it.
    </p>

    <ul class="list">
      <li v-if="!sessions.length" class="empty">No saved sessions yet.</li>
      <li v-for="s in sessions" :key="s.id">
        <button
          class="dot"
          :class="{ on: overlayIds.has(s.id) }"
          :style="overlayIds.has(s.id) ? { background: colorOf(s.id), borderColor: colorOf(s.id) } : {}"
          :title="overlayIds.has(s.id) ? 'Hide overlay' : 'Show overlay'"
          @click="emit('toggle', s)"
        ></button>
        <div class="info">
          <div class="name">{{ s.name }}</div>
          <div class="sub">
            {{ s.samples.length }} samples · {{ fmtDur(s) }} ·
            {{ s.settings ? s.settings.weighting : '?' }}-wt
          </div>
        </div>
        <button class="del" title="Delete" @click="emit('delete', s)">✕</button>
      </li>
    </ul>

    <button
      v-if="liveCount > 0"
      class="clear-live"
      @click="emit('clear-live')"
    >
      Clear live data
    </button>
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
.save-row {
  display: flex;
  gap: 8px;
}
.save-row input {
  flex: 1;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: inherit;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 13px;
}
button.save {
  border: none;
  background: #2bb673;
  color: #fff;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}
button.save:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.hint {
  font-size: 12px;
  opacity: 0.6;
  margin: 0;
  line-height: 1.4;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.list .empty {
  opacity: 0.5;
  font-size: 13px;
}
.list li {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  padding: 8px 10px;
}
.dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.4);
  background: transparent;
  cursor: pointer;
  flex: none;
}
.info {
  flex: 1;
  min-width: 0;
}
.name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sub {
  font-size: 11px;
  opacity: 0.55;
}
.del {
  border: none;
  background: transparent;
  color: inherit;
  opacity: 0.5;
  cursor: pointer;
  font-size: 13px;
}
.del:hover {
  opacity: 1;
  color: #ff6b81;
}
.clear-live {
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
}
</style>
