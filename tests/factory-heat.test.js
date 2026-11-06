import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Town } from '../src/js/world/town/Town.js';
import { MAT_METAL, MAT_CONCRETE, MAT_EXPLOSIVE, CHUNK } from '../src/js/world/town/chunks.js';
import { FACTORY_HEAT_COLORS, TOWN_CHAR_EDGE } from '../src/js/world/town/palette.js';
import { FACTORY_HEAT_COOL } from '../src/js/utils/Constants.js';
import { fakeCanvas } from './helpers/town-fixtures.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';

// 6面の金属は撃たれると穴の縁が赤く焼け、FACTORY_HEAT_COOL フレームで暗い焼け色に冷めて焼き込まれる（spec 2章）

const slab = (x, mat) => ({
    site: 'floor', style: 'B', kind: 'slab', x, y: 0, w: 32, h: 32,
    parts: [{ x: 0, y: 0, w: 32, h: 32, color: '#2e3034', mat, solid: true }],
});
function makeTown(specs, metalHeat = true) {
    const rng = new SeededRNG(1);
    return new Town(specs, {
        createCanvas: fakeCanvas, isSolidTile: () => true, metalHeat, random: () => rng.next(),
    });
}
const game = (town) => ({
    particles: [], projectiles: [], enemies: [], landmines: [], pickups: [], player: null, carrier: null,
    camera: null, canvas: null, map: { town },
});
/** fillStyle を追いながら、色ごとの fillRect の引数を集める */
function fillsWith(calls, color) {
    let style = '';
    let alpha = 1;
    const out = [];
    for (const c of calls) {
        if (c.name === 'set:fillStyle') style = c.args[0];
        else if (c.name === 'set:globalAlpha') alpha = c.args[0];
        else if (c.name === 'fillRect' && style === color) out.push({ args: c.args, alpha });
    }
    return out;
}
const VIEW = { x: -100, y: -100, w: 1000, h: 1000 };

test('金属の穴の縁は熱くなり、冷めると焼け色が焼き込まれる', () => {
    const town = makeTown([slab(0, MAT_METAL)]);
    const b = town.buildings[0];
    town.chip(b, 16, 16, 6);
    assert.ok(town.hot.length > 0, '熱いかけらが無い');
    assert.equal(fillsWith(b.ctx.calls, TOWN_CHAR_EDGE).length, 0, '金属に茶色の焦げを塗った');
    const n = town.hot.length;
    for (let i = 0; i < FACTORY_HEAT_COOL - 1; i++) town.update(game(town));
    assert.equal(town.hot.length, n, '冷めきる前に消えた');
    town.update(game(town));
    assert.equal(town.hot.length, 0, '冷めても残っている');
    assert.equal(fillsWith(b.ctx.calls, FACTORY_HEAT_COLORS.burnt).length, n, '焼け色が焼き込まれていない');
});

test('撃たれた直後は赤熱の色で描き、建物の alpha で描く', () => {
    const town = makeTown([slab(0, MAT_METAL)]);
    const b = town.buildings[0];
    town.chip(b, 16, 16, 6);
    b.alpha = 0.8;
    const ctx = makeFakeCtx();
    town.draw(ctx, VIEW);
    const hot = fillsWith(ctx.calls, FACTORY_HEAT_COLORS.hot);
    assert.equal(hot.length, town.hot.length);
    assert.ok(hot.every((f) => f.alpha === 0.8), '建物が薄い間も赤熱が不透明');
    assert.ok(hot.every((f) => f.args[2] === CHUNK && f.args[3] === CHUNK));
    assert.equal(ctx.globalAlpha, 1, 'globalAlpha を戻していない');
});

test('コンクリートの縁は茶色の焦げのまま', () => {
    const town = makeTown([slab(0, MAT_CONCRETE)]);
    const b = town.buildings[0];
    town.chip(b, 16, 16, 6);
    assert.equal(town.hot.length, 0);
    assert.ok(fillsWith(b.ctx.calls, TOWN_CHAR_EDGE).length > 0);
});

test('metalHeat の無い町（3〜5面）では金属も焦げのまま', () => {
    const town = makeTown([slab(0, MAT_METAL)], false);
    const b = town.buildings[0];
    town.chip(b, 16, 16, 6);
    assert.equal(town.hot.length, 0);
    assert.ok(fillsWith(b.ctx.calls, TOWN_CHAR_EDGE).length > 0);
});

test('消えたかけらの熱は描かない・一覧から外れる', () => {
    const town = makeTown([slab(0, MAT_METAL)]);
    const b = town.buildings[0];
    town.chip(b, 16, 16, 6);
    const { k } = town.hot[0];
    const i = k % b.cw, j = (k - i) / b.cw;
    town.chip(b, i * CHUNK + 2, j * CHUNK + 2, 0.5);
    assert.equal(b.cells[k], 0);
    // 欠けた tick の描画（update の前）でも、穴の上に赤い四角を描かない
    const at = (c) => c.name === 'fillRect' && c.args[0] === b.x + i * CHUNK && c.args[1] === b.y + j * CHUNK;
    const before = makeFakeCtx();
    town.draw(before, VIEW);
    assert.ok(!before.calls.some(at), '欠けた tick に穴の上へ赤い四角');
    town.update(game(town));
    assert.ok(!town.hot.some((h) => h.b === b && h.k === k), '消えたかけらが熱いまま');
    const ctx = makeFakeCtx();
    town.draw(ctx, VIEW);
    assert.ok(!ctx.calls.some(at), '穴の上に赤い四角');
});

test('熱は火も誘爆も起こさない', () => {
    const explosive = {
        site: 'floor', style: 'B', kind: 'drum', x: 32, y: 0, w: 8, h: 16,
        parts: [{ x: 0, y: 0, w: 8, h: 16, color: '#e02a1a', mat: MAT_EXPLOSIVE, solid: true }],
    };
    const town = makeTown([slab(0, MAT_METAL), explosive]);
    town.chip(town.buildings[0], 28, 8, 6);
    assert.ok(town.hot.length > 0);
    for (let i = 0; i < FACTORY_HEAT_COOL + 5; i++) town.update(game(town));
    assert.equal(town.buildings[1].exploded, false, '熱で爆発物が爆発した');
    assert.equal(town.fire.fires.length, 0, '熱で火がついた');
});
