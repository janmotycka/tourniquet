import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // Rozdělení bundlu na menší chunky → rychlejší první načtení
        manualChunks: {
          'vendor-react':    ['react', 'react-dom'],
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/database', 'firebase/functions'],
          'vendor-zustand':  ['zustand'],
          'vendor-pdf':      ['jspdf'],
          'vendor-qr':       ['qrcode'],
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

        // Firebase Realtime DB a Functions — vždy network-first (real-time data)
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.firebaseio\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/.*\.cloudfunctions\.net\/.*/i,
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
  ],
});
