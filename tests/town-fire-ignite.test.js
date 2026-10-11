import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAT_ADOBE, MAT_WOOD, MAT_METAL } from '../src/js/world/town/chunks.js';
import { TOWN_FIRES_PER_BUILDING, TOWN_EMBER_FRAMES, TOWN_EMBERS_MAX } from '../src/js/utils/Constants.js';
import { Town } from '../src/js/world/town/Town.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { fakeCanvas } from './helpers/town-fixtures.js';
import { made, townOf, run } from './helpers/town-fire-fixtures.js';
import { PlayerBullet } from '../src/js/entities/PlayerBullet.js';

test('爆発: 半径の中の燃える材料には必ず火がつく（1棟の上限まで）。金属にはつかない', () => {
    const town = townOf([made(0, 0, 64, 64, MAT_WOOD), made(100, 0, 64, 64, MAT_METAL)]);
    town.blast(32, 32, 36);
    assert.equal(town.fire.countIn(town.buildings[0]), TOWN_FIRES_PER_BUILDING);
    town.blast(132, 32, 36);
    assert.equal(town.fire.countIn(town.buildings[1]), 0);
});

test('弾: 当たった所に、材料の確率で火がつく（木は土より多い）', () => {
    const rate = (mat) => {
        let lit = 0;
        for (let seed = 1; seed <= 200; seed++) {
            const town = townOf([made(200, 0, 32, 200, mat)], seed);
            const game = { spawnSparks() {}, map: { isSolidAtPixel: () => false } };
            const b = new PlayerBullet(game, 196, 100, 0);
            b._prevX = 196; b._prevY = 100; b.x = 204;
            town.sweepProjectile(b);
            if (town.fire.fires.length > 0) lit++;
        }
        return lit / 200;
    };
    const wood = rate(MAT_WOOD), adobe = rate(MAT_ADOBE);
    assert.ok(wood > 0.07 && wood < 0.25, `木 ${wood}`);
    assert.ok(adobe < 0.08, `土 ${adobe}`);
});

test('燃えている塊が切り離されると、火は破片が持っていく（建物の火の数は減る）', () => {
    // 支えは最下段だけの木の柱。上のほうを燃やしてから、中ほどを横断して欠かせる
    const rng = new SeededRNG(1);
    const town = new Town([made(0, 0, 4, 40, MAT_WOOD)], {
        createCanvas: fakeCanvas, isSolidTile: (r) => r === 2, random: () => rng.next(),
    });
    const b = town.buildings[0];
    town.fire.ignite(b, 0);
    town.chip(b, 2, 20, 1);
    assert.equal(town.fire.countIn(b), 0);
    const p = town.falling.find((q) => q.y === 0);
    assert.ok(p && p.fireFuel > 0, '上の破片が燃えている');
});

test('燃えている破片は、当たった下の建物に燃え移る', () => {
    const rng = new SeededRNG(2);
    const floor10 = (r) => r >= 10;
    const town = new Town([made(0, 0, 16, 16, MAT_WOOD), made(0, 96, 16, 68, MAT_WOOD)], {
        createCanvas: fakeCanvas, isSolidTile: floor10, random: () => rng.next(),
    });
    town.fire.ignite(town.buildings[0], 0);
    town.chip(town.buildings[0], 14, 14, 0.5);    // 支えの無い上の小屋が丸ごと落ちる
    const p = town.falling[0];
    assert.ok(p.fireFuel > 0);
    p.vx = 0;
    const game = { particles: [], projectiles: [], camera: null, canvas: null };
    for (let t = 0; t < 60 && town.falling.length; t++) town.update(game);
    assert.ok(town.fire.countIn(town.buildings[1]) > 0);
});

test('燃えている破片が砕けた所に残り火が残り、TOWN_EMBER_FRAMES で消える', () => {
    const rng = new SeededRNG(3);
    const town = new Town([made(0, 0, 16, 16, MAT_WOOD)], {
        createCanvas: fakeCanvas, isSolidTile: (r) => r >= 10, random: () => rng.next(),
    });
    town.fire.ignite(town.buildings[0], 0);
    town.chip(town.buildings[0], 14, 14, 0.5);
    run(town, 80);
    assert.equal(town.falling.length, 0);
    assert.equal(town.fire.embers.length >= 1, true);
    run(town, TOWN_EMBER_FRAMES);
    assert.equal(town.fire.embers.length, 0);
});

test('燃料が尽きて消えた火元も残り火を残す。残り火は TOWN_EMBERS_MAX まで', () => {
    const specs = [];
    for (let n = 0; n < TOWN_EMBERS_MAX + 10; n++) specs.push(made(n * 40, 0, 4, 4, MAT_ADOBE));
    const town = townOf(specs);
    for (const b of town.buildings) town.fire.ignite(b, 0);
    run(town, 600);
    assert.equal(town.fire.fires.length, 0);
    assert.ok(town.fire.embers.length > 0);
    assert.ok(town.fire.embers.length <= TOWN_EMBERS_MAX);
});
