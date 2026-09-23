import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

test('email auth lifecycle, errors, session expiry and responsive layout', async ({
  page,
}) => {
  const email = 'e2e-' + randomUUID() + '@example.com';
  const password = 'SocialFlow test password 2026!';
  const client = new Client({
    connectionString:
      process.env.AUTH_TEST_DATABASE_URL ||
      'postgresql://socialflow:socialflow_local@localhost:55432/socialflow_auth_test',
  });
  await client.connect();
  try {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole('button', { name: 'Tiếp tục với Google' }),
    ).toBeDisabled();
    await page.getByRole('link', { name: 'Tạo tài khoản' }).click();
    await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
    await expect(page.getByText('Tên cần ít nhất 2 ký tự.')).toBeVisible();
    await page.getByLabel('Tên hiển thị').fill('Auth E2E');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await page.getByLabel('Xác nhận mật khẩu').fill(password);
    await page.route('**/api/dashboard', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
    );
    await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole('heading', { name: 'Chưa tải được dashboard' }),
    ).toBeVisible();
    await page.unroute('**/api/dashboard');
    await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
    await expect(page.getByText('Chưa có bài nào được lên lịch')).toBeVisible();
    await expect(page.getByText('Facebook mẫu')).toBeHidden();
    const menuButton = page.getByRole('button', { name: 'Mở menu' });
    if (await menuButton.isVisible()) {
      await menuButton.click();
      await expect(
        page.getByRole('navigation', { name: 'Menu workspace' }).getByRole('link', {
          name: 'Bài viết',
        }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Đóng menu', exact: true }).last().click();
    } else {
      await expect(
        page.getByRole('navigation', { name: 'Menu workspace' }).getByRole('link', {
          name: 'Bài viết',
        }),
      ).toBeVisible();
    }
    await page.reload();
    await expect(page.getByText('Instagram mẫu')).toBeHidden();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
    );
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    await expect(
      page.getByText('Không thể kiểm tra phiên đăng nhập. Vui lòng thử lại.'),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.unroute('**/api/auth/me');
    await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
    await expect(page.getByText('Facebook mẫu')).toBeHidden();
    await page.route('**/api/auth/logout', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
    );
    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await expect(
      page.getByText('Đăng xuất chưa thành công. Vui lòng thử lại.'),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.unroute('**/api/auth/logout');
    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill('wrong');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Email hoặc mật khẩu không đúng.' }),
    ).toContainText('Email hoặc mật khẩu không đúng.');
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await client.query(
      'UPDATE "Session" SET "expiresAt"=$1 WHERE "userId" IN (SELECT id FROM "User" WHERE email=$2)',
      [new Date(0), email],
    );
    await page.reload();
    await expect(page).toHaveURL(/\/login(?:\?reason=expired)?$/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    await client.query('DELETE FROM "User" WHERE email=$1', [email]);
    await client.end();
  }
});

test('post draft lifecycle keeps filters in the URL', async ({ page }) => {
  const email = 'post-e2e-' + randomUUID() + '@example.com';
  const password = 'SocialFlow test password 2026!';
  const title = 'Chiến dịch mùa thu ' + randomUUID().slice(0, 8);
  const updatedTitle = title + ' cập nhật';
  const client = new Client({
    connectionString:
      process.env.AUTH_TEST_DATABASE_URL ||
      'postgresql://socialflow:socialflow_local@localhost:55432/socialflow_auth_test',
  });
  await client.connect();
  try {
    await page.goto('/register');
    await page.getByLabel('Tên hiển thị').fill('Post E2E');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await page.getByLabel('Xác nhận mật khẩu').fill(password);
    await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    const workspace = await client.query(
      'SELECT w.id FROM "Workspace" w JOIN "User" u ON u.id=w."ownerId" WHERE u.email=$1',
      [email],
    );
    const channelId = randomUUID();
    await client.query(
      `INSERT INTO "Channel" (id,"workspaceId",platform,name,"isMock","externalId") VALUES ($1,$2,'FACEBOOK','Test Facebook',false,'123456789')`,
      [channelId, workspace.rows[0].id],
    );
    await client.query(
      `INSERT INTO "ChannelCredential" ("channelId","encryptedToken","pageId") VALUES ($1,'test-fixture-not-a-real-token','123456789')`,
      [channelId],
    );
    await page.goto('/posts/new');
    await page.getByLabel('Tài khoản đăng', { exact: true }).click();
    await page.getByRole('option', { name: /Test Facebook/ }).click();
    await page.getByLabel('Tiêu đề nội bộ').fill(title);
    await page
      .getByRole('textbox', { name: 'Nội dung', exact: true })
      .fill('Nội dung thử nghiệm cho chiến dịch.');
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    await page.locator('input[type="file"]').setInputFiles({
      name: 'pixel.png',
      mimeType: 'image/png',
      buffer: pixel,
    });
    await expect(page.getByAltText('Ảnh 1: pixel.png')).toBeVisible();
    await expect(page.getByText('Đang upload…')).toBeHidden();
    await page.getByRole('button', { name: 'Lưu bản nháp' }).click();
    await expect(page).toHaveURL(/\/posts\/[a-z0-9-]+$/);
    await expect(page.getByText('Phiên bản 1')).toBeVisible();
    await page.reload();
    await expect(page.getByAltText('Ảnh 1: pixel.png')).toBeVisible();

    await page.getByLabel('Tiêu đề nội bộ').fill(updatedTitle);
    await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
    await expect(page.getByText('Phiên bản 2')).toBeVisible();
    const dateInput = (offset: number) =>
      new Date(Date.now() + offset + 7 * 3600000).toISOString().slice(0, 16);
    await page.getByLabel('Ngày và giờ đăng').fill(dateInput(3600000));
    await page.getByRole('button', { name: 'Lên lịch', exact: true }).click();
    await expect(page.getByText('Đã lên lịch:', { exact: false })).toBeVisible();
    await expect(page.getByLabel('Tiêu đề nội bộ')).toBeDisabled();
    await page.getByLabel('Ngày và giờ đăng').fill(dateInput(7200000));
    await page.getByRole('button', { name: 'Đổi lịch', exact: true }).click();
    await expect(page.getByText('Phiên bản 4')).toBeVisible();
    await page.getByRole('button', { name: 'Hủy lịch', exact: true }).click();
    await page.getByRole('button', { name: 'Xác nhận hủy lịch', exact: true }).click();
    await expect(page.getByLabel('Tiêu đề nội bộ')).toBeEnabled();
    await expect(page.getByText('Phiên bản 5')).toBeVisible();
    await page.getByRole('link', { name: 'Danh sách bài viết' }).click();
    await expect(page).toHaveURL(/\/posts$/);
    await expect(
      page.getByAltText(`Ảnh đại diện ${updatedTitle}`).filter({ visible: true }),
    ).toBeVisible();

    await page.getByLabel('Tìm bài viết').fill('mùa thu');
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('mùa thu');
    await expect(
      page.getByRole('link', { name: updatedTitle, exact: true }),
    ).toBeVisible();
    await page.getByLabel('Lọc trạng thái').click();
    await page.getByRole('option', { name: 'Bản nháp' }).click();
    await expect(page).toHaveURL(/status=draft/);

    if ((page.viewportSize()?.width ?? 1024) >= 768) {
      await page.getByRole('button', { name: `Xóa ${updatedTitle}` }).click();
    } else {
      await page
        .locator('li')
        .filter({ hasText: updatedTitle })
        .getByRole('button', { name: 'Xóa' })
        .click();
    }
    await expect(page.getByRole('dialog', { name: 'Xóa bản nháp?' })).toBeVisible();
    await page.getByRole('button', { name: 'Xóa bản nháp' }).click();
    await expect(page.getByText('Không tìm thấy bài phù hợp')).toBeVisible();
    await page.goto('/media');
    await expect(page.getByRole('heading', { name: 'Dung lượng media' })).toBeVisible();
    await expect(page.getByText('Gói Personal')).toBeVisible();
    await expect(page.getByAltText('pixel.png')).toBeVisible();
    await page.getByRole('button', { name: 'Xóa pixel.png' }).click();
    await page.getByRole('button', { name: 'Xóa media' }).click();
    await expect(page.getByRole('heading', { name: 'Chưa có media' })).toBeVisible();
    await page.goto('/accounts');
    await expect(
      page.getByRole('button', { name: 'Kết nối Meta', exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole('heading', { name: 'Kết nối Meta chưa được kích hoạt' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Test Facebook' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Thêm tài khoản', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Bật tài khoản', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Bật tài khoản', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Tạm dừng', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Ngắt kết nối', exact: true }).click();
    await page
      .getByRole('button', { name: 'Xác nhận ngắt kết nối', exact: true })
      .click();
    await expect(page.getByText('FACEBOOK · Đã ngắt kết nối')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    await client.query('DELETE FROM "User" WHERE email=$1', [email]);
    await client.end();
  }
});
