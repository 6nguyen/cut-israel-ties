// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// Static site on Cloudflare Pages. In dev, /api/* proxies to `wrangler dev` (port 8787);
// in production the Worker is routed on the same domain under /api/*.
export default defineConfig({
  output: 'static',
  // Absolute share-image URLs need the deployed origin; set SITE_URL in the Pages build env.
  site: process.env.SITE_URL,
  integrations: [preact()],
  vite: {
    plugins: [tailwindcss()],
    // Build-time pages read data/ through the Worker's loader so the web and the API agree on every row.
    resolve: { alias: { '@worker': fileURLToPath(new URL('../worker/src', import.meta.url)) } },
    server: { proxy: { '/api': { target: process.env.API_ORIGIN ?? 'http://localhost:8787', changeOrigin: true } } },
  },
});
