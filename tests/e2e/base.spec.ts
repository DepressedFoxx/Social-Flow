import { test, expect } from '@playwright/test';
test('frontend connects to the real API and fits the viewport', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Không gian nội dung' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Đã kết nối API SocialFlow.');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
});
test('API error is visible and retry recovers', async ({ page }) => {
  await page.route('**/api/health', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Chưa kết nối được API');
  await page.unroute('**/api/health');
  await page.getByRole('button', { name: 'Kiểm tra lại' }).click();
  await expect(page.getByRole('status')).toContainText('Đã kết nối API SocialFlow.');
});
