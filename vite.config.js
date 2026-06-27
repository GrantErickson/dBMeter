import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)))

// base: './' produces relative asset URLs so the build works from any
// path on Azure Static Web Apps without extra configuration.
export default defineConfig({
  plugins: [vue()],
  base: './',
  // Stamp the package version and the build (deploy) timestamp into the bundle so
  // the settings page can show which build is live. It advances on every build.
  // The timestamp is a UTC ISO string; the app renders it in the visitor's local
  // time.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
})
