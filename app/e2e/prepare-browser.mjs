/**
 * Installs the browser executables that the project's pinned Playwright
 * dependency expects. The directory is ignored and lives beside the app so
 * a clean clone has one explicit, reproducible prerequisite:
 *
 *   npm ci
 *   npm run e2e:install-browser
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = resolve(appRoot, 'node_modules', 'playwright', 'cli.js');
const env = {
  ...process.env,
  PLAYWRIGHT_BROWSERS_PATH: resolve(appRoot, '.playwright-browsers'),
};

for (const browser of ['chromium', 'chromium-headless-shell']) {
  const result = spawnSync(process.execPath, [cli, 'install', browser], {
    cwd: appRoot,
    env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
