<script setup>
import { ref, onBeforeUnmount } from 'vue'
import AccordionSection from './AccordionSection.vue'

defineProps({
  firstRun: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

// Share the app with others: native share sheet where available, otherwise
// copy the link to the clipboard with a brief confirmation.
const APP_URL = 'https://dbmeter.micapeak.net'
const shareLabel = ref('Share')
let flashTimer = null

function flash(msg) {
  shareLabel.value = msg
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => {
    shareLabel.value = 'Share'
  }, 1800)
}

async function share() {
  const data = {
    title: 'dB Meter',
    text: 'dB Meter — turn your device into a sound-level meter and spectrum analyser.',
    url: APP_URL,
  }
  if (navigator.share) {
    try {
      await navigator.share(data)
    } catch {
      /* user cancelled or the share was dismissed */
    }
    return
  }
  // No Web Share API (most desktop browsers): copy the link instead.
  try {
    await navigator.clipboard.writeText(APP_URL)
    flash('Link copied')
  } catch {
    flash('Copy failed')
  }
}

onBeforeUnmount(() => {
  if (flashTimer) clearTimeout(flashTimer)
})

// Collapsible sections: the screen opens as a short, scannable list of titles
// (the first one expanded) so it isn't a wall of text. Tap a heading to expand.
const open = ref({ graph: true })
function isOpen(k) {
  return !!open.value[k]
}
function toggle(k) {
  open.value[k] = !open.value[k]
}

// Platform detection for install / full-screen guidance (evaluated on mount).
const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
const touchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0
const isIOS = /iP(hone|od|ad)/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)
const isAndroid = /Android/.test(ua)
const isStandalone =
  (typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(display-mode: standalone)').matches) ||
  (typeof navigator !== 'undefined' && navigator.standalone === true)
</script>

<template>
  <div class="help">
    <header class="hh">
      <h1>{{ firstRun ? 'Welcome to dB Meter' : 'Help &amp; guide' }}</h1>
      <div class="hh-actions">
        <button class="share" title="Share dB Meter" @click="share">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              d="M12 3v12 M8 7l4-4 4 4 M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"
              fill="none"
              stroke="currentColor"
              stroke-width="1.9"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          {{ shareLabel }}
        </button>
        <button class="done" @click="emit('close')">Done</button>
      </div>
    </header>

    <div class="hbody">
      <p class="lead">
        dB Meter turns your device's microphone into a live sound-level meter and
        plots the level over time. It runs entirely in your browser — nothing is
        uploaded, and your settings and saved measurements stay on this device.
      </p>

      <div class="acc-list">
      <AccordionSection title="Reading the graph" :open="isOpen('graph')" @toggle="toggle('graph')">
        <ul>
          <li>
            The big number is the current level. Bars are coloured
            <b style="color: hsl(120, 85%, 50%)">green</b> when quiet,
            <b style="color: hsl(60, 85%, 50%)">yellow</b> in the middle and
            <b style="color: hsl(0, 85%, 50%)">red</b> near the top of the scale.
          </li>
          <li>
            <b>Log</b> mode keeps the most recent 2 minutes at half the width and
            compresses older history toward the left, out to the timeline length.
            <b>2 min</b> mode shows just the last two minutes, evenly spaced.
          </li>
          <li>Tap the <b>peak</b> value to reset peak-hold.</li>
          <li><b>Clear</b> wipes the graph and starts fresh (settings are kept).</li>
        </ul>
      </AccordionSection>

      <AccordionSection title="Settings" :open="isOpen('settings')" @toggle="toggle('settings')">
        <ul>
          <li><b>Calibration</b> sits at the top — switch between Auto and Calibrated and capture reference points there.</li>
          <li><b>Weighting</b> — A and B mimic how loud sound seems to people; Z is flat/unweighted.</li>
          <li><b>Time response</b> — Fast (125 ms) reacts quickly; Slow (1 s) is smoother.</li>
          <li><b>Interval value</b> — each point is the Average (Leq) or the Max over the sampling interval.</li>
          <li><b>Timeline length</b> and the <b>Min / Max</b> scale (which also drives the colours).</li>
          <li>Pause or resume the microphone from the Settings screen at any time.</li>
        </ul>
      </AccordionSection>

      <AccordionSection title="Spectrum analyser" :open="isOpen('spectrum')" @toggle="toggle('spectrum')">
        <ul>
          <li>
            The <b>Spectrum</b> tab shows a live frequency analyser — bars across
            the audio range, coloured by level just like the main graph.
          </li>
          <li>
            Two peak-hold lines ride on top: the <b style="color: #ff6b81">peak</b>
            since you last cleared it, and the <b>recent</b> peak within a window
            you set on Settings (default 15 s). Tap <b>Clear</b> to reset them.
          </li>
          <li>
            In landscape a <b>piano keyboard</b> appears along the bottom and
            highlights the note matching the loudest frequency; its name and
            frequency show at the top-left. <b>Tap a key</b> to play that note.
          </li>
          <li>
            <b>Note fade-out</b> on Settings controls how slowly the bars (and
            the highlighted note) fall away after a sound stops.
          </li>
        </ul>
      </AccordionSection>

      <AccordionSection title="Auto mode vs. calibrated" :open="isOpen('autocal')" @toggle="toggle('autocal')">
        <ul>
          <li>
            <b>Auto</b> (the default, until you calibrate) shows
            <b>relative</b> levels. The numbers are <em>probably not true dB</em>,
            but the graph automatically scales between the quietest and loudest
            sounds it has heard — handy for seeing how loud things are compared to
            each other.
          </li>
          <li>
            <b>Calibrated</b> maps readings to real dB SPL and uses the fixed
            Min/Max scale from Settings.
          </li>
          <li>
            Switch between them at the top of the <b>Settings</b> screen at any
            time — capturing a reference turns calibration on, and there's an
            <b>Auto</b> button to turn it back off.
          </li>
        </ul>
      </AccordionSection>

      <AccordionSection title="Calibrating to real dB SPL" accent :open="isOpen('calibrate')" @toggle="toggle('calibrate')">
        <p>
          Calibration maps the raw reading onto a real scale using one or two
          reference points. (Skip this if you're happy with relative levels in
          Auto mode.)
        </p>
        <ol>
          <li>
            Get a <b>reference</b>: a proper sound-level meter, or a trusted phone
            SPL app. Set its weighting and response to match the Settings here
            (e.g. <b>A</b> + <b>Fast</b>).
          </li>
          <li>
            Make a <b>steady</b> sound at a known level (a constant tone or steady
            noise works best) and let the reading settle.
          </li>
          <li>
            On the <b>Settings</b> screen, tap <b>Capture</b> under
            <b>Quiet reference</b>, then type the reference meter's reading into
            <b>Known dB</b>.
          </li>
          <li>
            Repeat with a clearly <b>louder</b> steady sound for the
            <b>Loud reference</b>.
          </li>
          <li>
            That's it — every reading is now shown in calibrated dB. The panel
            displays the resulting slope and offset.
          </li>
        </ol>
        <p class="note">
          Two points give the most accurate result. One point just shifts
          everything by a fixed offset. Re-calibrate if you change device,
          microphone, or weighting. Keep the mic unobstructed during measurement.
        </p>
      </AccordionSection>

      <AccordionSection title="Tracking specific frequencies" :open="isOpen('freqs')" @toggle="toggle('freqs')">
        <ul>
          <li>
            On <b>Settings</b>, add up to five frequencies (in Hz) to follow
            individually — for example a 50/60 Hz hum, a 1 kHz tone, or a
            whine you're chasing down.
          </li>
          <li>
            They are <b>always recorded</b> while the mic runs. Tap the
            <b>Hz</b> button on the graph to overlay them as coloured lines, and
            tap it again to hide them. Each line is labelled with its frequency.
          </li>
          <li>
            With the overlay on, tap a <b>frequency chip</b> at the bottom-left
            of the graph to show or hide that individual line. (The coloured dot
            next to each frequency on Settings does the same thing.)
          </li>
          <li>
            Use the <b>bars</b> button next to <b>Hz</b> to hide the main level
            bars and show <em>only</em> the frequency lines for an uncluttered
            view.
          </li>
          <li>
            A single frequency carries far less energy than the whole sound, so
            its line normally sits below the broadband level — it rises when that
            frequency gets louder.
          </li>
        </ul>
      </AccordionSection>

      <AccordionSection title="Saving &amp; comparing" :open="isOpen('saving')" @toggle="toggle('saving')">
        <ul>
          <li>On the <b>Saved</b> screen, name and save the current measurement.</li>
          <li>
            Tap a saved item's dot to overlay it on the live graph as a line, so
            you can compare it against what's happening now — without interrupting
            the running session.
          </li>
        </ul>
      </AccordionSection>

      <AccordionSection title="Full screen &amp; running as an app" :open="isOpen('install')" @toggle="toggle('install')">

        <p v-if="isStandalone">
          You're running dB Meter as an installed app — the address bar is
          already gone. Enjoy the extra space.
        </p>

        <template v-else-if="isIOS">
          <p>
            On iPhone &amp; iPad, add dB Meter to your Home Screen to run it like
            a real app, with <b>no address bar</b>:
          </p>
          <ol>
            <li>In <b>Safari</b>, tap the <b>Share</b> button (square with an up arrow).</li>
            <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
            <li>Open dB Meter from the new icon — it launches full-screen.</li>
          </ol>
          <p class="note">
            iPhone Safari has no full-screen button, so this is the best way to
            reclaim the whole screen.
          </p>
        </template>

        <template v-else-if="isAndroid">
          <p>
            Tap the <b>⛶</b> button on the graph for instant full screen. To run
            it as a standalone app (no address bar):
          </p>
          <ol>
            <li>Open Chrome's <b>⋮</b> menu.</li>
            <li>Tap <b>Add to Home screen</b> (or <b>Install app</b>) and confirm.</li>
            <li>Launch it from the new icon.</li>
          </ol>
        </template>

        <p v-else>
          Tap the <b>⛶</b> button on the graph for full screen. You can also
          install dB Meter from your browser's menu (<b>Install</b> / <b>Add to
          Home Screen</b>) to run it in its own window.
        </p>
      </AccordionSection>

      <AccordionSection title="Good to know" :open="isOpen('good')" @toggle="toggle('good')">
        <ul>
          <li>Microphone access needs a secure page (HTTPS) or localhost, and your permission.</li>
          <li>The app keeps measuring while you switch tabs or rotate the device.</li>
          <li>
            Use the <b>⏸ / ▶</b> button to pause or resume the mic. It also
            auto-pauses after the app has been in the background for about an
            hour — tap <b>▶</b> to start again.
          </li>
          <li>In landscape the graph fills the screen with the reading on top.</li>
        </ul>
      </AccordionSection>
      </div>

      <button class="cta" @click="emit('close')">
        {{ firstRun ? 'Get started' : 'Show me the graph' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.help {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.hh {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: linear-gradient(#0f1320 75%, rgba(15, 19, 32, 0));
  padding: calc(var(--safe-t) + 14px) 16px 10px;
  z-index: 2;
}
.hh h1 {
  margin: 0;
  font-size: 22px;
  /* min-width:0 lets the title share/wrap rather than pushing the action
     buttons off-screen; it still wraps to a second line instead of truncating. */
  min-width: 0;
}
.hh-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
.done {
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: inherit;
  border-radius: 9px;
  padding: 9px 16px;
  font-size: 14px;
  font-weight: 600;
  flex: none;
}
.share {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: var(--accent);
  color: #fff;
  border-radius: 9px;
  padding: 9px 14px;
  font-size: 14px;
  font-weight: 600;
  flex: none;
  white-space: nowrap;
}
.share svg {
  flex: none;
}
.hbody {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0 16px calc(var(--safe-b) + 24px);
  max-width: 660px;
  margin: 0 auto;
  width: 100%;
}
.lead {
  font-size: 15px;
  line-height: 1.55;
  opacity: 0.85;
  margin: 0 0 8px;
}
/* The accordion list closes off its last item with a bottom rule (each item
   draws its own top rule). */
.acc-list {
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
ul,
ol {
  margin: 0;
  padding-left: 20px;
}
li {
  font-size: 14px;
  line-height: 1.55;
  margin-bottom: 7px;
}
p {
  font-size: 14px;
  line-height: 1.55;
  opacity: 0.9;
  margin: 0 0 8px;
}
.note {
  font-size: 13px;
  opacity: 0.7;
  margin-top: 4px;
}
.cta {
  display: block;
  width: 100%;
  margin-top: 26px;
  border: none;
  background: var(--go);
  color: #fff;
  border-radius: 12px;
  padding: 15px;
  font-size: 16px;
  font-weight: 700;
}
</style>
