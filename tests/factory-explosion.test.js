// 6面の工場の爆発物はグレネードと同じ派手な爆発（ユーザーの指定 2026-11-07「工場は可燃物が多い。グレネードと同様で
// 周囲にダメージあり」）。粒 GRENADE_EXPLOSION_COUNT、半径 GRENADE_DAMAGE_RADIUS に GRENADE_DAMAGE、地形も
// GRENADE_BLAST_RADIUS タイルを GRENADE_BLOCK_DAMAGE で壊す。3面の町の爆発物は今のまま（岩は壊さない）
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import {
    TILE_SIZE, GRENADE_EXPLOSION_COUNT, GRENADE_DAMAGE, GRENADE_DAMAGE_RADIUS, GRENADE_BLAST_RADIUS, GRENADE_BLOCK_DAMAGE,
    TOWN_EXPLOSIVE_DAMAGE, TOWN_EXPLOSIVE_BLAST_COUNT,
} from '../src/js/utils/Constants.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { drum, unit, world } from './helpers/town-explosive-fixtures.js';

const factoryDrum = (x, y, w, h) => ({ ...drum(x, y, w, h), blast: 'factory' });

test('工場の爆発物は粒 GRENADE_EXPLOSION_COUNT の爆発で、半径の中の機体に GRENADE_DAMAGE', () => {
    const w = world([factoryDrum(100, 100)]);   // 中心 (104, 108)
    w.game.player = unit(104 + GRENADE_DAMAGE_RADIUS - 8, 108);
    w.game.carrier = unit(104 + GRENADE_DAMAGE_RADIUS + 12, 108);
    w.game.enemies.push(unit(104, 108 - 20));
    w.town.chip(w.town.buildings[0], 104, 108, 4);
    w.step(1);
    assert.equal(w.booms.length, 1);
    assert.equal(w.booms[0].size, GRENADE_EXPLOSION_COUNT);
    assert.deepEqual(w.game.player.hits, [GRENADE_DAMAGE]);
    assert.deepEqual(w.game.enemies[0].hits, [GRENADE_DAMAGE], '敵にも当たる（町の爆発物は敵味方どちらにも）');
    assert.deepEqual(w.game.carrier.hits, []);
});

test('工場の爆発物は地形をグレネードと同じだけ壊す', () => {
    const w = world([factoryDrum(100, 100)]);
    w.town.chip(w.town.buildings[0], 104, 108, 4);
    w.step(1);
    const calls = w.rockHits.filter((c) => c[0] === 'destroyArea');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].slice(1), [Math.floor(108 / TILE_SIZE), Math.floor(104 / TILE_SIZE), GRENADE_BLAST_RADIUS, GRENADE_BLOCK_DAMAGE]);
});

test('画面の外で爆発しても地形とダメージは同じ（粒と音だけ省く）', () => {
    const w = world([factoryDrum(3000, 100)], { view: { x: 0, y: 0, w: 400, h: 300 } });
    w.game.player = unit(3004, 108);
    w.town.chip(w.town.buildings[0], 3004, 108, 4);
    w.step(1);
    assert.equal(w.booms.length, 0);
    assert.deepEqual(w.game.player.hits, [GRENADE_DAMAGE]);
    assert.equal(w.rockHits.filter((c) => c[0] === 'destroyArea').length, 1);
});

test('3面の町の爆発物は今のまま（粒 TOWN_EXPLOSIVE_BLAST_COUNT・ダメージ TOWN_EXPLOSIVE_DAMAGE・岩は壊さない）', () => {
    const w = world([drum(100, 100)]);
    w.game.player = unit(110, 108);
    w.town.chip(w.town.buildings[0], 104, 108, 4);
    w.step(1);
    assert.equal(w.booms[0].size, TOWN_EXPLOSIVE_BLAST_COUNT);
    assert.deepEqual(w.game.player.hits, [TOWN_EXPLOSIVE_DAMAGE]);
    assert.deepEqual(w.rockHits, []);
});

test('6面の爆発物の設計図には blast: factory、3面には無い', async () => {
    const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
    const { Map } = await import('../src/js/world/Map.js');
    const six = new Map({ rng: new SeededRNG(11) }, 5).town.buildings.filter((b) => b.explosive);
    const three = new Map({ rng: new SeededRNG(11) }, 2).town.buildings.filter((b) => b.explosive);
    assert.ok(six.length > 0 && three.length > 0);
    assert.ok(six.every((b) => b.blast === 'factory'));
    assert.ok(three.every((b) => b.blast === 'town'));
});
