<script setup>
// Shared graph-overlay HUD controls: the pause/resume button and the
// full-screen toggle. Used by both MeterView and SpectrumView so the icon
// markup and the useFullscreen() wiring live in one place.
import { useFullscreen } from '../composables/useFullscreen.js'

defineProps({
  isRunning: { type: Boolean, default: false },
})
defineEmits(['toggle-mic'])

const {
  isFullscreen,
  supported: fsSupported,
  toggle: toggleFullscreen,
} = useFullscreen()
</script>

<template>
  <button
    class="hud-play"
    :title="isRunning ? 'Pause' : 'Resume'"
    :aria-label="isRunning ? 'Pause microphone' : 'Resume microphone'"
    @click="$emit('toggle-mic')"
  >
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path v-if="isRunning" d="M7 5h3v14H7z M14 5h3v14h-3z" fill="currentColor" />
      <path v-else d="M8 5l12 7-12 7z" fill="currentColor" />
    </svg>
  </button>
  <button
    v-if="fsSupported"
    class="hud-icon"
    :title="isFullscreen ? 'Exit full screen' : 'Full screen'"
    :aria-label="isFullscreen ? 'Exit full screen' : 'Full screen'"
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
</template>

<style scoped>
.hud-icon,
.hud-play {
  border: none;
  background: rgba(20, 26, 43, 0.85);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 50%;
}
.hud-icon {
  width: 28px;
  height: 28px;
}
.hud-play {
  width: 36px;
  height: 36px;
  background: rgba(20, 26, 43, 0.9);
  margin-right: 2px;
}
</style>
