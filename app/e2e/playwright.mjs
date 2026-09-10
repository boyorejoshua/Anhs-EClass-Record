/**
 * The E2E suites use the exact Playwright version declared by this app.
 *
 * Install its matching Chromium binary once after `npm ci` with
 * `npm run e2e:install-browser`. Both installation and execution use the
 * ignored project-local browser directory below, instead of a global npm
 * prefix or a shared machine cache.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(appRoot, '.playwright-browsers');

const { chromium } = await import('playwright');
export { chromium };
