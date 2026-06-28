import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Proxy API calls to the backend in dev so there's no CORS dance and the
    // app can use same-origin '/api'. In production VITE_API_URL points at the
    // deployed backend instead.
    proxy: {
      '/api': {
        target: 'https://ptmsoftware.me/veolms-api',
        changeOrigin: true,
      },
    },
  },
})
