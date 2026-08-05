import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeathHold } from '../src/js/systems/DeathHold.js';
import { DEATH_HOLD_FRAMES } from '../src/js/utils/Constants.js';

test('生成直後はホールドしていない', () => {
  const hold = new DeathHold(10);
  assert.equal(hold.active, false);
  assert.equal(hold.focus, null);
});

test('begin() でホールドに入り、フォーカスが撃破地点を指す', () => {
  const hold = new DeathHold(10);
  hold.begin(300, 200);
  assert.equal(hold.active, true);
  // Camera.follow() は x + width / 2 で中心を求めるので、幅・高さ 0 の点を返す
  assert.deepEqual(hold.focus, { x: 300, y: 200, width: 0, height: 0 });
});

test('ホールド中の begin() は無視され、フォーカスが上書きされない', () => {
  // 自機と母艦がほぼ同時に壊れたとき、視点が2つ目の撃破地点へ飛ばないようにする
  const hold = new DeathHold(10);
  hold.begin(300, 200);
  hold.tick();
  hold.begin(900, 50);
  assert.deepEqual(hold.focus, { x: 300, y: 200, width: 0, height: 0 });
});

test('規定 tick 数ぶん回すと、ちょうどその tick で解除される', () => {
  const frames = 5;
  const hold = new DeathHold(frames);
  hold.begin(0, 0);
  for (let i = 0; i < frames - 1; i++) {
    assert.equal(hold.tick(), false, `${i + 1} tick 目で早く解除された`);
    assert.equal(hold.active, true);
  }
  assert.equal(hold.tick(), true, '最後の tick で解除されない');
  assert.equal(hold.active, false);
  assert.equal(hold.focus, null);
});

test('解除された後の tick() は false を返し続ける', () => {
  const hold = new DeathHold(1);
  hold.begin(0, 0);
  assert.equal(hold.tick(), true);
  assert.equal(hold.tick(), false);
  assert.equal(hold.tick(), false);
});

test('ホールドしていないときの tick() は false で副作用が無い', () => {
  const hold = new DeathHold(10);
  assert.equal(hold.tick(), false);
  assert.equal(hold.active, false);
  assert.equal(hold.focus, null);
});

test('clear() で即座に解除される', () => {
  const hold = new DeathHold(100);
  hold.begin(300, 200);
  hold.clear();
  assert.equal(hold.active, false);
  assert.equal(hold.focus, null);
});

test('解除後は再び begin() できる（次の残機でも演出が出る）', () => {
  const hold = new DeathHold(2);
  hold.begin(300, 200);
  hold.tick();
  hold.tick();
  assert.equal(hold.active, false);

  hold.begin(900, 50);
  assert.equal(hold.active, true);
  assert.deepEqual(hold.focus, { x: 900, y: 50, width: 0, height: 0 });
});

test('既定の長さは破片が消えきるまでを覆う', () => {
  // 破片の寿命は DEBRIS_LIFETIME(55) + jitter(0..20) なので最長 75 tick
  assert.ok(DEATH_HOLD_FRAMES >= 75,
    `破片が消える前にホールドが明ける: ${DEATH_HOLD_FRAMES}`);
});
