import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TOWN_BLAST_RADIUS_K, BLOCK_EMPTY, BLOCK_INDESTRUCTIBLE } from '../src/js/utils/Constants.js';
import { Town } from '../src/js/world/town/Town.js';
import { SpawnEffects } from '../src/js/systems/SpawnEffects.js';
import { fakeCanvas, block } from './helpers/town-fixtures.js';

before(() => {
    const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

test('blast: 半径 K×√size の中の建物を欠かせる。届かない建物は欠けない', () => {
    const town = new Town([block(0, 0, 64, 64), block(300, 0, 32, 32)], { createCanvas: fakeCanvas });
    const [near, far] = town.buildings;
    town.blast(80, 32, 150);                 // 半径 ≒ 40 → 塔の右端から 16px 内側まで
    assert.ok(near.remaining < near.total);
    assert.equal(far.remaining, far.total);
    const r = TOWN_BLAST_RADIUS_K * Math.sqrt(150);
    assert.ok(Math.abs(r - 40.4) < 0.1);
});

test('onBlockDestroyed: その岩に支えられていた建物は、支えを失って丸ごと落ちる', () => {
    let rock = true;
    const town = new Town([block(0, 0, 16, 68)], { createCanvas: fakeCanvas, isSolidTile: (r) => r === 4 && rock });
    rock = false;
    town.onBlockDestroyed(4, 0);
    assert.equal(town.falling.length, 1);
    assert.equal(town.buildings[0].remaining, 0);
});

test('onBlockDestroyed: 支えに関係ない岩なら何も起きない', () => {
    const town = new Town([block(0, 0, 16, 68)], { createCanvas: fakeCanvas, isSolidTile: (r) => r === 4 });
    town.onBlockDestroyed(20, 20);
    assert.equal(town.falling.length, 0);
});

test('spawnExplosion を通った爆発は町に届く（粒の数をそのまま size として渡す）', () => {
    const calls = [];
    const game = {
        particles: [], landmines: [],
        map: { town: { blast: (...a) => calls.push(a) } },
    };
    SpawnEffects.spawnExplosion.call(game, 10, 20, 36);
    assert.deepEqual(calls, [[10, 20, 36]]);
});

test('町の無い面の spawnExplosion は何もしない（map も town も無くてよい）', () => {
    SpawnEffects.spawnExplosion.call({ particles: [], landmines: [], map: { town: null } }, 0, 0, 4);
    SpawnEffects.spawnExplosion.call({ particles: [], landmines: [] }, 0, 0, 4);
});

test('崩壊と砕けた破片の粒は spawnExplosion を通らない（town.blast に戻って連鎖しない）', () => {
    const town = new Town([block(0, 0, 32, 68)], { createCanvas: fakeCanvas, isSolidTile: (r) => r >= 4 });
    let blasts = 0;
    const realBlast = town.blast.bind(town);
    town.blast = (...a) => { blasts++; realBlast(...a); };
    const game = { particles: [], projectiles: [], camera: { x: 0, y: 0 }, canvas: { width: 800, height: 600 },
        spawnExplosion: () => { throw new Error('spawnExplosion を呼んだ'); } };
    // ミサイル1発（半径約20px）を中ほどに: 上が落ち、残りが4割を切って崩壊する
    town.blast(16, 40, 36);
    for (let t = 0; t < 200; t++) town.update(game);
    assert.equal(blasts, 1);
    assert.ok(town.buildings[0].collapsed);
    assert.equal(town.falling.length, 0, '落ちた破片は砕け終わっている');
    assert.ok(game.particles.length > 0);
});

test('Map.damageBlock で岩が壊れると、町に知らせる（壊れなかったときは知らせない）', async () => {
    const { Map } = await import('../src/js/world/Map.js');
    const map = new Map({ rng: new SeededRNG(11) }, 2);
    const seen = [];
    map.town = { onBlockDestroyed: (r, c) => seen.push([r, c]) };
    // 壊せる岩を1つ探す
    let target = null;
    for (let r = 1; r < map.rows - 1 && !target; r++) {
        for (let c = 1; c < map.cols - 1 && !target; c++) {
            const v = map.grid[r][c];
            if (v !== BLOCK_EMPTY && v !== BLOCK_INDESTRUCTIBLE) target = [r, c];
        }
    }
    assert.ok(target);
    const [r, c] = target;
    const hp = map.blockHP[r][c];
    if (hp > 1) { map.damageBlock(r, c, 1); assert.deepEqual(seen, []); }
    map.damageBlock(r, c, 999);
    assert.deepEqual(seen, [[r, c]]);
});

test('3面の Map の町は、岩が壊れたときに本物の支えで落ちる（Map の isSolid を見ている）', async () => {
    const { Map } = await import('../src/js/world/Map.js');
    const map = new Map({ rng: new SeededRNG(11) }, 2);
    // 支えの岩が全部壊せる岩の、床の建物を選び、支えの岩を全部壊す
    const tilesOf = (v) => [...new Set(v.anchors.map((a) => `${a.r},${a.c}`))].map((k) => k.split(',').map(Number));
    const b = map.town.buildings.find((v) => v.site === 'floor' && v.anchors.length > 0
        && tilesOf(v).every(([r, c]) => map.grid[r][c] !== BLOCK_INDESTRUCTIBLE));
    assert.ok(b, '支えを全部壊せる建物が無い');
    for (const [r, c] of tilesOf(b)) map.damageBlock(r, c, 9999);
    assert.ok(tilesOf(b).every(([r, c]) => !map.isSolid(r, c)));
    assert.equal(b.remaining, 0, '支えを全部失った建物は丸ごと落ちる');
    assert.ok(map.town.falling.some((p) => p.sourceId === b.id));
});
