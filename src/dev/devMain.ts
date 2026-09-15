// 開発サーバだけが読み込む入口。index.html への差し込みは vite.config.ts の
// strip-dev-entry プラグイン（apply: 'serve'）が行うため、本番ビルドの
// モジュールグラフには一切現れない。
import { gameReady } from '../main';
import { installDevEntry } from './devEntry';

void gameReady.then((game) => installDevEntry(game));
