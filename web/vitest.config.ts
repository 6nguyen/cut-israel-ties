import { defineConfig } from 'vitest/config';
// Pure client logic (lib/*.ts) runs under node; islands that need a DOM set `// @vitest-environment happy-dom` per file.
export default defineConfig({ test: { include: ['src/**/*.test.ts', 'test/**/*.test.ts'] } });
