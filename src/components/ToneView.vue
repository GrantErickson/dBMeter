<script setup>
import { computed, onBeforeUnmount } from 'vue'
import { GEN_TYPES, WAVEFORMS } from '../lib/generator.js'
import { freqToMidi, noteName, PIANO_MIN_MIDI, PIANO_MAX_MIDI } from '../lib/notes.js'
import { createPianoVoice } from '../lib/pianoVoice.js'
import PianoKeyboard from './PianoKeyboard.vue'

// Tone tab: a signal generator (tone or coloured noise) plus a playable piano
// keyboard. The generator engine itself lives in App (useToneGenerator) so a
// running signal survives switching tabs; this view just edits settings.tone
// (App live-applies changes) and drives play/stop.

const props = defineProps({
  settings: { type: Object, required: true },
  gen: { type: Object, required: true }, // useToneGenerator instance
})

const isWave = computed(() => props.settings.tone.type === 'wave')
const playing = computed(() => props.gen.isPlaying.value)

// Nearest note to the entered frequency, with its cents offset when off-pitch
// (e.g. "A4" or "A4 +12¢"). Blank outside the piano's range.
const noteLabel = computed(() => {
  const f = props.settings.tone.freq
  if (!Number.isFinite(f) || f <= 0) return ''
  const m = freqToMidi(f)
  const nearest = Math.round(m)
  if (nearest < PIANO_MIN_MIDI || nearest > PIANO_MAX_MIDI) return ''
  const cents = Math.round((m - nearest) * 100)
  return noteName(nearest) + (cents ? ` ${cents > 0 ? '+' : ''}${cents}¢` : '')
})

// Keys retune a running tone (you hear the generator glide, not the piano
// voice); otherwise they play the tap piano voice. Either way the key's pitch
// lands in the frequency box.
const voice = createPianoVoice()

function onNote({ midi, freq }) {
  props.settings.tone.freq = Math.round(freq * 10) / 10
  if (!(playing.value && isWave.value)) voice.change(midi)
}

function onRelease() {
  voice.release()
}

function togglePlay() {
  props.gen.toggle({ ...props.settings.tone })
}

onBeforeUnmount(() => {
  voice.release() // the generator deliberately keeps playing across tabs
})
</script>

<template>
  <div class="tone">
    <div class="controls">
      <h1>Tone generator</h1>

      <div class="row">
        <label for="gen-type">Type</label>
        <select id="gen-type" class="sel" v-model="settings.tone.type">
          <option v-for="t in GEN_TYPES" :key="t.value" :value="t.value">
            {{ t.label }}
          </option>
        </select>
      </div>

      <div v-if="isWave" class="row">
        <label for="gen-wf">Waveform</label>
        <select id="gen-wf" class="sel" v-model="settings.tone.waveform">
          <option v-for="w in WAVEFORMS" :key="w.value" :value="w.value">
            {{ w.label }}
          </option>
        </select>
      </div>

      <div v-if="isWave" class="row">
        <label for="gen-freq">Frequency</label>
        <div class="inline">
          <span v-if="noteLabel" class="notechip">{{ noteLabel }}</span>
          <input
            id="gen-freq"
            class="num"
            type="number"
            min="1"
            max="20000"
            step="1"
            v-model.number="settings.tone.freq"
          />
          <span class="suffix">Hz</span>
        </div>
      </div>

      <div class="row">
        <label for="gen-vol">Volume</label>
        <input
          id="gen-vol"
          class="vol"
          type="range"
          min="0"
          max="1"
          step="0.01"
          v-model.number="settings.tone.volume"
        />
      </div>

      <button class="play" :class="{ on: playing }" @click="togglePlay">
        {{ playing ? '■ Stop' : '▶ Play' }}
      </button>

      <p v-if="playing" class="hint">
        Keeps playing while you switch tabs — watch it live on the Spectrum tab.
      </p>
      <p v-else-if="isWave" class="hint">
        Tap a key to set the frequency. While playing, keys retune the tone.
      </p>
      <p v-else class="hint">
        Noise has no pitch — the keys just play their own note.
      </p>
    </div>

    <PianoKeyboard
      class="keys"
      :active-freq="isWave ? settings.tone.freq : null"
      @note="onNote"
      @release="onRelease"
    />
  </div>
</template>

<style scoped>
.tone {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: calc(var(--safe-t) + 14px) 14px 10px;
  max-width: 640px;
  margin: 0 auto;
  width: 100%;
}
.controls {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
h1 {
  margin: 0 0 6px;
  font-size: 22px;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 44px;
}
label {
  font-size: 15px;
  opacity: 0.9;
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
.sel {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: inherit;
  border-radius: 8px;
  padding: 9px 10px;
  min-width: 150px;
}
.notechip {
  font-size: 13px;
  font-weight: 600;
  color: #9ab4ff;
  background: rgba(59, 108, 255, 0.14);
  border-radius: 999px;
  padding: 3px 9px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.vol {
  flex: 1;
  max-width: 220px;
  accent-color: var(--accent);
}
.play {
  border: none;
  border-radius: 12px;
  padding: 13px;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  background: var(--go);
  margin-top: 6px;
}
.play.on {
  background: var(--danger);
}
.hint {
  font-size: 12px;
  opacity: 0.6;
  line-height: 1.45;
  margin: 6px 0 0;
  text-align: center;
}
.keys {
  flex: 1;
  min-height: 110px;
  max-height: 300px;
  /* pin to the bottom when the window is taller than the capped keyboard */
  margin-top: auto;
}

/* Landscape: keyboard fills the left, controls become a right-hand column. */
@media (orientation: landscape) and (max-height: 600px) {
  .tone {
    flex-direction: row;
    max-width: none;
    padding: calc(var(--safe-t) + 10px) 12px 10px;
    align-items: stretch;
  }
  .controls {
    order: 2;
    width: 250px;
    flex: none;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  h1 {
    font-size: 17px;
  }
  .row {
    min-height: 40px;
  }
  .sel {
    min-width: 130px;
  }
  .keys {
    order: 1;
    flex: 1;
    min-width: 0;
    max-height: none;
    margin-top: 0;
  }
}
</style>
