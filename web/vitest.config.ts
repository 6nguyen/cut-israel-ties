import { defineConfig } from 'vitest/config';
// Pure client logic (lib/*.ts) runs under node; islands that need a DOM set `// @vitest-environment happy-dom` per file.
// test/setup.ts gives every file a working in-memory localStorage/sessionStorage (see its header).
export default defineConfig({ test: { include: ['src/**/*.test.ts', 'test/**/*.test.ts'], setupFiles: ['test/setup.ts'] } });
