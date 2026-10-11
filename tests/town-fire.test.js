import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Town } from '../src/js/world/town/Town.js';
import { MAT_ADOBE, MAT_WOOD, MAT_METAL, CHARRED } from '../src/js/world/town/chunks.js';
import { TOWN_FIRE_TICK, TOWN_FIRES_MAX, TOWN_FIRES_PER_BUILDING, TOWN_MATERIALS } from '../src/js/utils/Constants.js';
import { fakeCanvas } from './helpers/town-fixtures.js';
import { made, townOf, run } from './helpers/town-fire-fixtures.js';

test('ignite: 燃える材料のかけらに火がつき、燃えない材料（金属）・空のかけら・焦げたかけらにはつかない', () => {
    const town = townOf([made(0, 0, 16, 16, MAT_WOOD), made(40, 0, 16, 16, MAT_METAL)]);
    const [wood, metal] = town.buildings;
    assert.equal(town.fire.ignite(wood, 0), true);
    assert.equal(town.fire.ignite(wood, 0), false, '同じかけらに2つ目はつかない');
    assert.equal(town.fire.ignite(metal, 0), false);
    wood.cells[1] |= CHARRED;
    assert.equal(town.fire.ignite(wood, 1), false);
    wood.cells[2] = 0;
    assert.equal(town.fire.ignite(wood, 2), false);
});

test('上限: 1棟 TOWN_FIRES_PER_BUILDING まで、面全体 TOWN_FIRES_MAX まで。消えれば再びつく', () => {
    const specs = [];
    for (let n = 0; n < 20; n++) specs.push(made(n * 40, 0, 32, 32, MAT_WOOD));
    const town = townOf(specs);
    const b0 = town.buildings[0];
    for (let k = 0; k < 10; k++) town.fire.ignite(b0, k);
    assert.equal(town.fire.countIn(b0), TOWN_FIRES_PER_BUILDING);
    for (const b of town.buildings) for (let k = 0; k < 10; k++) town.fire.ignite(b, k);
    assert.equal(town.fire.fires.length, Math.min(TOWN_FIRES_MAX, 20 * TOWN_FIRES_PER_BUILDING));
    if (town.fire.fires.length === TOWN_FIRES_MAX) {
        const last = town.buildings.find((b) => town.fire.countIn(b) === 0);
        assert.equal(town.fire.ignite(last, 0), false, '上限のあいだはつかない');
        town.fire.onCellsRemoved(b0, [...Array(b0.cells.length).keys()]);
        assert.equal(town.fire.ignite(last, 0), true, '火が減れば再びつく');
    }
});

test('燃え進みは TOWN_FIRE_TICK フレームに1回。燃えているかけらは焦げ（CHARRED）、焦げ色を1度塗る', () => {
    const town = townOf([made(0, 0, 16, 16, MAT_WOOD)]);
    const b = town.buildings[0];
    town.fire.ignite(b, 5);
    run(town, TOWN_FIRE_TICK - 1);
    assert.equal(b.cells[5] & CHARRED, 0, 'まだ焦げない');
    const before = b.canvas.ctx.calls.filter((c) => c.name === 'fillRect').length;
    run(town, 1);
    assert.equal(b.cells[5] & CHARRED, CHARRED);
    assert.ok(b.burnt.has(5));
    assert.equal(b.canvas.ctx.calls.filter((c) => c.name === 'fillRect').length, before + 1);
});

test('燃料が尽きると火は消える（土は木より早い）', () => {
    const life = (mat) => {
        const town = townOf([made(0, 0, 4, 4, mat)]);   // かけら1つ（燃え進む先が無い）
        town.fire.ignite(town.buildings[0], 0);
        let f = 0;
        while (town.fire.fires.length > 0 && f < 5000) { run(town, 1); f++; }
        return f;
    };
    const [woodLo, woodHi] = TOWN_MATERIALS[MAT_WOOD].fuel;
    const [adobeLo, adobeHi] = TOWN_MATERIALS[MAT_ADOBE].fuel;
    const w = life(MAT_WOOD), a = life(MAT_ADOBE);
    assert.ok(w >= woodLo && w <= woodHi + TOWN_FIRE_TICK, `木 ${w}`);
    assert.ok(a >= adobeLo && a <= adobeHi + TOWN_FIRE_TICK, `土 ${a}`);
});

test('燃えているかけらが欠けたら、その火は消える（宙に火が残らない）', () => {
    const town = townOf([made(0, 0, 16, 16, MAT_WOOD)]);
    const b = town.buildings[0];
    town.fire.ignite(b, 0);
    town.chip(b, 2, 2, 1);
    assert.equal(town.fire.fires.length, 0);
});

test('removeAndSettle: かけらを抜いて支えを確かめ直す（燃えて崩れたときの入口）', () => {
    // 支えは最下段だけ。中ほどの段を全部抜くと上が落ちる
    const town = new Town([made(0, 0, 8, 20, MAT_WOOD)], {
        createCanvas: fakeCanvas, isSolidTile: (r) => r === 1,   // 中心 y=18 の最下段（行 1）
    });
    const b = town.buildings[0];
    town.removeAndSettle(b, [4, 5]);   // 2段目（j=2）の2かけら
    assert.ok(town.falling.length >= 1);
});
