/**
 * Generates the home-screen icons.
 *
 * There is no image file anywhere in this project: the kids, the props and now
 * the icon are all drawn by code. This script bundles `src/art/icon.ts` (which
 * uses the same crayon primitives and palette as the game), runs it against a
 * real Canvas2D in Chromium, and writes the PNGs the manifest points at.
 *
 *   node scripts/make-icons.mjs
 */
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, 'public', 'icons');

/** The sizes iOS and Android actually ask for. */
const SIZES = [180, 192, 512];

const bundle = await build({
  entryPoints: [join(root, 'src', 'art', 'icon.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'KidsIcon',
  target: 'es2020',
});
const code = bundle.outputFiles[0].text;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><title>i</title>');
await page.addScriptTag({ content: code });

mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  const dataUrl = await page.evaluate((s) => {
    const canvas = document.createElement('canvas');
    canvas.width = s;
    canvas.height = s;
    const ctx = canvas.getContext('2d');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.KidsIcon.drawIcon(ctx, s);
    return canvas.toDataURL('image/png');
  }, size);
  const png = Buffer.from(dataUrl.split(',')[1], 'base64');
  const file = join(outDir, `icon-${size}.png`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, png);
  console.log(`${file}  ${(png.length / 1024).toFixed(1)} KiB`);
}

await browser.close();
