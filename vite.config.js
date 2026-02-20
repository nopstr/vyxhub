import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from "@sentry/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    sentryVitePlugin({
      org: process.env.SENTRY_ORG || "vyxhub",
      project: process.env.SENTRY_PROJECT || "vyxhub-web",
      authToken: process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
  build: {
    sourcemap: true, // Source map generation must be turned on
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'supabase-vendor': ['@supabase/supabase-js', '@supabase/ssr'],
          'ui-vendor': ['lucide-react', 'sonner', 'react-intersection-observer'],
          'media-vendor': ['@cloudflare/stream-react', 'browser-image-compression', 'react-image-crop'],
          'dnd-vendor': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities']
        }
      }
    }
  },
})
