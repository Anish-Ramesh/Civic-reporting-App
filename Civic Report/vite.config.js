// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import path from 'path'

// PWA manifest configuration
const manifestForPlugin = {
  registerType: "prompt",
  includeAssets: [
    "logo.png",
    "maskable_iconx48.png",
    "maskable_iconx72.png",
    "maskable_iconx96.png",
    "maskable_iconx128.png",
    "maskable_iconx192.png",
    "maskable_iconx384.png",
    "maskable_iconx512.png",
    "maskable_icon.png",
  ],
  manifest: {
    name: "MobilEASE - Mobile Efficient Assistance for Traffic",
    short_name: "MobilEASE",
    description: "Application to report traffic issues around you",
    icons: [
      { src: "/logo.png", sizes: "512x512", type: "image/png" },
      { src: "/maskable_iconx48.png", sizes: "48x48", type: "image/png", purpose: "maskable" },
      { src: "/maskable_iconx72.png", sizes: "72x72", type: "image/png", purpose: "maskable" },
      { src: "/maskable_iconx96.png", sizes: "96x96", type: "image/png", purpose: "maskable" },
      { src: "/maskable_iconx128.png", sizes: "128x128", type: "image/png", purpose: "maskable" },
      { src: "/maskable_iconx192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/maskable_iconx384.png", sizes: "384x384", type: "image/png", purpose: "maskable" },
      { src: "/maskable_iconx512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
    theme_color: "#212121",
    background_color: "#D7FFFE",
    display: "standalone",
    scope: "/",
    start_url: "/",
    orientation: "portrait",
  },
  devOptions: {
    enabled: false,
  },
}

export default defineConfig({
  plugins: [
    react(), 
    VitePWA({
      ...manifestForPlugin,
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@capacitor/core': path.resolve(__dirname, 'node_modules/@capacitor/core'),
      '@capacitor/status-bar': path.resolve(__dirname, 'node_modules/@capacitor/status-bar'),
    },
  },
  optimizeDeps: {
    include: ['@capacitor/core', '@capacitor/status-bar'],
    esbuildOptions: {
      target: 'es2020',
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000, // Increased chunk size warning limit to 2000KB
    rollupOptions: {
      external: ['@capacitor/core', '@capacitor/status-bar'],
      output: {
        manualChunks: {
          vendor: [
            'react',
            'react-dom',
            'react-router-dom',
            '@mui/material',
            '@emotion/react',
            '@emotion/styled'
          ],
          recharts: ['recharts'],
          exceljs: ['exceljs'],
          leaflet: ['leaflet', 'react-leaflet']
        }
      }
    },
  },
  server: {
    hmr: {
      overlay: false,
    },
    // Plain HTTP dev server to avoid certificate warnings on mobile
  },
})
