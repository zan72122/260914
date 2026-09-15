/**
 * Convenience: run the standard review matrix (both scenes x 4 devices) and
 * write one contact sheet per combination.
 *
 *   node dev/sheets.mjs                 # the default matrix
 *   node dev/sheets.mjs --quick         # iphone-portrait only
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SHOT = fileURLToPath(new URL('./shot.mjs', import.meta.url));
const quick = process.argv.includes('--quick');

const DEVICES = quick
  ? ['iphone-portrait']
  : ['iphone-portrait', 'iphone-landscape', 'ipad-portrait', 'ipad-landscape'];

// scene -> [gesture, frames, every(ms), skip(ms)]
const MATRIX = {
  intro: [['approach-slow', 18, 90, 650], ['hold', 16, 150, 0], ['circle', 16, 180, 0]],
  kitchen: [['approach-slow', 16, 100, 700], ['pass-by', 14, 100, 200], ['rub', 16, 160, 0]],
};

const run = (args) => new Promise((res, rej) => {
  const p = spawn(process.execPath, [SHOT, ...args], { stdio: 'inherit' });
  p.on('exit', (c) => (c === 0 ? res() : rej(new Error('shot failed: ' + args.join(' ')))));
});

for (const [scene, list] of Object.entries(MATRIX)) {
  for (const device of DEVICES) {
    for (const [gesture, frames, every, skip] of list) {
      await run([`--scene=${scene}`, `--device=${device}`, `--gesture=${gesture}`,
        `--frames=${frames}`, `--every=${every}`, `--skip=${skip}`, '--contact']);
    }
  }
}
console.log('done');
