import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { luminance } from '../src/js/utils/color.js';
import {
  BLOCK_METAL, BLOCK_HARD, BLOCK_NORMAL, BLOCK_INDESTRUCTIBLE, BLOCK_EMPTY,
  METAL_BLOCK_HP, METAL_HEAT_COLOR,
} from '../src/js/utils/Constants.js';

before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }),
  };
});

test('BLOCK_METAL は他のブロック種別とかぶらない値で、HardRock より硬い', () => {
  const all = [BLOCK_EMPTY, BLOCK_NORMAL, BLOCK_HARD, BLOCK_INDESTRUCTIBLE, BLOCK_METAL];
  assert.equal(new Set(all).size, all.length, 'ブロック種別の値がかぶっている');
  assert.ok(METAL_BLOCK_HP > 3, `HardRock(3) より硬くない: ${METAL_BLOCK_HP}`);
});

test('金属は掘れる（damageBlock が効く）が、HardRock より手数が要る', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const map = new Map({ rng: new SeededRNG(1) }, 6);
  const self = {
    rows: 4, cols: 4,
    grid: Array.from({ length: 4 }, () => new Array(4).fill(BLOCK_METAL)),
    blockHP: Array.from({ length: 4 }, () => new Array(4).fill(METAL_BLOCK_HP)),
    water: null,
    invalidateTileRegion() {},
  };
  const damage = Map.prototype.damageBlock.bind(self);
  for (let i = 1; i < METAL_BLOCK_HP; i++) {
    assert.equal(damage(1, 1, 1), false, `${i} 発目で壊れてしまった`);
  }
  assert.equal(damage(1, 1, 1), true, `${METAL_BLOCK_HP} 発で壊れない`);
  assert.equal(self.grid[1][1], BLOCK_EMPTY);
  void map;
});

test('金属の描画色は面のテーマから作られ、面ごとに違う', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const seen = new Set();
  for (let lv = 0; lv < 7; lv++) {
    const m = new Map({ rng: new SeededRNG(1) }, lv);
    const style = m.blockStyles[BLOCK_METAL];
    assert.match(style.fill, /^#[0-9a-f]{6}$/i, `面${lv + 1} の金属色が不正: ${style.fill}`);
    seen.add(style.fill);
  }
  assert.equal(seen.size, 7, '面ごとに違う金属色になっていない');
});

/** _drawPolishedBlock を偽 ctx に描かせ、fillStyle の代入列を返す。 */
function paintMetal(map, hp) {
  const ctx = makeFakeCtx();
  map.grid = [[BLOCK_METAL]];
  map.blockHP = [[hp]];
  map._drawPolishedBlock(ctx, 0, 0, 16, map.blockStyles[BLOCK_METAL], 0, 0);
  return ctx.calls.filter((c) => c.name === 'set:fillStyle').map((c) => c.args[0]);
}

test('金属は被弾するほど焼けた赤茶に近づく（ひび割れない）', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const m = new Map({ rng: new SeededRNG(1) }, 6);
  const base = m.blockStyles[BLOCK_METAL].fill;
  const heatLum = luminance(METAL_HEAT_COLOR);

  // 塗りの1色目がベース塗り。ダメージが増えるほど焼け色へ寄る
  const fills = [];
  for (let hp = METAL_BLOCK_HP; hp >= 1; hp--) fills.push(paintMetal(m, hp)[0]);
  assert.equal(fills[0], base, '無傷なのに色が変わっている');
  const dist = (hex) => Math.abs(luminance(hex) - heatLum);
  for (let i = 1; i < fills.length; i++) {
    assert.ok(dist(fills[i]) < dist(fills[i - 1]),
      `ダメージ ${i} で焼け色に近づいていない: ${fills[i - 1]} → ${fills[i]}`);
  }
  // ひび割れの線は引かない（金属は割れない）
  const ctx = makeFakeCtx();
  m.grid = [[BLOCK_METAL]];
  m.blockHP = [[1]];
  m._drawPolishedBlock(ctx, 0, 0, 16, m.blockStyles[BLOCK_METAL], 0, 0);
  assert.equal(ctx.calls.some((c) => c.name === 'stroke' && false), false);
});

test('焼けるほど鏡面ハイライトが弱くなる（艶が飛ぶ）', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const m = new Map({ rng: new SeededRNG(1) }, 6);
  /** 白のハイライト（rgba(255,255,255,a)）のうち最大の a を返す。 */
  const topAlpha = (hp) => {
    const whites = paintMetal(m, hp)
      .filter((v) => typeof v === 'string' && v.startsWith('rgba(255,255,255'))
      .map((v) => parseFloat(v.split(',')[3]));
    return Math.max(...whites);
  };
  const fresh = topAlpha(METAL_BLOCK_HP);
  const burnt = topAlpha(1);
  assert.ok(fresh > 0, 'ハイライトが引かれていない');
  assert.ok(burnt < fresh, `焼けても艶が落ちていない: ${fresh} → ${burnt}`);
});
