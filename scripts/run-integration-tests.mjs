import { spawnSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const composeFile = resolve(repoRoot, 'infrastructure', 'docker-compose.test.yml');

const DEFAULT_DATABASE_URL =
  'postgresql://cost_watchdog_test:cost_watchdog_test@localhost:5433/cost_watchdog_test?schema=public';
const DEFAULT_REDIS_URL = 'redis://localhost:6380';
const DEFAULT_AUTH_SECRET = 'test-auth-secret-32-chars-minimum!!';
const PNPM_CMD = 'pnpm';

const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || 'test',
  DATABASE_URL: process.env.DATABASE_URL || DEFAULT_DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL || DEFAULT_REDIS_URL,
  AUTH_SECRET: process.env.AUTH_SECRET || DEFAULT_AUTH_SECRET,
};

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const error = new Error(`${cmd} ${args.join(' ')} failed with exit code ${result.status}`);
    error.exitCode = result.status;
    throw error;
  }
}

function runCapture(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    return null;
  }
  return (result.stdout || '').trim();
}

function runPnpm(args, options = {}) {
  if (process.platform === 'win32') {
    // pnpm is typically a .cmd shim on Windows and cannot be executed directly via spawnSync.
    // Use cmd.exe so argument passing stays explicit and we avoid Node's shell warning.
    run('cmd.exe', ['/d', '/s', '/c', PNPM_CMD, ...args], options);
    return;
  }

  run(PNPM_CMD, args, options);
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
  run(compose.cmd, [...compose.args, ...args], { cwd: repoRoot });
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
    if (status === 'healthy') {
      return;
    }
    if (status === 'unhealthy') {
      throw new Error(`Container ${containerName} reported unhealthy status.`);
    }
    await sleep(2000);
  }

  throw new Error(`Timed out waiting for ${containerName} to become healthy.`);
}

async function main() {
  let exitCode = 0;

  try {
    runCompose(['-f', composeFile, 'up', '-d']);

    await waitForHealthy('cost-watchdog-postgres-test');
    await waitForHealthy('cost-watchdog-redis-test');

    runPnpm(['--filter', '@cost-watchdog/api', 'db:push'], { cwd: repoRoot, env });
    runPnpm(['--filter', '@cost-watchdog/api', 'test'], { cwd: repoRoot, env });
  } catch (error) {
    console.error(error.message || error);
    exitCode = error.exitCode || 1;
  } finally {
    try {
      runCompose(['-f', composeFile, 'down', '-v']);
    } catch (error) {
      console.error('Failed to shut down test containers:', error.message || error);
      exitCode = exitCode || 1;
    }
  }

  process.exit(exitCode);
}

main();
