import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { Town } from '../src/js/world/town/Town.js';
import { IcicleFall } from '../src/js/world/town/IcicleFall.js';
import { buildIcicle } from '../src/js/world/town/icicles.js';
import { MAT_ICE, SOLID, CHUNK } from '../src/js/world/town/chunks.js';
import { ICE_PARTICLE_COLORS } from '../src/js/world/town/palette.js';
import { fakeCanvas } from './helpers/town-fixtures.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import {
    ICICLE_SHAKE_TICKS, ICICLE_SHAKE_AMPLITUDE, ICICLE_KNOCK_VY, ICICLE_DRIP_EVERY, ICICLE_SHARDS,
    TOWN_FALLING_MAX, ICICLE_DAMAGE,
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

test('床で砕けて氷の粒（land）を出す。瓦礫は残さない。落ちた先は床の上', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const game = fakeGame();
    const p = released(town, game, b);
    town.effects.length = 0;
    const seen = [];
    for (let t = 0; t < 200 && p.alive; t++) {
        town._updateFalling(game);
        seen.push(...town.effects.filter((e) => e.flora === 'ice' && e.mode === 'land'));
        town.effects.length = 0;
    }
    assert.equal(p.alive, false);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].count, ICICLE_SHARDS.land);
    assert.ok(Math.abs(seen[0].y - FLOOR_Y) <= 16, `y ${seen[0].y} が床から遠い`);
    assert.equal(town.rubble.length, 0);
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
