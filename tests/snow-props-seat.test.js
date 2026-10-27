// 5面の雪の木・つららの根元が、坂・面取りで削れた床・天井から浮かないことを縛る（設計 9章の最後の項）。
// 本物の5面の地図で、木は根元の両端の列、つららは上端の左右の縁と中心の列を、形の床・天井の高さと比べる。
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TILE_SIZE as T, TOWN_FOUNDATION_SINK as SINK, TOWN_CHUNK as CH } from '../src/js/utils/Constants.js';

before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

// 段5の前（計画のコミット 971c93d）の本数。坂の上の木が「岩に埋まりすぎ」で消えないことの目安
const BEFORE = { 1: { trees: 465, icicles: 164 }, 2: { trees: 440, icicles: 151 }, 3: { trees: 414, icicles: 179 } };

for (const seed of [1, 2, 3]) {
  test(`5面 seed ${seed}: 雪の木の根元は床から浮かず、つららの根元は天井から浮かない`, async () => {
    const { Map } = await import('../src/js/world/Map.js');
    const map = new Map({ rng: new SeededRNG(seed) }, 4);
    const trees = map.town.buildings.filter((b) => b.flora === 'snow');
    const icicles = map.town.buildings.filter((b) => b.brittle);
    const floating = [];
    for (const t of trees) {
      const bottom = t.y + t.height;
      for (const cx of [t.x + t.footX + 0.5, t.x + t.footX + 3.5]) {
        const top = map.terrainTopY(cx, bottom - T, bottom + 2 * T);
        if (top > bottom - SINK) floating.push(`tree ${t.x},${t.y} col ${cx}: ${top - (bottom - SINK)}px`);
      }
    }
    for (const t of icicles) {
      for (const cx of [t.x + 2.5, t.x + t.footX, t.x + t.width - 2.5]) {
        const bottom = map.terrainBottomY(cx, t.y + CH + T, t.y - T);
        if (bottom < t.y + CH) floating.push(`icicle ${t.x},${t.y} col ${cx}: ${t.y + CH - bottom}px`);
      }
    }
    assert.deepEqual(floating.slice(0, 8), [], `${floating.length} 本が浮いている`);
    assert.ok(trees.length >= BEFORE[seed].trees * 0.9, `木 ${trees.length} / 前 ${BEFORE[seed].trees}`);
    assert.ok(icicles.length >= BEFORE[seed].icicles * 0.9, `つらら ${icicles.length} / 前 ${BEFORE[seed].icicles}`);
  });
}
