import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/wewei-role-site/',
  server: {
    port: 5173,
    open: true
  }
})