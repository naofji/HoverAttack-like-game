// heavy が落とすキットのうち、どれだけがレア版（オーバードライブ付き）か。
//
// 面が進むほどレア版を厚くしてある。artillery（重み100）が加わる6面以降は
// heavy の出現率が 25% → 12.5% に半減するので、同じ確率のままだと
// 周回シールドが付いて一番きつい面で報酬が一番薄くなってしまう。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overdriveDropChance } from '../src/js/utils/drops.js';
import {
  ATTACKER_HEAVY_OVERDRIVE_CHANCE, ATTACKER_HEAVY_OVERDRIVE_CHANCE_LATE,
  OVERDRIVE_LATE_MISSION, ATTACKER_HEAVY_DROP_CHANCE,
} from '../src/js/utils/Constants.js';

test('5面までは通常の確率', () => {
  // heavy は missionsCompleted 2（3面）から出る
  for (const mc of [0, 1, 2, 3, 4]) {
    assert.equal(overdriveDropChance(mc), ATTACKER_HEAVY_OVERDRIVE_CHANCE, `mc=${mc}`);
  }
});

test('6面以降は高い方の確率になる', () => {
  for (const mc of [OVERDRIVE_LATE_MISSION, 6, 12]) {
    assert.equal(overdriveDropChance(mc), ATTACKER_HEAVY_OVERDRIVE_CHANCE_LATE, `mc=${mc}`);
  }
});

test('missionsCompleted が未定義でも通常の確率を返す', () => {
  // game.missionsCompleted は初期化前に undefined を取りうる
  assert.equal(overdriveDropChance(undefined), ATTACKER_HEAVY_OVERDRIVE_CHANCE);
});

test('後半の方が必ず厚い', () => {
  assert.ok(ATTACKER_HEAVY_OVERDRIVE_CHANCE_LATE > ATTACKER_HEAVY_OVERDRIVE_CHANCE,
    '6面以降を厚くするための定数なのに逆転している');
});

test('レア版はハズレ側（通常のミサイル補給）を食い潰さない', () => {
  // レア版はキットの内訳を分けるだけで、ドロップ率そのものは変えない。
  // 6面以降でも通常キットが 3.0 * (1 - 0.6) = 1.2個/面 残る
  assert.equal(ATTACKER_HEAVY_DROP_CHANCE, 0.6, 'ドロップ率まで動かしている');
  assert.ok(ATTACKER_HEAVY_OVERDRIVE_CHANCE_LATE < 1,
    '全部レア版になると満タン補給の手段が消える');
});
