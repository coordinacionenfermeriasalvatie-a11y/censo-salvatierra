import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Build ID = fecha + hora + 4 caracteres random. Se inyecta como
// VITE_BUILD_ID y se muestra en el Dashboard. Permite verificar a
// distancia qué versión tiene cada usuario instalada.
const BUILD_ID = (() => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getUTCFullYear().toString().slice(-2)}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}.${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`
  const r = Math.random().toString(36).slice(2, 6)
  return `${stamp}.${r}`
})()
process.env.VITE_BUILD_ID = BUILD_ID

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
        // Limpiar precaches antiguos en cuanto el nuevo SW active.
        // Crítico para evitar pantallas en blanco después de un deploy:
        // si el SW viejo tenía hashes que ya no existen en el CDN, la
        // PWA quedaba intentando cargar JS inexistente.
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // index.html / navegación: SIEMPRE pedir a la red. Sin esto,
            // un SW viejo podía servir HTML viejo apuntando a chunks que
            // ya no existen (404 en producción → pantalla en blanco).
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-shell',
              networkTimeoutSeconds: 4,
            },
          },
          {
            // Bundles JS/CSS: red primero, caché como fallback (no servir
            // versiones viejas si hay deploy nuevo)
            urlPattern: /\.(?:js|css)$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-assets',
              networkTimeoutSeconds: 4,
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
  },
  build: {
    // PERF — separar vendors estables (React, Supabase) en chunks propios.
    // Estos cambian poco entre deploys, así que el navegador los reutiliza
    // de caché y solo redescarga el código de la app en cada release.
    // Beneficio: ~150KB que dejan de redescargarse en visitas recurrentes.
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
})
