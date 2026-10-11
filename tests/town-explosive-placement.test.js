// 爆発物の置き場所（generate.js の explosiveRng）。spec 3b章「建物 8 棟に1つくらい」
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TILE_SIZE as T, TOWN_FOUNDATION_SINK } from '../src/js/utils/Constants.js';
import { generateTown } from '../src/js/world/town/generate.js';

let GameMap;
before(async () => {
    const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
    ({ Map: GameMap } = await import('../src/js/world/Map.js'));
});

const EXPLOSIVE = new Set(['drum', 'crate', 'gas', 'oiljars']);
const maps = () => [1, 2, 3, 4, 5, 6].map((seed) => new GameMap({ rng: new SeededRNG(seed) }, 2));

test('explosiveRng を渡しても、建物の設計図は渡さないときと同じで、爆発物は後ろに足されるだけ', () => {
    for (const m of maps()) {
        const base = { grid: m.grid, rows: m.rows, cols: m.cols };
        const plain = generateTown({ ...base, rng: new SeededRNG(7) });
        const withX = generateTown({ ...base, rng: new SeededRNG(7), explosiveRng: new SeededRNG(9) });
        assert.deepEqual(withX.slice(0, plain.length), plain);
        assert.ok(withX.slice(plain.length).every((s) => EXPLOSIVE.has(s.kind)));
        assert.ok(plain.every((s) => !EXPLOSIVE.has(s.kind)), 'explosiveRng が無ければ爆発物は無い');
    }
});

test('床の建物 TOWN_EXPLOSIVE_EVERY 棟に1つくらい（6週の合計で 1/14〜1/5）', () => {
    let floors = 0, explosives = 0;
    for (const m of maps()) {
        const specs = m._buildTownSpecs();
        explosives += specs.filter((s) => EXPLOSIVE.has(s.kind)).length;
        floors += specs.filter((s) => s.site === 'floor' && !EXPLOSIVE.has(s.kind)).length;
    }
    const ratio = explosives / floors;
    assert.ok(ratio > 1 / 14 && ratio < 1 / 5, `${explosives} / ${floors} = ${ratio.toFixed(3)}`);
});

test('爆発物は床の岩の上: 下端の 4px が岩に入り、その上は空いている。爆発物どうしは重ならない', () => {
    for (const m of maps()) {
        const xs = m._buildTownSpecs().filter((s) => EXPLOSIVE.has(s.kind));
        for (const s of xs) {
            const ground = (s.y + s.h - TOWN_FOUNDATION_SINK) / T;
            assert.ok(Number.isInteger(ground), `${s.kind} の下端 ${s.y + s.h}`);
            for (let c = Math.floor(s.x / T); c <= Math.floor((s.x + s.w - 1) / T); c++) {
                assert.ok(m.isSolid(ground, c), `${s.kind} (${s.x},${s.y}) の下 r${ground} c${c} が空洞`);
                for (let r = Math.floor(s.y / T); r < ground; r++) {
                    assert.ok(!m.isSolid(r, c), `${s.kind} (${s.x},${s.y}) が岩 r${r} c${c} に埋もれる`);
                }
            }
        }
        for (let i = 0; i < xs.length; i++) {
            for (let j = i + 1; j < xs.length; j++) {
                const a = xs[i], b = xs[j];
                assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h),
                    `${a.kind} と ${b.kind} が重なる`);
            }
        }
    }
});

test('Map の町には爆発物があり、建物として支えを持つ（作った町に explosive の印）', () => {
    const m = maps()[0];
    const xs = m.town.buildings.filter((b) => b.explosive);
    assert.ok(xs.length > 0);
    for (const b of xs) assert.ok(b.anchors.length > 0, `${b.kind} に支えが無い`);
});
