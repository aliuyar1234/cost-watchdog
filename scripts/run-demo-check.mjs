import { spawn, spawnSync } from 'child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const composeFile = resolve(repoRoot, 'infrastructure', 'docker-compose.yml');

const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');

const showcaseDir = resolve(repoRoot, 'showcase-screenshots', `demo-check-${timestamp}`);
const reportPath = resolve(showcaseDir, 'demo-check-report.json');

const DEFAULT_DATABASE_URL =
  'postgresql://cost_watchdog:cost_watchdog_dev@localhost:5432/cost_watchdog?schema=public';
const DEFAULT_REDIS_URL = 'redis://localhost:6379';
const DEFAULT_AUTH_SECRET = 'dev-auth-secret-32-chars-minimum!!';
const DEFAULT_FIELD_ENCRYPTION_KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const DEFAULT_S3_ENDPOINT = 'http://localhost:9000';
const DEFAULT_S3_BUCKET = 'cost-watchdog';
const DEFAULT_S3_ACCESS_KEY = 'minio_admin';
const DEFAULT_S3_SECRET_KEY = 'minio_admin_dev';
const DEFAULT_S3_REGION = 'eu-central-1';
const DEFAULT_API_PORT = '3101';
const DEFAULT_WEB_PORT = '3100';
const DEFAULT_WEB_URL = 'http://localhost:3100';
const DEFAULT_API_BASE_URL = `http://localhost:${DEFAULT_API_PORT}/api/v1`;
const DEFAULT_PLAYWRIGHT_BASE_URL = DEFAULT_WEB_URL;
const DEFAULT_ADMIN_EMAIL = 'admin@techflow.de';
const DEFAULT_ADMIN_PASSWORD = 'Demo2024!';
const PNPM_CMD = 'pnpm';

const shouldShutdownInfra = process.env['DEMO_CHECK_SHUTDOWN_INFRA'] === 'true';
const shouldSkipScreenshots = process.env['DEMO_CHECK_SKIP_SCREENSHOTS'] === 'true';

const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || DEFAULT_DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL || DEFAULT_REDIS_URL,
  AUTH_SECRET: process.env.AUTH_SECRET || DEFAULT_AUTH_SECRET,
  COOKIE_SECRET: process.env.COOKIE_SECRET || DEFAULT_AUTH_SECRET,
  FIELD_ENCRYPTION_KEY: process.env.FIELD_ENCRYPTION_KEY || DEFAULT_FIELD_ENCRYPTION_KEY,
  S3_ENDPOINT: process.env.S3_ENDPOINT || DEFAULT_S3_ENDPOINT,
  S3_BUCKET: process.env.S3_BUCKET || DEFAULT_S3_BUCKET,
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY || DEFAULT_S3_ACCESS_KEY,
  S3_SECRET_KEY: process.env.S3_SECRET_KEY || DEFAULT_S3_SECRET_KEY,
  S3_REGION: process.env.S3_REGION || DEFAULT_S3_REGION,
  WEB_URL: process.env.WEB_URL || DEFAULT_WEB_URL,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_BASE_URL,
  PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL || DEFAULT_PLAYWRIGHT_BASE_URL,
  E2E_ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD,
  SHOWCASE_OUTPUT_DIR: process.env.SHOWCASE_OUTPUT_DIR || showcaseDir,
};

// Force deterministic policy check: PDF upload requires key and should fail when missing.
delete env['ANTHROPIC_API_KEY'];

mkdirSync(env.SHOWCASE_OUTPUT_DIR, { recursive: true });

function runSync(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`${cmd} ${args.join(' ')} failed with exit code ${result.status}`);
    error.exitCode = result.status;
    throw error;
  }
}

function runCapture(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return (result.stdout || '').trim();
}

function runPnpm(args, options = {}) {
  if (process.platform === 'win32') {
    runSync('cmd.exe', ['/d', '/s', '/c', PNPM_CMD, ...args], options);
    return;
  }
  runSync(PNPM_CMD, args, options);
}

function spawnPnpm(args, options = {}) {
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/d', '/s', '/c', PNPM_CMD, ...args], { ...options });
  }
  return spawn(PNPM_CMD, args, { ...options });
}

function resolveComposeCommand() {
  const dockerCompose = runCapture('docker', ['compose', 'version']);
  if (dockerCompose) return { cmd: 'docker', args: ['compose'] };

  const legacyCompose = runCapture('docker-compose', ['version']);
  if (legacyCompose) return { cmd: 'docker-compose', args: [] };

  throw new Error('Docker Compose not found. Install docker compose or docker-compose.');
}

const compose = resolveComposeCommand();

function runCompose(args) {
  runSync(compose.cmd, [...compose.args, ...args], { cwd: repoRoot, env });
}

async function sleep(ms) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function waitForHealthy(containerName, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = runCapture('docker', [
      'inspect',
      '-f',
      '{{.State.Health.Status}}',
      containerName,
    ]);
    if (status === 'healthy') return;
    if (status === 'unhealthy') {
      throw new Error(`Container ${containerName} reported unhealthy status.`);
    }
    await sleep(2000);
  }
  throw new Error(`Timed out waiting for ${containerName} to become healthy.`);
}

async function waitForHttpOk(url, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) return;
    } catch {
      // ignore and retry
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for ${url} to respond.`);
}

function killProcessTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  child.kill('SIGTERM');
}

async function loginAndGetAccessToken(apiBaseUrl, email, password) {
  const response = await fetch(`${apiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Demo login failed (${response.status}): ${payload?.message || payload?.error || 'Unknown error'}`,
    );
  }

  if (!payload?.accessToken || typeof payload.accessToken !== 'string') {
    throw new Error('Demo login did not return an accessToken. Ensure NODE_ENV is not production.');
  }

  return payload.accessToken;
}

function getSetCookieValues(headers) {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }

  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

async function getCsrfContext(apiBaseUrl) {
  const response = await fetch(`${apiBaseUrl}/csrf/token`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.token) {
    throw new Error(`Failed to obtain CSRF token (status ${response.status})`);
  }

  const cookies = getSetCookieValues(response.headers)
    .map((setCookie) => setCookie.split(';')[0])
    .filter(Boolean);

  if (cookies.length === 0) {
    throw new Error('Failed to obtain CSRF cookie from /csrf/token');
  }

  return {
    token: payload.token,
    cookieHeader: cookies.join('; '),
  };
}

async function uploadFileWithBearer(apiBaseUrl, accessToken, csrf, file) {
  const form = new FormData();
  form.append('file', file.blob, file.filename);

  const response = await fetch(`${apiBaseUrl}/documents/upload`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      cookie: csrf.cookieHeader,
      'x-csrf-token': csrf.token,
    },
    body: form,
  });

  const payload = await response.json().catch(() => ({}));
  return {
    status: response.status,
    body: payload,
  };
}

async function runIngestPolicyChecks(apiBaseUrl, accessToken, csrf) {
  const csvUpload = await uploadFileWithBearer(apiBaseUrl, accessToken, csrf, {
    filename: 'demo-check.csv',
    blob: new Blob(
      [
        'periodStart,periodEnd,amount,currency,costType,supplierName\n2026-01-01,2026-01-31,999.5,EUR,electricity,Demo Supplier\n',
      ],
      { type: 'text/csv' },
    ),
  });

  if (csvUpload.status !== 201) {
    throw new Error(
      `CSV ingest check failed: expected 201, got ${csvUpload.status} (${csvUpload.body?.message || 'no message'})`,
    );
  }

  const xlsxUpload = await uploadFileWithBearer(apiBaseUrl, accessToken, csrf, {
    filename: 'blocked.xlsx',
    blob: new Blob(
      [new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    ),
  });

  if (xlsxUpload.status !== 400) {
    throw new Error(
      `XLSX ingest policy check failed: expected 400, got ${xlsxUpload.status} (${xlsxUpload.body?.message || 'no message'})`,
    );
  }

  const xlsxMessage = String(xlsxUpload.body?.message || '');
  if (!xlsxMessage.includes('Supported ingest types')) {
    throw new Error(`XLSX ingest policy check failed: unexpected message "${xlsxMessage}"`);
  }

  const pdfUpload = await uploadFileWithBearer(apiBaseUrl, accessToken, csrf, {
    filename: 'blocked.pdf',
    blob: new Blob(['%PDF-1.4 demo check'], { type: 'application/pdf' }),
  });

  if (pdfUpload.status !== 422) {
    throw new Error(
      `PDF ingest policy check failed: expected 422, got ${pdfUpload.status} (${pdfUpload.body?.message || 'no message'})`,
    );
  }

  const pdfMessage = String(pdfUpload.body?.message || '');
  if (!pdfMessage.includes('ANTHROPIC_API_KEY')) {
    throw new Error(`PDF ingest policy check failed: unexpected message "${pdfMessage}"`);
  }

  return {
    csvUploadStatus: csvUpload.status,
    xlsxUploadStatus: xlsxUpload.status,
    xlsxUploadMessage: xlsxMessage,
    pdfUploadStatus: pdfUpload.status,
    pdfUploadMessage: pdfMessage,
  };
}

async function main() {
  let exitCode = 0;
  let apiProc = null;
  let webProc = null;

  const report = {
    ranAt: new Date().toISOString(),
    showcaseOutputDir: env.SHOWCASE_OUTPUT_DIR,
    environment: {
      databaseUrl: env.DATABASE_URL,
      redisUrl: env.REDIS_URL,
      webUrl: env.WEB_URL,
      apiBaseUrl: env.NEXT_PUBLIC_API_URL,
      anthropicConfigured: false,
    },
    steps: {
      infra: 'pending',
      seed: 'pending',
      health: 'pending',
      ingestPolicy: 'pending',
      screenshots: shouldSkipScreenshots ? 'skipped' : 'pending',
    },
  };

  try {
    const apiBaseUrl = env.NEXT_PUBLIC_API_URL;
    const apiOrigin = new URL(apiBaseUrl).origin;
    const webUrl = env.WEB_URL;
    const apiEnv = {
      ...env,
      PORT: process.env.PORT || DEFAULT_API_PORT,
    };
    const webEnv = {
      ...env,
      PORT: process.env.WEB_PORT || DEFAULT_WEB_PORT,
    };

    runCompose(['-f', composeFile, 'up', '-d']);
    await waitForHealthy('cost-watchdog-postgres');
    await waitForHealthy('cost-watchdog-redis');
    await waitForHealthy('cost-watchdog-minio');
    report.steps.infra = 'ok';

    runPnpm(['--filter', '@cost-watchdog/api', 'db:push'], { cwd: repoRoot, env });
    runPnpm(['--filter', '@cost-watchdog/api', 'seed:demo'], { cwd: repoRoot, env });
    report.steps.seed = 'ok';

    apiProc = spawnPnpm(['--filter', '@cost-watchdog/api', 'exec', 'tsx', 'src/index.ts'], {
      cwd: repoRoot,
      env: apiEnv,
      stdio: 'inherit',
    });
    await waitForHttpOk(`${apiOrigin}/health`, 90000);

    webProc = spawnPnpm(['--filter', '@cost-watchdog/web', 'dev'], {
      cwd: repoRoot,
      env: webEnv,
      stdio: 'inherit',
    });
    await waitForHttpOk(webUrl, 120000);
    report.steps.health = 'ok';

    const accessToken = await loginAndGetAccessToken(
      apiBaseUrl,
      env.E2E_ADMIN_EMAIL,
      env.E2E_ADMIN_PASSWORD,
    );
    const csrf = await getCsrfContext(apiBaseUrl);

    const dashboardResponse = await fetch(`${apiBaseUrl}/analytics/dashboard`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!dashboardResponse.ok) {
      throw new Error(`Dashboard check failed with status ${dashboardResponse.status}`);
    }

    const ingestPolicy = await runIngestPolicyChecks(apiBaseUrl, accessToken, csrf);
    report.steps.ingestPolicy = 'ok';
    report.ingestPolicy = ingestPolicy;

    if (!shouldSkipScreenshots) {
      runPnpm(
        ['--filter', '@cost-watchdog/web', 'exec', 'playwright', 'test', 'e2e/showcase.spec.js'],
        { cwd: repoRoot, env: webEnv },
      );

      const screenshotFiles = readdirSync(env.SHOWCASE_OUTPUT_DIR)
        .filter((entry) => entry.toLowerCase().endsWith('.png'))
        .sort();

      report.steps.screenshots = 'ok';
      report.screenshots = screenshotFiles;
    }

    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`Demo check report written to: ${reportPath}`);
    // eslint-disable-next-line no-console
    console.log(`Showcase output dir: ${env.SHOWCASE_OUTPUT_DIR}`);
  } catch (error) {
    exitCode = error?.exitCode || 1;
    report.error = error instanceof Error ? error.message : String(error);
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    // eslint-disable-next-line no-console
    console.error(error?.message || error);
  } finally {
    killProcessTree(webProc);
    killProcessTree(apiProc);

    if (shouldShutdownInfra) {
      try {
        runCompose(['-f', composeFile, 'down']);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to stop infrastructure:', error?.message || error);
        exitCode = exitCode || 1;
      }
    }
  }

  process.exit(exitCode);
}

main();
