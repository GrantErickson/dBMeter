<template>
  <div class="panel">
    <h2>Install</h2>

    <!-- Already running as an installed app -->
    <div v-if="installerStatus === 'installed'" class="row">
      <label><span class="check">✓</span> App installed</label>
    </div>

    <!-- Android / desktop: one-tap native install -->
    <div v-else-if="installerStatus === 'button'" class="row">
      <label>Install dB Meter</label>
      <button class="action-btn" @click="install">Install app</button>
    </div>

    <!-- iOS Safari: manual Add-to-Home-Screen steps -->
    <template v-else-if="installerStatus === 'ios'">
      <div class="row">
        <label>Add to Home Screen</label>
      </div>
      <p class="hint">
        Tap
        <span class="ios-share" aria-label="the Share button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 15V3M8 7l4-4 4 4"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        in Safari's toolbar, then choose <strong>Add to Home Screen</strong>.
      </p>
    </template>

    <!-- Anything else (e.g. desktop Firefox): point at the browser menu -->
    <template v-else>
      <div class="row">
        <label>Install dB Meter</label>
      </div>
      <p class="hint">
        Open your browser's menu and choose <strong>Install app</strong> (or
        <strong>Add to Home Screen</strong>) to add dB Meter to your device.
      </p>
    </template>
  </div>
</template>

<script setup>
import { usePWAInstall } from "../composables/usePWAInstall.js";

const { installerStatus, install } = usePWAInstall();
</script>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
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
.check {
  color: #2bb673;
  font-weight: 700;
}
.action-btn {
  border: none;
  border-radius: 9px;
  padding: 9px 16px;
  font-size: 14px;
  font-weight: 600;
  background: #4a9eff;
  color: #00111f;
  min-height: 40px;
}
.action-btn:active {
  transform: translateY(1px);
}
.hint {
  font-size: 12px;
  opacity: 0.7;
  line-height: 1.5;
  margin: 0;
}
.hint strong {
  opacity: 0.95;
}
.ios-share {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: -2px;
  width: 18px;
  height: 18px;
  margin: 0 1px;
  border-radius: 5px;
  color: #4a9eff;
  background: rgba(74, 158, 255, 0.15);
}
</style>
