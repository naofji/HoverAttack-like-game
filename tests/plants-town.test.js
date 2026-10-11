import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { Town } from '../src/js/world/town/Town.js';
import { buildTallFern, buildLowFern, buildMoss } from '../src/js/world/town/plants.js';
import { MAT_PLANT, SOLID } from '../src/js/world/town/chunks.js';
import { PLANT_LEAF_PARTICLE_COLORS, PLANT_CHAR_EDGE, TOWN_CHAR_EDGE } from '../src/js/world/town/palette.js';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { fakeCanvas, block } from './helpers/town-fixtures.js';

// 行 20（y 320〜）から下が岩の平らな床。植物は床の上に根元を埋めて立つ
const FLOOR_ROW = 20;
const isSolidTile = (r) => r >= FLOOR_ROW;

/** 床に立つ植物を1つ。根元の段（最下行）が岩に 4px 埋まる */
function plantSpec(b, x = 100) {
    const groundY = FLOOR_ROW * 16 + 4;
    return { site: 'floor', style: 'P', soft: true, kind: b.kind, x: x - b.footX, y: groundY - b.h, w: b.w, h: b.h, parts: b.parts };
}
const tallFern = () => buildTallFern(new SeededRNG(3), { maxH: 400 });
const fakeGame = () => ({ particles: [], projectiles: [], camera: null, canvas: null });
const makeTown = (specs = [plantSpec(tallFern())], solid = isSolidTile) => new Town(specs, { createCanvas: fakeCanvas, isSolidTile: solid });

/** 弾の最小限（Town.sweepProjectile が読むもの）。止まったら onTownWall が呼ばれる */
function bullet(x0, y0, x1, y1, townKind = 'bullet') {
    const p = { townKind, alive: true, x: x1, y: y1, vx: x1 - x0, vy: y1 - y0, _prevX: x0, _prevY: y0, stopped: null };
    p.onTownWall = (x, y) => { p.stopped = [x, y]; p.alive = false; };
    return p;
}
const midOf = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

test('燃えない: 爆発の炎・弾の火花・直接の着火のどれでも火がつかない', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const { x, y } = midOf(b);
    for (let i = 0; i < 20; i++) town.blast(x, y, 150);
    assert.equal(town.fire.fires.length, 0);
    for (let k = 0; k < b.cells.length; k++) assert.equal(town.fire.ignite(b, k), false);
    town.random = () => 0;   // 一番火がつきやすい乱数でも
    town.fire.igniteByBullet(b, x, y);
    town.fire.igniteNear(b, x, y, 100);
    assert.equal(town.fire.fires.length, 0);
});

test('誘爆しない: 爆発物ではなく、壊しても爆発の注文が出ない', () => {
    const town = makeTown();
    const b = town.buildings[0];
    assert.equal(b.explosive, false);
    assert.equal(town.explosives.trigger(b, 0) ?? null, null);
    const { x, y } = midOf(b);
    town.blast(x, y, 150);
    for (let t = 0; t < 120; t++) town.update(fakeGame());
    assert.equal(b.exploded, false);
});

test('マシンガンの弾は植物に止まり、当たった所が欠ける（すり抜けない）', () => {
    const town = makeTown();
    const b = town.buildings[0];
    // 幹の高さ（根元の段の 3 段上）を左から横切る
    const y = b.y + b.height - 16;
    const row = Math.floor((y - b.y) / 4);
    const trunkX = b.x + b.cells.findIndex((v, k) => v && Math.floor(k / b.cw) === row) % b.cw * 4;
    const before = b.remaining;
    // 撃った位置に重なる建物はその弾では無視される（Town.sweepProjectile）ので、外接矩形の外から撃つ
    const p = bullet(b.x - 10, y, trunkX + 2, y);
    town.sweepProjectile(p);
    assert.ok(p.stopped, '弾が止まらなかった');
    assert.equal(p.alive, false);
    assert.ok(b.remaining < before, '欠けなかった');
});

test('ミサイルとグレネードも植物に当たって止まる（爆発は弾の側）', () => {
    for (const kind of ['missile', 'grenade']) {
        const town = makeTown();
        const b = town.buildings[0];
        const y = b.y + b.height - 12;
        const row = Math.floor((y - b.y) / 4);
        const hit = b.cells.findIndex((v, k) => v && Math.floor(k / b.cw) === row);
        const x = b.x + (hit % b.cw) * 4 + 2;
        const p = bullet(b.x - 10, y, x + 1, y, kind);
        town.sweepProjectile(p);
        assert.ok(p.stopped, `${kind} が止まらなかった`);
    }
});

test('反射ビームは貫通して植物を欠かせる', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const { y } = midOf(b);
    const before = b.remaining;
    const beam = { townKind: 'beam', alive: true, segments: () => [{ x1: b.x - 40, y1: y, x2: b.x + b.width + 40, y2: y }] };
    town.sweepProjectile(beam);
    assert.equal(beam.alive, true);
    assert.ok(b.remaining < before);
});

test('欠けるたびに葉の粒が出る（画面の中。音は鳴らさない）', () => {
    const calls = [];
    const orig = audioManager.playTownCollapse;
    audioManager.playTownCollapse = (...a) => calls.push(a);
    try {
        const town = makeTown();
        const b = town.buildings[0];
        const { x, y } = midOf(b);
        town.chip(b, x, y, 6);
        const game = fakeGame();
        town.update(game);
        assert.ok(game.particles.length > 0, '葉の粒が出ない');
        for (const p of game.particles) assert.ok(PLANT_LEAF_PARTICLE_COLORS.includes(p.color), `${p.color} が葉の色でない`);
        assert.equal(calls.length, 0, '崩れる音を鳴らした');
    } finally { audioManager.playTownCollapse = orig; }
});

test('大きく欠けても崩壊の演出（閃光・焦げた土台・音）は出ない。町の建物は同じだけ欠けると崩壊する', () => {
    const calls = [];
    const orig = audioManager.playTownCollapse;
    audioManager.playTownCollapse = (...a) => calls.push(a);
    try {
        const town = makeTown();
        const b = town.buildings[0];
        const { x, y } = midOf(b);
        town.blast(x, y, 400);   // 残りが 4 割を切るほど欠かせる
        assert.ok(b.remaining < b.total * 0.4, '前提: 4割を切るまで欠けていない');
        assert.equal(b.collapsed, false);
        assert.equal(town.effects.some((e) => e.type === 'collapse'), false);
        for (let t = 0; t < 200; t++) town.update(fakeGame());
        assert.equal(calls.length, 0);

        // 対照: 町の建物（soft でない）は同じ欠け方で崩壊する
        const wall = new Town([block(100, 300, 32, 20)], { createCanvas: fakeCanvas, isSolidTile });
        const w = wall.buildings[0];
        wall.blast(116, 310, 400);
        assert.equal(w.collapsed, true, '対照の町の建物が崩壊しない（この比較が意味を失った）');
    } finally { audioManager.playTownCollapse = orig; }
});

test('支えの岩が壊れると、植物は葉の破片になって落ち、床で粒になって散る（瓦礫は残さない）', () => {
    let rock = true;
    const town = makeTown([plantSpec(buildMoss(new SeededRNG(8), { maxW: 40 }))], (r) => r >= FLOOR_ROW && !(rock === false && r === FLOOR_ROW));
    const b = town.buildings[0];
    const tileCols = new Set(b.anchors.map((a) => `${a.r},${a.c}`));
    rock = false;
    for (const key of tileCols) town.onBlockDestroyed(...key.split(',').map(Number));
    // 支えを全部失った → 全部の破片
    assert.equal(b.remaining, 0);
    assert.ok(town.falling.length > 0);
    const game = fakeGame();
    for (let t = 0; t < 400 && town.falling.length; t++) town.update(game);
    assert.equal(town.falling.length, 0);
    assert.equal(town.rubble.length, 0, '葉の山は残さない');
    assert.ok(game.particles.length > 0);
});

test('支えが無くなった部分だけが落ちる（残りは立ったまま）', () => {
    const town = makeTown();
    const b = town.buildings[0];
    // 幹の途中を 1 段ぶん抜く（根元を残す）→ 上が落ちる
    const row = b.ch - 4;
    const gone = [];
    for (let i = 0; i < b.cw; i++) if (b.cells[row * b.cw + i]) gone.push(row * b.cw + i);
    town.removeAndSettle(b, gone);
    assert.ok(town.falling.length > 0, '上の部分が落ちない');
    assert.ok(b.remaining > 0, '根元まで落ちた');
    assert.equal(b.collapsed, false);
});

test('植物のかけらの材料は火を中継しない行（burns: false）', async () => {
    const { TOWN_MATERIALS } = await import('../src/js/utils/Constants.js');
    assert.equal(TOWN_MATERIALS[MAT_PLANT].burns, false);
    assert.equal(TOWN_MATERIALS[MAT_PLANT].bulletIgnite, 0);
    assert.ok(SOLID > 0);
});

test('低いシダ・苔も同じ（燃えず、弾で欠ける）', () => {
    for (const b of [buildLowFern(new SeededRNG(2), { maxH: 400 }), buildMoss(new SeededRNG(2), { maxW: 40 })]) {
        const town = makeTown([plantSpec(b)]);
        const bd = town.buildings[0];
        const { x, y } = midOf(bd);
        const before = bd.remaining;
        town.blast(x, y, 150);
        assert.ok(bd.remaining < before);
        assert.equal(town.fire.fires.length, 0);
    }
});

test('穴の縁は暗い緑（町の茶色の焦げは、植物が焼けたように見える）', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const { x, y } = midOf(b);
    b.ctx.calls.length = 0;
    town.chip(b, x, y, 6);
    const colors = b.ctx.calls.filter((c) => c.name === 'set:fillStyle').map((c) => c.args[0]);
    assert.ok(colors.includes(PLANT_CHAR_EDGE), '縁に暗い緑を重ねていない');
    assert.ok(!colors.includes(TOWN_CHAR_EDGE), '町の焦げ色を重ねた');
});
