import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/wewei-role-site/',
  build: {
    rollupOptions: {
      output: {
        // Third-party code changes rarely; a separate chunk keeps its cache across app updates.
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor'
        }
      }
    }
  },
  server: {
    port: 5173,
    open: true
  }
})