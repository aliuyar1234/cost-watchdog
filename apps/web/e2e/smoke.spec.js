const { test, expect } = require('@playwright/test');
const fs = require('fs');
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

test('smoke: documents upload works (pdf/csv/xlsx)', async ({ page }) => {
  await login(page);

  await page.goto('/documents');
  await expect(page.getByRole('heading', { name: 'Dokumente', exact: true })).toBeVisible();

  const samplePdfPath = path.join(__dirname, 'fixtures', 'sample.pdf');

  const fileInput = page.locator('input[type="file"]').first();
  const samplePdf = {
    name: 'sample.pdf',
    mimeType: 'application/pdf',
    buffer: fs.readFileSync(samplePdfPath),
  };
  const sampleCsv = {
    name: 'sample.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('account,amount\nexample,42\n', 'utf-8'),
  };
  const sampleXlsx = {
    name: 'sample.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    // Minimal ZIP local file header. file-type detects this as application/zip, which is allowed for XLSX.
    buffer: Buffer.from([
      0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]),
  };

  await fileInput.setInputFiles([samplePdf, sampleCsv, sampleXlsx]);

  await expect(page.getByText('3 Dokument(e) erfolgreich hochgeladen')).toBeVisible();
  await expect(page.getByText('sample.pdf')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('sample.csv')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('sample.xlsx')).toBeVisible({ timeout: 30_000 });
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

  const createModal = page.getByRole('heading', { name: 'Neuen Benutzer erstellen' }).locator('..');
  await createModal.locator('input[type="email"]').fill(userEmail);
  await createModal.locator('input[type="password"]').fill(userPassword);
  await createModal.locator('input[type="text"]').nth(0).fill('E2E');
  await createModal.locator('input[type="text"]').nth(1).fill('User');
  await createModal.locator('select').selectOption('viewer');
  await createModal.getByRole('button', { name: 'Erstellen' }).click();

  const userRow = page.locator('tr', { hasText: userEmail });
  await expect(userRow).toBeVisible();

  await userRow.getByRole('button', { name: 'Bearbeiten' }).click();
  const editModal = page.getByRole('heading', { name: 'Benutzer bearbeiten' }).locator('..');
  await editModal.locator('input[type="text"]').nth(0).fill('E2E2');
  await editModal.locator('select').selectOption('manager');
  await editModal.getByRole('button', { name: 'Speichern' }).click();

  await expect(page.locator('tr', { hasText: userEmail })).toContainText('Manager');

  await page
    .locator('tr', { hasText: userEmail })
    .getByRole('button', { name: /passwort/i })
    .click();
  const resetDialog = page.getByRole('dialog', { name: /passwort/i });
  await resetDialog.locator('input[type="password"]').fill('NewPassword123!');
  await resetDialog.getByRole('button', { name: /zur/i }).click();

  await expect(page.getByText(/Passwort erfolgreich/i)).toBeVisible();

  await page
    .locator('tr', { hasText: userEmail })
    .getByRole('button', { name: 'Deaktivieren' })
    .click();
  const deactivateDialog = page.getByRole('dialog', { name: /deaktivieren/i });
  await deactivateDialog.getByRole('button', { name: 'Deaktivieren' }).click();

  await expect(page.locator('tr', { hasText: userEmail })).toContainText('Inaktiv');
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
