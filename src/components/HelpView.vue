<script setup>
defineProps({
  firstRun: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])
</script>

<template>
  <div class="help">
    <header class="hh">
      <h1>{{ firstRun ? 'Welcome to dB Meter' : 'Help &amp; guide' }}</h1>
      <button class="done" @click="emit('close')">Done</button>
    </header>

    <div class="hbody">
      <p class="lead">
        dB Meter turns your device's microphone into a live sound-level meter and
        plots the level over time. It runs entirely in your browser — nothing is
        uploaded, and your settings and saved measurements stay on this device.
      </p>

      <section>
        <h2>Reading the graph</h2>
        <ul>
          <li>
            The big number is the current level. Bars are coloured
            <b style="color: hsl(120, 85%, 50%)">green</b> when quiet,
            <b style="color: hsl(60, 85%, 50%)">yellow</b> in the middle and
            <b style="color: hsl(0, 85%, 50%)">red</b> as they approach your
            <b>Max</b> setting.
          </li>
          <li>
            <b>Log</b> mode keeps the most recent 2 minutes at half the width and
            compresses older history toward the left, out to the timeline length.
            <b>2 min</b> mode shows just the last two minutes, evenly spaced.
          </li>
          <li>Tap the <b>peak</b> value to reset peak-hold.</li>
          <li><b>Clear</b> wipes the graph and starts fresh (settings are kept).</li>
        </ul>
      </section>

      <section>
        <h2>Options</h2>
        <ul>
          <li><b>Weighting</b> — A and B mimic how loud sound seems to people; Z is flat/unweighted.</li>
          <li><b>Time response</b> — Fast (125 ms) reacts quickly; Slow (1 s) is smoother.</li>
          <li><b>Interval value</b> — each point is the Average (Leq) or the Max over the sampling interval.</li>
          <li><b>Timeline length</b> and the <b>Min / Max</b> scale (which also drives the colours).</li>
          <li>Pause or resume the microphone from the Options screen at any time.</li>
        </ul>
      </section>

      <section class="calib">
        <h2>Calibrating to real dB SPL</h2>
        <p>
          Without calibration the readings are <em>relative</em> — fine for
          comparing loud vs. quiet, but not true decibels. Calibration maps the
          raw reading onto a real scale using one or two reference points.
        </p>
        <ol>
          <li>
            Get a <b>reference</b>: a proper sound-level meter, or a trusted phone
            SPL app. Set its weighting and response to match the Options here
            (e.g. <b>A</b> + <b>Fast</b>).
          </li>
          <li>
            Make a <b>steady</b> sound at a known level (a constant tone or steady
            noise works best) and let the reading settle.
          </li>
          <li>
            On the <b>Calibrate</b> screen, tap <b>Capture</b> under
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
      </section>

      <section>
        <h2>Saving &amp; comparing</h2>
        <ul>
          <li>On the <b>Saved</b> screen, name and save the current measurement.</li>
          <li>
            Tap a saved item's dot to overlay it on the live graph as a line, so
            you can compare it against what's happening now — without interrupting
            the running session.
          </li>
        </ul>
      </section>

      <section>
        <h2>Good to know</h2>
        <ul>
          <li>Microphone access needs a secure page (HTTPS) or localhost, and your permission.</li>
          <li>The app keeps measuring while you switch tabs or rotate the device.</li>
          <li>In landscape the graph fills the screen with the reading on top.</li>
        </ul>
      </section>

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
section {
  margin-top: 18px;
}
h2 {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.55;
  margin: 0 0 8px;
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
.calib {
  background: rgba(59, 108, 255, 0.1);
  border: 1px solid rgba(59, 108, 255, 0.3);
  border-radius: 12px;
  padding: 14px 16px;
}
.calib h2 {
  color: #9ab4ff;
  opacity: 0.95;
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
  background: #2bb673;
  color: #fff;
  border-radius: 12px;
  padding: 15px;
  font-size: 16px;
  font-weight: 700;
}
</style>
