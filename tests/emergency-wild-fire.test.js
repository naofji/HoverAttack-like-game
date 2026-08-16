// 総攻撃（緊急防衛）モード中、自機を見つけていない敵も基地の方向へ撃ち続ける挙動。
//
// **なぜ要るか**: 緊急防衛に入ると敵は基地の周囲（半径 EMERGENCY_DEFENSE_BASE_RADIUS）へ
// 向かう `return` 状態になるが、`_handleShooting()` は `aiState === 'chase'` の
// ときしか撃たない。通路が無くて基地に辿り着けない敵は、登れない壁の前で足踏み
// したまま一発も撃たない置物になっていた（実機で頻発するとの報告）。
//
// **狙いは2つ**: ⑴ 総攻撃らしい絵になる ⑵ **敵のミサイルも地形を壊す**
// （`Missile.js` の `damageBlock()` は自機の弾かどうかを見ていない）ので、
// 基地の方向へ撃たせると足止めされた敵が自分で壁を掘り、やがて近づけるようになる。
// 「通路が無くて近寄れない」という根本原因そのものが時間とともに解消される。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyAttacker } from '../src/js/entities/EnemyAttacker.js';
import { Missile } from '../src/js/entities/Missile.js';
import { Grenade } from '../src/js/entities/Grenade.js';
import { EnemyDrone } from '../src/js/entities/EnemyDrone.js';
import {
  EMERGENCY_WILD_FIRE_SPREAD, EMERGENCY_WILD_FIRE_INTERVAL_MULT,
  ENEMY_DRONE_GRENADE_CHANCE, EMERGENCY_DRONE_GRENADE_CHANCE,
} from '../src/js/utils/Constants.js';

const AIR_MAP = { isSolidAtPixel: () => false, cols: 1000, rows: 1000 };

function makeConfig(overrides = {}) {
  return {
    hp: 30, speed: 2, jumpForce: -8, score: 100,
    fireInterval: 30, sightRange: 100,
    movementType: 'stop_and_shoot', name: 'standard',
    climbStyle: 'hover', aimAccuracy: 1.0,
    ...overrides
  };
}

/** 実コンストラクタのスポーン処理を通さずに組み立てる（既存の敵テストと同じ流儀）。 */
function makeAttacker(x, y, config = makeConfig(), game = {}) {
  const a = Object.create(EnemyAttacker.prototype);
  a.game = { map: AIR_MAP, enemies: [], player: null, carrier: null,
             projectiles: [], enemyBullets: [], ...game };
  a.x = x; a.y = y; a.width = 16; a.height = 24;
  a.vx = 0; a.vy = 0;
  a.alive = true;
  a.onGround = false;
  a.config = config;
  a.hp = config.hp; a.maxHp = config.hp;
  a.maxSpeed = config.speed;
  a.facingRight = true;
  a.patrolDir = 1;
  a.fireTimer = 0;
  a.aiState = 'return';
  a.jumpCooldown = 0;
  a.homeX = x; a.homeY = y;
  a.returning = true;
  a.currentTarget = null;
  a.crouching = false; a.crouchTimer = 0;
  a.burstCount = 0; a.burstTimer = 0;
  a.frameCounter = 0;
  a.emergencyDefense = false;
  a.emergencyTargetBase = null;
  return a;
}

const BASE = { x: 600, y: 300, width: 40, height: 40 };
const BASE_CX = BASE.x + BASE.width / 2;
const BASE_CY = BASE.y + BASE.height / 2;

/** 緊急防衛中で、自機はどこにもいない（＝見つけていない）敵。 */
function stuckDefender() {
  const a = makeAttacker(100, 100);
  a.emergencyDefense = true;
  a.emergencyTargetBase = BASE;
  return a;
}

/** _handleShooting を n フレーム回して、撃たれた弾を返す。 */
function shootFor(a, n) {
  for (let i = 0; i < n; i++) a._handleShooting();
  return a.game.projectiles.concat(a.game.enemyBullets);
}

test('緊急防衛中は、自機を見つけていなくても撃つ', () => {
  const a = stuckDefender();
  assert.notEqual(a.aiState, 'chase', '前提が崩れている：交戦状態になっている');
  assert.ok(shootFor(a, 10).length > 0, '一発も撃っていない');
});

// 回帰。通常時（緊急防衛でない）に撃ち始めたら、マップ中の敵が常時発砲する
test('緊急防衛でなければ、自機を見つけていないうちは撃たない', () => {
  const a = makeAttacker(100, 100);   // emergencyDefense = false
  assert.equal(shootFor(a, 300).length, 0, '交戦していないのに撃っている');
});

test('弾は基地の方向へ飛ぶ', () => {
  const a = stuckDefender();
  const shots = shootFor(a, 200);
  assert.ok(shots.length >= 5, `弾数が足りず判定できない: ${shots.length}`);

  const cx = a.x + a.width / 2;
  const cy = a.y + a.height / 2;
  const toBase = Math.atan2(BASE_CY - cy, BASE_CX - cx);
  for (const s of shots) {
    const angle = Math.atan2(s.vy, s.vx);
    let diff = Math.abs(angle - toBase);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    assert.ok(
      diff <= EMERGENCY_WILD_FIRE_SPREAD + 1e-6,
      `基地の方向から外れすぎ: ${(diff * 180 / Math.PI).toFixed(1)}度`,
    );
  }
});

// 「見境なく撃つ」であって「狙い撃つ」ではない。全部が同じ角度だと、掘れる穴が
// 1本の線になってしまう（壁を崩すには幅が要る）
test('弾の角度にはばらつきがある（全部が同じ線に乗らない）', () => {
  const a = stuckDefender();
  const angles = shootFor(a, 400).map((s) => Math.atan2(s.vy, s.vx));
  assert.ok(angles.length >= 10, `弾数が足りず判定できない: ${angles.length}`);
  assert.ok(new Set(angles.map((v) => v.toFixed(4))).size > 3, '角度が固定されている');
});

// grenade の放物線は遠距離へ投げても手前に落ちるだけなので、見境なしの発砲では
// 使わない。artillery 以外は素の Missile に一本化する
test('artillery 以外の見境なしの発砲は、素の Missile（非誘導・非グレネード）', () => {
  for (const name of ['standard', 'rival', 'heavy']) {
    const a = stuckDefender();
    a.config = makeConfig({ name, usesGrenades: true, grenadeChance: 1.0 });
    const shots = shootFor(a, 200);
    assert.ok(shots.length > 0, `${name}: 撃っていない`);
    for (const s of shots) {
      assert.ok(s instanceof Missile, `${name}: Missile 以外が飛んでいる (${s.constructor.name})`);
    }
  }
});

// artillery は攻城型で、元々ホーミングを撃つ型。総攻撃中も型の個性を残す
// （ユーザー判断）。**壁を掘る役は他の型が担うので、道が開く効果は失われない** —
// ホーミングは _avoidObstacles() で壁を迂回するため、ほとんど地形を壊さない
test('artillery の見境なしの発砲はホーミングミサイル', () => {
  const a = stuckDefender();
  a.config = makeConfig({ name: 'artillery' });
  const shots = shootFor(a, 200);
  assert.ok(shots.length > 0, '撃っていない');
  for (const s of shots) {
    assert.equal(s.constructor.name, 'EnemyHomingMissile', `ホーミングでない (${s.constructor.name})`);
  }
});

// ホーミングであっても「基地の方向へ撃つ」ことは変わらない。自機を狙って
// 撃つのではない（追尾が始まるのは自機が240px以内に来たときだけ）
test('artillery のホーミングも基地の方向へ撃ち出される', () => {
  const a = stuckDefender();
  a.config = makeConfig({ name: 'artillery' });
  // 自機を「基地とは正反対」に置く。自機を狙う実装ならここで落ちる
  a.game.player = { x: -400, y: 100, width: 16, height: 16, alive: true, docked: false };
  const shots = shootFor(a, 200);
  assert.ok(shots.length > 0, '撃っていない');

  const cx = a.x + a.width / 2;
  const cy = a.y + a.height / 2;
  const toBase = Math.atan2(BASE_CY - cy, BASE_CX - cx);
  for (const s of shots) {
    let diff = Math.abs(s.angle - toBase);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    assert.ok(
      diff <= EMERGENCY_WILD_FIRE_SPREAD + 1e-6,
      `基地の方向から外れすぎ: ${(diff * 180 / Math.PI).toFixed(1)}度`,
    );
  }
});

test('artillery でもしゃがみ→バーストの手順には入らない', () => {
  const a = stuckDefender();
  a.config = makeConfig({ name: 'artillery' });
  shootFor(a, 50);
  assert.equal(a.crouching, false, 'しゃがみに入っている');
  assert.equal(a.burstCount, 0, 'バーストに入っている');
});

test('発射間隔は fireInterval × EMERGENCY_WILD_FIRE_INTERVAL_MULT', () => {
  const a = stuckDefender();
  const expected = Math.round(a.config.fireInterval * EMERGENCY_WILD_FIRE_INTERVAL_MULT);
  const frames = 600;
  const shots = shootFor(a, frames).length;
  // 1発目は fireTimer=0 から始まるので即発。以降は expected フレームおき
  const predicted = 1 + Math.floor((frames - 1) / expected);
  assert.equal(shots, predicted, `発射回数が想定と違う（間隔 ${expected} フレーム想定）`);
});

// 自機を見つけたら、従来どおりの交戦に戻ること（見境なし撃ちに居座らない）
test('自機を見つけたら通常の交戦（chase）の撃ち方に戻る', () => {
  const a = stuckDefender();
  a.config = makeConfig({ name: 'artillery' });
  a.aiState = 'chase';
  a.game.player = { x: 120, y: 100, width: 16, height: 16, alive: true, docked: false };
  shootFor(a, 5);
  // artillery は交戦中ならしゃがみ→バーストの手順に入る
  assert.equal(a.crouching, true, '交戦状態なのに artillery のしゃがみに入っていない');
});

// ============================================
// ドローン: 総攻撃中はグレネードを落としやすくなる
// ============================================
//
// ドローンは飛ぶので「通路が無くて基地に辿り着けない」ことは起きない。
// 代わりに**グレネードは map.destroyArea() で面（半径2タイル）を吹き飛ばす**ので、
// 単発ミサイルが1タイルずつしか削れないのに比べて壁を開ける効率が桁違いに高い。
// 飛んで地上ユニットが行けない場所の上空まで出られる点でも、掘る役に向いている。
//
// なお `_executeAttack()` に到達するには `_findTarget()` が自機を返す必要がある
// （視界内かつ視線が通る）ので、**グレネードが増えるのは自機の近くだけ**。
// 地上ユニットの「マップの隅で足止め」とは別の場所で効く。

/** Math.random を固定値に差し替えて fn を走らせる。乱数任せの統計テストは書かない。 */
function withRandom(value, fn) {
  const saved = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = saved; }
}

function makeDrone(emergency) {
  const d = Object.create(EnemyDrone.prototype);
  d.game = { map: AIR_MAP, enemies: [], player: null, carrier: null,
             projectiles: [], enemyBullets: [] };
  d.x = 100; d.y = 100; d.width = 24; d.height = 16;
  d.targetAngle = 0;
  d.emergencyDefense = emergency;
  d.emergencyTargetBase = emergency ? BASE : null;
  return d;
}

/** その抽選値で撃ったものがグレネードなら true。 */
function dropsGrenade(emergency, roll) {
  const d = makeDrone(emergency);
  withRandom(roll, () => d._executeAttack());
  return d.game.projectiles.some((p) => p instanceof Grenade);
}

test('通常時のグレネード率は ENEMY_DRONE_GRENADE_CHANCE のまま（回帰）', () => {
  // 境目のすぐ内側なら落とす／すぐ外側なら落とさない
  assert.equal(dropsGrenade(false, ENEMY_DRONE_GRENADE_CHANCE - 0.001), true, '境目の内側で落としていない');
  assert.equal(dropsGrenade(false, ENEMY_DRONE_GRENADE_CHANCE + 0.001), false, '境目の外側で落としている');
});

test('総攻撃中はグレネード率が EMERGENCY_DRONE_GRENADE_CHANCE に上がる', () => {
  assert.equal(dropsGrenade(true, EMERGENCY_DRONE_GRENADE_CHANCE - 0.001), true, '境目の内側で落としていない');
  assert.equal(dropsGrenade(true, EMERGENCY_DRONE_GRENADE_CHANCE + 0.001), false, '境目の外側で落としている');
});

// 「上がる」ことそのものを縛る。定数を下げてしまったら気づけるように
test('総攻撃中のグレネード率は通常時より高い', () => {
  assert.ok(
    EMERGENCY_DRONE_GRENADE_CHANCE > ENEMY_DRONE_GRENADE_CHANCE,
    `総攻撃中の方が低い: ${EMERGENCY_DRONE_GRENADE_CHANCE} <= ${ENEMY_DRONE_GRENADE_CHANCE}`,
  );
  // 全弾グレネードにするとドローンの性格が変わってしまう
  assert.ok(EMERGENCY_DRONE_GRENADE_CHANCE < 1.0, 'グレネードしか落とさなくなっている');
});

// 通常時に落とさない抽選値でも、総攻撃中なら落とす＝率が実際に効いている
test('通常時は落とさない抽選値でも、総攻撃中なら落とす', () => {
  const roll = (ENEMY_DRONE_GRENADE_CHANCE + EMERGENCY_DRONE_GRENADE_CHANCE) / 2;
  assert.equal(dropsGrenade(false, roll), false, '通常時に落としている');
  assert.equal(dropsGrenade(true, roll), true, '総攻撃中に落としていない');
});
