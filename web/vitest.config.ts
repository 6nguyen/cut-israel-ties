import { defineConfig } from 'vitest/config';
// Pure client logic (lib/*.ts) runs under node; islands that need a DOM set `// @vitest-environment happy-dom` per file.
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@worker': fileURLToPath(new URL('../worker/src', import.meta.url)) } },
  test: { include: ['src/**/*.test.ts', 'test/**/*.test.ts'] },
});
