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
