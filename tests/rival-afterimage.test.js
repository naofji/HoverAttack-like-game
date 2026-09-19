// ライバルの残像（entities/attacker/afterimage.js）
//
// 検証したいのは4つ:
//   1. 遅いフレームでは1枚も出ない（＝止まれば尾が消える）
//   2. 速いフレームぶんだけ、薄い順に重なる
//   3. 残像は単色（機体の色分けが残っていない）
//   4. 残像は本体より**先に**描かれる＝必ず後ろに回る
//
// 残像の1枚は `set:globalAlpha` で挟まれた区間として現れるので、そこを
// 切り出して中身を見ている（fake-ctx は restore でプロパティを巻き戻さないため、
// 実装側も alpha を明示的に戻す作りにしてある）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyAttacker } from '../src/js/entities/EnemyAttacker.js';
import { makeFakeCtx, extractFillRects } from './helpers/fake-ctx.js';
import {
    ENEMY_ATTACKER_TYPES,
    RIVAL_AFTERIMAGE_SPEED, RIVAL_AFTERIMAGE_COUNT,
    RIVAL_AFTERIMAGE_INTERVAL, RIVAL_AFTERIMAGE_ALPHA, RIVAL_AFTERIMAGE_COLOR,
} from '../src/js/utils/Constants.js';

const AIR_MAP = { isSolidAtPixel: () => false, cols: 1000, rows: 1000 };

/** constructor を通さずに draw() / _recordAfterimage() できる最小インスタンス。 */
function makeAttacker(typeKey, overrides = {}) {
    const config = ENEMY_ATTACKER_TYPES[typeKey];
    const a = Object.create(EnemyAttacker.prototype);
    a.game = { map: AIR_MAP, enemies: [], player: null, carrier: null,
               projectiles: [], enemyBullets: [] };
    a.x = 100; a.y = 50; a.width = 16; a.height = 24;
    a.vx = 0; a.vy = 0;
    a.alive = true;
    a.onGround = false;
    a.config = config;
    a.hp = config.hp; a.maxHp = config.hp;
    a.maxSpeed = config.speed;
    a.jumpForce = config.jumpForce;
    a.facingRight = true;
    a.walkFrame = 2;
    a.walkTimer = 0;
    a.hovering = false;
    a.crouching = false;
    a.burstCount = 0;
    a.recoil = 0;
    a.smokeTimer = 0;
    return Object.assign(a, overrides);
}

/** 速度 v で n フレーム動いたことにして履歴を積む（位置も v ぶん進める）。 */
function run(a, frames, speed) {
    for (let i = 0; i < frames; i++) {
        a.vx = speed; a.vy = 0;
        a.x += speed;
        a._recordAfterimage();
    }
}

/**
 * `set:globalAlpha` で挟まれた区間＝残像1枚ぶんを切り出す。
 * 実装は「alpha を下げる → 描く → 元に戻す」を1枚ごとに繰り返す。
 */
function ghostSegments(calls) {
    const out = [];
    let cur = null;
    for (const c of calls) {
        if (c.name === 'set:globalAlpha') {
            if (c.args[0] < 1) cur = { alpha: c.args[0], calls: [], };
            else if (cur) { out.push(cur); cur = null; }
            continue;
        }
        if (cur) cur.calls.push(c);
    }
    return out;
}

/** 残像の区間より後ろ（＝本体の描画）の呼び出し。 */
function bodyCalls(calls) {
    let last = -1;
    calls.forEach((c, i) => { if (c.name === 'set:globalAlpha' && c.args[0] >= 1) last = i; });
    return calls.slice(last + 1);
}

test('遅いフレームでは残像が1枚も出ない', () => {
    const a = makeAttacker('rival');
    run(a, 10, RIVAL_AFTERIMAGE_SPEED - 0.5);

    const ctx = makeFakeCtx();
    a.draw(ctx);

    assert.equal(ghostSegments(ctx.calls).length, 0);
});

test('速いフレームでは残像が COUNT 枚、薄い順に重なる', () => {
    const a = makeAttacker('rival');
    run(a, 20, RIVAL_AFTERIMAGE_SPEED + 1);

    const ctx = makeFakeCtx();
    a.draw(ctx);

    const ghosts = ghostSegments(ctx.calls);
    assert.equal(ghosts.length, RIVAL_AFTERIMAGE_COUNT);

    // 描く順は「遠い（薄い）→ 近い（濃い）」。近い残像が上に乗る
    const alphas = ghosts.map((g) => g.alpha);
    const expected = [];
    for (let i = RIVAL_AFTERIMAGE_COUNT; i >= 1; i--) {
        expected.push(RIVAL_AFTERIMAGE_ALPHA * (RIVAL_AFTERIMAGE_COUNT + 1 - i) / RIVAL_AFTERIMAGE_COUNT);
    }
    alphas.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-9,
        `alpha[${i}] = ${v}, expected ${expected[i]}`));

    // 一番濃い残像でも本体より薄い
    assert.ok(Math.max(...alphas) < 1);
});

test('残像は単色（機体の色分けが残っていない）', () => {
    const a = makeAttacker('rival');
    run(a, 20, RIVAL_AFTERIMAGE_SPEED + 1);

    const ctx = makeFakeCtx();
    a.draw(ctx);

    for (const g of ghostSegments(ctx.calls)) {
        const colors = g.calls
            .filter((c) => c.name === 'set:fillStyle' || c.name === 'set:strokeStyle')
            .map((c) => c.args[0]);
        assert.deepEqual([...new Set(colors)], [RIVAL_AFTERIMAGE_COLOR]);
        // 中身が空では「単色」も自明に通ってしまうので、実際に描いていることも見る
        assert.ok(g.calls.filter((c) => c.name === 'fillRect').length >= 5);
    }
});

test('残像は本体より先に描かれる（本体の絵は全部あとに残る）', () => {
    const a = makeAttacker('rival');
    const plain = makeFakeCtx();
    a.draw(plain);                      // 履歴なし＝本体だけ
    const baseline = extractFillRects(plain.calls).length;

    run(a, 20, RIVAL_AFTERIMAGE_SPEED + 1);
    const ctx = makeFakeCtx();
    a.draw(ctx);

    assert.equal(extractFillRects(bodyCalls(ctx.calls)).length, baseline);
});

test('残像は履歴の位置に描かれる（本体の位置ではない）', () => {
    const a = makeAttacker('rival');
    run(a, 20, RIVAL_AFTERIMAGE_SPEED + 1);

    const ctx = makeFakeCtx();
    a.draw(ctx);

    const ghosts = ghostSegments(ctx.calls);
    // 各区間の最初の translate が、その残像の原点（facingRight なので x そのもの）
    const xs = ghosts.map((g) => g.calls.find((c) => c.name === 'translate').args[0]);
    for (const gx of xs) assert.ok(gx < a.x, `残像 ${gx} が本体 ${a.x} より後ろにない`);
    // 新しい残像ほど本体に近い（描く順は薄い→濃い＝遠い→近い）
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i - 1]);
});

test('遅くなったフレームは残像にならない＝尾が短くなっていく', () => {
    const a = makeAttacker('rival');
    run(a, 20, RIVAL_AFTERIMAGE_SPEED + 1);
    // 直近 INTERVAL フレームだけ遅い＝一番新しい残像が1枚落ちる
    run(a, RIVAL_AFTERIMAGE_INTERVAL, 0);

    const ctx = makeFakeCtx();
    a.draw(ctx);
    assert.equal(ghostSegments(ctx.calls).length, RIVAL_AFTERIMAGE_COUNT - 1);
});

test('rival 以外は履歴すら持たない', () => {
    for (const key of ['standard', 'heavy', 'artillery']) {
        const a = makeAttacker(key);
        run(a, 20, RIVAL_AFTERIMAGE_SPEED + 5);
        assert.ok(!a.trail || a.trail.length === 0, `${key} が履歴を持っている`);

        const ctx = makeFakeCtx();
        a.draw(ctx);
        assert.equal(ghostSegments(ctx.calls).length, 0, `${key} に残像が出ている`);
    }
});

test('履歴は必要な長さで頭打ちになる（際限なく伸びない）', () => {
    const a = makeAttacker('rival');
    run(a, 500, RIVAL_AFTERIMAGE_SPEED + 1);
    assert.ok(a.trail.length <= RIVAL_AFTERIMAGE_COUNT * RIVAL_AFTERIMAGE_INTERVAL,
        `trail = ${a.trail.length}`);
});

test('残像の向きは、そのフレームの向きで描く', () => {
    const a = makeAttacker('rival', { facingRight: false });
    run(a, 20, -(RIVAL_AFTERIMAGE_SPEED + 1));
    a.facingRight = true;               // 描画の直前に振り向いた

    const ctx = makeFakeCtx();
    a.draw(ctx);

    // 左向きで積んだ残像は scale(-1, 1) を伴う。本体（右向き）は伴わない
    for (const g of ghostSegments(ctx.calls)) {
        assert.ok(g.calls.some((c) => c.name === 'scale' && c.args[0] === -1));
    }
    assert.ok(!bodyCalls(ctx.calls).some((c) => c.name === 'scale' && c.args[0] === -1));
});

// ---- 配線（update() から実際に呼ばれているか）----
// 上のテストは _recordAfterimage() を直に叩いているので、update() が呼び忘れて
// いても全部通ってしまう。本物の update() を回して履歴が伸びることを見る。

import { makeMap, makeGame, makeAttacker as spawnAttacker, flatFloorRows } from './helpers/enemy-world.js';

test('update() が残像の履歴を積む（落下中の rival）', () => {
    const map = makeMap(flatFloorRows());
    const game = makeGame(map);
    const rival = spawnAttacker(game, 100, 20, 'rival');   // 空中スタート＝重力で加速する

    for (let i = 0; i < 12; i++) rival.update();

    assert.ok(rival.trail && rival.trail.length > 0, '履歴が積まれていない');
    // 自由落下は 12 フレームで十分しきい値を超える
    assert.ok(rival.trail.some((e) => e.fast), '速いフレームが1つも記録されていない');
});

test('update() を回しても rival 以外は履歴を作らない', () => {
    const map = makeMap(flatFloorRows());
    const game = makeGame(map);
    const heavy = spawnAttacker(game, 100, 20, 'heavy');

    for (let i = 0; i < 12; i++) heavy.update();

    assert.ok(!heavy.trail || heavy.trail.length === 0);
});
