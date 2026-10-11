import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { Town } from '../src/js/world/town/Town.js';
import { TILE_SIZE as T, TOWN_FALL_MAX_SPEED, VIEW_CULL_MARGIN } from '../src/js/utils/Constants.js';
import { fakeCanvas, block } from './helpers/town-fixtures.js';

// 行 10（y 160〜175）から下が岩。建物は (0, 0) に支え無しで浮かせ、落としてみる
const floorAt10 = (r) => r >= 10;
// projectiles は Task 7 で town.update が見るようになる（ここでは空）
const fakeGame = (cam = { x: 0, y: 0 }) => ({ particles: [], projectiles: [], camera: cam, canvas: { width: 800, height: 600 } });

function dropOne() {
    const town = new Town([block(0, 0, 16, 16)], { createCanvas: fakeCanvas, isSolidTile: floorAt10 });
    town.chip(town.buildings[0], 8, 8, 1);   // 支え無し → 丸ごと破片
    return town;
}

test('破片は重力で落ち、速さは上限で止まる', () => {
    const town = dropOne();
    const p = town.falling[0];
    const game = fakeGame();
    let lastY = p.y;
    for (let t = 0; t < 12 && p.alive; t++) {
        town.update(game);
        assert.ok(p.y > lastY);
        assert.ok(p.vy <= TOWN_FALL_MAX_SPEED);
        lastY = p.y;
    }
});

test('岩に着くと砕ける: 破片は消え、瓦礫が床に残り、砕けた注文の粒が出る', () => {
    const town = dropOne();
    const game = fakeGame();
    for (let t = 0; t < 200 && town.falling.length; t++) town.update(game);
    assert.equal(town.falling.length, 0);
    assert.equal(town.rubble.length, 1);
    assert.equal(town.rubble[0].groundY, 10 * T);
    assert.ok(game.particles.length > 0);
    assert.equal(town.effects.length, 0, '注文は update で出し切る');
});

test('重なる瓦礫は1つにまとめる', () => {
    const town = new Town([block(0, 0, 16, 16), block(8, -40, 16, 16)], { createCanvas: fakeCanvas, isSolidTile: floorAt10 });
    for (const b of town.buildings) town.chip(b, b.x + 8, b.y + 8, 1);
    // 横流れ（建物ごとに ±0.3px/tick）で離れて落ちると重ならないので、まっすぐ落とす
    for (const p of town.falling) p.vx = 0;
    const game = fakeGame();
    for (let t = 0; t < 300 && town.falling.length; t++) town.update(game);
    assert.equal(town.rubble.length, 1);
    assert.ok(town.rubble[0].w >= 24);
});

test('画面の外で砕けても粒は出さない（でも破片は同じに落ちて瓦礫が残る）', () => {
    const town = dropOne();
    const game = fakeGame({ x: 5000, y: 5000 });
    for (let t = 0; t < 200 && town.falling.length; t++) town.update(game);
    assert.equal(town.falling.length, 0);
    assert.equal(town.rubble.length, 1);
    assert.equal(game.particles.length, 0);
});

test('画面のすぐ外（VIEW_CULL_MARGIN 以内）なら粒を出す', () => {
    const town = dropOne();
    // 破片は x=8 で砕ける。画面の左端をそれより MARGIN の半分だけ右に置く＝画面の外だがマージンの中
    const offScreenButInMargin = { x: 8 + VIEW_CULL_MARGIN / 2, y: 0 };
    const game = fakeGame(offScreenButInMargin);
    for (let t = 0; t < 200 && town.falling.length; t++) town.update(game);
    assert.ok(game.particles.length > 0);
});

test('落ちる破片は下の建物を1棟1回だけ欠かせる（連鎖）', () => {
    // 上の小屋を落とし、真下の塔（岩の上に立つ）に当てる
    const lower = block(0, 96, 16, 68);          // 下端 y=164 が行 10 の岩に 4px 入る
    const town = new Town([block(0, 0, 16, 16), lower], { createCanvas: fakeCanvas, isSolidTile: floorAt10 });
    const below = town.buildings[1];
    const before = below.remaining;
    town.chip(town.buildings[0], 8, 8, 1);
    const game = fakeGame();
    for (let t = 0; t < 300 && town.falling.length; t++) town.update(game);
    assert.ok(below.remaining < before, '下の建物が欠けた');
    const p = town.falling.find((f) => f.sourceId === 0);
    assert.equal(p, undefined);
});

test('破片の更新中に破片が増えても、全部が1回ずつ進む（新しい破片は次の tick から）', () => {
    const lower = block(0, 96, 16, 68);
    const town = new Town([block(0, 0, 16, 16), lower], { createCanvas: fakeCanvas, isSolidTile: floorAt10 });
    town.chip(town.buildings[0], 8, 8, 1);
    const p = town.falling[0];
    const game = fakeGame();
    const ys = [];
    for (let t = 0; t < 300 && p.alive; t++) { const y = p.y; town.update(game); if (p.alive) ys.push(p.y - y); }
    assert.ok(ys.every((d) => d > 0), '毎 tick 必ず下へ進む（飛ばし・二重が無い）');
});

test('draw: 建物 → 瓦礫 → 落ちる破片の順に、画面に掛かるものだけ描く', () => {
    const town = dropOne();
    const game = fakeGame();
    for (let t = 0; t < 3; t++) town.update(game);
    town.rubble.push({ x: 100, w: 16, groundY: 160, h: 4, color: '#6f4f24' });
    const ctx = makeFakeCtx();
    town.draw(ctx, { x: 0, y: 0, w: 800, h: 600 });
    const names = ctx.calls.map((c) => c.name);
    assert.ok(names.includes('fillRect'), '瓦礫');
    assert.ok(names.includes('rotate'), '破片');
    const far = makeFakeCtx();
    town.draw(far, { x: 5000, y: 5000, w: 800, h: 600 });
    assert.equal(far.calls.filter((c) => c.name === 'rotate' || c.name === 'fillRect').length, 0);
});

test('落ちる破片は、通り抜けるあいだ同じ建物を何度も削らない（1棟1回）', () => {
    const lower = block(0, 96, 16, 68);
    const town = new Town([block(0, 0, 16, 16), lower], { createCanvas: fakeCanvas, isSolidTile: floorAt10 });
    const below = town.buildings[1];
    town.chip(town.buildings[0], 8, 8, 1);
    for (const p of town.falling) p.vx = 0;
    let hits = 0;
    const realChip = town.chip.bind(town);
    town.chip = (b, ...rest) => { if (b === below) hits++; return realChip(b, ...rest); };
    const game = fakeGame();
    for (let t = 0; t < 300 && town.falling.length; t++) town.update(game);
    assert.equal(hits, 1, `下の建物を ${hits} 回削った`);
});

test('更新の途中で増えた破片は、その tick には動かない（次の tick から）', async () => {
    const { FallingPiece } = await import('../src/js/world/town/FallingPiece.js');
    const lower = block(0, 96, 16, 68);
    const town = new Town([block(0, 0, 16, 16), lower], { createCanvas: fakeCanvas, isSolidTile: floorAt10 });
    town.chip(town.buildings[0], 8, 8, 1);
    for (const p of town.falling) p.vx = 0;
    // 下の建物に当たった瞬間に、別の破片が1つ増える（欠けで切り離されたのと同じ）
    let born = null;
    const realChip = town.chip.bind(town);
    town.chip = (...a) => {
        const r = realChip(...a);
        if (!born) {
            born = new FallingPiece({ canvas: fakeCanvas(4, 4), cells: new Uint8Array([1]), cw: 1, ch: 1, x: 300, y: 50 });
            town.falling.push(born);
        }
        return r;
    };
    const game = fakeGame();
    for (let t = 0; t < 300 && !born; t++) town.update(game);
    assert.ok(born, '下の建物に当たらなかった');
    assert.equal(born.y, 50);
});
