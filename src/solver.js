// 状態 (fold, ハナの位置) を探索して、ゴールまでの最短手順を返す。
// ヒント(風のめくれ)と、ステージデータの検証に使う。
import { N, SIDES, composite, canFold, canUnfold, bfs } from './paper.js';

function goalVisible(level, fold) {
  const g = composite(level, fold);
  const t = g[level.goal.r][level.goal.c];
  return t === level.front[level.goal.r][level.goal.c];
}

export function solve(level, fold = null, hana = level.start) {
  const key = (f, r, c) => `${f || '-'}${r}${c}`;
  const startKey = key(fold, hana.r, hana.c);
  const prev = new Map([[startKey, null]]);
  const q = [{ fold, r: hana.r, c: hana.c }];
  const push = (from, st, action) => {
    const k = key(st.fold, st.r, st.c);
    if (prev.has(k)) return;
    prev.set(k, { from, action });
    q.push(st);
  };
  while (q.length) {
    const cur = q.shift();
    const curKey = key(cur.fold, cur.r, cur.c);
    if (cur.r === level.goal.r && cur.c === level.goal.c && goalVisible(level, cur.fold)) {
      const actions = [];
      let k = curKey;
      while (prev.get(k)) {
        actions.push(prev.get(k).action);
        k = prev.get(k).from;
      }
      return actions.reverse();
    }
    const grid = composite(level, cur.fold);
    const reach = bfs(grid, cur);
    for (const p of reach.all()) {
      if (p.r === cur.r && p.c === cur.c) continue;
      push(curKey, { fold: cur.fold, r: p.r, c: p.c }, { type: 'walk', to: p });
    }
    for (const s of SIDES) {
      if (canFold(level, cur.fold, s, cur)) push(curKey, { fold: s, r: cur.r, c: cur.c }, { type: 'fold', side: s });
    }
    if (canUnfold(cur.fold, cur)) push(curKey, { fold: null, r: cur.r, c: cur.c }, { type: 'unfold', side: cur.fold });
  }
  return null;
}

// 次に動かすべき辺。歩きが先でも、その後の折り辺を返す（試して当たれば「先に動く」と分かる）。
export function nextFoldHint(level, fold, hana) {
  const sol = solve(level, fold, hana);
  if (!sol) return null;
  const a = sol.find((x) => x.type === 'fold' || x.type === 'unfold');
  return a || null;
}

export { N };
