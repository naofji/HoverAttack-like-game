// 5面（積雪）の地形キャッシュに、生成時に上が空洞だったブロックの上面だけ
// 雪の帯を焼くことを縛るテスト。破壊で新しく露出した面には雪が乗らない
// （掘った跡が読めるようにするため）ことも確認する。
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { SNOW_CAP_COLOR, TILE_SIZE } from '../src/js/utils/Constants.js';

let ctxs = [];
before(() => {
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      ctxs.push(ctx);
      return { width: 0, height: 0, getContext: () => ctx, _ctx: ctx };
    },
  };
});

function capFills(ctx) {
  const out = [];
  let cur = null;
  for (const c of ctx.calls) {
    if (c.name === 'set:fillStyle') cur = c.args[0];
    if (c.name === 'fillRect' && cur === SNOW_CAP_COLOR) out.push(c.args);
  }
  return out;
}

test('stage 5 bakes snow caps on generation-exposed tops; stage 1 bakes none', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  ctxs = [];
  new Map({ rng: new SeededRNG(5) }, 4);
  const snowy = ctxs.reduce((n, c) => n + capFills(c).length, 0);
  assert.ok(snowy > 100, `expected many caps on stage 5, got ${snowy}`);
  ctxs = [];
  new Map({ rng: new SeededRNG(5) }, 0);
  assert.equal(ctxs.reduce((n, c) => n + capFills(c).length, 0), 0);
});

test('a top exposed by destruction gets no cap (bare rock)', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  ctxs = [];
  const map = new Map({ rng: new SeededRNG(5) }, 4);
  // 生成時に埋まっていた岩を1つ選んで、その上を壊す
  let target = null;
  for (let r = 3; r < map.rows - 3 && !target; r++) {
    for (let c = 3; c < map.cols - 3; c++) {
      if (map.grid[r][c] === 1 && map.grid[r - 1][c] === 1 && map.grid[r - 2][c] === 0) { target = { r, c }; break; }
    }
  }
  assert.ok(target, 'need a buried block under an exposed one');
  const tileCtx = ctxs[0]; // 最初に作られた canvas がタイルキャッシュ
  tileCtx.calls.length = 0;
  map.damageBlock(target.r - 1, target.c, 99);
  // 再描画された (target.r, target.c) は上が空いたが、生成時露出ではないので帯は無い
  const caps = capFills(tileCtx).filter(([x, y]) => x === target.c * TILE_SIZE && y === target.r * TILE_SIZE);
  assert.equal(caps.length, 0);
});
