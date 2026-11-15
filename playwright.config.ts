import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Firefox runs only the frame-rate / 4× check (success criterion 5).
    {
      name: 'firefox-perf',
      use: {
        ...devices['Desktop Firefox'],
        // Headless Firefox is not tied to a display's vsync (it ran ~85 rAF/s here).
        // Pin the refresh driver to 60 Hz so the run matches a 60 Hz display, as
        // headless Chromium does.
        launchOptions: { firefoxUserPrefs: { 'layout.frame_rate': 60 } },
      },
      testMatch: /layout-performance\.spec\.ts/,
      grep: /renders at display rate/,
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
