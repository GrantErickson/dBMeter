import { ref, onMounted, onBeforeUnmount } from 'vue'

// Thin wrapper around the Fullscreen API. Entering fullscreen must happen from a
// user gesture (a tap), so this is always driven by a button — never automatic.
// iPhone Safari doesn't support the API at all (`supported` is false there); the
// iOS path is "Add to Home Screen" for a standalone, chrome-free experience.

export function useFullscreen() {
  const isFullscreen = ref(false)

  const supported =
    typeof document !== 'undefined' &&
    (document.fullscreenEnabled ||
      document.webkitFullscreenEnabled ||
      !!document.documentElement.webkitRequestFullscreen)

  function sync() {
    isFullscreen.value = !!(
      document.fullscreenElement || document.webkitFullscreenElement
    )
  }

  async function enter() {
    const el = document.documentElement
    try {
      if (el.requestFullscreen) await el.requestFullscreen()
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen()
    } catch {
      /* user dismissed or not allowed */
    }
  }

  async function exit() {
    try {
      if (document.exitFullscreen) await document.exitFullscreen()
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen()
    } catch {
      /* ignore */
    }
  }

  function toggle() {
    if (isFullscreen.value) exit()
    else enter()
  }

  onMounted(() => {
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    sync()
  })
  onBeforeUnmount(() => {
    document.removeEventListener('fullscreenchange', sync)
    document.removeEventListener('webkitfullscreenchange', sync)
  })

  return { isFullscreen, supported, toggle, enter, exit }
}
