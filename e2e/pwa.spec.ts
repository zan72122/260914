import { spawn, type ChildProcess } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

/**
 * 配信の形の検査。
 * GitHub Pages と同じく `/260914/` の下に置いた本番の出力を `vite preview` で配り、
 * manifest と Service Worker が base 配下で正しく取れること、
 * そして一度開いたあとは機内でも起動することを確かめる。
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '/260914/';
const ORIGIN = 'http://127.0.0.1:4178';
const HOME = `${ORIGIN}${BASE}`;

let preview: ChildProcess | null = null;

async function waitFor(url: string, timeoutMs = 30_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    try {
      const r = await fetch(url);
      if (r.status < 400) return;
    } catch {
      /* まだ立っていない */
    }
    if (Date.now() > until) throw new Error(`preview server did not start: ${url}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

test.beforeAll(async () => {
  execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], { cwd: root, stdio: 'inherit' });
  preview = spawn('npx', ['vite', 'preview', '--port', '4178', '--host', '127.0.0.1'], {
    cwd: root,
    stdio: 'ignore',
  });
  await waitFor(HOME);
});

test.afterAll(() => {
  preview?.kill('SIGTERM');
});

test.describe('PWA と配信', () => {
  test('base 配下で manifest・Service Worker・アイコンが取れる', async ({ page }) => {
    const home = await page.goto(HOME);
    expect(home?.status()).toBe(200);

    // manifest の場所は base 付きで書かれている
    const href = await page.getAttribute('link[rel="manifest"]', 'href');
    expect(href).toBe(`${BASE}manifest.webmanifest`);
    const manifestRes = await page.request.get(new URL(href!, ORIGIN).href);
    expect(manifestRes.status()).toBe(200);
    const manifest = await manifestRes.json();
    expect(manifest.display).toBe('standalone');
    // 縦でも横でも遊べる
    expect(manifest.orientation).toBe('any');
    // 工房の闇色
    expect(manifest.theme_color).toBe('#05070d');
    expect(manifest.background_color).toBe('#05070d');

    // アイコンは manifest からの相対で、base の下に取れる
    for (const icon of manifest.icons) {
      const url = new URL(icon.src, HOME).href;
      expect(url.startsWith(HOME)).toBe(true);
      const res = await page.request.get(url);
      expect(res.status(), `${icon.src} が取れない`).toBe(200);
      expect((res.headers()['content-type'] ?? '').startsWith('image/')).toBe(true);
    }
    expect(manifest.icons.some((i: any) => i.purpose === 'maskable')).toBe(true);

    // iOS がホーム画面に使うアイコンと、全画面の指定
    const apple = await page.getAttribute('link[rel="apple-touch-icon"]', 'href');
    expect((await page.request.get(new URL(apple!, HOME).href)).status()).toBe(200);
    expect(await page.getAttribute('meta[name="apple-mobile-web-app-capable"]', 'content')).toBe('yes');
    expect(await page.getAttribute('meta[name="theme-color"]', 'content')).toBe('#05070d');
    const viewport = await page.getAttribute('meta[name="viewport"]', 'content');
    expect(viewport).toContain('viewport-fit=cover');
    expect(viewport).toContain('user-scalable=no');

    // Service Worker は base 配下にあり、base を scope にする
    const swRes = await page.request.get(`${HOME}sw.js`);
    expect(swRes.status()).toBe(200);
    const register = await (await page.request.get(`${HOME}registerSW.js`)).text();
    expect(register).toContain(`${BASE}sw.js`);
    expect(register).toContain(`scope: '${BASE}'`);
  });

  test('画面に文字・ボタン・開始画面が無い', async ({ page }) => {
    await page.goto(HOME);
    await page.waitForSelector('canvas');
    // 世界は canvas 一枚だけ。DOM に読める文字は無い
    const text = await page.evaluate(() => (document.body.innerText ?? '').trim());
    expect(text).toBe('');
    // 画面の中に見える押し物（ボタン・リンク・入力）が一つも無い。
    // Pixi が付ける読み上げ用の目印は 1px で画面の外に置かれるので、画面には現れない。
    const visible = await page.evaluate(() => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      return [...document.querySelectorAll('button, a, input, select')]
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 4 && r.height > 4 && r.right > 0 && r.bottom > 0 && r.left < w && r.top < h).length;
    });
    expect(visible).toBe(0);
  });

  test('一度開けば、オフラインでも起動する', async ({ page, context }) => {
    await page.goto(HOME);
    // Service Worker が資産を取り終えるまで待つ
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.waitForFunction(async () => {
      const keys = await caches.keys();
      for (const k of keys) {
        const c = await caches.open(k);
        if ((await c.keys()).length > 3) return true;
      }
      return false;
    });

    // 開き直すと Service Worker がページを受け持つ（2 回目の起動＝ホーム画面からの起動）
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller != null, undefined, {
      timeout: 30_000,
    });

    await context.setOffline(true);
    const res = await page.reload();
    expect(res?.status()).toBe(200);
    // 機内でも工房が立ち上がり、炎が描かれる
    await page.waitForSelector('canvas');
    const size = await page.evaluate(() => {
      const c = document.querySelector('canvas') as HTMLCanvasElement;
      return { w: c.width, h: c.height };
    });
    expect(size.w).toBeGreaterThan(0);
    expect(size.h).toBeGreaterThan(0);
    await context.setOffline(false);
  });
});
