import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEnemyConcealed } from '../src/js/utils/concealment.js';
import { SMOKE_PUFF_LIFETIME } from '../src/js/utils/Constants.js';

function puff(x, y, radius = 30, age = SMOKE_PUFF_LIFETIME * 0.2) {
  return { x, y, radius, age };
}

function enemy(x, y) {
  return { x, y, width: 16, height: 24, alive: true };
}

test('敵の中心が煙に入っていれば隠れている', () => {
  const e = enemy(100, 100);
  const cx = e.x + e.width / 2;
  const cy = e.y + e.height / 2;
  const screens = [{ puffs: [puff(cx, cy), puff(cx, cy), puff(cx, cy), puff(cx, cy)] }];
  assert.equal(isEnemyConcealed(e, screens), true);
});

test('煙の外の敵は隠れていない', () => {
  const e = enemy(500, 500);
  const screens = [{ puffs: [puff(100, 100), puff(100, 100), puff(100, 100), puff(100, 100)] }];
  assert.equal(isEnemyConcealed(e, screens), false);
});

test('煙が無ければ誰も隠れない', () => {
  assert.equal(isEnemyConcealed(enemy(100, 100), []), false);
});

test('幅の無い相手でも落ちない（基地など width を持たない敵がいる）', () => {
  assert.equal(isEnemyConcealed({ x: 100, y: 100, alive: true }, []), false);
});

test('煙の中なら artillery 本人でなくても隠れる（護衛効果）', () => {
  const guarded = enemy(104, 104);   // 発煙した機体の隣にいる別の敵
  const cx = guarded.x + guarded.width / 2;
  const cy = guarded.y + guarded.height / 2;
  const screens = [{ puffs: [puff(cx, cy), puff(cx, cy), puff(cx, cy), puff(cx, cy)] }];
  assert.equal(isEnemyConcealed(guarded, screens), true);
});
