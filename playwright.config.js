// End-to-end tests: the board served as it is deployed, driven in Chromium.
// The site is static; e2e/serve.js serves it with byte ranges, as a host does.

import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // One retry on CI keeps a trace of the second run, but a test that passes
  // only on its retry still fails the run: a flake is a bug to find.
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: {
      // A tap is a user gesture already; this keeps a headless run from
      // depending on how the browser counts one.
      args: ['--autoplay-policy=no-user-gesture-required'],
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `node e2e/serve.js ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
