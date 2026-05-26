import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // skipWaiting + clientsClaim: el nuevo Service Worker toma control
      // inmediatamente cuando hay deploy, sin esperar a que el usuario cierre
      // todas las pestañas. Critical para que los fixes se vean rápido.
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // Bundles JS/CSS: red primero, caché como fallback (no servir
            // versiones viejas si hay deploy nuevo)
            urlPattern: /\.(?:js|css)$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-assets',
              expiration: { maxAgeSeconds: 60 * 5 }, // 5 min de caché máx
            },
          },
        ],
      },
      includeAssets: ['logos/imss_bienestar.png', 'logos/LOGO_HOSPITAL.jpg'],
      manifest: {
        name: 'Censo Hospitalario Salvatierra',
        short_name: 'Censo Salvatierra',
        description: 'Sistema de Censo Hospitalario - Hospital Juan Maria de Salvatierra - IMSS Bienestar',
        theme_color: '#0E6755',
        background_color: '#F5F1E8',
        display: 'standalone',
        lang: 'es-MX',
        icons: [
          {
            src: '/logos/LOGO_HOSPITAL.jpg',
            sizes: '192x192',
            type: 'image/jpeg'
          },
          {
            src: '/logos/LOGO_HOSPITAL.jpg',
            sizes: '512x512',
            type: 'image/jpeg'
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    host: true
  }
})
