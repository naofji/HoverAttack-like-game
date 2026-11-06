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
        enemies: [], landmines: [], barriers: [], electricFloors: [], storageTowers: [],
        projectiles: [], particles: [], pickups: [],
        enemyBullets: [], smokeScreens: [],
        _applyRenderInterpolation: noop,
        _restoreRenderInterpolation: noop,
        _drawHpBarIfDamaged: noop,
        _drawGrenadeTrajectory: noop,
    };
}

test('町は機体・敵・弾のあと（前景）に描き、建物の範囲だけ地形を重ね直し、パーティクルはその手前', () => {
    const order = [];
    let view = null;
    let overRects = null;
    const rects = [{ x: 1100, y: 600, w: 16, h: 16 }];
    const town = {
        draw: (ctx, v) => { order.push('town'); view = v; },
        visibleRects: (v) => { order.push('rects'); assert.deepEqual(v, view); return rects; },
    };
    const w = makeWorld(order, town);
    w.map.drawTerrainOver = (ctx, r) => { order.push('terrainOver'); overRects = r; };
    w.player = { draw: () => order.push('player') };
    w.enemies = [{ x: 1100, y: 600, width: 10, height: 10, alive: true, draw: () => order.push('enemy') }];
    w.enemyBullets = [{ draw: () => order.push('enemyBullet') }];
    w.particles = [{ draw: () => order.push('particle') }];
    Game._drawWorld.call(w, makeFakeCtx());
    assert.deepEqual(order, ['backdrop', 'behind', 'map', 'player', 'enemy', 'enemyBullet',
        'town', 'rects', 'terrainOver', 'particle']);
    assert.deepEqual(view, { x: 1000, y: 500, w: 1024, h: 768 });
    assert.equal(overRects, rects);
});

test('町の無い面では何もしない', () => {
    const order = [];
    Game._drawWorld.call(makeWorld(order, null), makeFakeCtx());
    assert.deepEqual(order, ['backdrop', 'behind', 'map']);
});

test('町は map.update() の直後に、Game を渡して更新する', () => {
    const order = [];
    const noop = () => {};
    const g = Object.create(Game);
    Object.assign(g, {
        _snapshotPrevPositions: noop, _updateCarrier: noop, _updatePlayer: noop, _updateDeathHold: noop,
        _updateCamera: noop, _updateAndPrune: (list) => { if (list === g.enemies) order.push('enemies'); },
        _updateLandmines: noop, barriers: [], electricFloors: [], storageTowers: [], _updateBarrierSound: noop, _updateAutoAim: noop,
        _updateOverdrive: noop, env: { update: noop }, _updateEnemyHoverSound: noop,
        _checkMissionClear: noop, collisionManager: { update: noop }, _updateProximityAlert: noop,
        projectiles: [], particles: [], smokeScreens: [], pickups: [], enemies: [],
        map: { update: () => order.push('map'), town: { update: (game) => order.push(game === g ? 'town' : 'town(違う game)') } },
    });
    Game._simulationTick.call(g);
    assert.deepEqual(order, ['map', 'town', 'enemies']);
});

test('落ちる破片も描画補間に載る', () => {
    const piece = { x: 1, y: 2 };
    const seen = [];
    const g = {
        player: null, carrier: null, enemies: [], projectiles: [], enemyBullets: [],
        pickups: [], storageTowers: [],
        map: { town: { falling: [piece] } },
    };
    Game._forEachMovingEntity.call(g, (e) => seen.push(e));
    assert.deepEqual(seen, [piece]);
});
