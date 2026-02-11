import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

const backendUrl = process.env.LSLVIEW_BACKEND_URL ?? 'http://localhost:8765';

export default defineConfig({
  integrations: [react()],
  server: {
    host: true,
    port: 4321,
  },
  vite: {
    server: {
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
          ws: true,
        },
      },
    },
  },
});
