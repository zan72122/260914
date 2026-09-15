// @ts-check
/**
 * Static facts about the repo under test, used to skip suites whose subject
 * does not exist yet (the worlds are written by other engineers in parallel).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const hasFile = (rel) => fs.existsSync(path.join(repoRoot, rel));

export const hasApp = () => hasFile('index.html');
export const hasWorld = (id) => hasFile(`src/worlds/${id}.js`);
export const hasSpectroscope = () => hasFile('src/scenes/spectroscope.js');

/** elementId -> the world's scene id (they are the same by contract, §5.5.5). */
export const ELEMENTS = ['lithium', 'copper', 'sodium', 'strontium', 'barium'];
