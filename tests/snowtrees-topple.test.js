import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { Town } from '../src/js/world/town/Town.js';
import { ToppleTree } from '../src/js/world/town/ToppleTree.js';
import { FallingPiece } from '../src/js/world/town/FallingPiece.js';
import { buildFir, buildBareTree } from '../src/js/world/town/snowTrees.js';
import { buildTallFern } from '../src/js/world/town/plants.js';
import { rasterizeParts, MAT_PLANT, SOLID, CHUNK } from '../src/js/world/town/chunks.js';
import { fakeCanvas, block } from './helpers/town-fixtures.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import {
    SNOWTREE_TOPPLE_LIE_TICKS, SNOWTREE_TOPPLE_PUFFS, SNOWTREE_TOPPLE_PUFF_PARTICLES,
    SNOWTREE_TOPPLE_MIN_CELLS, PLANT_LEAF_PARTICLES_HIT, SNOWTREE_FLURRY_START, SNOWTREE_FLURRY_TRICKLE,
    SNOWTREE_FLURRY_LIE_EVERY, SNOWTREE_FLURRY_LIE_PARTICLES,
} from '../src/js/utils/Constants.js';

const FLOOR_ROW = 20;
const isSolidTile = (r) => r >= FLOOR_ROW;
const GROUND_Y = FLOOR_ROW * 16;
const DEG = Math.PI / 180;

function treeSpec(b, x = 100, flora = 'snow') {
    return { site: 'floor', style: 'P', soft: true, ...(flora ? { flora } : {}), kind: b.kind, footX: b.footX, x: x - b.footX, y: GROUND_Y + 4 - b.h, w: b.w, h: b.h, parts: b.parts };
}
const fir = (seed = 3) => buildFir(new SeededRNG(seed), { maxH: 400 });
const fakeGame = () => ({ particles: [], projectiles: [], camera: null, canvas: null });
const makeTown = (specs, solid = isSolidTile) => new Town(specs, { createCanvas: fakeCanvas, isSolidTile: solid });

/** 木を 1 本作って、塊（rasterize したかけら）を ToppleTree にする。床に立つ位置 */
function pieceOf(b, lean = 1, extra = {}) {
    const { cells, cw, ch } = rasterizeParts(b.parts, b.w, b.h);
    return new ToppleTree({
        canvas: fakeCanvas(b.w, b.h), cells, cw, ch, x: 100 - b.footX, y: GROUND_Y - (b.h - 4), lean, ...extra,
    });
}
/** 床の上で tick を進める（軸が床に乗っている） */
function run(p, ticks, supported = true) {
    const log = [];
    for (let t = 0; t < ticks; t++) { log.push(p.advance(supported)); }
    return log;
}

test('立った状態から傾き始め、傾くほど加速する（最初はゆっくり）', () => {
    const p = pieceOf(fir());
    const th = [];
    for (let t = 0; t < 40; t++) { p.advance(true); th.push(p.theta); }
    assert.ok(th[0] > 0 && th[0] < 1 * DEG, `最初の tick で ${th[0] / DEG}° 傾いた（急すぎる）`);
    const step = (a, b) => th[b] - th[a];
    assert.ok(step(30, 35) > 3 * step(5, 10), '加速していない');
    for (let t = 1; t < th.length; t++) assert.ok(th[t] >= th[t - 1], '角度が戻った');
});

test('倒れるまでに 0.5〜1 秒（30〜60 tick）かかる。ぱたんと一瞬で倒れない', () => {
    for (const build of [fir, () => buildBareTree(new SeededRNG(5), { maxH: 400 })]) {
        const p = pieceOf(build());
        let t = 0;
        while (!p.lying && t < 400) { p.advance(true); t++; }
        assert.ok(p.lying, '横たわらない');
        assert.ok(t >= 30 && t <= 60, `${t} tick で横たわった`);
    }
});

test('横たわったあと LIE_TICKS 続いて消え、その間に薄れる', () => {
    const p = pieceOf(fir());
    let landed = 0, ticks = 0;
    while (!p.done && ticks < 500) { if (p.advance(true)) landed++; ticks++; }
    assert.equal(landed, 1, '横たわった合図は 1 回だけ');
    assert.ok(p.done);
    const q = pieceOf(fir());
    while (!q.lying) q.advance(true);
    assert.equal(q.alpha, 1);
    run(q, SNOWTREE_TOPPLE_LIE_TICKS / 2);
    assert.ok(q.alpha > 0.4 && q.alpha < 0.6, `半分で alpha ${q.alpha}`);
});

test('軸は根元: 一番下の段のかけらの中心の x と、塊の下端の高さ。倒れる向きに関係なく同じ（箱の角を軸にすると、根元が切り株から持ち上がって箱が転がるように見えた）', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
        for (const build of [() => fir(seed), () => buildBareTree(new SeededRNG(seed), { maxH: 400 })]) {
            const b = build();
            const r = pieceOf(b, 1), l = pieceOf(b, -1);
            assert.equal(r.px, l.px, '向きで軸が変わる');
            assert.equal(r.py, r.height);
            // 一番下の段のかけら（根元）の真ん中あたり。矩形の角（0 や width）ではない
            const bottom = [];
            for (let i = 0; i < r.cw; i++) if (r.cells[(r.ch - 1) * r.cw + i]) bottom.push((i + 0.5) * CHUNK);
            assert.ok(r.px >= Math.min(...bottom) && r.px <= Math.max(...bottom), `軸 ${r.px} が根元の段 ${bottom} の外`);
            assert.ok(r.px > CHUNK && r.px < r.width - CHUNK, `軸 ${r.px} が矩形の端（幅 ${r.width}）`);
        }
    }
});

test('Town が切り離した木の軸は、幹の位置（切り株の真上）。幹の横の枝や針葉樹の段の角が一番下の段にあっても、そこへ外れない', () => {
    let checked = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
        for (const build of [() => fir(seed), () => buildBareTree(new SeededRNG(seed), { maxH: 400 })]) {
            for (const from of ['left', 'right']) {
                const town = makeTown([treeSpec(build())]);
                const tb = town.buildings[0];
                cutTrunk(town, tb, from);
                const p = town.falling.find((q) => q.topple);
                if (!p) continue;
                checked++;
                const trunkX = tb.x + tb.footX;
                assert.ok(Math.abs(p.pivotX - trunkX) <= CHUNK, `seed ${seed} ${from}: 軸 ${p.pivotX} が幹 ${trunkX} から外れている`);
                assert.equal(p.pivotY, p.y + p.height);
            }
        }
    }
    assert.ok(checked >= 12, `${checked} 回しか確かめていない（この検証が意味を失った）`);
});

test('傾いているあいだ、軸（根元）は動かない。横たわると木は水平（軸から長さ方向が水平）', () => {
    for (const lean of [1, -1]) {
        const p = pieceOf(fir(), lean);
        const px = p.pivotX, py = p.pivotY;
        for (let t = 0; t < 45; t++) {
            p.advance(true);
            assert.equal(p.pivotX, px);
            assert.equal(p.pivotY, py);
        }
        assert.ok(p.lying);
        assert.equal(p.theta, Math.PI / 2);
        const tip = p.pointAlong(30);
        assert.ok(Math.abs(tip.y - py) < 1e-9, `横たわった木の先が軸の高さにない（${tip.y - py}）`);
        assert.ok(lean * (tip.x - px) > 29.9, '倒れる向きへ伸びていない');
    }
});

test('軸の下に足場が無ければ、傾きながら落ちる。足場があれば軸は動かない', () => {
    const a = pieceOf(fir());
    const y0 = a.y;
    run(a, 10, true);
    assert.equal(a.y, y0);
    const b = pieceOf(fir());
    run(b, 10, false);
    assert.ok(b.y > y0 + 5, `落ちていない ${b.y - y0}`);
    assert.ok(b.theta > 0, '傾いていない');
    assert.equal(b.lying, false, '落ちているあいだは横たわらない');
    // 倒れきっても、足場が無ければ横たわらない（宙で消えない）
    const c = pieceOf(fir());
    run(c, 120, false);
    assert.equal(c.theta, Math.PI / 2);
    assert.equal(c.lying, false);
});

test('立っているあいだ、木の上は真上。倒れ始めたら倒れる向きへ', () => {
    const b = fir();
    const r = pieceOf(b, 1), l = pieceOf(b, -1);
    assert.deepEqual([Math.round(r.pointAlong(10).x - r.pivotX), Math.round(r.pointAlong(10).y - r.pivotY)], [0, -10]);
    run(r, 25);
    run(l, 25);
    assert.ok(r.pointAlong(10).x > r.pivotX, '右へ倒れていない');
    assert.ok(l.pointAlong(10).x < l.pivotX, '左へ倒れていない');
});

test('描く: 軸を原点に回して貼る。薄れているあいだは globalAlpha が下がる', () => {
    const p = pieceOf(fir());
    run(p, 20);
    const ctx = makeFakeCtx();
    p.draw(ctx);
    const names = ctx.calls.map((c) => c.name);
    assert.deepEqual(names.filter((n) => ['save', 'translate', 'rotate', 'drawImage', 'restore'].includes(n)),
        ['save', 'translate', 'rotate', 'drawImage', 'restore']);
    assert.deepEqual(ctx.calls.find((c) => c.name === 'translate').args, [p.pivotX, p.pivotY]);
    assert.equal(ctx.calls.find((c) => c.name === 'rotate').args[0], p.theta);
    assert.ok(!ctx.calls.some((c) => c.name === 'set:globalAlpha'), '倒れている途中で薄れた');
    while (!p.lying) p.advance(true);
    run(p, 10);
    const c2 = makeFakeCtx();
    p.draw(c2);
    assert.ok(c2.calls.some((c) => c.name === 'set:globalAlpha' && c.args[0] < 1));
});

// --- Town の中（切り離しと更新）---

/** 床の木の幹を切る。from: 'left' なら左から撃つ。radius は幹の2かけらを覆う */
function cutTrunk(town, b, from = 'left') {
    const ch = b.ch;
    const root = [];
    for (let i = 0; i < b.cw; i++) if (b.cells[(ch - 1) * b.cw + i]) root.push(i);
    const hx = from === 'left' ? b.x + root[0] * CHUNK - 2 : b.x + (root[root.length - 1] + 1) * CHUNK + 2;
    town.chip(b, hx, b.y + (ch - 2) * CHUNK + 2, 8);
    return hx;
}

test('幹を切ると、上の塊は倒れる木（ToppleTree）になる。撃たれた側から離れる向きへ', () => {
    for (const [from, lean] of [['left', 1], ['right', -1]]) {
        const town = makeTown([treeSpec(fir())]);
        const b = town.buildings[0];
        cutTrunk(town, b, from);
        // 木の大きな塊が 1 つ倒れる（切れ目の縁の小さな欠片は、ふつうの破片になりうる）
        const toppling = town.falling.filter((p) => p.topple);
        assert.equal(toppling.length, 1, '倒れる木が 1 つでない');
        assert.ok(toppling[0] instanceof ToppleTree);
        assert.ok(toppling[0].count > b.total / 2, '倒れるのが木の大部分でない');
        assert.equal(toppling[0].lean, lean, `${from} から撃って向きが ${toppling[0].lean}`);
        assert.equal(toppling[0].sourceId, b.id);
    }
});

test('切った瞬間に砕けて消えない（以前は落ち始めた最初のコマで床に触れて雪の粒になった）。倒れて、床で横たわって、消える', () => {
    const town = makeTown([treeSpec(fir())]);
    const b = town.buildings[0];
    cutTrunk(town, b);
    const tree = town.falling.find((p) => p.topple);
    town.effects.length = 0;
    const game = fakeGame();
    for (let t = 0; t < 10; t++) town.update(game);
    assert.ok(tree.alive, '10 tick のうちに消えた');
    let t = 10;
    while (tree.alive && t < 400) { town.update(game); t++; }
    assert.equal(tree.alive, false);
    assert.ok(t > 60, `${t} tick で消えた（倒れるのが速すぎる）`);
    assert.equal(town.rubble.length, 0, '瓦礫は残さない');
});

test('横たわったとき、雪の粒が木に沿って数回に分けて出る（1か所で一斉に出さない）', () => {
    const town = makeTown([treeSpec(fir())]);
    const b = town.buildings[0];
    cutTrunk(town, b);
    const tree = town.falling.find((p) => p.topple);
    town.effects.length = 0;
    let seen = null;
    for (let t = 0; t < 200 && tree.alive; t++) {
        const wasLying = tree.lying;
        town._updateFalling();
        if (!wasLying && tree.lying) seen = town.effects.filter((e) => e.type === 'leaf' && e.count === SNOWTREE_TOPPLE_PUFF_PARTICLES);
        town.effects.length = 0;
    }
    assert.ok(seen, '横たわらなかった');
    assert.equal(seen.length, SNOWTREE_TOPPLE_PUFFS);
    for (const e of seen) { assert.equal(e.flora, 'snow'); assert.equal(e.mode, 'puff', '横たわったときの雪は舞い上がる動き'); }
    assert.equal(new Set(seen.map((e) => Math.round(e.x))).size, SNOWTREE_TOPPLE_PUFFS, '同じ x に重なっている');
    // 床の線の近く（木は床に横たわる）
    for (const e of seen) assert.ok(Math.abs(e.y - GROUND_Y) < 40, `y ${e.y} が床から遠い`);
});

test('倒れ始めに雪を振るい落とし、倒れているあいだ木に沿って雪がこぼれる（横たわるまで途切れない）', () => {
    const town = makeTown([treeSpec(fir())]);
    const b = town.buildings[0];
    town.effects.length = 0;
    cutTrunk(town, b);
    // 切った瞬間: 欠けた粒（HIT）と、倒れ始めの雪（START）
    const start = town.effects.filter((e) => e.type === 'leaf' && e.count === SNOWTREE_FLURRY_START);
    assert.equal(start.length, 1, '倒れ始めの雪が出ない');
    assert.equal(start[0].mode, 'shake', '倒れ始めの雪は振るい落とす動き');
    assert.ok(start[0].spread >= 8, '倒れ始めの雪が幅に広がっていない');
    const tree = town.falling.find((p) => p.topple);
    town.effects.length = 0;
    const trickle = [];
    for (let t = 0; t < 200 && !tree.lying; t++) {
        town._updateFalling();
        trickle.push(...town.effects.filter((e) => e.type === 'leaf' && e.count === SNOWTREE_FLURRY_TRICKLE));
        town.effects.length = 0;
    }
    // 倒れるのに約 40 tick。3 tick ごとに 1 回
    assert.ok(trickle.length >= 10 && trickle.length <= 20, `${trickle.length} 回`);
    assert.equal(new Set(trickle.map((e) => `${Math.round(e.x)},${Math.round(e.y)}`)).size > 5, true, '同じ所からばかり出る');
    for (const e of trickle) { assert.equal(e.flora, 'snow'); assert.equal(e.mode, 'shake', '倒れているあいだにこぼれる雪は振るい落とす動き'); }
    // 横たわったあとはこぼれない
    for (let t = 0; t < 10; t++) { town._updateFalling(); assert.equal(town.effects.filter((e) => e.count === SNOWTREE_FLURRY_TRICKLE).length, 0); town.effects.length = 0; }
});

test('舞う雪の数は、1 本が倒れきるまでに約 100 粒（多すぎて重くならない・少なすぎて寂しくない）', () => {
    const town = makeTown([treeSpec(fir())]);
    const b = town.buildings[0];
    cutTrunk(town, b);
    const tree = town.falling.find((p) => p.topple);
    const game = fakeGame();
    let spawned = 0;
    for (let t = 0; t < 300 && tree.alive; t++) {
        const before = game.particles.length;
        town.update(game);
        spawned += game.particles.length - before;
    }
    assert.ok(spawned >= 60 && spawned <= 160, `${spawned} 粒`);
});

test('小さな塊（SNOWTREE_TOPPLE_MIN_CELLS 未満）は倒れず、ふつうの破片として落ちて砕ける', () => {
    const w = 3 * CHUNK, h = 2 * CHUNK;   // 6 かけら
    assert.ok(6 < SNOWTREE_TOPPLE_MIN_CELLS);
    const spec = {
        site: 'floor', style: 'P', soft: true, flora: 'snow', kind: 'fir', x: 100, y: GROUND_Y + 4 - h, w, h,
        parts: [{ x: 0, y: 0, w, h, color: '#fff', mat: MAT_PLANT, solid: true }],
    };
    let rock = true;
    const town = makeTown([spec], (r) => r >= FLOOR_ROW && !(rock === false && r === FLOOR_ROW));
    const b = town.buildings[0];
    rock = false;
    for (const a of new Set(b.anchors.map((q) => `${q.r},${q.c}`))) town.onBlockDestroyed(...a.split(',').map(Number));
    assert.ok(town.falling.length > 0);
    for (const p of town.falling) {
        assert.ok(p instanceof FallingPiece && !(p instanceof ToppleTree), '小さな塊が倒れる木になった');
    }
});

test('4面の植物（flora の無い設計図）は倒れず、今までどおりの破片', () => {
    const f = buildTallFern(new SeededRNG(3), { maxH: 400 });
    let rock = true;
    const town = makeTown([treeSpec(f, 100, null)], (r) => r >= FLOOR_ROW && !(rock === false && r === FLOOR_ROW));
    const b = town.buildings[0];
    rock = false;
    for (const a of new Set(b.anchors.map((q) => `${q.r},${q.c}`))) town.onBlockDestroyed(...a.split(',').map(Number));
    assert.ok(town.falling.length > 0);
    for (const p of town.falling) assert.ok(!(p instanceof ToppleTree));
});

test('倒れて横にはみ出した木は、軸から遠い画面でも描かれる（画面外の判定が回した先まで届く）', () => {
    const town = makeTown([treeSpec(fir())]);
    const b = town.buildings[0];
    cutTrunk(town, b);
    const p = town.falling.find((q) => q.topple);
    for (let t = 0; t < 200 && !p.lying; t++) town.update(fakeGame());
    assert.ok(p.lying);
    // 横たわった木の先端のあたりだけを映す画面
    const tip = p.pointAlong(p.height - 4);
    const ctx = makeFakeCtx();
    town.draw(ctx, { x: tip.x - 8, y: tip.y - 8, w: 16, h: 16 });
    assert.ok(ctx.calls.some((c) => c.name === 'drawImage' && c.args[0] === p.canvas), '先端が映る画面で描かれなかった');
});

test('支えの岩が壊れて木が浮いたら、傾きながら落ち、岩に着いたら横たわる', () => {
    let rock = true;
    const town = makeTown([treeSpec(buildBareTree(new SeededRNG(8), { maxH: 400 }))], (r) => r >= FLOOR_ROW + 3 || (r >= FLOOR_ROW && rock));
    const b = town.buildings[0];
    rock = false;   // 床の 3 行ぶんが無くなる
    for (const a of new Set(b.anchors.map((q) => `${q.r},${q.c}`))) town.onBlockDestroyed(...a.split(',').map(Number));
    assert.equal(town.falling.length, 1);
    const p = town.falling[0];
    assert.ok(p instanceof ToppleTree);
    const y0 = p.y;
    for (let t = 0; t < 60 && !p.lying; t++) town.update(fakeGame());
    assert.ok(p.y > y0 + 20, `落ちていない ${p.y - y0}`);
    // 軸は新しい床（行 23）の上に乗っている
    assert.ok(p.pivotY <= (FLOOR_ROW + 3) * 16 + 1e-6 && p.pivotY > (FLOOR_ROW + 3) * 16 - 4, `軸の高さ ${p.pivotY}`);
});

test('倒れる木が上限（TOWN_FALLING_MAX）で追い出されたら、雪の粒を出して消える', () => {
    const town = makeTown([treeSpec(fir())]);
    const b = town.buildings[0];
    cutTrunk(town, b);
    const p = town.falling.find((q) => q.topple);
    for (let i = 0; i < 30; i++) town.falling.push(new FallingPiece({ canvas: fakeCanvas(8, 8), cells: [MAT_PLANT | SOLID], cw: 1, ch: 1, x: 0, y: 0, sourceId: b.id }));
    town.effects.length = 0;
    town._trimFalling();
    assert.equal(p.alive, false);
    assert.ok(town.effects.some((e) => e.type === 'leaf' && e.flora === 'snow'));
    assert.equal(PLANT_LEAF_PARTICLES_HIT > 0, true);
});

test('書き出しの道具（PixelCanvas）は、translate のあとの rotate を drawImage に効かせる（倒れる様子の連続写真に使う）', async () => {
    const { PixelCanvas } = await import('../tools/lib/pixel-canvas.mjs');
    // 4x2 の絵（左の列だけ赤）を、軸（絵の下端の右の角）を中心に時計回りに 90° 回す。絵の左上が右上へ回り、
    // 絵の左の列（赤）は軸の真上の列になる
    const img = new PixelCanvas(4, 2);
    img.getContext().fillStyle = '#ff0000';
    img.getContext().fillRect(0, 0, 1, 2);
    img.getContext().fillStyle = '#0000ff';
    img.getContext().fillRect(1, 0, 3, 2);
    const screen = new PixelCanvas(20, 20);
    const ctx = screen.getContext();
    ctx.save();
    ctx.translate(10, 10);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -4, -2);
    ctx.restore();
    const at = (x, y) => Array.from(screen.px.slice((y * 20 + x) * 4, (y * 20 + x) * 4 + 4)).map(Math.round);
    // 回す前の絵は軸の左（x -4..0）・上（y -2..0）。90° 時計回りで、軸の上（y 10-4..10）・右（x 10..12）へ
    assert.deepEqual(at(11, 6), [255, 0, 0, 1], '左の列（赤）は一番上に来る');
    assert.deepEqual(at(11, 9), [0, 0, 255, 1], '右の列（青）は軸のそばに来る');
    assert.deepEqual(at(5, 8), [0, 0, 0, 0], '回す前の位置には残らない');
    // 回さないとき（rot = 0）は今までどおり、そのまま貼る
    const flat = new PixelCanvas(20, 20);
    flat.getContext().drawImage(img, 3, 3);
    assert.deepEqual(Array.from(flat.px.slice((3 * 20 + 3) * 4, (3 * 20 + 3) * 4 + 4)).map(Math.round), [255, 0, 0, 1]);
});

test('根元が床の上なら、枝が床の縁の外へ張り出していても、軸は足場の上（縁の外の穴へ落ちない）', () => {
    // 床（行 20 以下が岩）は列 C0 まで。木の根元は列 C0 の中で、右半分の枝は縁の外（穴の上）に張り出す。右へ倒れる
    const C0 = 12;
    const b = fir();
    const spec = { ...treeSpec(b), x: (C0 + 1) * 16 - 8 - b.footX };
    const edge = (r, c) => r >= FLOOR_ROW && (c <= C0 || r >= 40);   // 縁の外は 20 行ぶん深い穴
    const town = makeTown([spec], edge);
    const tb = town.buildings[0];
    cutTrunk(town, tb, 'left');
    const p = town.falling.find((q) => q.topple);
    assert.equal(p.lean, 1);
    assert.ok(p.pivotX < (C0 + 1) * 16 && p.pivotX + p.width / 2 > (C0 + 1) * 16, 'この検証が意味を失った（枝が縁の外へ出ていない）');
    const y0 = p.y;
    for (let t = 0; t < 200 && p.alive; t++) town.update(fakeGame());
    assert.equal(p.y, y0, `軸が ${p.y - y0}px 落ちた（穴へ落ちた）`);
    assert.ok(p.lying || !p.alive, '横たわらない');
});

test('高い所で切れた木は、切り株の上に乗って傾く（落ち続けない）。切り株が無くなると落ちる', () => {
    // 幹の長い枯れ木の、根元から 4 段（16px）上の 1 段を横一列に切る。下に切り株（3 段）が残り、
    // 切れ目の上の塊は 4px 落ちて切り株の上に乗る
    const b0 = buildBareTree(new SeededRNG(1), { maxH: 400 });
    const town = makeTown([treeSpec(b0)]);
    const tb = town.buildings[0];
    const row = tb.ch - 4;
    const cut = [];
    for (let i = 0; i < tb.cw; i++) if (tb.cells[row * tb.cw + i]) cut.push(row * tb.cw + i);
    town.removeAndSettle(tb, cut);
    const p = town.falling.find((q) => q.topple);
    assert.ok(p && p.count > tb.total / 2, '木の大部分が倒れる木になっていない（この検証が意味を失った）');
    const stumpTop = tb.y + (tb.ch - 3) * CHUNK;
    for (let t = 0; t < 20; t++) town._updateTopple(p);
    assert.ok(p.pivotY >= stumpTop - 1 && p.pivotY <= stumpTop + 4, `軸 ${p.pivotY} が切り株の上端 ${stumpTop} にない`);
    const y1 = p.y;
    for (let t = 0; t < 20; t++) town._updateTopple(p);
    assert.equal(p.y, y1, `切り株の上なのに ${p.y - y1}px 落ちた`);
    assert.ok(p.theta > 0.3, '傾いていない');
    // 切り株のかけらを全部壊すと、軸の下が空いて落ちる
    const left = [];
    for (let k = 0; k < tb.cells.length; k++) if (tb.cells[k]) left.push(k);
    town.removeAndSettle(tb, left);
    for (let t = 0; t < 10; t++) town._updateTopple(p);
    assert.ok(p.y > y1 + 3, '切り株が無くなっても落ちない');
});

test('落ちる軸は、下の建物のかけら（隣の木・切り株）の上に乗って止まる。すり抜けない', () => {
    // 町の建物は欠けて 4 割を割ると崩れる（支えの無い塊は全部落ちる）ので、岩に根元を埋めて立つ soft の建物を使う。
    // 高さ 68px の塊が、行 4（y 64 から）の岩に立つ。軸はその上（y 0 より上）から落ちてくる
    const town = makeTown([{ ...block(0, 0, 32, 68), soft: true }], (r) => r >= 4);
    const target = town.buildings[0];
    assert.ok(target.anchors.length > 0, '塊が岩に支えられていない（この検証が意味を失った）');
    const b = fir();
    const p = new ToppleTree({
        canvas: fakeCanvas(b.w, b.h), cells: rasterizeParts(b.parts, b.w, b.h).cells, cw: b.w / CHUNK, ch: b.h / CHUNK,
        x: 0, y: 0, lean: 1,
    });
    p.x = 16 - p.px;   // 軸（根元）が (16, -40)。そこから target（x 0〜32、y 0〜68）の上へ落ちる
    p.y = -40 - p.py;
    town.falling.push(p);
    const before = target.remaining;
    for (let t = 0; t < 60; t++) town._updateTopple(p);
    assert.ok(p.pivotY >= -1 && p.pivotY <= 8, `軸 ${p.pivotY} が塊の上端（0）に乗っていない`);
    assert.equal(target.remaining, before, '乗っただけで欠けた');
    assert.ok(p.lying, '横たわらない');
});

test('横たわって薄れていくあいだも、LIE_EVERY tick ごとに倒れた木から雪が舞い上がる。消えたあとは出ない', () => {
    const town = makeTown([treeSpec(fir())]);
    const b = town.buildings[0];
    cutTrunk(town, b);
    const tree = town.falling.find((p) => p.topple);
    let t = 0;
    while (!tree.lying && t++ < 200) town._updateFalling();
    assert.ok(tree.lying);
    town.effects.length = 0;
    const ticks = [];
    for (let k = 1; tree.alive && k < 200; k++) {
        town._updateFalling();
        for (const e of town.effects) if (e.count === SNOWTREE_FLURRY_LIE_PARTICLES) { ticks.push(k); assert.equal(e.mode, 'puff'); assert.equal(e.flora, 'snow'); }
        town.effects.length = 0;
    }
    assert.equal(tree.alive, false);
    assert.deepEqual(ticks, [1, 2, 3, 4, 5].map((n) => n * SNOWTREE_FLURRY_LIE_EVERY), `間隔 ${ticks}`);
    for (let k = 0; k < 20; k++) { town._updateFalling(); assert.equal(town.effects.length, 0, '消えたあとに雪の注文が出た'); }
});
