import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 45000,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: process.env.UI_TEST_URL ?? 'http://localhost:3000',
    headless: true,
    trace: 'retain-on-failure',
  },
  outputDir: 'work/browser-results',
  reporter: [['list'], ['html', { outputFolder: 'work/browser-report', open: 'never' }]],
});
