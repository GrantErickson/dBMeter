<script setup>
defineProps({
  modelValue: { type: String, required: true },
  overlayCount: { type: Number, default: 0 },
})
const emit = defineEmits(['update:modelValue'])

// Each tab: key, label, and one or more SVG path strings for its icon.
const tabs = [
  { key: 'meter', label: 'Graph', paths: ['M5 20V11', 'M12 20V5', 'M19 20v-6'] },
  {
    key: 'spectrum',
    label: 'Spectrum',
    // Piano keyboard: outer frame, white-key dividers, black keys as top strokes.
    paths: [
      'M4 6h16v12H4z',
      'M9.3 6v12 M14.7 6v12',
      'M7.3 6v6.5 M11.3 6v6.5 M16.7 6v6.5',
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    paths: [
      'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
      'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
    ],
  },
  { key: 'sessions', label: 'Saved', paths: ['M7 4h10v16l-5-3.5L7 20z'] },
  {
    key: 'help',
    label: 'Help',
    paths: [
      'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
      'M9.09 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3',
      'M12 17h.01',
    ],
  },
]
</script>

<template>
  <nav class="tabbar">
    <button
      v-for="t in tabs"
      :key="t.key"
      class="tab"
      :class="{ active: modelValue === t.key }"
      @click="emit('update:modelValue', t.key)"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          v-for="(p, i) in t.paths"
          :key="i"
          :d="p"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="lbl">{{ t.label }}</span>
      <span
        v-if="t.key === 'sessions' && overlayCount > 0"
        class="badge"
        >{{ overlayCount }}</span
      >
    </button>
  </nav>
</template>

<style scoped>
.tabbar {
  display: flex;
  background: #0b0e18;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-bottom: var(--safe-b);
  flex: none;
}
.tab {
  flex: 1;
  position: relative;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 8px 2px 7px;
  font-size: 11px;
}
.tab.active {
  color: var(--accent);
}
.lbl {
  line-height: 1;
}
.badge {
  position: absolute;
  top: 4px;
  right: 50%;
  transform: translateX(16px);
  background: var(--go);
  color: #fff;
  font-size: 10px;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

/* Landscape: slim the bar and put icon + label side by side. */
@media (orientation: landscape) and (max-height: 520px) {
  .tab {
    flex-direction: row;
    gap: 6px;
    padding: 6px 2px;
    font-size: 12px;
  }
}
</style>
