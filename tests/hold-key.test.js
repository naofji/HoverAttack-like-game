import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialHoldState, stepHoldKey } from '../src/js/utils/holdKey.js';

const TH = 300; // しきい値 300ms

/** down/deltaMs の並びを流して、最後の結果と履歴を返す。 */
function run(frames, thresholdMs = TH) {
  let state = initialHoldState();
  const taps = [];
  const holds = [];
  for (const [down, deltaMs] of frames) {
    const r = stepHoldKey(state, down, deltaMs, thresholdMs);
    state = r.state;
    taps.push(r.tap);
    holds.push(r.hold);
  }
  return { state, taps, holds };
}

test('押していないだけでは何も起きない', () => {
  const { taps, holds } = run([[false, 16], [false, 16]]);
  assert.deepEqual(taps, [false, false]);
  assert.deepEqual(holds, [false, false]);
});

test('しきい値未満で離すとタップ', () => {
  const { taps, holds } = run([[true, 16], [true, 16], [false, 16]]);
  assert.deepEqual(taps, [false, false, true], '離したフレームでタップになっていない');
  assert.deepEqual(holds, [false, false, false]);
});

// 押しっぱなしで毎フレーム発火すると、0.3秒ごとに解除と再開を往復してしまう。
test('しきい値を跨いだ1フレームだけ長押しが立つ', () => {
  const { holds } = run([[true, 100], [true, 100], [true, 100], [true, 100], [true, 100]]);
  assert.deepEqual(holds, [false, false, true, false, false], `holds=${holds}`);
});

test('長押しが出たあとに離してもタップにはならない', () => {
  const { taps, holds } = run([[true, 400], [false, 16]]);
  assert.deepEqual(holds, [true, false]);
  assert.deepEqual(taps, [false, false], '長押しの後にタップも発火している');
});

test('離すと状態が初期化され、次の押下はしきい値を最初から要求する', () => {
  const { state } = run([[true, 400], [false, 16]]);
  assert.deepEqual(state, initialHoldState());
  // 初期化された状態から、しきい値未満の押下では長押しにならない
  const r = stepHoldKey(state, true, 100, TH);
  assert.equal(r.hold, false);
});

test('しきい値ちょうどで長押しになる', () => {
  const { holds } = run([[true, TH]]);
  assert.deepEqual(holds, [true], '境界で発火していない');
});

test('しきい値の変更が効く', () => {
  assert.equal(run([[true, 150]], 100).holds[0], true, '短いしきい値で発火していない');
  assert.equal(run([[true, 150]], 2000).holds[0], false, '長いしきい値で発火してしまう');
});

test('元の状態を書き換えない', () => {
  const before = initialHoldState();
  stepHoldKey(before, true, 100, TH);
  assert.deepEqual(before, initialHoldState());
});

// タブを切り替えて戻ったときなど、deltaMs が跳ねる経路がある。
test('deltaMs が 0 でも巨大でも壊れない', () => {
  assert.doesNotThrow(() => stepHoldKey(initialHoldState(), true, 0, TH));
  const r = stepHoldKey(initialHoldState(), true, 100000, TH);
  assert.equal(r.hold, true);
});

test('state を渡さなくても初期状態として扱う', () => {
  const r = stepHoldKey(undefined, true, 16, TH);
  assert.equal(r.hold, false);
  assert.equal(r.state.heldMs, 16);
});
