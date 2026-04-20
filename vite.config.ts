import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
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
