import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PickupItem, ITEM_SIZE } from '../src/js/entities/PickupItem.js';
import { RepairKit } from '../src/js/entities/RepairKit.js';
import { MissileKit } from '../src/js/entities/MissileKit.js';
import { AutoAimUnit } from '../src/js/entities/AutoAimUnit.js';
import { OverdriveKit } from '../src/js/entities/OverdriveKit.js';
import { Player } from '../src/js/entities/Player.js';
import { MISSILE_INITIAL_COUNT, AUTO_AIM_DURATION, AUTO_AIM_MAX_DURATION, ITEM_PICKUP_SCORE,
    PLAYER_MAX_HP, REPAIR_KIT_PLAYER_HEAL }
    from '../src/js/utils/Constants.js';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { makeMap, flatFloorRows } from './helpers/enemy-world.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';

/**
 * 拾い物は落下・接地・当たり判定・点滅が全く同じで、違うのは
 * 「拾ったときの効果」と「色とアイコン」だけ。以前は3ファイルに同じ90行が
 * 並んでいた。共通部分を PickupItem に集めたので、各種が本当に同じ振る舞いを
 * 続けていることと、効果だけが別であることをここで縛る。
 */

const KINDS = [
    ['リペアキット', RepairKit],
    ['ミサイル補給', MissileKit],
    ['Auto Aim ユニット', AutoAimUnit],
    ['オーバードライブ', OverdriveKit],
];

function makePlayer(overrides = {}) {
    return {
        x: 100, y: 100, width: 16, height: 24,
        alive: true, docked: false,
        repairKits: 0, missiles: 0, autoAimTimer: 0, autoAimMaxTimer: 0,
        overdriveTimer: 0, overdriveMaxTimer: 0,
        // リペアキットは拾うと自機も回復する。回復の式は Player 本体のものを
        // 借りる（ここに書き写すとコード複製になる）
        hp: PLAYER_MAX_HP,
        heal: Player.prototype.heal,
        ...overrides,
    };
}

function makeGame(player = null) {
    const game = {
        map: makeMap(flatFloorRows()),
        player,
        score: 0,
        addScore(s) { this.score += s; },
    };
    return game;
}

/** playPickup を記録して必ず戻す。 */
function withPickupSpy(fn) {
    const original = audioManager.playPickup;
    const calls = [];
    audioManager.playPickup = (...args) => calls.push(args);
    try {
        fn(calls);
    } finally {
        audioManager.playPickup = original;
    }
}

test('どの拾い物も PickupItem を継承している', () => {
    for (const [name, Cls] of KINDS) {
        assert.ok(Cls.prototype instanceof PickupItem, `${name} が PickupItem 由来でない`);
    }
});

test('置かれる位置は中心指定（左上に直される）', () => {
    for (const [name, Cls] of KINDS) {
        const item = new Cls(makeGame(), 100, 50);
        assert.equal(item.x, 100 - ITEM_SIZE / 2, `${name} の x`);
        assert.equal(item.y, 50, `${name} の y`);
        assert.equal(item.width, ITEM_SIZE);
        assert.equal(item.height, ITEM_SIZE);
    }
});

test('どれも同じ落ち方をして、同じ高さで床に着く', () => {
    const traces = KINDS.map(([, Cls]) => {
        const item = new Cls(makeGame(), 100, 0);
        const trace = [];
        for (let i = 0; i < 80; i++) {
            item.update();
            trace.push(`${item.y.toFixed(4)}/${item.vy.toFixed(4)}/${item.onGround}`);
        }
        return trace.join('|');
    });
    for (let i = 1; i < traces.length; i++) {
        assert.equal(traces[i - 1], traces[i],
            `${KINDS[i - 1][0]} と ${KINDS[i][0]} で落ち方が違う`);
    }
    assert.ok(traces[0].includes('true'), '床に着いていない');
});

test('接地したら落下が止まる（床をすり抜けない）', () => {
    for (const [name, Cls] of KINDS) {
        const item = new Cls(makeGame(), 100, 0);
        for (let i = 0; i < 200; i++) item.update();
        assert.equal(item.onGround, true, `${name} が接地していない`);
        assert.equal(item.vy, 0, `${name} の落下速度が残っている`);
    }
});

test('自機が重なると拾われ、得点と音が1回だけ入る', () => {
    for (const [name, Cls] of KINDS) {
        withPickupSpy((calls) => {
            const player = makePlayer();
            const game = makeGame(player);
            const item = new Cls(game, 100 + ITEM_SIZE / 2, 100);
            item.onGround = true;
            item.update();

            assert.equal(item.alive, false, `${name} が消えていない`);
            assert.equal(game.score, ITEM_PICKUP_SCORE, `${name} の得点`);
            assert.equal(calls.length, 1, `${name} の効果音が1回でない`);
        });
    }
});

test('ドッキング中・死亡中は拾えない', () => {
    for (const [name, Cls] of KINDS) {
        for (const state of [{ docked: true }, { alive: false }]) {
            const player = makePlayer(state);
            const game = makeGame(player);
            const item = new Cls(game, 100 + ITEM_SIZE / 2, 100);
            item.onGround = true;
            item.update();
            assert.equal(item.alive, true, `${name}: ${JSON.stringify(state)} で拾えてしまう`);
            assert.equal(game.score, 0);
        }
    }
});

test('離れていれば拾わない', () => {
    for (const [name, Cls] of KINDS) {
        const player = makePlayer({ x: 400 });
        const game = makeGame(player);
        const item = new Cls(game, 100, 100);
        item.onGround = true;
        item.update();
        assert.equal(item.alive, true, `${name} が離れた位置で拾われた`);
    }
});

// --- ここからが3種の「違い」。表の1行にあたる部分 ---

test('リペアキットは持ち物が1つ増える（母艦の回復はドッキング時）', () => {
    const player = makePlayer();
    new RepairKit(makeGame(player), 0, 0).onPickup(player);
    assert.equal(player.repairKits, 1);
    assert.equal(player.missiles, 0);
    assert.equal(player.autoAimTimer, 0);
});

test('リペアキットは拾った場で自機も回復する（キットは消費しない）', () => {
    const player = makePlayer({ hp: 40 });
    new RepairKit(makeGame(player), 0, 0).onPickup(player);
    assert.equal(player.hp, 40 + REPAIR_KIT_PLAYER_HEAL);
    assert.equal(player.repairKits, 1, '自機を治すとキットが消えている');
});

test('ミサイル補給は残弾を満タンに戻す（加算ではない）', () => {
    const player = makePlayer({ missiles: 3 });
    new MissileKit(makeGame(player), 0, 0).onPickup(player);
    assert.equal(player.missiles, MISSILE_INITIAL_COUNT);
});

test('Auto Aim は重ね取りで延長できるが上限を超えない', () => {
    const player = makePlayer();
    const unit = new AutoAimUnit(makeGame(player), 0, 0);

    unit.onPickup(player);
    assert.equal(player.autoAimTimer, AUTO_AIM_DURATION);
    assert.equal(player.autoAimMaxTimer, AUTO_AIM_MAX_DURATION);

    for (let i = 0; i < 20; i++) unit.onPickup(player);
    assert.equal(player.autoAimTimer, AUTO_AIM_MAX_DURATION, '上限を超えて延びている');
});

test('全種類が見分けがつく（グローの色が違う）', () => {
    const game = makeGame();
    const colors = KINDS.map(([, Cls]) => new Cls(game, 0, 0).glowColor);
    assert.equal(new Set(colors).size, KINDS.length, '同じ色のアイテムがある');
});

test('描画は save/restore が釣り合っている', () => {
    // Auto Aim だけアイコンが stroke 主体で、統合時に restore を余計に
    // 持ち込みかけた。崩れると以降の描画すべてに色や線幅が漏れる
    for (const [name, Cls] of KINDS) {
        const item = new Cls(makeGame(), 100, 100);
        const ctx = makeFakeCtx();
        ctx.arcTo = () => {};
        item.draw(ctx);
        const saves = ctx.calls.filter((c) => c.name === 'save').length;
        const restores = ctx.calls.filter((c) => c.name === 'restore').length;
        assert.equal(saves, restores, `${name}: save ${saves} / restore ${restores}`);
    }
});

test('死んでいる間は何も描かない', () => {
    for (const [name, Cls] of KINDS) {
        const item = new Cls(makeGame(), 100, 100);
        item.alive = false;
        const ctx = makeFakeCtx();
        ctx.arcTo = () => {};
        item.draw(ctx);
        assert.equal(ctx.calls.length, 0, `${name} が死亡中に描画している`);
    }
});
