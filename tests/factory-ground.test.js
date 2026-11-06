import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import {
    TILE_SIZE as T, TOWN_FOUNDATION_SINK, BLOCK_METAL, BLOCK_EMPTY, BLOCK_INDESTRUCTIBLE, METAL_BLOCK_HP,
} from '../src/js/utils/Constants.js';

// 6面の工場が建つ地面はメタル（7面と同じ BLOCK_METAL）にする（ユーザーの指定 2026-11-07「岩場に建っているのはおかしい」）
before(() => {
    const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

async function makeMap(seed, mission) {
    const { Map } = await import('../src/js/world/Map.js');
    return new Map({ rng: new SeededRNG(seed) }, mission);
}

test('床の建物の見えている足元の地面はメタル（壊れない枠の岩を除く）', async () => {
    for (const seed of [11, 22, 33]) {
        const map = await makeMap(seed, 5);
        let n = 0;
        let metal = 0;
        for (const b of map.town.buildings.filter((o) => o.site === 'floor')) {
            const g = (b.y + b.height - TOWN_FOUNDATION_SINK) / T;
            for (let c = Math.floor((b.x + (b.footX ?? 0)) / T); c <= Math.floor((b.x + (b.footX ?? 0) + (b.footW ?? b.width) - 1) / T); c++) {
                if (map.grid[g][c] === BLOCK_INDESTRUCTIBLE || map.grid[g][c] === BLOCK_EMPTY) continue;
                // 奥の列が4段以上の岩壁に埋まっている所は足元が見えないので数えない（上面が地面の行から3段以内の列だけ）
                if (![0, 1, 2, 3].some((d) => map.grid[g - d][c] !== BLOCK_EMPTY && map.grid[g - d - 1][c] === BLOCK_EMPTY)) continue;
                n++;
                if (map.grid[g][c] === BLOCK_METAL) {
                    metal++;
                    assert.equal(map.blockHP[g][c], METAL_BLOCK_HP);
                }
            }
        }
        assert.ok(n > 50);
        assert.equal(metal, n, `seed ${seed}: 足元 ${n} タイルのうちメタルは ${metal}`);
    }
});

test('メタルの地面は床の上面から2段の厚さで、外接矩形より左右に1タイル広がる', async () => {
    const map = await makeMap(22, 5);
    const isTop = (r, c) => map.grid[r][c] !== BLOCK_EMPTY && map.grid[r - 1][c] === BLOCK_EMPTY;
    const usable = (v) => v !== BLOCK_EMPTY && v !== BLOCK_INDESTRUCTIBLE;
    let deep = 0;
    let side = 0;
    for (const s of map._buildFactorySpecs().filter((o) => o.site === 'floor')) {
        const g = (s.y + s.h - TOWN_FOUNDATION_SINK) / T;
        const c = Math.floor((s.x + (s.footX ?? 0)) / T);
        if (isTop(g, c) && usable(map.grid[g + 1][c])) { assert.equal(map.grid[g + 1][c], BLOCK_METAL, `${s.kind} の2段目`); deep++; }
        const left = Math.floor(s.x / T) - 1;
        if (isTop(g, left) && map.grid[g][left] !== BLOCK_INDESTRUCTIBLE) { assert.equal(map.grid[g][left], BLOCK_METAL, `${s.kind} の左隣`); side++; }
    }
    assert.ok(deep > 20 && side > 10, `確かめた数が少ない（2段目 ${deep}・左隣 ${side}）`);
});

test('メタルにしても工場の並びと敵の構成は変わらない（設計図は空きか岩かしか見ない・乱数を引かない）', async () => {
    const map = await makeMap(33, 5);
    const specs = map._buildFactorySpecs();   // 生成の後に作り直す（道具と同じ呼び方）
    assert.deepEqual(map.town.buildings.map((b) => [b.kind, b.x, b.y]), specs.map((s) => [s.kind, s.x, s.y]));
});

test('6面以外の面にはメタルを足さない', async () => {
    for (const mission of [1, 2, 4]) {
        const map = await makeMap(11, mission);
        assert.ok(!map.grid.some((row) => row.includes(BLOCK_METAL)), `${mission + 1}面にメタルがある`);
    }
});
