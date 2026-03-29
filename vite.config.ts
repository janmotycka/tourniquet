/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { sentryVitePlugin } from '@sentry/vite-plugin';

// https://vite.dev/config/
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },

  build: {
    // Source maps pro Sentry (automaticky uploadovány přes sentryVitePlugin)
    sourcemap: !!process.env.SENTRY_AUTH_TOKEN,
    rollupOptions: {
      output: {
        // Rozdělení bundlu na menší chunky → rychlejší první načtení
        manualChunks(id) {
          // Vendor chunky
          if (id.includes('node_modules/react-dom')) return 'vendor-react';
          if (id.includes('node_modules/react/')) return 'vendor-react';
          if (id.includes('node_modules/firebase/')) return 'vendor-firebase';
          if (id.includes('node_modules/zustand')) return 'vendor-zustand';
          if (id.includes('node_modules/jspdf')) return 'vendor-pdf';
          if (id.includes('node_modules/qrcode')) return 'vendor-qr';
          if (id.includes('node_modules/html2canvas')) return 'vendor-html2canvas';
          if (id.includes('node_modules/@stripe')) return 'vendor-stripe';
          // Data chunky — velké datové soubory cvičení
          if (id.includes('/data/exercises/')) return 'exercises-data';
        },
      },
    },
  },

  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',

      // Service worker soubory do dist/
      workbox: {
        // Precachuj statické assety (JS, CSS, HTML, fonty, obrázky)
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],

        // Zajisti rychlé přepnutí na nový SW a smazání starých cache
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,

        // Firebase Realtime DB a Functions — vždy network-first (real-time data)
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.firebaseio\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/.*\.firebasedatabase\.app\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/.*\.cloudfunctions\.net\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/identitytoolkit\.googleapis\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/securetoken\.googleapis\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          // Google Fonts — cache-first
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },

      // Web App Manifest
      manifest: {
        name: 'TORQ – Trénink & Turnaje',
        short_name: 'TORQ',
        description: 'Správa fotbalových tréninků a turnajů pro mládežnické trenéry',
        theme_color: '#1B5E20',
        background_color: '#FFFFFF',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'cs',
        categories: ['sports', 'productivity'],
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Nový turnaj',
            short_name: 'Turnaj',
            url: '/#new-tournament',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Generátor tréninku',
            short_name: 'Trénink',
            url: '/#generator',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
        ],
      },

      // Dev mode — service worker aktivní i ve vývoji pro testování
      devOptions: {
        enabled: false, // zapnout na true pokud chceš testovat SW lokálně
        type: 'module',
      },
    }),

    // Sentry — upload source maps při buildu (vyžaduje SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT env vars)
    process.env.SENTRY_AUTH_TOKEN
      ? sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: process.env.SENTRY_AUTH_TOKEN,
        })
      : null,
  ].filter(Boolean),
});
