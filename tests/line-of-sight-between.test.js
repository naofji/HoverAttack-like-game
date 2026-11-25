// hasLineOfSightBetween（2つの機体の箱の中心どうしの視線）と、それを使うドローンの索敵。
//
// 砲台とドローンが同じ中身の _hasLineOfSight を1つずつ持っていたのを Physics へ寄せた（2026-11-25）。
// 砲台の側は beam-cannon.test.js の「gun 型は視線が通らないと撃たない」が縛っていたが、
// ドローンの側は視線を常に通すように壊しても落ちるテストが無かったので、ここで縛る。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasLineOfSightBetween } from '../src/js/utils/Physics.js';
import { EnemyDrone } from '../src/js/entities/EnemyDrone.js';

// 縦の壁 1本（x が 100〜110）。箱の左上どうしを結ぶ線は壁の上を抜け、中心どうしは壁に当たる
// 置き方にして、「中心ではなく左上で見る」取り違えを落とせるようにする
const wallMap = { isSolidAtPixel: (x, y) => x >= 100 && x < 110 && y >= 20 };
const box = (x, y) => ({ x, y, width: 40, height: 40 });

test('箱の中心どうしを結ぶ線が岩を通ると見えない', () => {
  // 左上どうし (40,0)→(160,0) は壁（y>=20）の上を通る。中心どうし (60,20)→(180,20) は壁に当たる
  assert.equal(hasLineOfSightBetween(box(40, 0), box(160, 0), wallMap), false);
});

test('岩が無ければ見える', () => {
  assert.equal(hasLineOfSightBetween(box(40, 0), box(160, 0), { isSolidAtPixel: () => false }), true);
});

function droneSeeing(map) {
  const player = { x: 160, y: 0, width: 40, height: 40, alive: true, docked: false };
  const game = { player, carrier: null, map };
  const drone = { x: 40, y: 0, width: 40, height: 40, game, emergencyDefense: false };
  return EnemyDrone.prototype._findTarget.call(drone);
}

test('ドローンは岩越しの自機を標的にしない', () => {
  assert.equal(droneSeeing(wallMap), null);
});

test('ドローンは岩が無ければ自機を標的にする', () => {
  assert.equal(droneSeeing({ isSolidAtPixel: () => false })?.x, 160);
});
