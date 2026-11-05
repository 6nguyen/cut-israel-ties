// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';

// Static site on Cloudflare Pages. In dev, /api/* proxies to `wrangler dev` (port 8787);
// in production the Worker is routed on the same domain under /api/*.
export default defineConfig({
  output: 'static',
  integrations: [preact()],
  vite: {
    plugins: [tailwindcss()],
    server: { proxy: { '/api': { target: process.env.API_ORIGIN ?? 'http://localhost:8787', changeOrigin: true } } },
  },
});
