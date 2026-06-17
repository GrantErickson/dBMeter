import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// base: './' produces relative asset URLs so the build works from any
// path on Azure Static Web Apps without extra configuration.
export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
})
