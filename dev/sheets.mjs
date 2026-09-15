/**
 * Convenience: run the standard review matrix (every scene x 4 devices, with
 * the gestures that matter for each) and write one contact sheet per
 * combination into dev/out/.
 *
 *   node dev/sheets.mjs                 # the whole matrix (slow)
 *   node dev/sheets.mjs --quick         # iphone-portrait only
 *   node dev/sheets.mjs --scene=sofa    # one scene, all devices
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
  paper: [['approach-slow', 16, 110, 500], ['approach-fast', 14, 90, 0], ['hold', 16, 160, 0]],
  toy: [['approach-slow', 16, 120, 400], ['pass-by', 14, 110, 0]],
  thread: [['approach-slow', 18, 120, 400], ['hold', 16, 170, 0]],
  sand: [['approach-slow', 18, 120, 300], ['circle', 16, 180, 0]],
  sofa: [['approach-slow', 16, 140, 300], ['hold', 16, 190, 0]],
  carpet: [['rub', 18, 140, 0], ['approach-slow', 14, 120, 300]],
};

const only = (process.argv.find((a) => a.startsWith('--scene=')) || '').slice(8);

const run = (args) => new Promise((res, rej) => {
  const p = spawn(process.execPath, [SHOT, ...args], { stdio: 'inherit' });
  p.on('exit', (c) => (c === 0 ? res() : rej(new Error('shot failed: ' + args.join(' ')))));
});

for (const [scene, list] of Object.entries(MATRIX)) {
  if (only && scene !== only) continue;
  for (const device of DEVICES) {
    for (const [gesture, frames, every, skip] of list) {
      await run([`--scene=${scene}`, `--device=${device}`, `--gesture=${gesture}`,
        `--frames=${frames}`, `--every=${every}`, `--skip=${skip}`, '--contact']);
    }
  }
}
console.log('done');
