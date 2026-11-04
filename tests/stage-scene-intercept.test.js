// 7面の場面（面別ランキング・面セレクトの上の絵）で、自機の迎撃弾がクルーズミサイルを撃ち落とす台本。
// 以前は弾と相手が別々の周期で動き、弾が相手の今の位置へ毎フレーム補間していたので、
// 弾が止まる・跳ぶ・すり抜ける（実機の指摘）。ここでは純粋関数 interceptPhase を細かく刻んで見る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interceptPhase } from '../src/js/ui/StageScene.js';

const FROM = 150, START = 1230, END = 190;
const STEPS = 2000;
const frames = Array.from({ length: STEPS }, (_, i) => interceptPhase(i / STEPS, FROM, START, END));

test('迎撃弾は撃ってから出会うまで、右へ一定の速さで進む（止まらず、戻らず、跳ばない）', () => {
  const flying = frames.filter((f) => f.missileX !== null);
  assert.ok(flying.length > 100, '弾が飛んでいない');
  const steps = flying.slice(1).map((f, i) => f.missileX - flying[i].missileX);
  for (const d of steps) assert.ok(d > 0, '弾が止まった・戻った');
  const min = Math.min(...steps), max = Math.max(...steps);
  assert.ok(max - min < 1e-6, `弾の速さが一定でない（${min}〜${max}）`);
});

test('弾が飛んでいる最後のフレームで、弾と相手はほぼ同じ場所にいる（ちょうど出会う）', () => {
  const last = frames.filter((f) => f.missileX !== null).at(-1);
  assert.ok(Math.abs(last.missileX - last.cruiseX) < 2, `出会っていない: 弾 ${last.missileX} / 相手 ${last.cruiseX}`);
  // 出会うまで、弾は相手を追い越さない
  for (const f of frames) if (f.missileX !== null) assert.ok(f.missileX <= f.cruiseX + 1e-9, '弾が相手をすり抜けた');
});

test('撃ち落とした後は相手を描かず、爆発が出会った場所に出る。周期の頭で相手がまた現れる', () => {
  const hitIndex = frames.findIndex((f) => f.blast !== null);
  assert.ok(hitIndex > 0, '爆発が無い');
  for (const f of frames.slice(hitIndex)) assert.equal(f.cruiseX, null, '撃ち落とした後も相手が飛んでいる');
  assert.equal(frames[hitIndex - 1].cruiseX !== null, true);
  assert.equal(frames[0].cruiseX, START, '周期の頭で相手が右端に現れない');
});

test('相手は右から左へ一定の速さで飛ぶ（周期の途中で右端へ跳ばない）', () => {
  const alive = frames.filter((f) => f.cruiseX !== null);
  const steps = alive.slice(1).map((f, i) => f.cruiseX - alive[i].cruiseX);
  for (const d of steps) assert.ok(d < 0, '相手が止まった・右へ戻った');
});
