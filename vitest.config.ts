import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/api/**/*.test.ts', 'apps/web/**/*.test.ts'],
    exclude: ['**/*.e2e.test.ts'],
    environment: 'node',
  },
});
