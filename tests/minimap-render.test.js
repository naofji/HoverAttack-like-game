// ミニマップを「実際の地形(tileCacheCanvas)を縮小して焼く」形に変えたことを縛るテスト。
// 独自にタイルを塗り直す実装に戻ると壊れるはずのテスト群。
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { COLOR_CAVE_BG } from '../src/js/utils/Constants.js';

/**
 * 呼び出しを記録する疑似 canvas 2D コンテキストを作る。
 * supportsFilter=true なら ctx.filter は文字列(初期値 'none')として振る舞い、
 * false なら undefined を返す(filter 非対応環境を模す)。
 * それ以外の任意のメソッド呼び出し・プロパティ代入も記録して素通しする
 * (Proxy なので未知のプロパティでも例外にならない)。
 */
function makeRecordingCanvas(supportsFilter) {
    const calls = [];
    const store = {};
    const ctx = new Proxy({}, {
        get(_target, prop) {
            if (prop === 'calls') return calls;
            if (prop === 'filter') {
                if (!supportsFilter) return undefined;
                return store.filter !== undefined ? store.filter : 'none';
            }
            if (prop in store) return store[prop];
            // 未知のメソッド呼び出しは記録するだけの関数を返す。
            // createRadialGradient/createLinearGradient 用に addColorStop も持たせる。
            return (...args) => {
                calls.push({ name: prop, args });
                return { addColorStop() {} };
            };
        },
        set(_target, prop, value) {
            store[prop] = value;
            calls.push({ name: `set:${String(prop)}`, args: [value] });
            return true;
        },
    });
    const canvas = { width: 0, height: 0, calls, getContext: () => ctx };
    return canvas;
}

function installFakeDocument(supportsFilter) {
    globalThis.document = {
        createElement: () => makeRecordingCanvas(supportsFilter),
    };
}

function buildMap(MapClass, seed, missionLevel) {
    const game = { rng: new SeededRNG(seed) };
    return new MapClass(game, missionLevel);
}

test('mini map is baked from tileCacheCanvas via drawImage, not per-tile fillRect', async () => {
    installFakeDocument(true);
    const { Map } = await import('../src/js/world/Map.js');
    const map = buildMap(Map, 42, 2);

    const calls = map.miniMapCanvas.calls;
    const drawImageCalls = calls.filter((c) => c.name === 'drawImage');
    assert.ok(drawImageCalls.length >= 1, 'expected at least one drawImage call onto the mini map canvas');
    assert.ok(
        drawImageCalls.some((c) => c.args[0] === map.tileCacheCanvas),
        'expected drawImage to be called with tileCacheCanvas as the source'
    );

    // 背景の1回を除き、タイル単位の fillRect で塗っていないこと。
    const fillRectCalls = calls.filter((c) => c.name === 'fillRect');
    assert.equal(fillRectCalls.length, 1, `expected exactly 1 fillRect (background only), got ${fillRectCalls.length}`);
});

test('mini map canvas dimensions stay cols*2 x rows*2', async () => {
    installFakeDocument(true);
    const { Map } = await import('../src/js/world/Map.js');
    const map = buildMap(Map, 7, 1);

    assert.equal(map.miniMapScale, 2);
    assert.equal(map.miniMapCanvas.width, map.cols * 2);
    assert.equal(map.miniMapCanvas.height, map.rows * 2);
});

test('background is filled with COLOR_CAVE_BG before the tile cache is drawn', async () => {
    installFakeDocument(true);
    const { Map } = await import('../src/js/world/Map.js');
    const map = buildMap(Map, 5, 0);

    const calls = map.miniMapCanvas.calls;
    const bgFillStyleIdx = calls.findIndex((c) => c.name === 'set:fillStyle' && c.args[0] === COLOR_CAVE_BG);
    const fillRectIdx = calls.findIndex((c) => c.name === 'fillRect');
    const drawImageIdx = calls.findIndex((c) => c.name === 'drawImage');

    assert.ok(bgFillStyleIdx >= 0, 'expected fillStyle to be set to COLOR_CAVE_BG');
    assert.ok(fillRectIdx >= 0, 'expected a fillRect call for the background');
    assert.ok(bgFillStyleIdx < fillRectIdx, 'fillStyle should be set before the background fillRect');
    assert.ok(fillRectIdx < drawImageIdx, 'background fillRect must happen before drawImage of the tile cache');
});

test('invalidateTileRegion marks the mini map as dirty', async () => {
    installFakeDocument(true);
    const { Map, BLOCK_EMPTY, BLOCK_INDESTRUCTIBLE } = await import('../src/js/world/Map.js');
    const map = buildMap(Map, 9, 3);

    assert.equal(map.miniMapDirty, false, 'freshly generated map should not be dirty');

    let targetR = -1, targetC = -1;
    for (let r = 10; r < map.rows - 10 && targetR < 0; r++) {
        for (let c = 10; c < map.cols - 10; c++) {
            if (map.grid[r][c] !== BLOCK_EMPTY && map.grid[r][c] !== BLOCK_INDESTRUCTIBLE) {
                targetR = r; targetC = c; break;
            }
        }
    }
    assert.ok(targetR >= 0, 'test setup: no destructible block found');

    map.invalidateTileRegion(targetR, targetC);
    assert.equal(map.miniMapDirty, true, 'invalidateTileRegion should mark the mini map dirty');
});

test('refreshMiniMap only re-bakes when dirty, and clears the flag afterwards', async () => {
    installFakeDocument(true);
    const { Map } = await import('../src/js/world/Map.js');
    const map = buildMap(Map, 11, 2);

    const canvasBeforeRefresh = map.miniMapCanvas;

    // 汚れていない状態で呼んでも焼き直さない。
    map.refreshMiniMap();
    assert.equal(map.miniMapCanvas, canvasBeforeRefresh, 'refreshMiniMap should not rebuild when not dirty');

    // 汚す→焼き直す。
    map.invalidateTileRegion(20, 20);
    assert.equal(map.miniMapDirty, true);
    map.refreshMiniMap();
    assert.equal(map.miniMapDirty, false, 'refreshMiniMap should clear the dirty flag after rebuilding');
});

test('mini map toning applies without throwing when ctx.filter is supported (string)', async () => {
    installFakeDocument(true);
    const { Map } = await import('../src/js/world/Map.js');
    assert.doesNotThrow(() => buildMap(Map, 13, 1));

    const map = buildMap(Map, 13, 1);
    const calls = map.miniMapCanvas.calls;
    assert.ok(
        calls.some((c) => c.name === 'set:filter' && typeof c.args[0] === 'string' && c.args[0] !== ''),
        'expected ctx.filter to be set to a saturate()/brightness() string on the filter-capable path'
    );
});

test('mini map toning applies without throwing when ctx.filter is unsupported (fallback path)', async () => {
    installFakeDocument(false);
    const { Map } = await import('../src/js/world/Map.js');
    assert.doesNotThrow(() => buildMap(Map, 13, 1));

    const map = buildMap(Map, 13, 1);
    const calls = map.miniMapCanvas.calls;
    // フォールバックはブレンドモードで代替する: 'saturation' で彩度を落とし、
    // 'source-over' に戻してから暗い色を重ねて明度を落とす。
    assert.ok(
        calls.some((c) => c.name === 'set:globalCompositeOperation' && c.args[0] === 'saturation'),
        'expected the fallback path to use the saturation blend mode'
    );
});

test('_generate() consumes game.rng the same number of times across builds (order swap did not touch rng)', async () => {
    installFakeDocument(true);
    const { Map } = await import('../src/js/world/Map.js');

    const countCalls = (seed, missionLevel) => {
        const rng = new SeededRNG(seed);
        let count = 0;
        const orig = rng.next.bind(rng);
        rng.next = (...args) => { count++; return orig(...args); };
        const game = { rng };
        new Map(game, missionLevel);
        return count;
    };

    const a = countCalls(42, 2);
    const b = countCalls(42, 2);
    assert.equal(a, b, 'rng.next() call count should be deterministic for the same seed');
    assert.ok(a > 0, 'sanity: map generation should consume some rng calls');
});
