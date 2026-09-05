import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { luminance, withLuminance } from '../src/js/utils/color.js';
import {
  BLOCK_NORMAL, BLOCK_HARD,
  STAGE_PALETTES, COLOR_CAVE_BG, HARD_BLOCK_DARKEN,
} from '../src/js/utils/Constants.js';

before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }),
  };
});

/** #rrggbb の彩度の代わりに使う、最大成分と最小成分の差（0=無彩色）。 */
function chroma(hex) {
  const s = String(hex).replace('#', '');
    const p = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
  return Math.max(...p) - Math.min(...p);
}

/** 面 lv（0 起点）の Map を作り、通常岩と硬い岩の描画色を返す。 */
async function stylesFor(lv) {
  const { Map } = await import('../src/js/world/Map.js');
  const map = new Map({ rng: new SeededRNG(1) }, lv);
  return { normal: map.blockStyles[BLOCK_NORMAL], hard: map.blockStyles[BLOCK_HARD] };
}

test('withLuminance は指定した輝度の色を返す（色味は保つ）', () => {
  const out = withLuminance('#8B4513', 50);
  assert.ok(Math.abs(luminance(out) - 50) < 1.5, `輝度 50 のはずが ${luminance(out)}`);
  // 赤 > 緑 > 青 の並びは元の色のまま
  const p = [1, 3, 5].map((i) => parseInt(out.slice(i, i + 2), 16));
  assert.ok(p[0] > p[1] && p[1] > p[2], `色味が崩れている: ${out}`);
});

test('真っ黒を明るくしようとしても NaN にならない', () => {
  // 輝度 0 で割る経路。地形の色に黒は無いが、割り算を書いた以上ここは塞いでおく
  const out = withLuminance('#000000', 80);
  assert.match(out, /^#[0-9a-f]{6}$/, `不正な色: ${out}`);
});

test('硬い岩は面ごとに色が違い、通常岩より暗く彩度が低い', async () => {
  const seen = new Set();
  for (let lv = 0; lv < STAGE_PALETTES.length; lv++) {
    const { normal, hard } = await stylesFor(lv);
    const tag = `面${lv + 1}`;

    // 輝度は通常岩に対する比で決める（面6のような元から暗い岩が黒へ潰れないように）
    const want = luminance(normal.fill) * HARD_BLOCK_DARKEN;
    assert.ok(Math.abs(luminance(hard.fill) - want) < 2,
      `${tag}: 硬い岩の輝度は ${want.toFixed(1)} のはずが ${luminance(hard.fill).toFixed(1)}`);

    // 撃つ前に見分けられること。彩度が落ちているだけでなく輝度でも離れている
    assert.ok(chroma(hard.fill) < chroma(normal.fill),
      `${tag}: 硬い岩の彩度が通常岩より低くない`);
    assert.ok(luminance(normal.fill) - luminance(hard.fill) > 15,
      `${tag}: 通常岩との輝度差が小さすぎる`);

    // 洞窟の背景に沈まないこと（空洞と硬い岩が見分けられなくなる）
    assert.ok(luminance(hard.fill) - luminance(COLOR_CAVE_BG) > 15,
      `${tag}: 硬い岩が洞窟背景に沈んでいる (${hard.fill})`);

    seen.add(hard.fill);
  }
  assert.equal(seen.size, STAGE_PALETTES.length, '面ごとに違う色になっていない');
});

test('硬い岩は面のテーマ色の色味を保つ（灰色一色ではない）', async () => {
  for (let lv = 0; lv < STAGE_PALETTES.length; lv++) {
    const { hard } = await stylesFor(lv);
    assert.ok(chroma(hard.fill) > 5,
      `面${lv + 1}: 硬い岩が無彩色になっている (${hard.fill})`);
  }
});

test('硬い岩の枠線は塗りより暗い', async () => {
  for (let lv = 0; lv < STAGE_PALETTES.length; lv++) {
    const { hard } = await stylesFor(lv);
    assert.ok(luminance(hard.border) < luminance(hard.fill),
      `面${lv + 1}: 枠線 ${hard.border} が塗り ${hard.fill} より暗くない`);
  }
});
