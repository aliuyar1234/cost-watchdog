const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const E2E_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@example.com';
const E2E_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'Password123!';
const OUTPUT_DIR =
  process.env.SHOWCASE_OUTPUT_DIR ||
  path.resolve(process.cwd(), '..', '..', 'showcase-screenshots');

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function login(page) {
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(E2E_EMAIL);
  await page.getByLabel('Passwort').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function capture(page, name, headingText) {
  await expect(page.getByRole('heading', { name: headingText }).first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(700);
  await page.screenshot({
    path: path.join(OUTPUT_DIR, name),
    fullPage: true,
    animations: 'disabled',
  });
}

test('showcase: capture platform screenshots', async ({ page }) => {
  ensureOutputDir();
  await page.setViewportSize({ width: 1728, height: 1117 });

  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.screenshot({
    path: path.join(OUTPUT_DIR, '01-login.png'),
    fullPage: true,
    animations: 'disabled',
  });

  await login(page);

  await capture(page, '02-dashboard.png', 'Dashboard');

  await page.goto('/anomalies');
  await capture(page, '03-anomalies.png', 'Anomalien');

  await page.goto('/documents');
  await capture(page, '04-documents.png', 'Dokumente');

  await page.goto('/admin/users');
  await capture(page, '05-admin-users.png', 'Benutzerverwaltung');

  await page.goto('/admin/settings');
  await capture(page, '06-admin-settings.png', 'Einstellungen');

  await page.goto('/settings/notifications');
  await capture(page, '07-notifications.png', 'Notification settings');
});
