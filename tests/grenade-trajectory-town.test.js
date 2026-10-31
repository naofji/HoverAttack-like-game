// ============================================
// グレネードの軌道予測線が、町（建物・木・植物）での跳ね返りを反映する
// ============================================
//
// 予測 (_calcGrenadeTrajectory) は地形用の stepGrenade だけを見ていたので、実際のグレネードが
// 建物で弾んでも、予測線は壁を素通りして向こうの地面へ着地していた（2026-11-01 ユーザー指摘）。
// 本物（Grenade.update → Town.sweepProjectile、_simulationTick と同じ順）と同じ点列になることで縛る。
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Town } from '../src/js/world/town/Town.js';
import { Grenade } from '../src/js/entities/Grenade.js';
import { CombatActions } from '../src/js/systems/CombatActions.js';
import { GRENADE_LIFETIME } from '../src/js/utils/Constants.js';
import { fakeCanvas, block } from './helpers/town-fixtures.js';
import { MAT_WOOD } from '../src/js/world/town/chunks.js';

before(() => {
    const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

/** 岩の無い広い空間（下は大きく空いている）。土の塔 x=200〜232 が1棟だけ立つ */
function world({ withTown = true, blueprints = null } = {}) {
    const game = {
        particles: [], landmines: [], enemies: [], projectiles: [], enemyBullets: [], barriers: [],
        spawnExplosion() {}, spawnSparks() {},
        player: null, carrier: null,
    };
    game.map = {
        width: 4000, height: 4000, rows: 250, cols: 250,
        isSolid: () => false, isSolidAtPixel: () => false,
        isSolidPoint: () => false, slopeHitAlong: () => null, popOutOfRock: () => null, hasShapedTileIn: () => false,
        pixelToTile: (x, y) => ({ r: Math.floor(y / 16), c: Math.floor(x / 16) }),
        destroyArea: () => 0,
        isWaterAtPixel: () => false,
    };
    const town = new Town(blueprints || [block(200, 0, 32, 400)], { createCanvas: fakeCanvas });
    if (withTown) game.map.town = town;
    return { game: Object.assign(game, CombatActions), town };
}

/** 本物のグレネードを _simulationTick と同じ順（位置の記録 → 更新 → 町）で進め、3フレームおきの点を返す */
function actualPoints(game, town, x, y, angle, speed) {
    // 敵が重なっている建物は止めない（Town.update が毎 tick 集めるのと同じ）
    const exposed = town.buildingsUnder(game.enemies.filter((e) => e.alive));
    const g = new Grenade(game, x, y, angle, speed);
    g.lifetime = 1e9;   // 寿命の爆発は予測の関心外（予測は GRENADE_LIFETIME 回で打ち切る）
    const pts = [];
    for (let i = 0; i < GRENADE_LIFETIME && g.alive; i++) {
        g._prevX = g.x; g._prevY = g.y;
        g.update();
        if (g.alive) town.sweepProjectile(g, exposed);
        if (i % 3 === 0) pts.push({ x: g.x, y: g.y });
    }
    return pts;
}

test('予測線は建物で跳ね返り、本物のグレネードと同じ点列になる', () => {
    const { game, town } = world();
    const trajectory = game._calcGrenadeTrajectory(60, 100, 0, 12);
    const actual = actualPoints(game, town, 60, 100, 0, 12);

    // 壁で弾んだ（x が増えたあと減る）ことを本物の側でも確かめておく。両方が壁を素通りして一致するのを防ぐ
    const maxX = Math.max(...actual.map((p) => p.x));
    assert.ok(maxX < 200, `本物が壁に入った: ${maxX}`);
    assert.ok(actual[actual.length - 1].x < maxX - 10, '本物が跳ね返っていない');

    const n = Math.min(trajectory.points.length, actual.length);
    assert.ok(n > 10);
    for (let i = 0; i < n; i++) {
        assert.ok(Math.abs(trajectory.points[i].x - actual[i].x) < 1e-4, `point[${i}].x ${trajectory.points[i].x} / ${actual[i].x}`);
        assert.ok(Math.abs(trajectory.points[i].y - actual[i].y) < 1e-4, `point[${i}].y`);
    }
});

test('町の無い面では、これまでどおり壁（なし）を通らず放物線のまま', () => {
    const { game } = world({ withTown: false });
    const trajectory = game._calcGrenadeTrajectory(60, 100, 0, 12);
    assert.ok(Math.max(...trajectory.points.map((p) => p.x)) > 232, '町が無いのに止まっている');
});

test('予測しても町の状態（建物の欠け・火）は変わらない', () => {
    const { game, town } = world();
    const b = town.buildings[0];
    const before = b.remaining;
    game._calcGrenadeTrajectory(60, 100, 0, 12);
    assert.equal(b.remaining, before);
});

test('撃った位置に重なる建物は予測でも無視する（本物と同じに、目の前の壁で跳ね返らない）', () => {
    const { game, town } = world();
    // 塔の中から右へ投げる。本物は発射位置に重なる建物を無視するので、抜けて飛ぶ
    const trajectory = game._calcGrenadeTrajectory(210, 100, 0, 6);
    const actual = actualPoints(game, town, 210, 100, 0, 6);
    const n = Math.min(trajectory.points.length, actual.length);
    for (let i = 0; i < n; i++) {
        assert.ok(Math.abs(trajectory.points[i].x - actual[i].x) < 1e-4, `point[${i}].x`);
    }
});

test('敵が重なっている建物は、予測でも本物と同じに止めない（弾が的に届く）', () => {
    const { game, town } = world();
    // 塔のすぐ手前に立つ敵。塔と重なるので、本物の自機側の弾は塔に止められない
    game.enemies.push({ alive: true, x: 190, y: 90, width: 30, height: 30 });
    const trajectory = game._calcGrenadeTrajectory(60, 100, 0, 12);
    const actual = actualPoints(game, town, 60, 100, 0, 12);
    assert.ok(Math.max(...actual.map((p) => p.x)) > 232, '本物が敵の後ろの塔を抜けていない（前提が崩れている）');
    const n = Math.min(trajectory.points.length, actual.length);
    for (let i = 0; i < n; i++) {
        assert.ok(Math.abs(trajectory.points[i].x - actual[i].x) < 1e-4, `point[${i}].x`);
    }
});

test('同じ建物の空きのかけらを通ってから厚い壁に当たっても、予測は本物と同じに跳ね返る', () => {
    // 手すり（細い・x=200〜204）の奥に厚い壁（x=216〜240）がある1棟。弾は発射位置が建物の外なので、
    // この建物を無視しない。予測の弾を毎ステップ作り直すと、手すりの中の点が「発射位置」になり、奥の壁を素通りする
    const rail = {
        site: 'floor', style: 'A', kind: 'tower', x: 200, y: 0, w: 40, h: 400,
        parts: [
            { x: 0, y: 0, w: 4, h: 400, color: '#4a3418', mat: MAT_WOOD, solid: false },
            { x: 16, y: 0, w: 24, h: 400, color: '#7d5a2a', mat: MAT_WOOD, solid: true },
        ],
    };
    const { game, town } = world({ blueprints: [rail] });
    const trajectory = game._calcGrenadeTrajectory(100, 100, 0, 5);
    const actual = actualPoints(game, town, 100, 100, 0, 5);
    assert.ok(Math.max(...actual.map((p) => p.x)) < 216, '本物が奥の壁に入った（前提が崩れている）');
    const n = Math.min(trajectory.points.length, actual.length);
    assert.ok(n > 10);
    for (let i = 0; i < n; i++) {
        assert.ok(Math.abs(trajectory.points[i].x - actual[i].x) < 1e-4, `point[${i}].x ${trajectory.points[i].x} / ${actual[i].x}`);
    }
});
