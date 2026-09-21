import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL: 'http://localhost:3017', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } },
    },
  ],
  webServer: [
    {
      command: 'npm run start --workspace=@social-flow/api',
      env: { WEB_ORIGIN: 'http://localhost:3017' },
      url: 'http://localhost:4000/api/health',
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: 'npm exec --workspace=@social-flow/web -- next start --port 3017',
      url: 'http://localhost:3017',
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
