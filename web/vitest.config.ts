import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
// Pure client logic (lib/*.ts) runs under node; islands that need a DOM set `// @vitest-environment happy-dom` per file.
// test/setup.ts gives every file a working in-memory localStorage/sessionStorage (see its header).
export default defineConfig({
  resolve: { alias: { '@worker': fileURLToPath(new URL('../worker/src', import.meta.url)) } },
  test: { include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'], setupFiles: ['test/setup.ts'] },
});
