const { test, expect } = require('@playwright/test');
const path = require('path');

const E2E_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@example.com';
const E2E_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'Password123!';

async function login(page) {
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(E2E_EMAIL);
  await page.getByLabel('Passwort').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test('smoke: login and dashboard loads', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('smoke: documents upload works', async ({ page }) => {
  await login(page);

  await page.goto('/documents');
  await expect(page.getByRole('heading', { name: 'Dokumente', exact: true })).toBeVisible();

  const samplePdf = path.join(__dirname, 'fixtures', 'sample.pdf');

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(samplePdf);

  await expect(page.getByText('1 Dokument(e) erfolgreich hochgeladen')).toBeVisible();
  await expect(page.getByText('sample.pdf')).toBeVisible();
});

test('smoke: acknowledge anomaly and update notification settings', async ({ page }) => {
  await login(page);

  await page.goto('/anomalies');
  await expect(page.getByRole('heading', { name: 'Anomalien' })).toBeVisible();

  await expect(page.getByText('E2E test anomaly')).toBeVisible();

  const acknowledge = page.getByRole('button', { name: /best/i }).first();
  await acknowledge.click();

  await expect(page.getByText('E2E test anomaly')).not.toBeVisible();

  await page.goto('/settings/notifications');
  await expect(page.getByRole('heading', { name: 'Notification settings' })).toBeVisible();

  await page.locator('input[aria-label="Email alerts enabled"] + div').click();

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Notification settings updated.')).toBeVisible();
});
