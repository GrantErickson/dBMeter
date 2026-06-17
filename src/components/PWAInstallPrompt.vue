<template>
  <div v-if="bannerMode" class="install-prompt">
    <div class="install-prompt-content">
      <div class="install-prompt-icon">
        <img src="/icons/icon-192x192.png" width="40" height="40" alt="" />
      </div>

      <!-- Android / desktop: one-tap install -->
      <template v-if="bannerMode === 'button'">
        <div class="install-prompt-text">
          <h3>Install dB Meter</h3>
          <p>Add it to your device for full-screen, offline access.</p>
        </div>
        <div class="install-prompt-actions">
          <button @click="install" class="install-btn">Install</button>
          <button @click="dismissBanner" class="dismiss-btn">Later</button>
        </div>
      </template>

      <!-- iOS Safari: guide the manual Add-to-Home-Screen flow -->
      <template v-else>
        <div class="install-prompt-text">
          <h3>Install dB Meter</h3>
          <p>
            Tap
            <span class="ios-share" aria-label="the Share button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
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
            then <strong>Add to Home Screen</strong>.
          </p>
        </div>
        <div class="install-prompt-actions">
          <button @click="dismissBanner" class="dismiss-btn">Got it</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { usePWAInstall } from "../composables/usePWAInstall.js";

const { bannerMode, install, dismissBanner } = usePWAInstall();
</script>

<style scoped>
.install-prompt {
  /* In-flow, just above the tab bar (placed before it in App.vue) so it never
     covers navigation. */
  flex-shrink: 0;
  padding: 14px 16px;
  background: linear-gradient(135deg, #1a2332 0%, #0f1320 100%);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.install-prompt-content {
  display: flex;
  align-items: center;
  gap: 14px;
  max-width: 600px;
  margin: 0 auto;
}

.install-prompt-icon {
  flex-shrink: 0;
  display: flex;
}

.install-prompt-icon img {
  border-radius: 9px;
}

.install-prompt-text {
  flex: 1;
  min-width: 0;
}

.install-prompt-text h3 {
  margin: 0 0 4px 0;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.install-prompt-text p {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.7);
}

.install-prompt-text strong {
  color: #fff;
  font-weight: 600;
}

.ios-share {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: -2px;
  width: 20px;
  height: 20px;
  margin: 0 1px;
  border-radius: 5px;
  color: #4a9eff;
  background: rgba(74, 158, 255, 0.15);
}

.install-prompt-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

button {
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.install-btn {
  background: #4a9eff;
  color: #000;
  min-width: 80px;
}

.install-btn:hover {
  background: #6aafff;
}

.install-btn:active {
  transform: translateY(1px);
}

.dismiss-btn {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  min-width: 70px;
}

.dismiss-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

@media (max-width: 600px) {
  .install-prompt-content {
    flex-wrap: wrap;
  }

  .install-prompt-actions {
    width: 100%;
  }

  .install-btn,
  .dismiss-btn {
    flex: 1;
  }
}
</style>
