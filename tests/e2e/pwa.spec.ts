/**
 * "Add to Home Screen" has to actually work from the build that is served.
 *
 * Nothing here is about what the game looks like; it is about the four things
 * iOS and Android read before they will put an icon on a home screen: the
 * manifest resolves, it is fullscreen, it declares icons, and every icon URL
 * (including the apple-touch-icon links, which iOS reads instead of the
 * manifest) really is a PNG that the preview server serves.
 */
import { expect, test } from '@playwright/test';
import { bootGame, expectWordless } from './helpers';

interface ManifestIcon {
  src: string;
  sizes: string;
  type?: string;
}

test('the manifest and every icon it names resolve from the served build', async ({
  request,
}) => {
  const res = await request.get('/manifest.json');
  expect(res.status()).toBe(200);
  const manifest = (await res.json()) as {
    name: string;
    display: string;
    background_color: string;
    icons: ManifestIcon[];
  };

  expect(manifest.name.length).toBeGreaterThan(0);
  // Fullscreen is the whole point: no Safari chrome over a wordless game.
  expect(manifest.display).toBe('fullscreen');
  expect(manifest.background_color.toLowerCase()).toBe('#fff7e8');
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

  const sizes = manifest.icons.map((i) => i.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');

  for (const icon of manifest.icons) {
    const got = await request.get(icon.src);
    expect(got.status(), `${icon.src} should be served`).toBe(200);
    expect(got.headers()['content-type']).toContain('image/png');
    const body = await got.body();
    expect(body.length).toBeGreaterThan(1000);
    // A real PNG, not an HTML fallback page with a 200 on it.
    expect(body.subarray(1, 4).toString('ascii')).toBe('PNG');
  }
});

test('iOS finds an apple-touch-icon, and the page is still wordless', async ({ page, request }) => {
  await bootGame(page);
  const hrefs = await page.locator('link[rel="apple-touch-icon"]').evaluateAll((els) =>
    els.map((el) => (el as HTMLLinkElement).getAttribute('href') ?? ''),
  );
  expect(hrefs.length).toBeGreaterThanOrEqual(1);
  for (const href of hrefs) {
    const got = await request.get(href);
    expect(got.status(), `${href} should be served`).toBe(200);
    expect(got.headers()['content-type']).toContain('image/png');
  }
  // The manifest carries the only words in the project, and none of them are
  // ever drawn: the screen itself stays wordless.
  await expectWordless(page);
});

test('the icon is drawn, like everything else, and ships no photographs', async ({ request }) => {
  const res = await request.get('/icons/icon-512.png');
  const body = await res.body();
  // Procedurally drawn flat crayon colours compress to almost nothing; a
  // photograph or an exported bitmap would be an order of magnitude bigger.
  expect(body.length).toBeLessThan(200 * 1024);
});
