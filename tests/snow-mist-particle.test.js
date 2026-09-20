// ホバー中に地表で舞う粉雪（SnowMistParticle）。
//
// 着地・滑走で使う SnowKickParticle と同じ形（fillRect 1回、save/restore なし）
// だが、接地していないので「蹴る」のではなく「ふわっと舞う」見た目にする ──
// 重力を弱くして長く漂わせ、最大でも半透明にとどめる。
//
// 地面とは CasingParticle と同じ考え方であたる（game.map.isSolidAtPixel）。
// ただし薬莢と違って跳ね返らず、触れた瞬間に地面へ吸収されて消える
// （実機の指摘: 粉雪が跳ねるのは不自然）。game.map が無い（テストの簡易呼び出し
// や既存のコンストラクタ呼び出し）場合は衝突を見ずに素通りする。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { SnowMistParticle } from '../src/js/entities/Particle.js';
import { HOVER_SNOW_MIST_LIFETIME, HOVER_SNOW_MIST_COLOR } from '../src/js/utils/Constants.js';

test('SnowKickParticle より重力が弱く、ふわっと漂う', () => {
    const p = new SnowMistParticle(null, 100, 100, 0, 0);
    p.update();
    // SnowKickParticle は1F目で vy が 0.12 になる。粉雪はそれよりずっと軽い
    assert.ok(p.vy > 0 && p.vy < 0.06, `重力が強すぎる: ${p.vy}`);
});

test('寿命が尽きると消える', () => {
    const p = new SnowMistParticle(null, 100, 100, 0, 0);
    for (let i = 0; i < HOVER_SNOW_MIST_LIFETIME; i++) p.update();
    assert.equal(p.alive, false);
});

test('死んだ後は update しても動かない', () => {
    const p = new SnowMistParticle(null, 100, 100, 1, 1);
    p.alive = false;
    p.update();
    assert.equal(p.x, 100);
    assert.equal(p.y, 100);
});

test('最大でも SnowKick(1.0)よりはわずかに透ける', () => {
    // 実機の指摘で「巻き上げの勢いが伝わるくらい、はっきり見えてよい」と
    // 上限を上げた（0.7→0.9）。完全な不透明(1.0)ではないことだけ縛る
    const p = new SnowMistParticle(null, 100, 100, 0, 0); // 生まれた直後 = 最大alpha
    const ctx = makeFakeCtx();
    p.draw(ctx);
    const alpha = ctx.calls.find((c) => c.name === 'set:globalAlpha');
    assert.ok(alpha.args[0] < 1.0 && alpha.args[0] >= 0.85, `期待した範囲外: ${alpha.args[0]}`);
});

test('描き終わりに globalAlpha を 1 へ戻す', () => {
    const p = new SnowMistParticle(null, 100, 100, 0, 0);
    const ctx = makeFakeCtx();
    p.draw(ctx);
    assert.equal(ctx.globalAlpha, 1);
});

test('専用の色（HOVER_SNOW_MIST_COLOR）で描く', () => {
    const p = new SnowMistParticle(null, 100, 100, 0, 0);
    const ctx = makeFakeCtx();
    p.draw(ctx);
    const fill = ctx.calls.find((c) => c.name === 'set:fillStyle');
    assert.equal(fill.args[0], HOVER_SNOW_MIST_COLOR);
});

test('死んでいれば draw しても何もしない', () => {
    const p = new SnowMistParticle(null, 100, 100, 0, 0);
    p.alive = false;
    const ctx = makeFakeCtx();
    p.draw(ctx);
    assert.equal(ctx.calls.length, 0);
});

// --- 地面との当たり判定：跳ねずに吸収される --------------------------------------

/** 指定 y 以上を地面とする最小マップ。 */
function groundBelow(groundY) {
    return { isSolidAtPixel: (x, y) => y >= groundY };
}

test('地面に触れると跳ね返らず、そのまま消える（吸収）', () => {
    const game = { map: groundBelow(101) }; // y=101 から地面
    const p = new SnowMistParticle(game, 100, 100, 0, 1); // 下向き、1F後に地面(101)へ到達
    p.update();
    assert.equal(p.alive, false, '地面に触れても消えていない');
});

test('地面に触れる前は普通に動く', () => {
    const game = { map: groundBelow(1000) }; // ずっと遠い地面
    const p = new SnowMistParticle(game, 100, 100, 2, 0);
    p.update();
    assert.equal(p.alive, true);
    assert.equal(p.x, 102);
});

test('game.map が無ければ地面判定をせず素通りする（フォールバック）', () => {
    const p = new SnowMistParticle(null, 100, 100, 0, 5);
    p.update();
    assert.equal(p.alive, true);
    assert.ok(p.y > 100, '通常どおり動いていない');
});

test('吸収されると位置は地面の手前で止まり、地面の内側へはめり込まない', () => {
    const game = { map: groundBelow(101) };
    const p = new SnowMistParticle(game, 100, 100, 0, 5); // 大きく踏み込む速度
    p.update();
    assert.ok(p.y < 101, `地面の中に入っている: y=${p.y}`);
});
