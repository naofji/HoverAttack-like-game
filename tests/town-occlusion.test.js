// 町を前景に描くとき、機体が重なる建物を丸ごと薄くする（Town.updateOcclusion / draw）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { Town } from '../src/js/world/town/Town.js';
import { MAT_ADOBE } from '../src/js/world/town/chunks.js';
import { TOWN_OCCLUDE_ALPHA, TOWN_OCCLUDE_FADE_STEP } from '../src/js/utils/Constants.js';

const fakeCanvas = (w, h) => { const cv = { width: w, height: h, ctx: makeFakeCtx() }; cv.getContext = () => cv.ctx; return cv; };
const spec = (x, y) => ({
    site: 'floor', style: 'A', kind: 'tower', x, y, w: 32, h: 32,
    parts: [{ x: 0, y: 0, w: 32, h: 32, color: '#7d5a2a', mat: MAT_ADOBE, solid: true }],
});
const makeTown = () => new Town([spec(100, 100), spec(300, 100)], { createCanvas: fakeCanvas });
const at = (x, y, extra = {}) => ({ x, y, width: 10, height: 10, alive: true, ...extra });
const ticksToFade = Math.ceil((1 - TOWN_OCCLUDE_ALPHA) / TOWN_OCCLUDE_FADE_STEP);

test('重なった建物だけが少しずつ TOWN_OCCLUDE_ALPHA まで薄くなり、離れると 1 に戻る', () => {
    const town = makeTown();
    const [inside, other] = town.buildings;
    town.updateOcclusion([at(110, 110)]);
    assert.ok(Math.abs(inside.alpha - (1 - TOWN_OCCLUDE_FADE_STEP)) < 1e-9, '1 tick で一気には変わらない');
    for (let t = 0; t < ticksToFade; t++) town.updateOcclusion([at(110, 110)]);
    assert.equal(inside.alpha, TOWN_OCCLUDE_ALPHA, '行き過ぎずに止まる');
    assert.equal(other.alpha, 1);
    for (let t = 0; t <= ticksToFade; t++) town.updateOcclusion([]);
    assert.equal(inside.alpha, 1);
});

test('薄い建物だけ globalAlpha を下げて描き、描いたら 1 に戻す', () => {
    const town = makeTown();
    town.buildings[0].alpha = TOWN_OCCLUDE_ALPHA;
    const ctx = makeFakeCtx();
    town.draw(ctx, { x: 0, y: 0, w: 800, h: 600 });
    const seq = ctx.calls.filter((c) => c.name === 'drawImage' || c.name === 'set:globalAlpha')
        .map((c) => (c.name === 'drawImage' ? `img${c.args[1]}` : `a${c.args[0]}`));
    assert.deepEqual(seq, [`a${TOWN_OCCLUDE_ALPHA}`, 'img100', 'a1', 'img300']);
});

test('update は自機・母艦・画面の近くの敵・アイテム・地雷を見る。死んだものと画面の遠くの敵は見ない', () => {
    const cases = [
        [{ player: at(110, 110) }, true],
        [{ carrier: at(110, 110) }, true],
        [{ enemies: [at(110, 110)] }, true],
        [{ pickups: [at(110, 110)] }, true],
        [{ landmines: [at(110, 110)] }, true],
        [{ player: at(110, 110, { alive: false }) }, false],
        // 画面（0,0 から 800x600）からずっと遠い敵の下の建物は描かれないので見ない
        [{ enemies: [at(110, 110)], camera: { x: 5000, y: 5000 }, canvas: { width: 800, height: 600 } }, false],
    ];
    for (const [extra, faded] of cases) {
        const town = makeTown();
        town.update({ particles: [], projectiles: [], enemies: [], camera: null, canvas: null, ...extra });
        assert.equal(town.buildings[0].alpha < 1, faded, JSON.stringify(Object.keys(extra)));
        assert.equal(town.buildings[1].alpha, 1);
    }
});

test('visibleRects は draw と同じ建物の外接矩形を返す', () => {
    const town = makeTown();
    assert.deepEqual(town.visibleRects({ x: 0, y: 0, w: 200, h: 200 }), [{ x: 100, y: 100, w: 32, h: 32 }]);
});

test('drawTerrainOver は矩形ごとに地形のキャッシュを同じ位置へ重ね、盤面の外は切る', async () => {
    const { MapRender } = await import('../src/js/world/mapRender.js');
    const cache = { name: 'cache' };
    const ctx = makeFakeCtx();
    MapRender.drawTerrainOver.call({ width: 1000, height: 500, tileCacheCanvas: cache }, ctx, [
        { x: 100.5, y: 50, w: 32, h: 20 },
        { x: -10, y: 480, w: 30, h: 40 },     // 左と下にはみ出す
        { x: 2000, y: 0, w: 10, h: 10 },      // 盤面の外は描かない
    ]);
    const imgs = ctx.calls.filter((c) => c.name === 'drawImage').map((c) => c.args);
    assert.deepEqual(imgs, [
        [cache, 100, 50, 33, 20, 100, 50, 33, 20],
        [cache, 0, 480, 20, 20, 0, 480, 20, 20],
    ]);
});
