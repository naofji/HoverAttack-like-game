import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyDamage } from '../src/js/utils/damage.js';
import { EnemyAttacker } from '../src/js/entities/EnemyAttacker.js';
import { EnemyDrone } from '../src/js/entities/EnemyDrone.js';
import { EnemyTank } from '../src/js/entities/EnemyTank.js';
import { EnemyTurret } from '../src/js/entities/EnemyTurret.js';
import { EnemyBase } from '../src/js/entities/EnemyBase.js';
import { ENEMY_ATTACKER_TYPES } from '../src/js/utils/Constants.js';
import { makeMap, flatFloorRows } from './helpers/enemy-world.js';

/**
 * 敵機の標準的な被弾は「HP を削る → 火花 → 0以下なら die()」の7行で、
 * アタッカー・ドローン・タンク・砲台の4クラスが1文字違わず持っていた。
 * applyDamage に切り出したので、4クラスが本当に同じ振る舞いを続けること、
 * および敵基地だけが別扱いのままであることを縛る。
 */

function makeGame() {
    const game = {
        map: makeMap(flatFloorRows()),
        enemies: [], particles: [], projectiles: [], enemyBullets: [],
        player: null, carrier: null, score: 0, missionsCompleted: 0,
        sparks: [],
        spawnSparks(x, y) { this.sparks.push({ x, y }); },
        addScore(s) { this.score += s; },
        spawnExplosion() {}, spawnDebris() {}, spawnHeavyDamage() {},
        spawnSmokeScreen() {}, triggerBaseEmergencyAlert() {},
        rng: { next: () => 0.5 },
    };
    return game;
}

const ENEMIES = [
    ['アタッカー', (g) => new EnemyAttacker(g, 100, 100, ENEMY_ATTACKER_TYPES.standard)],
    ['ドローン', (g) => new EnemyDrone(g, 100, 100)],
    ['タンク', (g) => new EnemyTank(g, 100, 100)],
    ['砲台', (g) => new EnemyTurret(g, 100, 100)],
];

test('4種とも被弾で HP が減り、機体の中心に火花が出る', () => {
    for (const [name, make] of ENEMIES) {
        const game = makeGame();
        const e = make(game);
        const before = e.hp;

        e.takeDamage(1);

        assert.equal(e.hp, before - 1, `${name} の HP が減っていない`);
        assert.equal(game.sparks.length, 1, `${name} の火花が1回でない`);
        assert.deepEqual(game.sparks[0], {
            x: e.x + e.width / 2,
            y: e.y + e.height / 2,
        }, `${name} の火花の位置が中心でない`);
    }
});

test('4種とも HP が尽きたら撃破され、得点が入る', () => {
    for (const [name, make] of ENEMIES) {
        const game = makeGame();
        const e = make(game);

        e.takeDamage(e.hp + 100);

        assert.equal(e.alive, false, `${name} が撃破されていない`);
        assert.ok(game.score > 0, `${name} の撃破で得点が入っていない`);
    }
});

test('撃破される一撃でも火花は出る（当たった手応えを消さない）', () => {
    for (const [name, make] of ENEMIES) {
        const game = makeGame();
        const e = make(game);
        e.takeDamage(e.hp);
        assert.equal(e.alive, false, `${name} が生きている`);
        assert.equal(game.sparks.length, 1, `${name} の撃破時に火花が出ていない`);
    }
});

test('死んだ後に撃っても何も起きない（多重撃破しない）', () => {
    for (const [name, make] of ENEMIES) {
        const game = makeGame();
        const e = make(game);
        e.takeDamage(e.hp + 100);

        const scoreAfterKill = game.score;
        const sparksAfterKill = game.sparks.length;
        const hpAfterKill = e.hp;

        e.takeDamage(50);

        assert.equal(game.score, scoreAfterKill, `${name} が二重に得点を出した`);
        assert.equal(game.sparks.length, sparksAfterKill, `${name} が死後に火花を出した`);
        assert.equal(e.hp, hpAfterKill, `${name} の HP が死後に減った`);
    }
});

test('applyDamage 単体: HP が残っていれば die() を呼ばない', () => {
    let died = 0;
    const sparks = [];
    const entity = {
        alive: true, hp: 10, x: 0, y: 0, width: 20, height: 40,
        game: { spawnSparks: (x, y) => sparks.push({ x, y }) },
        die() { died++; },
    };

    applyDamage(entity, 3);
    assert.equal(entity.hp, 7);
    assert.equal(died, 0);
    assert.deepEqual(sparks, [{ x: 10, y: 20 }]);

    applyDamage(entity, 7);
    assert.equal(died, 1, 'ちょうど0で撃破されること');
});

test('敵基地は共通処理を使わない（シールドを先に削る別の作り）', () => {
    // 基地だけは被弾が増援の呼び出しも兼ねるので、自前の takeDamage を持つ
    const game = makeGame();
    const base = Object.create(EnemyBase.prototype);
    Object.assign(base, {
        game, x: 0, y: 0, width: 64, height: 64,
        alive: true, hp: 10, shields: 2, dying: false,
        _spawnSparks() { this.sparkCount = (this.sparkCount || 0) + 1; },
        _die() { this.alive = false; },
    });

    base.takeDamage(1);
    assert.equal(base.shields, 1, 'シールドが先に削れていない');
    assert.equal(base.hp, 10, 'シールドがあるのに本体が削れている');
    assert.ok(game.score > 0, 'シールド破壊の得点が入っていない');
});
