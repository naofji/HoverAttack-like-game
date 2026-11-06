import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';

// 絵柄の表（theme）。3面の町は表を通しても1棟も変わらないこと、表を差し替えればその関数から建つことを見る
before(() => {
    const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

async function stage3() {
    const { Map } = await import('../src/js/world/Map.js');
    const map = new Map({ rng: new SeededRNG(11) }, 2);
    return { map, args: { grid: map.grid, rows: map.rows, cols: map.cols, excludeRects: [map._reservedRects()[1]] } };
}

test('TOWN_THEME を渡しても省略しても同じ設計図', async () => {
    const { generateTown } = await import('../src/js/world/town/generate.js');
    const { TOWN_THEME } = await import('../src/js/world/town/themes.js');
    const { args } = await stage3();
    const a = generateTown({ ...args, rng: new SeededRNG(77), explosiveRng: new SeededRNG(78) });
    const b = generateTown({ ...args, rng: new SeededRNG(77), explosiveRng: new SeededRNG(78), theme: TOWN_THEME });
    assert.ok(a.length > 50);
    assert.deepEqual(a, b);
});

test('theme を差し替えると床の建物がその関数から出る', async () => {
    const { generateTown } = await import('../src/js/world/town/generate.js');
    const { TOWN_THEME } = await import('../src/js/world/town/themes.js');
    const { args } = await stage3();
    const probe = {
        ...TOWN_THEME,
        wide: 'X', narrow: 'Y',
        floor: () => ({
            kind: 'probe', w: 16, h: 20, footX: 0, footW: 16,
            parts: [{ x: 0, y: 0, w: 16, h: 20, color: '#333333', mat: 3, solid: true }],
        }),
    };
    const specs = generateTown({ ...args, rng: new SeededRNG(77), theme: probe });
    const floors = specs.filter((s) => s.site === 'floor');
    assert.ok(floors.length > 0);
    assert.ok(floors.every((s) => s.kind === 'probe'));
    assert.ok(specs.every((s) => s.style === 'X' || s.style === 'Y'), 'style は表の wide / narrow');
});
