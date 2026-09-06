import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { generateWaterSprings } from '../src/js/world/waterPools.js';
import { Map } from '../src/js/world/Map.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { BLOCK_EMPTY, BLOCK_NORMAL, MAX_WATER_MASS, WATER_SPRING_INTERVAL, WATERFALL_DOWNFORCE, WATERFALL_FALL_SPEED_SCALE, PLAYER_MAX_FALLING_SPEED } from '../src/js/utils/Constants.js';
import { StageEnvironment, motionFor } from '../src/js/world/StageEnvironment.js';

before(() => {
    globalThis.document = {
        createElement: () => {
            const ctx = makeFakeCtx();
            return {
                width: 0,
                height: 0,
                getContext: () => ctx,
            };
        },
    };
});

test('generateWaterSprings: 天井直下の空洞に水源を決定論的に選定する', () => {
    const rows = 20, cols = 30;
    const grid = Array.from({ length: rows }, () => new Uint8Array(cols).fill(BLOCK_NORMAL));
    // (5, 5) 〜 (10, 15) に空洞を作る
    for (let r = 5; r <= 10; r++) {
        for (let c = 5; c <= 15; c++) {
            grid[r][c] = BLOCK_EMPTY;
        }
    }
    const rooms = [{ centerR: 7, centerC: 10 }];
    const excludeRects = [];
    const rng1 = new SeededRNG(12345);
    const rng2 = new SeededRNG(12345);

    const springs1 = generateWaterSprings({ grid, rows, cols, rooms, excludeRects, rng: rng1, count: 1 });
    const springs2 = generateWaterSprings({ grid, rows, cols, rooms, excludeRects, rng: rng2, count: 1 });

    assert.equal(springs1.length, 1);
    assert.deepEqual(springs1, springs2);
    // 天井直下の空洞（r === 5）であること
    assert.equal(springs1[0].r, 5);
    // 直上がブロック、直下が空洞であること
    assert.notEqual(grid[springs1[0].r - 1][springs1[0].c], BLOCK_EMPTY);
    assert.equal(grid[springs1[0].r + 1][springs1[0].c], BLOCK_EMPTY);
});

test('Map: 水源から定期的に水が湧き出し、下へ落下して総水量が増加する', () => {
    const game = { rng: new SeededRNG(42), settings: {} };
    // 4面（missionLevel = 3）で初期化
    const map = new Map(game, 3);
    assert.equal(map.envKind, 'water');
    assert.ok(map.waterSprings && map.waterSprings.length > 0);

    let totalMassBefore = 0;
    for (let i = 0; i < map.water.length; i++) totalMassBefore += map.water[i];

    // 水源インターバル以上更新を進める
    for (let frame = 0; frame < WATER_SPRING_INTERVAL * 2; frame++) {
        map.update();
    }

    let totalMassAfter = 0;
    for (let i = 0; i < map.water.length; i++) totalMassAfter += map.water[i];

    // 水量が増加していること
    assert.ok(totalMassAfter > totalMassBefore, `Water mass should increase: before=${totalMassBefore}, after=${totalMassAfter}`);
});

test('isWaterfallAtPixel: 下に空きがある水流を滝と判定し、水底の静水は滝と判定しない', () => {
    const rows = 10, cols = 10;
    const map = {
        rows, cols,
        water: new Uint8Array(rows * cols),
        isSolid(r, c) { return r >= 8; }, // r >= 8 が床
        isWaterAtPixel(x, y) {
            const r = Math.floor(y / 16);
            const c = Math.floor(x / 16);
            return map.water[r * cols + c] > 0;
        },
    };
    // Map の isWaterfallAtPixel ロジックをテスト
    map.isWaterfallAtPixel = Map.prototype.isWaterfallAtPixel.bind(map);

    // (2, 5) に水、(3, 5) に水、(4, 5) は空気（下へ落ちる途中）
    map.water[2 * cols + 5] = MAX_WATER_MASS;
    map.water[3 * cols + 5] = 4;

    // (2, 5) と (3, 5) は滝の中
    assert.ok(map.isWaterfallAtPixel(5 * 16 + 8, 2 * 16 + 8), 'Row 2 should be waterfall');
    assert.ok(map.isWaterfallAtPixel(5 * 16 + 8, 3 * 16 + 8), 'Row 3 should be waterfall');

    // (7, 5) は床 (8, 5) の直上で満水（水たまりの底）
    map.water[7 * cols + 5] = MAX_WATER_MASS;
    assert.ok(!map.isWaterfallAtPixel(5 * 16 + 8, 7 * 16 + 8), 'Row 7 (resting on floor) should not be waterfall');
});

test('StageEnvironment: 滝の中にいる時は WATERFALL_MOTION（downforce, fallSpeedScale）が返る', () => {
    const game = {
        map: {
            isWaterAtPixel(x, y) { return true; },
            isWaterfallAtPixel(x, y) { return y < 100; }, // y < 100 は滝、y >= 100 は静水
        }
    };
    const env = new StageEnvironment(game, 3); // 4面: water

    const motionInWaterfall = env.motionAt(50, 50);
    assert.equal(motionInWaterfall.downforce, WATERFALL_DOWNFORCE);
    assert.equal(motionInWaterfall.fallSpeedScale, WATERFALL_FALL_SPEED_SCALE);

    const motionInPool = env.motionAt(50, 150);
    assert.equal(motionInPool.downforce || 0, 0);
    assert.notEqual(motionInPool.fallSpeedScale, WATERFALL_FALL_SPEED_SCALE);
});

test('Player: 滝の中では下向きのダウンフォースを受け、落下速度上限が WATERFALL_FALL_SPEED_SCALE になる', async () => {
    const { Player } = await import('../src/js/entities/Player.js');
    const game = {
        settings: {},
        camera: { x: 0, y: 0 },
        map: { isSolidAtPixel: () => false, isSolid: () => false },
        enemies: [],
        particles: [],
        input: {
            isKeyDown: () => false,
            isKeyPressed: () => false,
            mouse: { x: 0, y: 0, left: false },
            getTargetWorld: () => ({ x: 0, y: 0 }),
        },
        env: {
            motionAt: () => ({
                speed: 0.5, gravity: 0.3, slide: 0, downforce: WATERFALL_DOWNFORCE, fallSpeedScale: WATERFALL_FALL_SPEED_SCALE,
            }),
        },
    };
    const player = new Player(game, 50, 50);
    player.docked = false;
    player.onGround = false;
    player.hovering = false;
    player.vy = 0;
    player.update();
    // 重力(0.25 * 0.3 = 0.075) + downforce(0.18) = 0.255
    assert.ok(player.vy > 0.2, `vy should include downforce: got ${player.vy}`);

    // 落下速度上限テスト
    player.vy = 100;
    player.update();
    const expectedMax = PLAYER_MAX_FALLING_SPEED * WATERFALL_FALL_SPEED_SCALE;
    assert.ok(Math.abs(player.vy - expectedMax) < 1e-4, `vy clamped to waterfall max: expected ${expectedMax}, got ${player.vy}`);
});

test('water.js: 離れて2層存在する水ブロックがある場合、それぞれの空気直下のトップが水面になる', async () => {
    const { createWaterRenderer } = await import('../src/js/world/environment/water.js');
    const rows = 15, cols = 10;
    const water = new Uint8Array(rows * cols);
    // 上層の池: r = 3..4, c = 2..5 (r = 3 の上が空気)
    for (let r = 3; r <= 4; r++) for (let c = 2; c <= 5; c++) water[r * cols + c] = 8;
    // 中間 (r = 5..8) は空気
    // 下層の池: r = 9..11, c = 2..5 (r = 9 の上が空気)
    for (let r = 9; r <= 11; r++) for (let c = 2; c <= 5; c++) water[r * cols + c] = 8;

    const map = {
        rows, cols, width: cols * 16, height: rows * 16, water, waterCells: [],
        isWater: (r, c) => r >= 0 && r < rows && c >= 0 && c < cols && water[r * cols + c] > 0,
        isSolid: () => false,
        isWaterfallAtPixel: () => false,
    };
    const env = { game: { map } };
    const renderer = createWaterRenderer(env);

    const ctx = makeFakeCtx();
    renderer.drawOverWorld(ctx, 0, 0);

    // 水面線の moveTo が上層の池（r=3）と下層の池（r=9）でそれぞれ呼ばれ、2層とも描画されること
    const moveCalls = ctx.calls.filter((c) => c.name === 'moveTo');
    assert.equal(moveCalls.length, 2, '2つの独立した水たまりでそれぞれ1つずつ水面線が開始されるべき');
    // 1つ目の水面は r=3 (y ≈ 48px)、2つ目の水面は r=9 (y ≈ 144px) 付近
    assert.ok(Math.abs(moveCalls[0].args[1] - 48) < 10, `上層の水面高さが違う: ${moveCalls[0].args[1]}`);
    assert.ok(Math.abs(moveCalls[1].args[1] - 144) < 10, `下層の水面高さが違う: ${moveCalls[1].args[1]}`);
});

test('water.js: 横方向に広がった水面セグメントは各セルの水量がバラついていても平均化されて水平に描画される', async () => {
    const { createWaterRenderer } = await import('../src/js/world/environment/water.js');
    const rows = 10, cols = 10;
    const water = new Uint8Array(rows * cols);
    // r = 5, c = 2..5 に水面がある。ただし水量は 8, 4, 6, 8 とバラバラ
    water[5 * cols + 2] = 8;
    water[5 * cols + 3] = 4;
    water[5 * cols + 4] = 6;
    water[5 * cols + 5] = 8;

    const map = {
        rows, cols, width: cols * 16, height: rows * 16, water, waterCells: [],
        isWater: (r, c) => r >= 0 && r < rows && c >= 0 && c < cols && water[r * cols + c] > 0,
        isSolid: () => false,
        isWaterfallAtPixel: () => false,
    };
    const env = { game: { map } };
    const renderer = createWaterRenderer(env);

    const ctx = makeFakeCtx();
    // t=0 で波オフセットが0または規則的な状態で描画
    renderer.t = 0;
    renderer.drawOverWorld(ctx, 0, 0);

    // 1つの連続セグメントとして1本のパスが引かれること
    const moveCalls = ctx.calls.filter((c) => c.name === 'moveTo');
    assert.equal(moveCalls.length, 1, '同一水たまりでは1本の水面パス');

    // 平均水位: ( (6 - 8/8)*16 + (6 - 4/8)*16 + (6 - 6/8)*16 + (6 - 8/8)*16 ) / 4
    // = ( 80 + 88 + 84 + 80 ) / 4 = 332 / 4 = 83px
    // 起点のY座標が平均値（約83px）に波オフセットを加えた値になっていること
    const startY = moveCalls[0].args[1];
    assert.ok(Math.abs(startY - 83) < 3, `起点の水面高さが平均化されていない: got ${startY}, expected ≈ 83`);
});



