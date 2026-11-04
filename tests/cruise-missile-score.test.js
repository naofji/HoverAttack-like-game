// 巡航ミサイルを撃ち落としたときの得点が、CRUISE_MISSILE_SCORE（バランス表の値）であること。
//
// 2026-11-04 まで、得点の定数が2つあった。2026-07-18 のバランス調整は CRUISE_MISSILE_SCORE を
// 100 → 150 に変えたが、実際に加点していたのは CollisionManager の SCORE_CRUISE_DESTROY = 100 で、
// 調整は効いていなかった（定数の値だけを見るテストは通っていた）。だから値ではなく、
// 撃ち落とす経路を通して加点を見る。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollisionManager } from '../src/js/systems/CollisionManager.js';
import { CRUISE_MISSILE_SCORE } from '../src/js/utils/Constants.js';

// 判定は constructor.name で巡航ミサイルを見分けるので、同じ名前の偽物でよい
class EnemyCruiseMissile {
    constructor(hp) { this.x = 100; this.y = 100; this.hp = hp; this.alive = true; this.exploded = false; }
    _explode() { this.alive = false; this.exploded = true; }
}

function intercept(hp) {
    const scores = [];
    const missile = new EnemyCruiseMissile(hp);
    const game = { enemyBullets: [missile], addScore: (n) => scores.push(n), particles: [], spawnExplosion() {} };
    const cm = new CollisionManager(game);
    const bullet = { x: 100, y: 100, alive: true };   // 機銃の弾（Missile ではない）
    const consumed = cm._checkInterception(bullet);
    return { consumed, scores, missile };
}

test('巡航ミサイルを撃ち落とすと CRUISE_MISSILE_SCORE が入る', () => {
    const { consumed, scores, missile } = intercept(1);
    assert.equal(consumed, true);
    assert.equal(missile.exploded, true);
    assert.deepEqual(scores, [CRUISE_MISSILE_SCORE]);
});

test('HP が残っているうちは得点が入らない', () => {
    const { consumed, scores } = intercept(1000);
    assert.equal(consumed, true);
    assert.deepEqual(scores, []);
});
