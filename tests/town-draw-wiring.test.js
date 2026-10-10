// 町を「遠景のあと・地形の前」に描く配線。Game._drawWorld() を本物のまま呼び、
// 呼ばれた順番を記録する（ソース文字列の grep にはしない。CLAUDE.md）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { Game } from '../src/js/main.js';

function makeWorld(order, town) {
    const noop = () => {};
    return {
        gameState: 'playing',
        simAlpha: 1,
        canvas: { width: 1024, height: 768 },
        camera: { x: 1000, y: 500, renderX: () => 1000, renderY: () => 500 },
        map: { backdrop: { draw: () => order.push('backdrop') }, draw: () => order.push('map'), town },
        env: { update: noop, drawBehindTerrain: () => order.push('behind'), drawOverWorld: noop, drawOverlay: noop },
        carrier: null, player: null, flag: null, grenadeTrajectory: null,
        enemies: [], landmines: [], barriers: [],
        projectiles: [], particles: [], repairKits: [], autoAimUnits: [],
        missileKits: [], enemyBullets: [], smokeScreens: [],
        _applyRenderInterpolation: noop,
        _restoreRenderInterpolation: noop,
        _drawHpBarIfDamaged: noop,
        _drawGrenadeTrajectory: noop,
    };
}

test('町は遠景と環境の奥の描画のあと、地形の前に、画面のワールド矩形で描く', () => {
    const order = [];
    let view = null;
    const town = { draw: (ctx, v) => { order.push('town'); view = v; } };
    Game._drawWorld.call(makeWorld(order, town), makeFakeCtx());
    assert.deepEqual(order, ['backdrop', 'behind', 'town', 'map']);
    assert.deepEqual(view, { x: 1000, y: 500, w: 1024, h: 768 });
});

test('町の無い面では何もしない', () => {
    const order = [];
    Game._drawWorld.call(makeWorld(order, null), makeFakeCtx());
    assert.deepEqual(order, ['backdrop', 'behind', 'map']);
});
