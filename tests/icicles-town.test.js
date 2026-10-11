import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { Town } from '../src/js/world/town/Town.js';
import { IcicleFall } from '../src/js/world/town/IcicleFall.js';
import { buildIcicle } from '../src/js/world/town/icicles.js';
import { MAT_ICE, SOLID, CHUNK } from '../src/js/world/town/chunks.js';
import { ICE_PARTICLE_COLORS, SNOWTREE_FLURRY_COLORS } from '../src/js/world/town/palette.js';
import { SnowFlurryParticle } from '../src/js/entities/Particle.js';
import { fakeCanvas } from './helpers/town-fixtures.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import {
    ICICLE_SHAKE_TICKS, ICICLE_SHAKE_AMPLITUDE, ICICLE_KNOCK_VY, ICICLE_DRIP_EVERY, ICICLE_SHARDS,
    TOWN_FALLING_MAX, ICICLE_DAMAGE, ICICLE_TRAIL_EVERY, ICICLE_TRAIL_COUNT, ICICLE_POWDER, ICICLE_SINK_SPEED, ICICLE_POWDER_SIZE,
} from '../src/js/utils/Constants.js';

// 行 0〜9 が天井の岩、行 20 から下が床。つららは天井の下端（y 160）に上の 4px を埋めて吊るす
const CEIL_BOTTOM = 10 * 16;
const FLOOR_Y = 20 * 16;
const isSolidTile = (r) => r <= 9 || r >= 20;

function icicleSpec(seed = 3, x = 200, maxLength = 400) {
    const b = buildIcicle(new SeededRNG(seed), { maxLength });
    return {
        site: 'ceiling', style: 'P', soft: true, brittle: true, flora: 'ice', kind: b.kind,
        footX: b.footX, damage: b.damage, length: b.length,
        x: x - b.footX, y: CEIL_BOTTOM - CHUNK, w: b.w, h: b.h, parts: b.parts,
    };
}
const fakeGame = (extra = {}) => ({ particles: [], projectiles: [], enemies: [], camera: null, canvas: null, ...extra });
const makeTown = (specs = [icicleSpec()], solid = isSolidTile) => new Town(specs, { createCanvas: fakeCanvas, isSolidTile: solid });
const entity = (x, y, extra = {}) => ({ x, y, width: 10, height: 10, alive: true, hp: 100, vx: 1.5, vy: 0, takeDamage(n) { this.hp -= n; }, ...extra });
// 見える長さ（上の 4px は天井に埋まる）。Town の建物は length を持たないので、高さから出す
const lenOf = (b) => b.height - CHUNK;
const tipOf = (b) => ({ x: b.x + b.footX, y: b.y + b.height - 2 });
const run = (town, game, ticks) => { for (let t = 0; t < ticks; t++) town.update(game); };

test('設計図の印が建物に載る（brittle・damage・flora ice）。ふつうの建物は brittle でない', () => {
    const town = makeTown();
    const b = town.buildings[0];
    assert.equal(b.brittle, true);
    assert.equal(b.damage, icicleSpec().damage);
    assert.equal(b.flora, 'ice');
    assert.equal(b.shakeLeft, 0);
    const plain = makeTown([{ ...icicleSpec(), brittle: undefined, damage: undefined }]);
    assert.equal(plain.buildings[0].brittle, false);
    assert.equal(plain.buildings[0].damage, 0);
});

test('当たっても欠けない: かけらは減らず、震え始める（ICICLE_SHAKE_TICKS）。最初の当たりだけ氷の粒の注文が出る', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const total = b.remaining;
    const tip = tipOf(b);
    assert.equal(town.chip(b, tip.x, tip.y, 6), 1);
    assert.equal(b.remaining, total, 'かけらが欠けた');
    assert.equal(b.shakeLeft, ICICLE_SHAKE_TICKS);
    assert.equal(town.shaking.length, 1);
    const hits = town.effects.filter((e) => e.flora === 'ice' && e.mode === 'hit');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].count, ICICLE_SHARDS.hit);
    assert.equal(town.falling.length, 0, '震えている間は落ちない');
});

test('震えの間の追加の当たりは、時間を延ばさず、粒も出さない（1 本につき 1 回だけ震える）', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const tip = tipOf(b);
    town.chip(b, tip.x, tip.y, 6);
    town.effects.length = 0;
    const game = fakeGame();
    run(town, game, 10);
    const left = b.shakeLeft;
    assert.equal(town.chip(b, tip.x, tip.y, 6), 0);
    assert.equal(b.shakeLeft, left);
    assert.equal(town.shaking.length, 1);
    assert.equal(town.effects.filter((e) => e.mode === 'hit').length, 0);
});

test('ICICLE_SHAKE_TICKS tick 後に、全体が 1 つの IcicleFall になって落ちる。建物は空になる。ダメージは建物の damage', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const total = b.remaining;
    town.chip(b, tipOf(b).x, tipOf(b).y, 6);
    const game = fakeGame();
    run(town, game, ICICLE_SHAKE_TICKS - 1);
    assert.equal(town.falling.length, 0, '震えの途中で落ちた');
    run(town, game, 1);
    assert.equal(town.falling.length, 1);
    const p = town.falling[0];
    assert.ok(p instanceof IcicleFall);
    assert.equal(p.damage, b.damage);
    assert.equal(p.count, total, '全部のかけらが 1 つの塊になる');
    assert.equal(b.remaining, 0);
    assert.equal(town.shaking.length, 0);
    assert.equal(p.sourceId, b.id);
});

test('支えの岩が壊れたら、震えずにすぐ落ちる', () => {
    let ceiling = true;
    const town = makeTown([icicleSpec()], (r) => (ceiling ? r <= 9 : r <= 8) || r >= 20);
    const b = town.buildings[0];
    ceiling = false;   // 行 9（つららの根元を埋めていた岩）が壊れた
    for (const a of new Set(b.anchors.map((q) => `${q.r},${q.c}`))) town.onBlockDestroyed(...a.split(',').map(Number));
    assert.equal(town.falling.length, 1);
    assert.ok(town.falling[0] instanceof IcicleFall);
    assert.equal(b.shakeLeft, 0);
});

test('震えている最中に支えの岩が壊れて落ちたら、時間切れで二重に落とさない・例外を出さない', () => {
    let ceiling = true;
    const town = makeTown([icicleSpec()], (r) => (ceiling ? r <= 9 : r <= 8) || r >= 20);
    const b = town.buildings[0];
    town.chip(b, tipOf(b).x, tipOf(b).y, 6);
    ceiling = false;
    for (const a of new Set(b.anchors.map((q) => `${q.r},${q.c}`))) town.onBlockDestroyed(...a.split(',').map(Number));
    assert.equal(town.falling.length, 1);
    let releases = 0;
    const detach = town._detach.bind(town);
    town._detach = (...a) => { releases++; return detach(...a); };
    town.effects.length = 0;
    let drips = 0;
    // _updateShaking を直接回す（update は毎 tick 注文を流して空にするので、注文が出たかを見られない）
    for (let t = 0; t < ICICLE_SHAKE_TICKS + 5; t++) {
        town._updateShaking();
        drips += town.effects.filter((e) => e.mode === 'drip').length;
        town.effects.length = 0;
    }
    assert.equal(releases, 0, '震えの時間切れで、空の建物からもう一度落とそうとした');
    assert.equal(town.shaking.length, 0);
    assert.equal(b.shakeLeft, 0);
    assert.equal(drips, 0, 'もう吊るされていない（落ちた）つららの先から水滴が落ちた');
});

test('爆風が範囲内の複数のつららを同時に震わせる。どれも 1 回だけ震え、全部が落ちる', () => {
    const specs = [icicleSpec(3, 200), icicleSpec(4, 216), icicleSpec(5, 232)];
    const town = makeTown(specs);
    const total = town.buildings.length;
    town.blast(216, CEIL_BOTTOM + 20, 150);
    assert.equal(town.shaking.length, total, `${town.shaking.length} / ${total} 本しか震えない`);
    for (const b of town.buildings) assert.equal(b.shakeLeft, ICICLE_SHAKE_TICKS);
    run(town, fakeGame(), ICICLE_SHAKE_TICKS);
    assert.equal(town.falling.filter((p) => p instanceof IcicleFall).length, total);
});

test('震えている間は、先から水滴の粒を ICICLE_DRIP_EVERY tick おきに 1 つ落とす（予兆）', () => {
    const town = makeTown();
    const b = town.buildings[0];
    town.chip(b, tipOf(b).x, tipOf(b).y, 6);
    town.effects.length = 0;
    let drips = 0;
    for (let t = 0; t < ICICLE_SHAKE_TICKS; t++) {
        town._updateShaking();
        drips += town.effects.filter((e) => e.mode === 'drip').length;
        town.effects.length = 0;
    }
    assert.equal(drips, Math.floor((ICICLE_SHAKE_TICKS - 1) / ICICLE_DRIP_EVERY));
});

test('描画: 震えている間だけ、±ICICLE_SHAKE_AMPLITUDE px 横に揺らす。当たり（建物の位置）は動かさない', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const view = { x: 0, y: 0, w: 1000, h: 400 };
    const drawX = () => {
        const ctx = makeFakeCtx();
        town.draw(ctx, view);
        return ctx.calls.find((c) => c.name === 'drawImage' && c.args[0] === b.canvas).args[1];
    };
    assert.equal(drawX(), b.x, '震えていないのに揺れた');
    town.chip(b, tipOf(b).x, tipOf(b).y, 6);
    const xs = new Set();
    for (let t = 0; t < 6; t++) { xs.add(drawX() - b.x); town._updateShaking(); }
    assert.deepEqual([...xs].sort(), [-ICICLE_SHAKE_AMPLITUDE, ICICLE_SHAKE_AMPLITUDE]);
    assert.equal(b.x, icicleSpec().x, '揺れで当たりの位置が動いた');
});

// --- 落下とダメージ ---

/** 震え始めてから、塊になって落ち始める直前まで進める。塊を返す */
function released(town, game, b) {
    town.chip(b, tipOf(b).x, tipOf(b).y, 6);
    run(town, game, ICICLE_SHAKE_TICKS);
    return town.falling.find((p) => p instanceof IcicleFall);
}

test('落ちたつららが機体に掛かると、その機体にだけダメージ（長さに比例）。自機・母艦・敵のすべてが対象', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const under = (extra) => entity(b.x + b.footX - 5, CEIL_BOTTOM + lenOf(b) + 20, extra);   // 先の落ちる先（少し下）の機体
    const player = under(), carrier = under(), enemy = under(), far = entity(b.x + 400, 300);
    const game = fakeGame({ player, carrier, enemies: [enemy, far] });
    const p = released(town, game, b);
    assert.ok(p);
    const dmg = p.damage;
    assert.ok(dmg >= ICICLE_DAMAGE[0] && dmg <= ICICLE_DAMAGE[1]);
    for (let t = 0; t < 120 && p.alive; t++) town.update(game);
    for (const [name, e] of [['自機', player], ['母艦', carrier], ['敵', enemy]]) assert.equal(e.hp, 100 - dmg, `${name}`);
    assert.equal(far.hp, 100, '離れた機体に当たった');
});

test('1 本につき 1 機体 1 回だけ。落ちている間ずっと当て続けない。当たった機体は下へ押され、vx は変わらない', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const e = entity(b.x + b.footX - 5, CEIL_BOTTOM + lenOf(b) + 20);
    const game = fakeGame({ enemies: [e] });
    const p = released(town, game, b);
    let calls = 0;
    const orig = e.takeDamage;
    e.takeDamage = function (n) { calls++; return orig.call(this, n); };
    for (let t = 0; t < 120 && p.alive; t++) town.update(game);
    assert.equal(calls, 1);
    assert.ok(e.vy >= ICICLE_KNOCK_VY);
    assert.equal(e.vx, 1.5);
    assert.ok(e.lastHitX !== undefined);
});

test('震えが終わる tick にすでに先と重なっている機体には、その tick で 1 回だけ当たる（落ち始めて 0.25px 動いた直後に判定する）', () => {
    const town = makeTown();
    const b = town.buildings[0];
    // 先の行（一番下のかけら）に重なる位置に居座る機体
    const e = entity(b.x + b.footX - 5, CEIL_BOTTOM + lenOf(b) - 4);
    const game = fakeGame({ enemies: [e] });
    const p = released(town, game, b);
    assert.ok(p);
    assert.ok(e.hp < 100, '震えが終わった tick で当たらなかった');
    const once = e.hp;
    assert.equal(once, 100 - p.damage);
    run(town, game, 30);
    assert.equal(e.hp, once, '2 回目が当たった');
});

test('死んでいる敵・ドッキング中の自機には当たらない', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const at = () => ({ x: b.x + b.footX - 5, y: CEIL_BOTTOM + lenOf(b) + 20 });
    const dead = entity(at().x, at().y, { alive: false });
    const docked = entity(at().x, at().y, { docked: true });
    const game = fakeGame({ player: docked, enemies: [dead] });
    released(town, game, b);
    run(town, game, 120);
    assert.equal(dead.hp, 100);
    assert.equal(docked.hp, 100);
});

test('画面外の機体にも当たる（カメラが無い・遠くを向いていても、シミュレーションは進む）', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const e = entity(b.x + b.footX - 5, CEIL_BOTTOM + lenOf(b) + 20);
    const game = fakeGame({ enemies: [e], camera: { x: 9000, y: 0 }, canvas: { width: 800, height: 600 } });
    released(town, game, b);
    run(town, game, 120);
    assert.ok(e.hp < 100);
});

test('game を渡さない更新（道具・テスト）でも例外を出さず、機体には当てない', () => {
    const town = makeTown();
    const b = town.buildings[0];
    town.chip(b, tipOf(b).x, tipOf(b).y, 6);
    for (let t = 0; t < ICICLE_SHAKE_TICKS; t++) town._updateShaking();
    assert.equal(town.falling.length, 1);
    for (let t = 0; t < 200; t++) town._updateFalling();
    assert.equal(town.falling.length, 0);
});

// --- 着地 ---

/** 落ちて先が床に触れるまで進める（その tick の effects を溜めて返す）。touch した tick の p を返す */
function untilTouch(town, game, p) {
    const seen = [];
    for (let t = 0; t < 200 && !p.sinking && p.alive; t++) {
        town._updateFalling(game);
        seen.push(...town.effects);
        town.effects.length = 0;
    }
    return seen;
}

test('落ちている間、粉雪が舞う（先から ICICLE_TRAIL_EVERY tick ごとに ICICLE_TRAIL_COUNT 粒。つららの体に沿って）', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const game = fakeGame();
    const p = released(town, game, b);
    town.effects.length = 0;
    const seen = untilTouch(town, game, p);
    const dust = seen.filter((e) => e.flora === 'ice' && e.mode === 'dust');
    assert.ok(p.age >= 20, `落ちた時間が短すぎる（${p.age} tick。この検証が意味を失った）`);
    assert.equal(dust.length, Math.floor(p.age / ICICLE_TRAIL_EVERY), `${dust.length} 回`);
    for (const e of dust) {
        assert.equal(e.count, ICICLE_TRAIL_COUNT);
        assert.ok(e.spread > 0);
    }
    // 位置はつららの体の高さの中に散らばる（同じ所ばかりに出ない）
    assert.ok(new Set(dust.map((e) => Math.round(e.y))).size > dust.length / 2, '同じ高さにばかり出る');
});

test('先が床に触れたら消えずに、先からめり込んでいく（ICICLE_SINK_SPEED）。めり込み始めは大きめの粉雪が出る', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const game = fakeGame();
    const p = released(town, game, b);
    town.effects.length = 0;
    const seen = untilTouch(town, game, p);
    assert.equal(p.sinking, true);
    assert.equal(p.alive, true, '触れた瞬間に消えた');
    assert.equal(p.groundY, FLOOR_Y, '地面の線が、触れた床のタイルの上端でない');
    assert.equal(p.vy, 0);
    const burst = seen.filter((e) => e.mode === 'powder');
    assert.equal(burst.length, 1);
    assert.equal(burst[0].count, ICICLE_POWDER.land);
    assert.ok(Math.abs(burst[0].y - FLOOR_Y) < 1e-9, '粉雪が地面の線から出ていない');
    assert.equal(seen.filter((e) => e.mode === 'land').length, 0, '硬い氷の欠片（land）を出した');
    // めり込む: 毎 tick 一定の速さで下がる。重力では落ちない
    const ys = [];
    for (let t = 0; t < 5; t++) { ys.push(p.y); town._updateFalling(game); }
    for (let i = 1; i < ys.length; i++) assert.ok(Math.abs(ys[i] - ys[i - 1] - ICICLE_SINK_SPEED) < 1e-9, `${i} tick 目に ${ys[i] - ys[i - 1]}px`);
    assert.equal(p.vy, 0);
});

test('めり込み切る（つらら全体が地面の線より下）まで消えない。そのあいだ毎 tick 粉雪が出て、最後にもう一度出して消える', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const game = fakeGame();
    const p = released(town, game, b);
    untilTouch(town, game, p);
    town.effects.length = 0;
    let sinkTicks = 0, sinkPowder = 0, endPowder = 0;
    while (p.alive && sinkTicks < 400) {
        const before = p.y;
        town._updateFalling(game);
        sinkTicks++;
        for (const e of town.effects.filter((q) => q.mode === 'powder')) {
            if (p.alive) { assert.equal(e.count, ICICLE_POWDER.sink); sinkPowder++; } else { assert.equal(e.count, ICICLE_POWDER.end); endPowder++; }
            assert.ok(Math.abs(e.y - FLOOR_Y) < 1e-9);
        }
        town.effects.length = 0;
        assert.ok(p.y > before);
    }
    assert.equal(p.alive, false);
    assert.ok(p.y >= p.groundY, '地面の線に頭が出たまま消えた');
    assert.ok(p.y - ICICLE_SINK_SPEED < p.groundY, '頭が地面の線の下に潜りきってから、さらに潜り続けた');
    assert.equal(endPowder, 1);
    assert.ok(sinkPowder >= (p.height - 16) / ICICLE_SINK_SPEED - 2, `粉雪が ${sinkPowder} 回しか出ない`);
    assert.equal(town.rubble.length, 0);
});

test('めり込んでいる間は、地面の線より下を描かない（薄い足場の下から先がはみ出さない）。頭が潜りきれば何も描かない', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const game = fakeGame();
    const p = released(town, game, b);
    untilTouch(town, game, p);
    for (let t = 0; t < 12; t++) town._updateFalling(game);
    const view = { x: 0, y: 0, w: 1000, h: 400 };
    const ctx = makeFakeCtx();
    town.draw(ctx, view);
    const call = ctx.calls.find((c) => c.name === 'drawImage' && c.args[0] === p.canvas);
    assert.ok(call, 'めり込み中のつららを描いていない');
    // drawImage(canvas, sx, sy, sw, sh, dx, dy, dw, dh): 描く下端が地面の線を超えない
    const [, sx, sy, sw, sh, dx, dy, dw, dh] = call.args;
    assert.equal(call.args.length, 9);
    assert.equal(sh, dh);
    assert.ok(dy + dh <= p.groundY + 1e-9, `地面の線 ${p.groundY} より下 ${dy + dh} まで描いた`);
    assert.ok(dh > 0 && dh < p.height, `見える高さ ${dh}`);
    assert.equal(sy, 0);
    assert.equal(dx, p.x);
    assert.equal(dy, p.y);
    // 落ちている間（まだ触れていない）は、全体を描く
    const town2 = makeTown();
    const p2 = released(town2, fakeGame(), town2.buildings[0]);
    const ctx2 = makeFakeCtx();
    town2.draw(ctx2, view);
    assert.equal(ctx2.calls.some((c) => c.name === 'drawImage' && c.args[0] === p2.canvas), true);
});

test('めり込み中はもう機体に当てない（すでに当てた機体にも、床の上に立つ機体にも）', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const game = fakeGame();
    const p = released(town, game, b);
    untilTouch(town, game, p);
    // 地面の線のすぐ上に立つ機体（めり込み中のつららと重なる）
    const e = entity(b.x + b.footX - 5, FLOOR_Y - 12);
    game.enemies.push(e);
    for (let t = 0; t < 60 && p.alive; t++) town._updateFalling(game);
    assert.equal(e.hp, 100, 'めり込み中のつららが機体に当たった');
});

test('触れたかは先の位置（外接矩形の下の角ではなく、先のかけらの真ん中）で見る。足場の縁が外接矩形の角だけに掛かっても、落ち続ける', () => {
    // 幅 24px（6 かけら）・先は左端のかけら（x 102）の塊。床は x 112 以降（列 7〜）だけ。
    // 外接矩形の右下の角（x 122）は床の上でも、先（x 102）は空中
    const cells = new Uint8Array(6 * 3);
    for (let i = 0; i < 6; i++) cells[i] = MAT_ICE | SOLID;   // 上の段は全部
    cells[6] = MAT_ICE | SOLID; cells[12] = MAT_ICE | SOLID;   // 先は左端の列だけ
    const town = makeTown([], (r, c) => r >= 20 && c >= 7);
    const p = new IcicleFall({ canvas: fakeCanvas(24, 12), cells, cw: 6, ch: 3, x: 100, y: FLOOR_Y - 60, damage: 20 });
    assert.ok(Math.abs(p.tipX - 102) < 1e-9, `先の x ${p.tipX}`);
    town.falling.push(p);
    for (let t = 0; t < 60 && p.y + p.height < FLOOR_Y + 8; t++) town._updateFalling(fakeGame());
    assert.equal(p.sinking, false, '先が空中なのに触れた扱いになった');
    assert.ok(p.y + p.height >= FLOOR_Y + 8, '落ち続けていない');
});

test('落ちた先の建物を 1 棟 1 回だけ欠かす（下の雪の木・植物など、brittle でない建物）', () => {
    const target = { site: 'floor', style: 'P', soft: true, kind: 'moss', x: 190, y: FLOOR_Y - 40, w: 24, h: 44,
        parts: [{ x: 0, y: 0, w: 24, h: 44, color: '#fff', mat: MAT_ICE, solid: true }] };
    const town = makeTown([icicleSpec(), target]);
    const b = town.buildings[0], t = town.buildings[1];
    const before = t.remaining;
    const game = fakeGame();
    const p = released(town, game, b);
    for (let i = 0; i < 200 && p.alive; i++) town.update(game);
    assert.ok(t.remaining < before, '下の建物が欠けなかった');
    // 半径 TOWN_FALL_CHIP_RADIUS（6px）＋ぎざぎざ（3px）の円は、4px のかけらで最大 16 個ほど。1 回しか欠かさないので、それを大きく超えない
    assert.ok(t.remaining >= before - 30, `${before - t.remaining} かけらも欠けた（1 回より多く欠かした）`);
});

test('落ちる破片の上限（TOWN_FALLING_MAX）で追い出されたつららは、氷の粒を出して消える', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const p = released(town, fakeGame(), b);
    assert.ok(p);
    const filler = () => new IcicleFall({ canvas: fakeCanvas(4, 4), cells: new Uint8Array([MAT_ICE | SOLID]), cw: 1, ch: 1, x: 0, y: 0, damage: 1 });
    for (let i = 0; i < TOWN_FALLING_MAX + 2; i++) town.falling.push(filler());
    town.effects.length = 0;
    town._trimFalling();
    assert.equal(p.alive, false);
    assert.ok(town.effects.some((e) => e.flora === 'ice'));
    assert.equal(town.falling.length, TOWN_FALLING_MAX);
});

// --- 見た目の粒（_flushEffects）---

test('氷の粒の注文は、氷の色の粒になる（hit: 少なく控えめ、land: 多く上へ散る、drip: 1 粒がほぼ真下へ）', () => {
    const town = makeTown();
    const game = fakeGame();
    const spawn = (mode, count) => {
        game.particles.length = 0;
        town._spawnIceShards(game, { x: 100, y: 100, count, flora: 'ice', mode, spread: 3 });
        return game.particles.slice();
    };
    for (const [mode, count] of [['hit', 80], ['land', 80]]) {
        const ps = spawn(mode, count);
        assert.equal(ps.length, count);
        for (const p of ps) assert.ok(ICE_PARTICLE_COLORS.includes(p.color), `${mode}: ${p.color}`);
    }
    const mean = (ps) => ps.reduce((s, p) => s + Math.hypot(p.vx, p.vy), 0) / ps.length;
    assert.ok(mean(spawn('hit', 200)) < mean(spawn('land', 200)), 'hit が land より勢いがある');
    for (const p of spawn('land', 200)) assert.ok(p.vy <= 1e-9, '着地の粒が下へ飛んだ');
    for (const mode of ['hit', 'land', 'drip']) {
        for (const p of spawn(mode, 200)) assert.ok(p.y <= 100 + 1e-9, `${mode}: 粒が出る点（床の線）より下 ${p.y} で生まれた（岩の中で生まれて消える）`);
    }
    const drip = spawn('drip', 1);
    assert.equal(drip.length, 1);
    assert.equal(drip[0].vx, 0);
    assert.ok(drip[0].vy > 0 && drip[0].vy <= 0.5);
});

test('シミュレーション（当たる・震える・落ちる・当てる）は Math.random を使わない。使ってよいのは見た目の粒を作る _flushEffects だけ', () => {
    const real = Math.random;
    Math.random = () => { throw new Error('シミュレーションで Math.random は使わない'); };
    try {
        const town = makeTown();
        const b = town.buildings[0];
        const e = entity(b.x + b.footX - 5, CEIL_BOTTOM + lenOf(b) + 20);
        const game = fakeGame({ enemies: [e] });
        town.chip(b, tipOf(b).x, tipOf(b).y, 6);
        for (let t = 0; t < ICICLE_SHAKE_TICKS + 120; t++) { town._updateShaking(); town._updateFalling(game); }
        assert.ok(e.hp < 100, '当たっていない（この検証が意味を失った）');
        assert.ok(town.effects.length > 0);
    } finally { Math.random = real; }
});

test('氷の注文は _flushEffects を通して氷の粒になる（雪の木の粒・葉の粒には回らない）', () => {
    const town = makeTown();
    const game = fakeGame();
    town.effects.push({ type: 'leaf', x: 100, y: 100, count: 5, flora: 'ice', mode: 'hit', spread: 3 });
    town._flushEffects(game);
    assert.equal(game.particles.length, 5);
    for (const p of game.particles) assert.ok(ICE_PARTICLE_COLORS.includes(p.color), p.color);
    assert.equal(town.effects.length, 0);
});

test('粉雪（powder: 大きめ・上へ舞い上がる、dust: 小さく・ほとんど動かず落ちるつららの跡に残る）は、舞う雪の粒（SnowFlurryParticle）で、雪の色', () => {
    const town = makeTown();
    const game = fakeGame();
    const spawn = (mode, count = 400) => {
        game.particles.length = 0;
        town._spawnIceShards(game, { x: 100, y: 100, count, flora: 'ice', mode, spread: 3 });
        return game.particles.slice();
    };
    const powder = spawn('powder'), dust = spawn('dust');
    for (const p of [...powder, ...dust]) {
        assert.ok(p instanceof SnowFlurryParticle, '舞う雪の粒でない');
        assert.ok(SNOWTREE_FLURRY_COLORS.includes(p.color), p.color);
        assert.ok(p.y <= 100 + 1e-9, `出る点（地面の線）より下 ${p.y} で生まれた`);
        assert.equal(p.game, game);
    }
    const [s0, s1] = ICICLE_POWDER_SIZE;
    for (const p of powder) assert.ok(p.size >= s0 && p.size <= s1, `powder の大きさ ${p.size}`);
    assert.ok(powder.some((p) => p.size === s1) && powder.some((p) => p.size === s0), 'powder の大小が混ざらない');
    for (const p of dust) assert.ok(p.size === 1 || p.size === 2, `dust の大きさ ${p.size}`);
    const mean = (ps, f) => ps.reduce((a, p) => a + f(p), 0) / ps.length;
    assert.ok(mean(powder, (p) => p.size) > mean(dust, (p) => p.size) * 1.5, 'powder が dust より大きくない（大きめの粉雪）');
    for (const p of powder) assert.ok(p.vy <= 1e-9, 'powder が下へ飛んだ');
    assert.ok(mean(powder, (p) => Math.hypot(p.vx, p.vy)) > mean(dust, (p) => Math.hypot(p.vx, p.vy)) * 2, 'powder の勢いが dust と同じ');
});
