import { createGame } from './game.js';

const canvas = document.getElementById('c');
const game = createGame(canvas);
game.start();
window.__game = game; // デバッグ用
