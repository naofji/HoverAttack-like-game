import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { Town } from '../src/js/world/town/Town.js';
import { buildFir, buildBareTree } from '../src/js/world/town/snowTrees.js';
import { MAT_PLANT, SOLID } from '../src/js/world/town/chunks.js';
import {
    SNOWTREE_PARTICLE_COLORS, SNOWTREE_CHAR_EDGE, PLANT_LEAF_PARTICLE_COLORS, PLANT_CHAR_EDGE,
} from '../src/js/world/town/palette.js';
import { fakeCanvas } from './helpers/town-fixtures.js';

// 4面の植物（plants-town.test.js）と同じ Town の仕組みに載る。ここでは雪の木だけの違い
// （砕けた粒と穴の縁の色）と、燃えない・誘爆しないが雪の木でも保たれることを見る
const FLOOR_ROW = 20;
const isSolidTile = (r) => r >= FLOOR_ROW;
function treeSpec(b, x = 100) {
    const groundY = FLOOR_ROW * 16 + 4;
    return { site: 'floor', style: 'P', soft: true, flora: 'snow', kind: b.kind, x: x - b.footX, y: groundY - b.h, w: b.w, h: b.h, parts: b.parts };
}
const fir = () => buildFir(new SeededRNG(3), { maxH: 400 });
const fakeGame = () => ({ particles: [], projectiles: [], camera: null, canvas: null });
const makeTown = (specs = [treeSpec(fir())], solid = isSolidTile) => new Town(specs, { createCanvas: fakeCanvas, isSolidTile: solid });
const midOf = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

test('雪の木は欠けると雪の粒が出る（葉の色ではない）', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const { x, y } = midOf(b);
    town.chip(b, x, y, 6);
    const game = fakeGame();
    town.update(game);
    assert.ok(game.particles.length > 0, '粒が出ない');
    for (const p of game.particles) {
        assert.ok(SNOWTREE_PARTICLE_COLORS.includes(p.color), `${p.color} が雪の木の粒の色でない`);
        assert.ok(!PLANT_LEAF_PARTICLE_COLORS.includes(p.color));
    }
});

test('穴の縁は暗い青灰色（4面の暗い緑でも町の茶色でもない）', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const { x, y } = midOf(b);
    b.ctx.calls.length = 0;
    town.chip(b, x, y, 6);
    const colors = b.ctx.calls.filter((c) => c.name === 'set:fillStyle').map((c) => c.args[0]);
    assert.ok(colors.includes(SNOWTREE_CHAR_EDGE));
    assert.ok(!colors.includes(PLANT_CHAR_EDGE));
});

test('支えの岩が壊れると、雪の木は雪の破片になって落ち、床で雪の粒になって散る（瓦礫は残さない）', () => {
    let rock = true;
    const b0 = buildBareTree(new SeededRNG(8), { maxH: 400 });
    const town = makeTown([treeSpec(b0)], (r) => r >= FLOOR_ROW && !(rock === false && r === FLOOR_ROW));
    const b = town.buildings[0];
    const tiles = new Set(b.anchors.map((a) => `${a.r},${a.c}`));
    rock = false;
    for (const key of tiles) town.onBlockDestroyed(...key.split(',').map(Number));
    assert.equal(b.remaining, 0);
    assert.ok(town.falling.length > 0);
    const game = fakeGame();
    for (let t = 0; t < 400 && town.falling.length; t++) town.update(game);
    assert.equal(town.falling.length, 0);
    assert.equal(town.rubble.length, 0);
    assert.ok(game.particles.length > 0);
    for (const p of game.particles) assert.ok(SNOWTREE_PARTICLE_COLORS.includes(p.color), `${p.color}`);
});

test('落ちる破片の数が上限を超えて古いものが消えるときも、粒は雪の色', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const piece = { sourceId: b.id };
    assert.equal(town._floraOf(piece), 'snow');
    assert.equal(town._floraOf({ sourceId: -1 }), 'leaf');
});

test('燃えない・誘爆しない・弾で欠ける（雪の木でも植物の材料のまま）', () => {
    for (const build of [buildFir, buildBareTree]) {
        const b0 = build(new SeededRNG(3), { maxH: 400 });
        const town = makeTown([treeSpec(b0)]);
        const b = town.buildings[0];
        assert.equal(b.explosive, false);
        const { x, y } = midOf(b);
        for (let i = 0; i < 10; i++) town.blast(x, y, 150);
        assert.equal(town.fire.fires.length, 0);
        for (const v of b.cells) if (v) assert.equal(v, MAT_PLANT | SOLID);
    }
});

test('4面の植物（flora の無い設計図）は今までどおり葉の粒・暗い緑の縁', () => {
    const b0 = buildFir(new SeededRNG(3), { maxH: 400 });
    const spec = { ...treeSpec(b0) };
    delete spec.flora;
    const town = makeTown([spec]);
    const b = town.buildings[0];
    assert.equal(b.flora, 'leaf');
    const { x, y } = midOf(b);
    town.chip(b, x, y, 6);
    const game = fakeGame();
    town.update(game);
    for (const p of game.particles) assert.ok(PLANT_LEAF_PARTICLE_COLORS.includes(p.color));
});
