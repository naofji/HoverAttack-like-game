import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { reachable } from './helpers/map-reach.js';
import { BLOCK_INDESTRUCTIBLE, BLOCK_EMPTY, STAGE_ENVIRONMENTS } from '../src/js/utils/Constants.js';

// Map._generateMiniMap() が canvas を触るので最小限の DOM スタブ。
before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }),
  };
});

// 開始の部屋は _generate() が (3,3) から 20x16 で掘り、中心を rooms に積む。
// その中心（centerR 11 / centerC 13）を自機の出発点とみなす
const START = { r: 11, c: 13 };

test('全7面で、開始の部屋から基地まで掘って辿り着ける', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  for (let lv = 0; lv < STAGE_ENVIRONMENTS.length; lv++) {
    for (const seed of [1, 2, 3, 4, 5]) {
      const map = new Map({ rng: new SeededRNG(seed) }, lv);
      assert.ok(reachable(map, START, map.enemyBaseCenter),
        `面${lv + 1} seed ${seed}: 基地へ到達できない`);
    }
  }
});

test('装甲で囲まれた基地には到達できない（ヘルパが偽を返せることの確認）', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const map = new Map({ rng: new SeededRNG(1) }, 0);
  const b = map.enemyBaseCenter;
  // 基地の周りを装甲のリングで塞ぐ。ヘルパが常に true を返すだけの
  // 恒真テストになっていないことを、この1本で担保する
  for (let r = b.r - 6; r <= b.r + 6; r++) {
    for (let c = b.c - 6; c <= b.c + 6; c++) {
      const onRing = r === b.r - 6 || r === b.r + 6 || c === b.c - 6 || c === b.c + 6;
      if (onRing && map.grid[r] && map.grid[r][c] !== undefined) {
        map.grid[r][c] = BLOCK_INDESTRUCTIBLE;
      }
    }
  }
  map.grid[b.r][b.c] = BLOCK_EMPTY;
  assert.equal(reachable(map, START, b), false, '装甲のリングを抜けてしまった');
});
