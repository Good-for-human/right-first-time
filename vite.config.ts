import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  // SECURITY: do NOT expose `RFT_*` env vars to the client bundle. Provider API
  // keys live in Netlify env vars and are resolved server-side by the
  // openai-proxy function (per country, with DE fallback). Including `RFT_` here
  // previously leaked non-secret keys (e.g. RFT_LOCAL_*) into the public JS.
  envPrefix: ['VITE_'],
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Listen on all interfaces so localhost / 127.0.0.1 / LAN IP all work
    host: true,
    port: 5173,
    strictPort: false,
    // Allow dev URLs like *.local, tunnel hostnames, or machine hostname (Vite 5+ host check)
    allowedHosts: true,
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: false,
    allowedHosts: true,
  },
})
