import { spawn, spawnSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const composeFile = resolve(repoRoot, 'infrastructure', 'docker-compose.e2e.yml');

const DEFAULT_DATABASE_URL =
  'postgresql://cost_watchdog_e2e_test:cost_watchdog_e2e_test@localhost:5434/cost_watchdog_e2e_test?schema=public';
const DEFAULT_REDIS_URL = 'redis://localhost:6381';
const DEFAULT_AUTH_SECRET = 'test-auth-secret-32-chars-minimum!!';

const DEFAULT_S3_ENDPOINT = 'http://localhost:9002';
const DEFAULT_S3_BUCKET = 'cost-watchdog-e2e';
const DEFAULT_S3_ACCESS_KEY = 'minio_admin';
const DEFAULT_S3_SECRET_KEY = 'minio_admin_dev';
const DEFAULT_S3_REGION = 'eu-central-1';

const DEFAULT_WEB_URL = 'http://localhost:3000';
const DEFAULT_NEXT_PUBLIC_API_URL = 'http://localhost:3001/api/v1';

const PNPM_CMD = 'pnpm';

const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || 'test',
  DATABASE_URL: process.env.DATABASE_URL || DEFAULT_DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL || DEFAULT_REDIS_URL,
  AUTH_SECRET: process.env.AUTH_SECRET || DEFAULT_AUTH_SECRET,
  COOKIE_SECRET: process.env.COOKIE_SECRET || DEFAULT_AUTH_SECRET,
  S3_ENDPOINT: process.env.S3_ENDPOINT || DEFAULT_S3_ENDPOINT,
  S3_BUCKET: process.env.S3_BUCKET || DEFAULT_S3_BUCKET,
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY || DEFAULT_S3_ACCESS_KEY,
  S3_SECRET_KEY: process.env.S3_SECRET_KEY || DEFAULT_S3_SECRET_KEY,
  S3_REGION: process.env.S3_REGION || DEFAULT_S3_REGION,
  WEB_URL: process.env.WEB_URL || DEFAULT_WEB_URL,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || DEFAULT_NEXT_PUBLIC_API_URL,
  E2E_ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL || 'admin@example.com',
  E2E_ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD || 'Password123!',
  PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL || DEFAULT_WEB_URL,
};

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
  if (dockerCompose) {
    return { cmd: 'docker', args: ['compose'] };
  }

  const legacyCompose = runCapture('docker-compose', ['version']);
  if (legacyCompose) {
    return { cmd: 'docker-compose', args: [] };
  }

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
    if (status === 'unhealthy')
      throw new Error(`Container ${containerName} reported unhealthy status.`);
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
    // Kill the whole process tree (cmd.exe -> pnpm -> node/next).
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }

  child.kill('SIGTERM');
}

async function main() {
  let exitCode = 0;

  /** @type {import('child_process').ChildProcess | null} */
  let apiProc = null;
  /** @type {import('child_process').ChildProcess | null} */
  let webProc = null;

  try {
    runCompose(['-f', composeFile, 'up', '-d']);

    await waitForHealthy('cost-watchdog-postgres-e2e');
    await waitForHealthy('cost-watchdog-redis-e2e');
    await waitForHealthy('cost-watchdog-minio-e2e');

    runPnpm(['--filter', '@cost-watchdog/api', 'db:push'], { cwd: repoRoot, env });
    runPnpm(['--filter', '@cost-watchdog/api', 'exec', 'tsx', 'scripts/seed-e2e.ts'], {
      cwd: repoRoot,
      env,
    });

    apiProc = spawnPnpm(['--filter', '@cost-watchdog/api', 'exec', 'tsx', 'src/index.ts'], {
      cwd: repoRoot,
      env,
      stdio: 'inherit',
    });
    await waitForHttpOk('http://localhost:3001/health', 60000);

    webProc = spawnPnpm(['--filter', '@cost-watchdog/web', 'dev'], {
      cwd: repoRoot,
      env,
      stdio: 'inherit',
    });
    await waitForHttpOk('http://localhost:3000/', 120000);

    runPnpm(['--filter', '@cost-watchdog/web', 'test:e2e'], { cwd: repoRoot, env });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error.message || error);
    exitCode = error.exitCode || 1;
  } finally {
    killProcessTree(webProc);
    killProcessTree(apiProc);

    try {
      runCompose(['-f', composeFile, 'down', '-v']);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to shut down e2e containers:', error.message || error);
      exitCode = exitCode || 1;
    }
  }

  process.exit(exitCode);
}

main();
