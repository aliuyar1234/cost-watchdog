import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

function findUp(startDir: string, filename: string, maxDepth = 5): string | null {
  let dir = startDir;

  for (let depth = 0; depth <= maxDepth; depth++) {
    const candidate = resolve(dir, filename);
    if (existsSync(candidate)) return candidate;

    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

const envPath = findUp(process.cwd(), '.env');
if (envPath) {
  config({ path: envPath, override: false });
}
