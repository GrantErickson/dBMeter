import { ref, computed } from "vue";

const DISMISS_KEY = "dbmeter.pwa.dismissed";
const DISMISS_DAYS = 14;

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari reports installed PWAs through this non-standard flag.
    window.navigator.standalone === true
  );
}

// iOS has no beforeinstallprompt — installation is the manual "Share → Add to
// Home Screen" flow, and only Safari (not Chrome/Firefox/Edge on iOS, which are
// WebKit wrappers without that menu item) can do it.
function isIOSSafari() {
  const ua = window.navigator.userAgent;
  const ios =
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ masquerades as desktop Safari.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const otherIOSBrowser = /crios|fxios|edgios|opios/i.test(ua);
  return ios && !otherIOSBrowser;
}

function recentlyDismissed() {
  try {
    const ts = Number(localStorage.getItem(DISMISS_KEY));
    if (!ts) return false;
    return Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

// --- Shared singleton state -------------------------------------------------
// One source of truth so the auto-banner and the Settings "Install" button stay
// in sync. Listeners are attached once at module load, which also avoids the
// race where beforeinstallprompt fires before any component mounts.
const deferredPrompt = ref(null); // Android/desktop beforeinstallprompt event
const installed = ref(false);
const bannerDismissed = ref(false);
const ready = ref(false); // small delay so the banner doesn't fight first paint
const IS_IOS = typeof window !== "undefined" && isIOSSafari();

if (typeof window !== "undefined") {
  installed.value = isStandalone();
  bannerDismissed.value = recentlyDismissed();

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt.value = e;
  });
  window.addEventListener("appinstalled", () => {
    installed.value = true;
    deferredPrompt.value = null;
  });
  // Catch installs done through the browser's own menu.
  window
    .matchMedia("(display-mode: standalone)")
    .addEventListener?.("change", (e) => {
      if (e.matches) installed.value = true;
    });

  setTimeout(() => {
    ready.value = true;
  }, 2500);
}

async function install() {
  if (!deferredPrompt.value) return false;
  deferredPrompt.value.prompt();
  const { outcome } = await deferredPrompt.value.userChoice;
  deferredPrompt.value = null; // a prompt can only be used once
  return outcome === "accepted";
}

function dismissBanner() {
  bannerDismissed.value = true;
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* storage unavailable — banner just won't be remembered */
  }
}

export function usePWAInstall() {
  // Auto-banner: a transient offer, suppressed once dismissed.
  const bannerMode = computed(() => {
    if (installed.value || bannerDismissed.value || !ready.value) return null;
    if (deferredPrompt.value) return "button";
    if (IS_IOS) return "ios";
    return null;
  });

  // Persistent control (Settings screen): always reflects how the user can
  // install right now, regardless of whether the banner was dismissed.
  //   installed   – already running as an installed app
  //   button      – native install available (tap to install)
  //   ios         – show the iOS Add-to-Home-Screen steps
  //   unsupported – no programmatic path; point at the browser menu
  const installerStatus = computed(() => {
    if (installed.value) return "installed";
    if (deferredPrompt.value) return "button";
    if (IS_IOS) return "ios";
    return "unsupported";
  });

  return { bannerMode, installerStatus, isIOS: IS_IOS, install, dismissBanner };
}
