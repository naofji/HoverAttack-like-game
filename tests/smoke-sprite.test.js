import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { falloff } from '../src/js/utils/concealment.js';
import { SMOKE_SPRITE_SIZE } from '../src/js/utils/Constants.js';

// 焼いたスプライトの中身は見られないので、canvas に来た呼び出しを記録する。
const created = [];

before(() => {
  globalThis.document = {
    createElement: () => {
      const calls = [];
      const canvas = {
        width: 0,
        height: 0,
        calls,
        getContext: () => new Proxy({}, {
          get: (_t, prop) => {
            if (prop === 'createRadialGradient') {
              return (...args) => {
                const grad = { type: 'radialGradient', args, stops: [] };
                grad.addColorStop = (offset, color) => grad.stops.push([offset, color]);
                calls.push({ name: 'createRadialGradient', grad });
                return grad;
              };
            }
            return (...args) => calls.push({ name: String(prop), args });
          },
        }),
      };
      created.push(canvas);
      return canvas;
    },
  };
});

test('形4種 × 色3段 = 12枚が焼かれる', async () => {
  const { getSmokeSprites, _resetSmokeSprites, SMOKE_SHAPES, SMOKE_TINTS } =
    await import('../src/js/entities/smokeSprites.js');
  _resetSmokeSprites();
  created.length = 0;

  const sprites = getSmokeSprites();
  assert.equal(SMOKE_SHAPES.length, 4);
  assert.equal(SMOKE_TINTS.length, 3);
  assert.equal(sprites.length, 4);
  for (const row of sprites) assert.equal(row.length, 3);
  assert.equal(created.length, 12, `焼いた枚数が違う: ${created.length}`);
});

test('二度目の呼び出しでは焼き直さない（代金は起動時に一度だけ）', async () => {
  const { getSmokeSprites, _resetSmokeSprites } = await import('../src/js/entities/smokeSprites.js');
  _resetSmokeSprites();
  created.length = 0;

  const first = getSmokeSprites();
  const countAfterFirst = created.length;
  const second = getSmokeSprites();

  assert.equal(created.length, countAfterFirst, '2回目で焼き直している');
  assert.strictEqual(first, second, '同じ配列を返していない');
});

test('スプライトは SMOKE_SPRITE_SIZE の正方形', async () => {
  const { getSmokeSprites, _resetSmokeSprites } = await import('../src/js/entities/smokeSprites.js');
  _resetSmokeSprites();
  created.length = 0;
  getSmokeSprites();

  for (const c of created) {
    assert.equal(c.width, SMOKE_SPRITE_SIZE);
    assert.equal(c.height, SMOKE_SPRITE_SIZE);
  }
});

test('グラデーションの停止点が falloff と一致する（見た目と判定の対を守る）', async () => {
  const { gradientStops } = await import('../src/js/entities/smokeSprites.js');
  const stops = gradientStops('#FFFFFF', '#B4A9C4', '#7A7089');

  assert.ok(stops.length >= 4, '段が少なすぎて形が出ない');
  assert.equal(stops[0][0], 0, '中心から始まっていない');
  assert.equal(stops[stops.length - 1][0], 1, '縁で終わっていない');

  for (const [offset, color] of stops) {
    // rgba(r, g, b, a) の a が falloff(offset, 1) と一致すること
    const m = /rgba\([^)]*,\s*([0-9.]+)\)$/.exec(color);
    assert.ok(m, `rgba になっていない: ${color}`);
    const alpha = Number(m[1]);
    assert.ok(Math.abs(alpha - falloff(offset, 1)) < 0.005,
      `offset ${offset}: alpha ${alpha} が falloff ${falloff(offset, 1)} と違う`);
  }
});

test('中心は白っぽく、縁は紫がかった灰（色も距離で振る）', async () => {
  const { gradientStops } = await import('../src/js/entities/smokeSprites.js');
  const stops = gradientStops('#FFFFFF', '#B4A9C4', '#7A7089');
  const rgb = (s) => /rgba\((\d+),\s*(\d+),\s*(\d+)/.exec(s).slice(1).map(Number);

  const core = rgb(stops[0][1]);
  const edge = rgb(stops[stops.length - 1][1]);
  assert.ok(core[0] > edge[0], '中心が縁より暗い');
  // 紫がかる = 赤と青が緑より高い
  assert.ok(edge[2] > edge[1], `縁が紫寄りでない: ${edge}`);
});

test('色段は白 → 淡い紫 → 紫灰 の順に暗くなる（年齢で冷えていく）', async () => {
  const { SMOKE_TINTS } = await import('../src/js/entities/smokeSprites.js');
  const lum = (hex) => {
    const s = hex.replace('#', '');
    return parseInt(s.slice(0, 2), 16) + parseInt(s.slice(2, 4), 16) + parseInt(s.slice(4, 6), 16);
  };
  for (let i = 1; i < SMOKE_TINTS.length; i++) {
    assert.ok(lum(SMOKE_TINTS[i].core) < lum(SMOKE_TINTS[i - 1].core),
      `色段 ${i} が前より明るい`);
  }
});
