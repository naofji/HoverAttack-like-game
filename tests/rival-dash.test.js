// ライバルの瞬間加速（回避の立ち上がりだけ速くする）
//
// 狙いは「照準を合わせた瞬間に残像を残して横へ消える」こと。なので
//   - 回避に入る**瞬間**だけ速い
//   - その速さが残像のしきい値を超えている（超えないと尾が出ない＝意味がない）
//   - 数フレームで通常速度へ戻る（切れた瞬間に急停止して見えない）
// の3つを縛る。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { makeMap, makeGame, makeAttacker, flatFloorRows } from './helpers/enemy-world.js';
import {
    RIVAL_DASH_FRAMES, RIVAL_DASH_MULT,
    RIVAL_ALIGN_TRIGGER_FRAMES, RIVAL_AFTERIMAGE_SPEED,
    ENEMY_ATTACKER_TYPES,
} from '../src/js/utils/Constants.js';

// 軸が合っている＝自機が自分とほぼ同じ X に居る状態。
// 離れた targetX を渡すと alignXFrames がその場で 0 に戻り、回避が始まらない。
const alignedX = (e) => e.x + e.width / 2;

/** 軸が合った状態を作って回避（＝ダッシュ）に入れる。 */
function startEvade(e) {
    e.alignXFrames = RIVAL_ALIGN_TRIGGER_FRAMES + 1;
    e.alignYFrames = 0;
    e.evadeTimer = 0;
    // dx = targetX - 自分の中心。軸が合っているので 0
    return e._updateAlignmentAvoidance(0, 0, alignedX(e));
}

/** 回避を1フレーム進めて |vx| を返す。 */
function stepEvade(e) {
    const targetX = alignedX(e);
    e._updateAlignmentAvoidance(0, 0, targetX);
    return Math.abs(e.vx);
}

function spawnRival() {
    const game = makeGame(makeMap(flatFloorRows()));
    return makeAttacker(game, 200, 100, 'rival');
}

/** playRivalDash の呼び出しを数える。 */
function countDashSounds(fn) {
    const saved = audioManager.playRivalDash;
    let count = 0;
    audioManager.playRivalDash = () => { count++; };
    try { fn(); } finally { audioManager.playRivalDash = saved; }
    return count;
}

test('回避に入るとダッシュが立つ', () => {
    const e = spawnRival();
    countDashSounds(() => startEvade(e));
    // 立てた同じフレームで1つ使う（回避の vx はそのフレームから速い）ので、
    // 呼び終わりでは残り FRAMES-1
    assert.equal(e.dashTimer, RIVAL_DASH_FRAMES - 1);
});

test('ダッシュの初速は通常の最高速より速い', () => {
    const e = spawnRival();
    let first;
    countDashSounds(() => { startEvade(e); first = Math.abs(e.vx); });
    // 倍率の定数から期待値を作ると、倍率をいくつに変えても通る恒真のテストになる。
    // 「瞬間加速と呼べるのは最低でも2倍から」という設計上の主張をそのまま書く
    assert.ok(first > e.maxSpeed * 2,
        `初速 ${first} が最高速 ${e.maxSpeed} の2倍に届かず、加速に見えない`);
    assert.ok(first > e.maxSpeed * (RIVAL_DASH_MULT - 0.2),
        `初速 ${first} が倍率 ${RIVAL_DASH_MULT} に届いていない`);
});

test('ダッシュの初速は残像のしきい値を超える（尾が出る速さになっている）', () => {
    // ここが繋がっていないと「加速はするが残像は出ない」になる。
    // rival の maxSpeed は 1.20 で、しきい値 1.6 には素の速度では届かない
    const e = spawnRival();
    assert.ok(e.maxSpeed < RIVAL_AFTERIMAGE_SPEED, '前提が崩れている（素の速度で尾が出る）');

    let first;
    countDashSounds(() => { startEvade(e); first = Math.abs(e.vx); });
    assert.ok(first > RIVAL_AFTERIMAGE_SPEED,
        `ダッシュの初速 ${first} が残像のしきい値 ${RIVAL_AFTERIMAGE_SPEED} を超えない`);
});

test('速度は段階的に落ちて、通常の最高速へ戻る', () => {
    const e = spawnRival();
    const speeds = [];
    countDashSounds(() => {
        startEvade(e);
        speeds.push(Math.abs(e.vx));
        for (let i = 0; i < RIVAL_DASH_FRAMES + 3; i++) speeds.push(stepEvade(e));
    });

    // 単調に落ちる（途中で速くなるとガクつく）
    for (let i = 1; i < speeds.length; i++) {
        assert.ok(speeds[i] <= speeds[i - 1] + 1e-9,
            `${i}フレーム目で速度が戻っている: ${speeds[i - 1]} → ${speeds[i]}`);
    }
    // 最後は通常の最高速ちょうど
    assert.ok(Math.abs(speeds[speeds.length - 1] - e.maxSpeed) < 1e-9,
        `最高速へ戻っていない: ${speeds[speeds.length - 1]}`);
    // 急停止ではない：最終フレームの1つ手前でも、まだ最高速の2倍まで跳ねていない
    assert.ok(speeds[RIVAL_DASH_FRAMES - 1] < e.maxSpeed * 2,
        `終わり際が速すぎて、切れた瞬間に急停止して見える: ${speeds[RIVAL_DASH_FRAMES - 1]}`);
});

test('ダッシュは回避の長さより短い（ずっと速いわけではない）', () => {
    const e = spawnRival();
    assert.ok(RIVAL_DASH_FRAMES < (ENEMY_ATTACKER_TYPES.rival.evadeDuration),
        '回避のあいだ中ダッシュしている');
});

test('rival 以外はダッシュしない', () => {
    for (const key of ['standard', 'heavy', 'artillery']) {
        const game = makeGame(makeMap(flatFloorRows()));
        const e = makeAttacker(game, 200, 100, key);
        const sounds = countDashSounds(() => startEvade(e));
        assert.ok(!e.dashTimer, `${key} がダッシュしている`);
        assert.equal(sounds, 0, `${key} でダッシュ音が鳴った`);
        // 回避そのものは今までどおり最高速で動く
        assert.ok(Math.abs(Math.abs(e.vx) - e.maxSpeed) < 1e-9, `${key} の回避速度が変わった`);
    }
});
