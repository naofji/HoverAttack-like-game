import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { Town } from '../src/js/world/town/Town.js';
import { buildFir, buildBareTree } from '../src/js/world/town/snowTrees.js';
import { MAT_PLANT, SOLID } from '../src/js/world/town/chunks.js';
import {
    SNOWTREE_PARTICLE_COLORS, SNOWTREE_FLURRY_COLORS, SNOWTREE_CHAR_EDGE, PLANT_LEAF_PARTICLE_COLORS, PLANT_CHAR_EDGE,
} from '../src/js/world/town/palette.js';
import { fakeCanvas } from './helpers/town-fixtures.js';
import { SnowFlurryParticle } from '../src/js/entities/Particle.js';
import { SNOWTREE_FLURRY_HIT, SNOWTREE_FLURRY_LIFE, SNOWTREE_FLURRY_MODES, SNOWTREE_FLURRY_START, SNOWTREE_FLURRY_DRAG } from '../src/js/utils/Constants.js';

// 雪の木が出す粒の色（舞う雪と針葉の欠片）
const SNOW_COLORS = new Set([...SNOWTREE_PARTICLE_COLORS, ...SNOWTREE_FLURRY_COLORS]);
import { FallingPiece } from '../src/js/world/town/FallingPiece.js';
import { TOWN_FALLING_MAX } from '../src/js/utils/Constants.js';

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
        assert.ok(SNOW_COLORS.has(p.color), `${p.color} が雪の木の粒の色でない`);
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
    for (const p of game.particles) assert.ok(SNOW_COLORS.has(p.color), `${p.color}`);
});

test('落ちる破片の数が上限を超えて古いものが消えるときも、粒は雪の色', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const canvas = fakeCanvas(8, 8);
    const piece = () => new FallingPiece({ canvas, cells: [MAT_PLANT | SOLID], cw: 1, ch: 1, x: 100, y: 100, sourceId: b.id });
    for (let i = 0; i < TOWN_FALLING_MAX + 5; i++) town.falling.push(piece());
    town._trimFalling();
    assert.equal(town.falling.length, TOWN_FALLING_MAX);
    const leaf = town.effects.filter((e) => e.type === 'leaf');
    assert.equal(leaf.length, 5, '消した破片の数だけ粒の注文が出る');
    for (const e of leaf) assert.equal(e.flora, 'snow');
    // 元の建物が分からない破片は葉（4面の植物と同じ）。一番古い位置に置いて、次に消えるのがこれになるようにする
    town.effects.length = 0;
    town.falling.unshift(new FallingPiece({ canvas, cells: [MAT_PLANT | SOLID], cw: 1, ch: 1, x: 0, y: 0, sourceId: -1 }));
    town.falling.push(piece());
    town._trimFalling();
    assert.equal(town.effects.length, 2);
    assert.equal(town.effects[0].flora, 'leaf');
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

test('雪の木が欠けると、舞う雪（SnowFlurryParticle）が SNOWTREE_FLURRY_HIT 粒出る（6 粒に 1 粒は針葉の欠片）。4面の植物は葉のまま', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const { x, y } = midOf(b);
    town.chip(b, x, y, 6);
    const game = fakeGame();
    town.update(game);
    assert.equal(game.particles.length, SNOWTREE_FLURRY_HIT);
    const flurry = game.particles.filter((p) => p instanceof SnowFlurryParticle);
    assert.equal(flurry.length, SNOWTREE_FLURRY_HIT - Math.floor(SNOWTREE_FLURRY_HIT / 6));
    for (const p of flurry) assert.ok(SNOWTREE_FLURRY_COLORS.includes(p.color));
    // 舞う雪は game を持つ（地面に触れたら消えるため）
    assert.ok(flurry.every((p) => p.game === game));
    // 寿命は 1〜1.5 秒（50〜90 tick）。大きさは 2 か 3
    for (const p of flurry) {
        assert.ok(p.maxLifetime >= SNOWTREE_FLURRY_LIFE[0] && p.maxLifetime <= SNOWTREE_FLURRY_LIFE[1], `寿命 ${p.maxLifetime}`);
        assert.ok(p.size === 2 || p.size === 3);
    }

    const b0 = buildFir(new SeededRNG(3), { maxH: 400 });
    const spec = { ...treeSpec(b0) };
    delete spec.flora;
    const leaf = makeTown([spec]);
    const lb = leaf.buildings[0];
    leaf.chip(lb, midOf(lb).x, midOf(lb).y, 6);
    const g2 = fakeGame();
    leaf.update(g2);
    assert.ok(g2.particles.length > 0 && !g2.particles.some((p) => p instanceof SnowFlurryParticle), '4面の植物が舞う雪を出した');
});

test('地面の線の上の点（横たわった木・床で砕けた欠片）から出た舞う雪は、最初の更新で岩に入って消えない', () => {
    const town = makeTown();
    // 岩は y 320（行 20）から。効果の点が、その線の上
    const game = { particles: [], map: { isSolidAtPixel: (x, y) => y >= 320 } };
    town.effects.push({ type: 'leaf', x: 100, y: 320, count: 600, flora: 'snow', spread: 6 });
    town._flushEffects(game);
    const flurry = game.particles.filter((p) => p instanceof SnowFlurryParticle);
    assert.ok(flurry.length >= 400);
    for (const p of flurry) p.update();
    const dead = flurry.filter((p) => !p.alive).length;
    assert.equal(dead, 0, `${dead} 粒が最初の更新で消えた（岩の中で生まれた）`);
});

test('シミュレーション（欠ける・切り離す・倒れる）は Math.random を使わない。使ってよいのは見た目の粒を作る _flushEffects だけ', () => {
    const real = Math.random;
    Math.random = () => { throw new Error('シミュレーションで Math.random は使わない'); };
    try {
        const town = makeTown([treeSpec(fir())]);
        const b = town.buildings[0];
        town.chip(b, midOf(b).x, midOf(b).y, 6);
        const root = [];
        for (let i = 0; i < b.cw; i++) if (b.cells[(b.ch - 1) * b.cw + i]) root.push(i);
        town.chip(b, b.x + root[0] * 4 - 2, b.y + (b.ch - 2) * 4 + 2, 8);
        for (let t = 0; t < 120; t++) town._updateFalling();
        assert.ok(town.effects.length > 0, '粒の注文が出ていない（この検証が意味を失った）');
    } finally { Math.random = real; }
});

// 出来事ごとの動き（ユーザーの指摘「舞い上がりすぎ。欠けるときは控えめに。倒れるときは振り落とされて、倒れた後に舞う」）
function spawnMode(mode, count = 600) {
    const town = makeTown();
    const game = fakeGame();
    town._spawnSnowFlurry(game, { x: 100, y: 100, count, flora: 'snow', spread: 3, mode });
    return game.particles;
}
const upSpeed = (p) => -p.vy;   // 画面座標: 上向きが負

test('欠けたとき（hit）は控えめ: 上へ飛ぶ勢いが弱い（puff の約 1/3 以下）', () => {
    const ps = spawnMode('hit');
    const maxUp = Math.max(...ps.map(upSpeed));
    assert.ok(maxUp <= SNOWTREE_FLURRY_MODES.hit.speed[1] + 1e-9, `上へ ${maxUp}px/tick`);
    // 空気抵抗で止まるまでに飛ぶ高さ（初速 / (1 - DRAG)）。実機の「舞い上がりすぎ」の基準: 最大でも 15px 以下
    assert.ok(maxUp / (1 - SNOWTREE_FLURRY_DRAG) <= 15, `${maxUp / (1 - SNOWTREE_FLURRY_DRAG)}px まで上がる`);
    const puff = spawnMode('puff');
    const mean = (a) => a.reduce((x, p) => x + Math.hypot(p.vx, p.vy), 0) / a.length;
    assert.ok(mean(ps) < mean(puff) * 0.5, `hit の勢い ${mean(ps)} が puff ${mean(puff)} に近い`);
});

test('倒れる木が雪を振るい落とすとき（shake）は、下向きにほとんど勢い無しで落ちる', () => {
    const ps = spawnMode('shake');
    for (const p of ps) {
        assert.ok(p.vy > 0, `上へ飛んだ（vy ${p.vy}）`);
        assert.ok(Math.hypot(p.vx, p.vy) <= SNOWTREE_FLURRY_MODES.shake.speed[1] + 1e-9);
    }
});

test('倒れたあと（puff）は上半分の向きへ舞い上がる。勢いは hit より強い', () => {
    const ps = spawnMode('puff');
    for (const p of ps) assert.ok(p.vy <= 1e-9, `下へ飛んだ（vy ${p.vy}）`);
    assert.ok(Math.max(...ps.map(upSpeed)) > 1.5, '舞い上がる勢いが弱い');
    assert.ok(Math.min(...ps.map((p) => p.x)) < 100 && Math.max(...ps.map((p) => p.x)) > 100);
});

test('欠けたときの雪は、倒れ始めに振るい落とす雪の半分以下（控えめ）。mode 無しの効果は hit と同じ動き', () => {
    assert.ok(SNOWTREE_FLURRY_HIT * 2 <= SNOWTREE_FLURRY_START, `${SNOWTREE_FLURRY_HIT} と ${SNOWTREE_FLURRY_START}`);
    const town = makeTown();
    const b = town.buildings[0];
    town.effects.length = 0;
    town.chip(b, midOf(b).x, midOf(b).y, 6);
    const e = town.effects.find((q) => q.type === 'leaf');
    assert.equal(e.mode, 'hit');
    assert.equal(e.count, SNOWTREE_FLURRY_HIT);
    const game = fakeGame();
    town._spawnSnowFlurry(game, { x: 0, y: 0, count: 200, flora: 'snow' });
    assert.ok(Math.max(...game.particles.map(upSpeed)) <= SNOWTREE_FLURRY_MODES.hit.speed[1] + 1e-9);
});

test('粒の大きさ: 倒れる木の雪（shake / puff）は 1px か 2px、欠けたとき（hit）は 2px か 3px。針葉の欠片も倒れる木のほうが小さい', () => {
    const sizes = (mode) => spawnMode(mode, 900);
    for (const mode of ['shake', 'puff']) {
        const ps = sizes(mode);
        const flurry = ps.filter((p) => p instanceof SnowFlurryParticle);
        const needles = ps.filter((p) => !(p instanceof SnowFlurryParticle));
        assert.ok(flurry.length > 600 && needles.length > 100);
        for (const p of flurry) assert.ok(p.size === 1 || p.size === 2, `${mode}: 大きさ ${p.size}`);
        assert.ok(flurry.some((p) => p.size === 1) && flurry.some((p) => p.size === 2), `${mode}: 大小が混ざらない`);
        for (const p of needles) assert.ok(p.size <= 2.25 + 1e-9, `${mode}: 針葉の欠片 ${p.size}`);
    }
    const hit = sizes('hit');
    for (const p of hit.filter((q) => q instanceof SnowFlurryParticle)) assert.ok(p.size === 2 || p.size === 3, `hit: 大きさ ${p.size}`);
    const mean = (a) => a.reduce((x, p) => x + p.size, 0) / a.length;
    assert.ok(mean(sizes('puff')) < mean(hit) * 0.75, '倒れる木の雪が欠けたときの雪より小さくない');
});
