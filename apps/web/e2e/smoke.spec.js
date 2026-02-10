const { test, expect } = require('@playwright/test');

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

test('smoke: documents upload works (csv)', async ({ page }) => {
  await login(page);

  await page.goto('/documents');
  await expect(page.getByRole('heading', { name: 'Dokumente', exact: true })).toBeVisible();

  const fileInput = page.locator('input[type="file"]').first();
  const sampleCsv = {
    name: 'sample.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('account,amount\nexample,42\n', 'utf-8'),
  };
  await fileInput.setInputFiles([sampleCsv]);

  await expect(page.getByText('1 Dokument(e) erfolgreich hochgeladen')).toBeVisible();
  await expect(page.getByRole('table').getByText('sample.csv')).toBeVisible({ timeout: 30_000 });
});

test('smoke: documents pagination loads more', async ({ page }) => {
  await login(page);

  await page.goto('/documents');
  await expect(page.getByRole('heading', { name: 'Dokumente', exact: true })).toBeVisible();

  const loadMore = page.getByRole('button', { name: 'Mehr laden' });
  await expect(loadMore).toBeVisible();

  const rows = page.locator('table tbody tr');
  await expect(rows).toHaveCount(25);

  await loadMore.click();
  await expect.poll(async () => rows.count()).toBeGreaterThan(25);
});

test('smoke: admin user management basics', async ({ page }) => {
  await login(page);

  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Benutzerverwaltung' })).toBeVisible();

  const userEmail = `e2e.user+${Date.now()}@example.com`;
  const userPassword = 'Password123!';

  await page.getByRole('button', { name: 'Neuer Benutzer' }).click();

  const createModal = page.getByRole('dialog', { name: 'Neuen Benutzer erstellen' });
  await createModal.locator('input[type="email"]').fill(userEmail);
  await createModal.locator('input[type="password"]').fill(userPassword);
  await createModal.locator('input[type="text"]').nth(0).fill('E2E');
  await createModal.locator('input[type="text"]').nth(1).fill('User');
  await createModal.locator('select').selectOption('viewer');
  await createModal.getByRole('button', { name: 'Erstellen' }).click();

  const userRow = page.locator('tr', { hasText: userEmail });
  await expect(userRow).toBeVisible();

  await userRow.getByRole('button', { name: 'Bearbeiten' }).click();
  const editModal = page.getByRole('dialog', { name: 'Benutzer bearbeiten' });
  await expect(editModal).toBeVisible();
  await editModal.getByRole('button', { name: 'Abbrechen' }).click();

  await page
    .locator('tr', { hasText: userEmail })
    .getByRole('button', { name: /passwort/i })
    .click();
  const resetDialog = page.getByRole('dialog', { name: /passwort/i });
  await resetDialog.locator('input[type="password"]').fill('NewPassword123!');
  await resetDialog.getByRole('button', { name: /zur/i }).click();

  await expect(page.getByText(/Passwort erfolgreich/i)).toBeVisible();
});

test('smoke: anomalies and notification settings pages load', async ({ page }) => {
  await login(page);

  await page.goto('/anomalies');
  await expect(page.getByRole('heading', { name: 'Anomalien' })).toBeVisible();

  await expect(page.getByText('E2E test anomaly')).toBeVisible();

  await page.goto('/settings/notifications');
  await expect(page.getByRole('heading', { name: 'Notification settings' })).toBeVisible();
  await expect(page.locator('input[aria-label="Email alerts enabled"]')).toBeVisible();
  await expect(page.locator('input[aria-label="Daily digest enabled"]')).toBeVisible();
});
