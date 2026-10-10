// ============================================
// 流れの記録（waterStream.js）と、それを書くシミュレーション・読む判定のテスト
// ============================================
//
// 落下が毎フレームになると、細い滝は水量1の粒が3マスおきに並んだものになる。
// 「細い流れがついさっき通ったセル」を記録し、空でも滝とみなして1本につなぐ。
// 設計: docs/superpowers/specs/2026-10-10-water-fast-fall-design.md

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordFall, decayStream } from '../src/js/world/waterStream.js';
import { stepWaterSimulation } from '../src/js/world/waterSimulation.js';
import { WATER_STREAM_HOLD_FRAMES, WATER_STREAM_MAX_FLOW } from '../src/js/utils/Constants.js';
import { rebuildWaterCache, classifyWaterColumn, WATER_FALL, WATER_NONE } from '../src/js/world/waterQuery.js';

test('細い流れ（量 WATER_STREAM_MAX_FLOW 以下）は、落ちた元と先の両方に記録を残す', () => {
    const hold = new Uint8Array(10);
    const live = new Set();
    recordFall(hold, live, 2, 7, WATER_STREAM_MAX_FLOW);
    assert.equal(hold[2], WATER_STREAM_HOLD_FRAMES);
    assert.equal(hold[7], WATER_STREAM_HOLD_FRAMES);
    assert.deepEqual([...live].sort((a, b) => a - b), [2, 7]);
});

test('塊（量が WATER_STREAM_MAX_FLOW を超える落下）は記録しない', () => {
    const hold = new Uint8Array(10);
    const live = new Set();
    recordFall(hold, live, 2, 7, WATER_STREAM_MAX_FLOW + 1);
    assert.deepEqual([...hold], new Array(10).fill(0));
    assert.equal(live.size, 0);
});

test('記録は1フレームに1ずつ減り、0 になったフレームにだけそのセルを返す', () => {
    const hold = new Uint8Array(10);
    const live = new Set();
    recordFall(hold, live, 2, 7, 1);
    for (let f = 1; f < WATER_STREAM_HOLD_FRAMES; f++) {
        assert.deepEqual(decayStream(hold, live), [], `${f} フレーム目にはまだ切れない`);
    }
    assert.deepEqual(decayStream(hold, live).sort((a, b) => a - b), [2, 7]);
    assert.equal(live.size, 0);
    assert.equal(hold[2], 0);
    assert.deepEqual(decayStream(hold, live), [], '切れた後は何も返さない');
});

test('記録が残っているうちにまた流れが通れば、残りは満タンに戻る', () => {
    const hold = new Uint8Array(10);
    const live = new Set();
    recordFall(hold, live, 2, 7, 1);
    decayStream(hold, live);
    decayStream(hold, live);
    recordFall(hold, live, 2, 7, 1);
    assert.equal(hold[2], WATER_STREAM_HOLD_FRAMES);
});

/** 列1だけが空いた縦穴。行 rows-1 が床 */
function shaft(rows) {
    const cols = 3;
    const isSolid = (r, c) => r < 0 || r >= rows - 1 || c !== 1;
    return { rows, cols, isSolid, water: new Uint8Array(rows * cols) };
}

test('stepWaterSimulation: 量1が落ちたら、落ちた元と先に記録を残す', () => {
    const s = shaft(7);
    s.water[1 * s.cols + 1] = 1;
    const hold = new Uint8Array(s.rows * s.cols);
    const live = new Set();
    stepWaterSimulation({
        ...s, activeCells: new Set([1 * s.cols + 1]), doFall: true, streamHold: hold, streamLive: live,
    });
    assert.equal(s.water[2 * s.cols + 1], 1, '前提: 1マス落ちた');
    assert.equal(hold[1 * s.cols + 1], WATER_STREAM_HOLD_FRAMES);
    assert.equal(hold[2 * s.cols + 1], WATER_STREAM_HOLD_FRAMES);
});

test('stepWaterSimulation: 満水のセルが2ずつ落ちるときは記録しない', () => {
    const s = shaft(7);
    s.water[1 * s.cols + 1] = 8;
    const hold = new Uint8Array(s.rows * s.cols);
    const live = new Set();
    stepWaterSimulation({
        ...s, activeCells: new Set([1 * s.cols + 1]), doFall: true, streamHold: hold, streamLive: live,
    });
    assert.equal(s.water[2 * s.cols + 1], 2, '前提: 2 落ちた');
    assert.equal(live.size, 0);
});

/** 文字の絵から水の配列を作る。'#'=岩 '.'=空 数字=水量。hold は別の絵で、数字=残りフレーム */
function fromArt(art, holdArt = null) {
    const lines = art.trim().split('\n').map((s) => s.trim());
    const rows = lines.length, cols = lines[0].length;
    const solid = new Uint8Array(rows * cols);
    const water = new Uint8Array(rows * cols);
    lines.forEach((ln, r) => [...ln].forEach((ch, c) => {
        if (ch === '#') solid[r * cols + c] = 1;
        else if (ch >= '1' && ch <= '8') water[r * cols + c] = Number(ch);
    }));
    const hold = new Uint8Array(rows * cols);
    if (holdArt) {
        holdArt.trim().split('\n').map((s) => s.trim()).forEach((ln, r) => [...ln].forEach((ch, c) => {
            if (ch >= '1' && ch <= '9') hold[r * cols + c] = Number(ch);
        }));
    }
    const isSolid = (r, c) => r < 0 || r >= rows || c < 0 || c >= cols || solid[r * cols + c] === 1;
    const kind = new Uint8Array(rows * cols);
    const surfaceY = new Int16Array(rows * cols).fill(-1);
    const paintTopY = new Int16Array(rows * cols).fill(-1);
    const foam = new Uint8Array(rows * cols);
    const foamCells = new Set();
    const ctx = { rows, cols, water, isSolid, hold, kind, surfaceY, paintTopY, foam, foamCells };
    rebuildWaterCache({ ...ctx, dirtyCols: [...Array(cols).keys()] });
    return ctx;
}

test('空のセルでも、流れの記録が残っていて真下が水を支えないなら滝', () => {
    // 列2: 水量1の粒が行1と行4にあり、あいだの行2・3は空だが流れが通ったばかり
    const t = fromArt(`
        #####
        ##1##
        ##.##
        ##.##
        ##1##
        ##.##
        #####
    `, `
        .....
        ..4..
        ..3..
        ..2..
        ..4..
        .....
        .....
    `);
    for (const r of [1, 2, 3, 4]) {
        assert.equal(t.kind[r * t.cols + 2], WATER_FALL, `行${r} が滝でない`);
    }
    assert.equal(t.kind[5 * t.cols + 2], WATER_NONE, '記録の無い空のセルは水なしのまま');
});

test('記録があっても、真下が岩か満水なら滝ではない（床の上・湖面の上）', () => {
    // (1,1) の真下は岩、(1,3) の真下は満水
    const t = fromArt(`
        #####
        #...#
        ##.8#
        #####
    `, `
        .....
        .4.4.
        .....
        .....
    `);
    assert.equal(t.kind[1 * t.cols + 1], WATER_NONE);
    assert.equal(t.kind[1 * t.cols + 3], WATER_NONE);
});

test('記録があっても満水のセルは滝ではない（落ち着いた水）', () => {
    const t = fromArt(`
        ###
        #8#
        #.#
        ###
    `, `
        ...
        .4.
        ...
        ...
    `);
    assert.notEqual(t.kind[1 * t.cols + 1], WATER_FALL);
});

test('記録のある滝のマスは泡にしない（真上が滝でない水・真下が水でも）', () => {
    // (2,1) は空で記録あり、真上 (1,1) は満水（滝でない水）、真下 (3,1) は水量3（支えない）。
    // 記録が無ければ泡のマスになる形
    const t = fromArt(`
        ###
        #8#
        #.#
        #3#
        #.#
        ###
    `, `
        ...
        ...
        .4.
        ...
        ...
        ...
    `);
    const k = 2 * t.cols + 1;
    assert.equal(t.kind[k], WATER_FALL, '前提: 滝');
    assert.equal(t.foam[k], 0);
    assert.equal(t.foamCells.has(k), false);
});

test('塊が縦穴を落ちても、その上に滝の尾が残らない（記録は細い流れだけ）', () => {
    // 幅 W の縦穴に満水の塊（4段）を置いて落とす。毎フレーム、各列で一番上の水より上に滝のセルが
    // あれば尾。量で絞らないと、W=3 で延べ195セル×フレームの尾が出た（計画作成時の試作）
    for (const W of [1, 3, 5]) {
        const rows = 24, cols = W + 2;
        const isSolid = (r, c) => r < 0 || r >= rows - 1 || c <= 0 || c >= cols - 1;
        const water = new Uint8Array(rows * cols);
        const kind = new Uint8Array(rows * cols);
        const surfaceY = new Int16Array(rows * cols).fill(-1);
        const hold = new Uint8Array(rows * cols);
        const live = new Set();
        let active = new Set();
        for (let r = 1; r <= 4; r++) for (let c = 1; c <= W; c++) { water[r * cols + c] = 8; active.add(r * cols + c); }
        let tail = 0;
        for (let f = 1; f <= 80; f++) {
            decayStream(hold, live);
            active = stepWaterSimulation({
                water, rows, cols, isSolid, activeCells: active, doFall: true, streamHold: hold, streamLive: live,
            }).nextActiveCells;
            for (let c = 0; c < cols; c++) classifyWaterColumn({ water, kind, surfaceY, rows, cols, isSolid, c, hold });
            for (let c = 1; c <= W; c++) {
                let top = 0;
                while (top < rows && water[top * cols + c] === 0) top++;
                for (let r = 0; r < top; r++) if (kind[r * cols + c] === WATER_FALL) tail++;
            }
        }
        assert.equal(tail, 0, `幅 ${W}: 塊の上に滝の尾 ${tail} セル×フレーム`);
    }
});
