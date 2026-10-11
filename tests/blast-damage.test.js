// 爆心からの範囲ダメージ（utils/blastDamage.js）。地雷と町の爆発物が同じ処理を使う（spec 3b章）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBlastDamage } from '../src/js/utils/blastDamage.js';

/** 中心が (cx, cy) の 16px 角の機体。受けたダメージを記録する */
function unit(cx, cy) {
    return {
        x: cx - 8, y: cy - 8, width: 16, height: 16, alive: true, vx: 0, vy: 0, hits: [],
        takeDamage(n) { this.hits.push(n); },
    };
}

const OPTS = { radius: 50, damage: 25, knockVy: -6, knockVx: 3 };

test('半径の中の自機・母艦・敵にダメージ、外には無し', () => {
    const game = { player: unit(30, 0), carrier: unit(80, 0), enemies: [unit(0, 40), unit(-60, 0)], landmines: [] };
    applyBlastDamage(game, 0, 0, OPTS);
    assert.deepEqual(game.player.hits, [25]);
    assert.deepEqual(game.carrier.hits, []);
    assert.deepEqual(game.enemies[0].hits, [25]);
    assert.deepEqual(game.enemies[1].hits, []);
});

test('当たった相手は爆心から離れる向きに飛ばされ、被弾位置が爆心になる', () => {
    const left = unit(-20, 0), right = unit(20, 0);
    applyBlastDamage({ enemies: [left, right] }, 0, 0, OPTS);
    assert.equal(left.vx, -3);
    assert.equal(right.vx, 3);
    assert.equal(right.vy, -6);
    assert.equal(right.lastHitX, 0);
    assert.equal(right.lastHitY, 0);
});

test('地雷は誘爆させる。source 自身と、倒れた相手は飛ばす', () => {
    const fired = [];
    const mine = { x: -6, y: -3, width: 12, height: 6, alive: true, detonate() { fired.push('mine'); } };
    const self = { ...mine, detonate() { fired.push('self'); } };
    const dead = unit(10, 0);
    dead.alive = false;
    applyBlastDamage({ player: dead, enemies: [], landmines: [mine, self] }, 0, 0, { ...OPTS, source: self });
    assert.deepEqual(fired, ['mine']);
    assert.deepEqual(dead.hits, []);
});

test('game に母艦・敵・地雷の配列が無くても落ちない', () => {
    applyBlastDamage({ player: null }, 0, 0, OPTS);
});
