import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Single-page React app. host:true so the live preview is reachable from a
// phone or a second laptop during the in-person demo.
// HydraDB has no browser CORS, so the browser hits a same-origin /hydra/* path
// and the dev server proxies it to api.hydradb.com (server-side, CORS-free).
export default defineConfig({
  plugins: [react()],
  // Pin PostCSS empty so Vite doesn't inherit a parent Tailwind config (the
  // repo lives under a folder that has one) — keeps `vite build` warning-free.
  css: { postcss: {} },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/hydra': {
        target: 'https://api.hydradb.com',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/hydra/, ''),
      },
    },
  },
})
