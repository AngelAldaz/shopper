import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import { copyFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * La app vive en https://USUARIO.github.io/shopper/ — todo (assets, scope del
 * PWA, navigateFallback) tiene que colgar de este mismo prefijo o el service
 * worker no toma control de las rutas.
 */
const BASE = '/shopper/'

/**
 * GitHub Pages devuelve 404.html para cualquier ruta que no exista como archivo.
 * Sirviendo ahí una copia de index.html, un deep link en frío (antes de que el
 * service worker esté instalado) carga la app en lugar de la página de error.
 */
function githubPagesSpaFallback() {
  return {
    name: 'gh-pages-spa-fallback',
    closeBundle() {
      const dist = fileURLToPath(new URL('./dist/', import.meta.url))
      copyFileSync(`${dist}index.html`, `${dist}404.html`)
    },
  }
}

export default defineConfig({
  base: BASE,
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
      manifest: {
        id: BASE,
        name: 'Shopper — listas de súper',
        short_name: 'Shopper',
        description:
          'Tus listas de súper con el mejor precio de cada producto, foto de la marca y total aproximado por tienda.',
        lang: 'es-MX',
        dir: 'ltr',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FFF5F8',
        theme_color: '#FFF5F8',
        categories: ['shopping', 'productivity', 'lifestyle'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: `${BASE}index.html`,
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Fotos de productos: se ven en el pasillo aunque no haya señal.
            // Son inmutables (cada foto tiene un uuid propio), así que CacheFirst
            // es seguro y evita gastar datos móviles releyéndolas.
            urlPattern: ({ url }) => url.pathname.includes('/storage/v1/object/public/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'fotos-productos',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      // /rest/v1 y /auth/v1 quedan fuera a propósito: llevan cabeceras de sesión
      // y su caché lo maneja Dexie, no el service worker.
    }),
    githubPagesSpaFallback(),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
