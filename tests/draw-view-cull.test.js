// 画面外の敵と地雷を描かない配線。
//
// 実測(2026-08-16)で、敵は平均 99.6 体いるのに画面内は約11%、`enemies` の描画
// 0.433ms/フレームの9割近くが捨て仕事だった。判定そのものは utils/viewCull.js に
// あってそちらでテストしてある。**ここで見るのは「本当に呼ばれなくなったか」。**
//
// 呼び出しの存在をソース文字列で grep するテストにはしない。到達不能でも通って
// しまい、実際にそれで抜けたバグがある（CLAUDE.md）。Game._drawWorld() を本物の
// まま呼び、各敵の draw() が呼ばれた／呼ばれなかったを数える。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { Game } from '../src/js/main.js';

/** draw() が呼ばれた回数を数えるだけの敵もどき。x,y は左上基準 */
function stubEnemy(name, x, y) {
    return {
        name, x, y, width: 32, height: 32, alive: true,
        drawCount: 0,
        draw() { this.drawCount++; },
    };
}

/** _drawWorld() が触るものだけを埋めた最小の game。描画以外はすべて空 */
function makeWorld({ enemies = [], landmines = [] } = {}) {
    const noop = () => {};
    return {
        gameState: 'playing',
        simAlpha: 1,
        canvas: { width: 1024, height: 768 },
        camera: { x: 1000, y: 500, renderX: () => 1000, renderY: () => 500 },
        map: { backdrop: null, draw: noop },
        // Game.env は Task 8 で追加された環境（霧・雪・地底湖）。この画面は
        // 画面外カリングだけを見るのでスタブでよい。
        env: { update: noop, drawOverWorld: noop, drawOverlay: noop },
        carrier: null,
        player: null,
        flag: null,
        grenadeTrajectory: null,
        enemies,
        landmines,
        projectiles: [], particles: [], repairKits: [], autoAimUnits: [],
        missileKits: [], enemyBullets: [], smokeScreens: [],
        _applyRenderInterpolation: noop,
        _restoreRenderInterpolation: noop,
        _drawHpBarIfDamaged: noop,
        _drawGrenadeTrajectory: noop,
    };
}

test('画面内の敵は描かれ、遠く離れた敵は描かれない', () => {
    // カメラは 1000,500 〜 2024,1268
    const inside = stubEnemy('inside', 1500, 880);
    const farRight = stubEnemy('farRight', 4000, 880);
    const farBelow = stubEnemy('farBelow', 1500, 3000);
    const world = makeWorld({ enemies: [inside, farRight, farBelow] });

    Game._drawWorld.call(world, makeFakeCtx());

    assert.equal(inside.drawCount, 1);
    assert.equal(farRight.drawCount, 0);
    assert.equal(farBelow.drawCount, 0);
});

test('画面の縁をまたぐ敵は描く（半分だけ切れて消えるのを防ぐ）', () => {
    // 中心が右端 2024 の少し外。機体の半径 16 ＋ margin で掛かる
    const straddling = stubEnemy('straddling', 2020, 880);
    const world = makeWorld({ enemies: [straddling] });

    Game._drawWorld.call(world, makeFakeCtx());

    assert.equal(straddling.drawCount, 1);
});

test('画面のすぐ外にいる敵も margin のぶんは描く（脚や炎がはみ出すため）', () => {
    // 機体の矩形は完全に画面外だが、脚・スラスター炎・HPバーは矩形の外へ出る。
    // ここを切り詰めると縁で部品がちらつく
    const justOutside = stubEnemy('justOutside', 2060, 880);
    const world = makeWorld({ enemies: [justOutside] });

    Game._drawWorld.call(world, makeFakeCtx());

    assert.equal(justOutside.drawCount, 1);
});

test('敵基地は当たり判定より遥かに大きく描くので、その広がりぶん手前から描く', () => {
    // EnemyBase の width/height は 24x32（半径16）しかないが、
    // 緊急防衛のパルスは中心から半径 120px まで広がり（EnemyBase.js の
    // `20 + progress * 100`）、シールドも半径45で回っている。
    // margin を機体の矩形基準だけで決めると、**パルスが縁でポップする**。
    //
    // パルスの左端が画面の右端 2024 にちょうど触る位置に基地を置く。
    // 中心 = 2024 + 120 = 2144、左上 = 2144 - 12
    const base = stubEnemy('base', 2144 - 12, 880);
    base.width = 24;
    base.height = 32;
    const world = makeWorld({ enemies: [base] });

    Game._drawWorld.call(world, makeFakeCtx());

    assert.equal(base.drawCount, 1);
});

test('地雷も同じ判定で間引く', () => {
    const inside = stubEnemy('mineIn', 1500, 880);
    const outside = stubEnemy('mineOut', 4000, 880);
    const world = makeWorld({ landmines: [inside, outside] });

    Game._drawWorld.call(world, makeFakeCtx());

    assert.equal(inside.drawCount, 1);
    assert.equal(outside.drawCount, 0);
});

test('画面外の敵は HP バーも描かない', () => {
    // 敵の draw を飛ばしても HP バーだけ残れば、何も無い場所にバーが浮く
    const outside = stubEnemy('outside', 4000, 880);
    const world = makeWorld({ enemies: [outside] });
    const hpBarFor = [];
    world._drawHpBarIfDamaged = (ctx, e) => { if (e) hpBarFor.push(e.name); };

    Game._drawWorld.call(world, makeFakeCtx());

    assert.deepEqual(hpBarFor, []);
});
