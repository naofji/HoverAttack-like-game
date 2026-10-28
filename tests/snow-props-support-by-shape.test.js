// 5面で隣のブロックが壊れて、根元のタイルが坂・面取りに削れたとき、雪の木・つららが宙に浮いたまま
// 立ち続けないことを縛る。支えは「かけらの真ん中が形の岩の中か」で見るので、根元の下の岩が削れて
// 支えが全部無くなった木は倒れ、つららは落ちる。残った木・つららは、根元のどこかが岩に触れている。
// 本物の5面の地図で、木・つららごとに根元のタイルの左右の隣を壊して確かめる。
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TILE_SIZE as T, TOWN_CHUNK as CH } from '../src/js/utils/Constants.js';

before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

// 根元の列で、岩に最も近い所の隙間（px。0 以下は岩に触れている）。木は根元の両端の列の床、
// つららは上端の左右の縁と中心の列の天井と比べ、触れている列が 1 本でもあれば 0 以下になる
function treeGap(map, t) {
  const bottom = t.y + t.height;
  return Math.min(...[t.x + t.footX + 0.5, t.x + t.footX + 3.5].map((cx) => {
    const top = map.terrainTopY(cx, bottom - T, bottom + 2 * T);
    return top === null ? Infinity : top - bottom;
  }));
}
function icicleGap(map, t) {
  return Math.min(...[t.x + 2.5, t.x + t.footX, t.x + t.width - 2.5].map((cx) => {
    const bottom = map.terrainBottomY(cx, t.y + CH + T, t.y - T);
    return bottom === null ? Infinity : t.y - bottom;
  }));
}

// 支えは岩から TOWN_SHAPE_SUPPORT_REACH（2px）まで離れていても触れているとみなす（見た目は床に着いている木を
// 倒さないため）。45度の坂は列の真ん中で測ると上端が半端な位置になるので、さらに 0.5px。
// 定数から導かずに数で書く（REACH を大きくすると浮いた木が立ち続けるのを、このテストで止める）
const GAP_OK = 2.5;

for (const seed of [1, 2]) {
  test(`5面 seed ${seed}: 隣が壊れて根元の岩が削れても、雪の木・つららは宙に浮いたまま立たない`, async () => {
    const { Map } = await import('../src/js/world/Map.js');
    const map = new Map({ rng: new SeededRNG(seed) }, 4);
    const floating = [];
    let cases = 0, fell = 0;
    const tooEager = [];
    for (const b of map.town.buildings.filter((x) => x.flora === 'snow' || x.brittle)) {
      if (b.remaining === 0) continue;
      const r = b.brittle ? Math.floor(b.y / T) : Math.floor((b.y + b.height - 1) / T);
      const cr = Math.floor((b.x + b.footX + 2) / T);
      const c = [cr - 1, cr + 1].find((cc) => map.damageBlock(r, cc, 999));
      if (c === undefined) continue;
      cases++;
      const gap = b.brittle ? icicleGap(map, b) : treeGap(map, b);
      if (map.town.falling.some((p) => p.sourceId === b.id)) {
        fell++;
        // 倒れた・落ちたものは、残っていたら見た目でも浮いていたもの（床に着いて見える木までは倒さない）
        if (gap <= GAP_OK) tooEager.push(`${b.brittle ? 'icicle' : 'tree'} ${b.x},${b.y} (${r},${c}): ${gap}px`);
        continue;
      }
      if (gap > GAP_OK) floating.push({ gap, at: `${b.brittle ? 'icicle' : 'tree'} ${b.x},${b.y} (${r},${c}): ${gap}px` });
    }
    floating.sort((a, b) => b.gap - a.gap);
    assert.ok(cases >= 300, `確かめた数 ${cases}`);
    // 根元の下が大きく削れたものは倒れる・落ちる（支えを確かめ直していなければ 0 本のまま浮いて立つ）
    assert.ok(fell >= 20, `倒れた・落ちた ${fell}`);
    assert.deepEqual(tooEager.slice(0, 8), [], `${tooEager.length} / ${fell} 本が床・天井に着いて見えるのに倒れた・落ちた`);
    assert.deepEqual(floating.slice(0, 8).map((f) => f.at), [], `${floating.length} / ${cases} 本が浮いたまま立っている（倒れた・落ちた ${fell}）`);
  });
}
