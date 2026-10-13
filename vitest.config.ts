import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests-publicos/**/*.test.ts'], fileParallelism: false, hookTimeout: 20000, testTimeout: 15000 } });
