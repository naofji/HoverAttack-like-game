import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';

let lastCtx = null;
before(() => {
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      lastCtx = ctx;
      return { width: 0, height: 0, getContext: () => ctx, _ctx: ctx };
    },
  };
});

function fills(ctx) {
  // fill() の直前の set:fillStyle を色として拾う
  const out = [];
  let cur = null;
  for (const c of ctx.calls) {
    if (c.name === 'set:fillStyle') cur = c.args[0];
    if (c.name === 'fill' || c.name === 'fillRect') out.push(cur);
  }
  return out;
}

test('machine backdrop keeps the rock bands and adds machinery colours', async () => {
  const { CaveBackdrop, backdropColors } = await import('../src/js/world/CaveBackdrop.js');
  const fill = '#483D8B';
  const rock = backdropColors(fill, 'machine');
  new CaveBackdrop(2400, 1200, fill, new SeededRNG(7), 'machine');
  const used = new Set(fills(lastCtx));
  assert.ok(used.has(rock.rockDark), 'rock bands must remain (it was a cave)');
  // 機械の色（配管・ランプ）は岩の3階調のどれでもない
  const extra = [...used].filter((c) => c !== rock.voidColor && c !== rock.rockDark && c !== rock.rockLight);
  assert.ok(extra.length >= 2, `expected machinery colours, got ${[...used].join(',')}`);
});

test('cave backdrop uses only the three rock tones', async () => {
  const { CaveBackdrop, backdropColors } = await import('../src/js/world/CaveBackdrop.js');
  const fill = '#8B4513';
  const rock = backdropColors(fill, 'cave');
  new CaveBackdrop(2400, 1200, fill, new SeededRNG(7), 'cave');
  const used = new Set(fills(lastCtx));
  assert.deepEqual([...used].sort(), [rock.voidColor, rock.rockDark, rock.rockLight].sort());
});

test('Map passes the stage backdrop to CaveBackdrop', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const map = new Map({ rng: new SeededRNG(3) }, 6); // 7面
  assert.equal(map.backdrop.backdrop, 'machine');
});

test('backdrop decoration colours never compete with the foreground (≤ 0.45 × palette luminance)', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const { STAGE_PALETTES, ENV_BACKDROPS } = await import('../src/js/utils/Constants.js');
  const lum = (hex) => { const s = hex.replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)).reduce((a, b, i) => a + b * [0.2126, 0.7152, 0.0722][i], 0); };
  for (const backdrop of ENV_BACKDROPS) {
    for (const palette of STAGE_PALETTES) {
      new CaveBackdrop(2400, 1200, palette.fill, new SeededRNG(3), backdrop);
      const used = new Set(fills(lastCtx).filter((c) => typeof c === 'string' && c.startsWith('#')));
      for (const c of used) {
        assert.ok(lum(c) <= lum(palette.fill) * 0.45, `${backdrop}/${palette.fill}: ${c} (${lum(c).toFixed(1)}) too bright`);
      }
    }
  }
});
