import { defineConfig, devices } from '@playwright/test';
const database =
  process.env.AUTH_TEST_DATABASE_URL ||
  'postgresql://socialflow:socialflow_local@localhost:55432/socialflow_auth_test?schema=public';
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 90000,
  forbidOnly: !!process.env.CI,
  retries: 0,
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
      env: {
        NODE_ENV: 'test',
        META_APP_ID: '',
        META_APP_SECRET: '',
        META_PUBLIC_API_ORIGIN: 'https://api.example.test',
        PORT: '4018',
        WEB_ORIGIN: 'http://localhost:3017',
        DATABASE_URL: database,
        GOOGLE_CLIENT_ID: '',
        GOOGLE_CLIENT_SECRET: '',
        MEDIA_STORAGE_PATH: '.data/media-e2e',
      },
      url: 'http://localhost:4018/api/health',
      reuseExistingServer: false,
      timeout: 90000,
    },
    {
      command: 'npm exec --workspace=@social-flow/web -- next dev --port 3017',
      env: {
        NEXT_DIST_DIR: '.next-e2e',
        NEXT_PUBLIC_API_URL: 'http://localhost:4018/api',
        API_INTERNAL_URL: 'http://localhost:4018/api',
      },
      url: 'http://localhost:3017/login',
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
