import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { generateWaterSprings } from '../src/js/world/waterPools.js';
import { Map } from '../src/js/world/Map.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { BLOCK_EMPTY, BLOCK_NORMAL, MAX_WATER_MASS, WATER_SPRING_INTERVAL, WATERFALL_DOWNFORCE, WATERFALL_FALL_SPEED_SCALE, PLAYER_MAX_FALLING_SPEED } from '../src/js/utils/Constants.js';
import { StageEnvironment, motionFor } from '../src/js/world/StageEnvironment.js';
import { makeWaterMap } from './helpers/water-map.js';

/**
 * 実物の Map に water[] と grid を手で入れたあと、派生キャッシュを用意する。
 * 水の無い面（missionLevel=1）として作った Map には waterKind が無いので、
 * ここで確保して全列を作り直す。
 */
function primeWaterCache(map) {
    const n = map.rows * map.cols;
    map.waterKind = new Uint8Array(n);
    map.waterSurfaceY = new Int16Array(n).fill(-1);
    map._waterIsSolid = null;
    map.dirtyWaterCols = new Set([...Array(map.cols).keys()]);
    map._rebuildWaterCacheIfDirty();
}

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

test('isWaterfallAtPixel: 満水未満が縦に連なる水流を滝と判定し、水底の静水は滝と判定しない', () => {
    // 滝の判定ルールを「自分より下のどこかに空気がある」から
    // 「**自分も直下も満水未満**」へ変えたことに追随した。旧ルールは湖底に穴が
    // 開いたときに湖を貫く縦縞を出すバグそのものだった（水が1ドットも動いて
    // いないのに、その列が水面まで全部「滝」と判定されていた）。
    // 満水セルは「落ち着いた水」として扱うので、水量8のセルは滝にならない。
    const map = makeWaterMap(`
        ##########
        ##########
        .....4....
        .....4....
        ..........
        ..........
        ..........
        .....8....
        ##########
        ##########
    `);

    // (2,5) と (3,5) は自分も直下も満水未満なので落下中
    assert.ok(map.isWaterfallAtPixel(5 * 16 + 8, 2 * 16 + 8), '(2,5) は滝の中であるべき');
    assert.ok(map.isWaterfallAtPixel(5 * 16 + 8, 3 * 16 + 8), '(3,5) は滝の中であるべき');

    // (7,5) は床 (8,5) の直上で満水（水たまりの底）
    assert.ok(!map.isWaterfallAtPixel(5 * 16 + 8, 7 * 16 + 8), '(7,5) は床の上の静水なので滝ではない');
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
    // 上層の池 (r=3..4) と下層の池 (r=9..11)。あいだの r=5..8 は空気
    const map = makeWaterMap(`
        ..........
        ..........
        ..........
        ..8888....
        ..8888....
        ..........
        ..........
        ..........
        ..........
        ..8888....
        ..8888....
        ..8888....
        ..........
        ..........
        ..........
    `);
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
    // r=5, c=2..5 に水面。水量は 8, 4, 6, 8 とバラバラ。
    // r=6 に床を敷いてあるのは、下が空気だと「落下中の水柱」と判定されて
    // 水面ではなくなるため（滝の判定ルールC）。以前のモックは isSolid が
    // 常に false で、描画側のフォールバック経路を通っていた。その経路は
    // production では使われないので削除した
    const map = makeWaterMap(`
        ..........
        ..........
        ..........
        ..........
        ..........
        ..8468....
        ##########
        ..........
        ..........
        ..........
    `);
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

test('Map.getSurfaceY & isWaterAtPixel: 横方向に繋がった水たまりで水面高さと水中判定が平均化され完全に一致する', () => {
    const rows = 10, cols = 10;
    const map = new Map({ rng: { next: () => 0 } }, 1);
    map.rows = rows;
    map.cols = cols;
    map.width = cols * 16;
    map.height = rows * 16;
    map.water = new Uint8Array(rows * cols);
    map.grid = Array.from({ length: rows }, () => new Uint8Array(cols));
    // r = 6 を床（固体ブロック）にする
    for (let c = 0; c < cols; c++) map.grid[6][c] = 1;

    // r = 5, c = 2..5 に水面。水量は 8, 4, 6, 8
    map.water[5 * cols + 2] = 8;
    map.water[5 * cols + 3] = 4;
    map.water[5 * cols + 4] = 6;
    map.water[5 * cols + 5] = 8;
    primeWaterCache(map);

    // 平均水位: ( (6 - 8/8)*16 + (6 - 4/8)*16 + (6 - 6/8)*16 + (6 - 8/8)*16 ) / 4 = 83px
    const expectedSurfaceY = 83;
    for (let c = 2; c <= 5; c++) {
        const surfaceY = map.getSurfaceY(5, c);
        assert.equal(surfaceY, expectedSurfaceY, `セル (5, ${c}) の水面高さは平均水位 83px であるべき: got ${surfaceY}`);
    }

    // isWaterAtPixel の判定: 平均水面 83px より上（y = 82）は空気、83px 以上（y = 83, 84）は水中
    for (let c = 2; c <= 5; c++) {
        const px = c * 16 + 8;
        assert.equal(map.isWaterAtPixel(px, 82), false, `y=82px は水面より上なので false であるべき (c=${c})`);
        assert.equal(map.isWaterAtPixel(px, 83), true, `y=83px は水面位置なので true であるべき (c=${c})`);
        assert.equal(map.isWaterAtPixel(px, 90), true, `y=90px は水中なので true であるべき (c=${c})`);
    }
});

test('water.js: 水ブロックの塗り（fillRect）の上端が平均水面高さと一致し、完全に水平に塗られる', async () => {
    const { createWaterRenderer } = await import('../src/js/world/environment/water.js');
    const rows = 10, cols = 10;
    const map = new Map({ rng: { next: () => 0 } }, 1);
    map.rows = rows;
    map.cols = cols;
    map.width = cols * 16;
    map.height = rows * 16;
    map.water = new Uint8Array(rows * cols);
    map.grid = Array.from({ length: rows }, () => new Uint8Array(cols));
    // r = 6 を床（固体ブロック）にする
    for (let c = 0; c < cols; c++) map.grid[6][c] = 1;

    map.waterCells = [
        [5, 2], [5, 3], [5, 4], [5, 5],
    ];

    // r = 5, c = 2..5 に水面。水量は 8, 4, 6, 8（平均 83px）
    map.water[5 * cols + 2] = 8;
    map.water[5 * cols + 3] = 4;
    map.water[5 * cols + 4] = 6;
    map.water[5 * cols + 5] = 8;
    primeWaterCache(map);

    const fillCalls = [];
    const origCreateElement = document.createElement;
    document.createElement = (tag) => {
        const el = origCreateElement.call(document, tag);
        if (tag === 'canvas') {
            const origGetContext = el.getContext;
            el.getContext = (type) => {
                const ctx = origGetContext.call(el, type);
                if (type === '2d') {
                    const origFillRect = ctx.fillRect;
                    ctx.fillRect = function(x, y, w, h) {
                        fillCalls.push({ x, y, w, h });
                        return origFillRect.apply(this, arguments);
                    };
                }
                return ctx;
            };
        }
        return el;
    };

    try {
        const env = { game: { map } };
        createWaterRenderer(env);

        // 前景 canvas の fillRect 呼び出しを抽出（y が水面付近のもの）
        const surfaceFills = fillCalls.filter((call) => Math.abs(call.y - 83) < 2);
        assert.equal(surfaceFills.length, 4, '4つの水面セルすべてが平均水位で描画されるべき');
        for (const fill of surfaceFills) {
            assert.equal(fill.y, 83, `水ブロックの上端 Y 座標は平均水位 83px に揃っているべき: got ${fill.y}`);
            assert.equal(fill.h, 96 - 83, `水ブロックの高さは 96 - 83 = 13px であるべき: got ${fill.h}`);
        }
    } finally {
        document.createElement = origCreateElement;
    }
});

test('Map.damageBlock & water.js: 水に隣接するブロックを破壊した際、下層水・前景水がクリアされ空間が水ブロックで上書きされない', async () => {
    const { createWaterRenderer } = await import('../src/js/world/environment/water.js');
    const rows = 10, cols = 10;
    const game = { rng: { next: () => 0 } };
    const map = new Map(game, 1);
    game.map = map;
    map.rows = rows;
    map.cols = cols;
    map.width = cols * 16;
    map.height = rows * 16;
    map.water = new Uint8Array(rows * cols);
    map.grid = Array.from({ length: rows }, () => new Uint8Array(cols));
    map.blockHP = Array.from({ length: rows }, () => new Uint8Array(cols));

    // (5, 2) は水ブロック、(5, 3) は隣接する岩ブロック（HP=1）
    map.water[5 * cols + 2] = 8;
    map.waterCells = [[5, 2]];
    map.grid[5][3] = 1;
    map.blockHP[5][3] = 1;

    let clearedBehind = false;
    const renderer = {
        onBlockDestroyed(r, c) {
            if (r === 5 && c === 3) clearedBehind = true;
        },
        invalidate() {},
    };
    game.env = { renderer };

    // (5, 3) のブロックを破壊
    const destroyed = map.damageBlock(5, 3, 1);
    assert.equal(destroyed, true, 'ブロックが破壊されるべき');
    assert.equal(map.grid[5][3], 0, '破壊されたセルは空洞（BLOCK_EMPTY）になるべき');
    assert.equal(clearedBehind, true, '破壊されたセルの水キャッシュ消去ハンドラが呼ばれるべき');
    // 破壊直後、まだ水流シミュレーションが届いていなければ水量は 0
    assert.equal(map.water[5 * cols + 3], 0, '破壊直後は水ブロックで空間が上書きされず 0 であるべき');
});

test('water.js: 落下中の滝セル（isWaterfallCell）は16x16のブロックではなく細い水流として描画される', async () => {
    const { createWaterRenderer } = await import('../src/js/world/environment/water.js');
    const rows = 10, cols = 10;
    const map = new Map({ rng: { next: () => 0 } }, 1);
    map.rows = rows;
    map.cols = cols;
    map.width = cols * 16;
    map.height = rows * 16;
    map.water = new Uint8Array(rows * cols);
    map.grid = Array.from({ length: rows }, () => new Uint8Array(cols));

    // (3, 5) に水量4の水。直下 (4, 5) は空気なので落下中（滝）
    map.water[3 * cols + 5] = 4;
    map.waterCells = [[3, 5]];
    primeWaterCache(map);

    const fillCalls = [];
    const origCreateElement = document.createElement;
    document.createElement = (tag) => {
        const el = origCreateElement.call(document, tag);
        if (tag === 'canvas') {
            const origGetContext = el.getContext;
            el.getContext = (type) => {
                const ctx = origGetContext.call(el, type);
                if (type === '2d') {
                    const origFillRect = ctx.fillRect;
                    ctx.fillRect = function(x, y, w, h) {
                        fillCalls.push({ x, y, w, h });
                        return origFillRect.apply(this, arguments);
                    };
                }
                return ctx;
            };
        }
        return el;
    };

    try {
        const env = { game: { map } };
        createWaterRenderer(env);

        // (3, 5) の描画（x ≈ 80px, y = 48px）
        const waterfallFill = fillCalls.find((c) => c.y === 3 * 16);
        assert.ok(waterfallFill, '滝セルの描画が行われるべき');
        assert.ok(waterfallFill.w < 16, `滝は16pxブロックではなく細水流として描画されるべき: got width ${waterfallFill.w}px`);
    } finally {
        document.createElement = origCreateElement;
    }
});

test('Map.isWaterSurface & water.js: 落下中の水（滝）は水面（液面）と判定されず、液面の線を描画しない', async () => {
    // (2,4)〜(4,4) に水量4の水柱。(5,4) から下が床。
    // 以前は Map.prototype のメソッドをプレーンなオブジェクトに bind して
    // いたが、種別は waterKind（water[] から導く要約）を読むようになったので、
    // 共通ヘルパーで同じ状況を組み立てる
    const map = makeWaterMap(`
        ..........
        ..........
        ....4.....
        ....4.....
        ....4.....
        ##########
        ##########
        ##########
        ##########
        ##########
    `);

    // 落下中のセル (2, 4), (3, 4) は絶対に水面（液面）になってはならない
    assert.equal(map.isWaterfallCell(2, 4), true, '(2, 4) は滝セルであるべき');
    assert.equal(map.isWaterSurface(2, 4), false, '(2, 4) は水面（液面）になってはならない');
    assert.equal(map.isWaterSurface(3, 4), false, '(3, 4) は水面（液面）になってはならない');

    // (4, 4) は直下が床（solid）なので着水面（水たまり表面）
    assert.equal(map.isWaterfallCell(4, 4), false, '(4, 4) は床直上のため滝ではない');
    assert.equal(map.isWaterSurface(4, 4), true, '(4, 4) は水面（液面）である');
});

test('getWaterfallPlacement: 左から水が供給される時は左端寄り、右から水が供給される時は右端寄り、空中は中央に配置される', async () => {
    const { getWaterfallPlacement } = await import('../src/js/world/environment/water.js');
    const rows = 10, cols = 10;

    // ケース1: 左から水が供給される（(2, 3) が水、(2, 4) が滝）
    const mapLeft = {
        rows, cols,
        isWater: (r, c) => (r === 2 && c === 3) || (r === 2 && c === 4),
        isSolid: () => false,
    };
    const placementLeft = getWaterfallPlacement(mapLeft, 2, 4);
    assert.equal(placementLeft.align, 'left', '左から供給される時は align=left');
    assert.equal(placementLeft.x, 4 * 16 + 1, '左端寄りに配置されるべき (offset=1)');

    // ケース2: 右から水が供給される（(2, 5) が水、(2, 4) が滝）
    const mapRight = {
        rows, cols,
        isWater: (r, c) => (r === 2 && c === 5) || (r === 2 && c === 4),
        isSolid: () => false,
    };
    const placementRight = getWaterfallPlacement(mapRight, 2, 4);
    assert.equal(placementRight.align, 'right', '右から供給される時は align=right');
    assert.equal(placementRight.x, 4 * 16 + (16 - 8 - 1), '右端寄りに配置されるべき');

    // ケース3: 空中（左右とも空気）
    const mapCenter = {
        rows, cols,
        isWater: (r, c) => (r === 2 && c === 4) || (r === 1 && c === 4),
        isSolid: () => false,
    };
    const placementCenter = getWaterfallPlacement(mapCenter, 2, 4);
    assert.equal(placementCenter.align, 'center', '空中からの落下は align=center');
    assert.equal(placementCenter.x, 4 * 16 + 4, '中央に配置されるべき (offset=4)');
});

test('water.js: drawOverWorld で滝セルの中に流下する短い筋状パーティクルと飛沫が描画される', async () => {
    const { createWaterRenderer } = await import('../src/js/world/environment/water.js');
    const rows = 10, cols = 10;
    const water = new Uint8Array(rows * cols);
    // (3, 4) に滝セル
    water[3 * cols + 4] = 4;
    const map = {
        rows, cols,
        width: cols * 16, height: rows * 16,
        water,
        waterCells: [[3, 4]],
        isWater: (r, c) => r === 3 && c === 4,
        isSolid: () => false,
        isWaterfallCell: (r, c) => r === 3 && c === 4,
        isWaterSurface: () => false,
        getWaterSurfaceSegment: () => null,
        getSurfaceY: () => -1,
    };
    const env = { game: { map } };
    const renderer = createWaterRenderer(env);

    const fillCalls = [];
    const ctx = {
        drawImage() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        fillRect(x, y, w, h) {
            fillCalls.push({ x, y, w, h });
        }
    };

    renderer.drawOverWorld(ctx, 0, 0);

    // 線状パーティクル（幅 1.5px, 長さ 6px）が描画されていること
    const streak = fillCalls.find((c) => c.w === 1.5 && c.h === 6);
    assert.ok(streak, '流下する線状パーティクルが描画されるべき');
    // 着水飛沫（幅 1.5px, 高さ 1.5px）が描画されていること
    const splash = fillCalls.find((c) => c.w === 1.5 && c.h === 1.5);
    assert.ok(splash, '着水地点の微小飛沫が描画されるべき');
});

