import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withinSight } from '../src/js/utils/Physics.js';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, SIGHT_VERTICAL_BASE, SIGHT_ASPECT,
  EMERGENCY_DEFENSE_SIGHT_RANGE,
  ENEMY_TANK_SIGHT_RANGE, ENEMY_TURRET_SIGHT_RANGE, ENEMY_DRONE_SIGHT_RANGE,
  BASE_LASER_RANGE, ENEMY_ATTACKER_TYPES,
  ENEMY_BULLET_SPEED, ENEMY_BULLET_LIFETIME,
  MISSILE_SPEED, MISSILE_LIFETIME,
  ENEMY_HOMING_MISSILE_MAX_SPEED, ENEMY_HOMING_MISSILE_LIFETIME,
  PLAYER_MG_SPEED, PLAYER_MG_LIFETIME,
} from '../src/js/utils/Constants.js';

// 4:3 (1024x768) 時代の索敵係数。sightRange = 画面幅 * k。
//
// **ここは実装から導かず直書きする。** ENEMY_TANK_SIGHT_RANGE / CANVAS_WIDTH の
// ように現在の実装から k を割り戻すと、両辺が同じ実装値から作られて恒真になり、
// 係数を書き換えても落ちないテストになる（実際に一度そう書きかけた）。
const BASE_WIDTH = 1024;
const BASE_K = {
  tank: 0.4, turret: 0.5, drone: 0.7, baseLaser: 0.55,   // 単体の敵
  standard: 0.4, rival: 0.5, heavy: 0.6, artillery: 0.8, // ENEMY_ATTACKER_TYPES
};

/** 現在の実装が持っている索敵の横半径。 */
const CURRENT_SIGHT = {
  tank:      ENEMY_TANK_SIGHT_RANGE,
  turret:    ENEMY_TURRET_SIGHT_RANGE,
  drone:     ENEMY_DRONE_SIGHT_RANGE,
  baseLaser: BASE_LASER_RANGE,
  standard:  ENEMY_ATTACKER_TYPES.standard.sightRange,
  rival:     ENEMY_ATTACKER_TYPES.rival.sightRange,
  heavy:     ENEMY_ATTACKER_TYPES.heavy.sightRange,
  artillery: ENEMY_ATTACKER_TYPES.artillery.sightRange,
};

/** 浮動小数の誤差を吸収する等値判定。1366 * 0.4 は 546.4 ちょうどにならない。 */
function assertClose(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < 1e-6,
    `${message}（期待 ${expected}、実際 ${actual}）`
  );
}

test('every enemy in BASE_K is covered, and no enemy is missing', () => {
  assert.deepEqual(Object.keys(CURRENT_SIGHT).sort(), Object.keys(BASE_K).sort());
  assert.deepEqual(
    Object.keys(ENEMY_ATTACKER_TYPES).sort(),
    ['artillery', 'heavy', 'rival', 'standard'],
    'アタッカーの型が増減したら BASE_K も直すこと'
  );
});

// --- 横の力関係の保存 ---

test('the horizontal sight-to-halfwidth ratio is unchanged from 4:3', () => {
  const halfW = CANVAS_WIDTH / 2;
  for (const [name, k] of Object.entries(BASE_K)) {
    assertClose(
      CURRENT_SIGHT[name] / halfW,
      (BASE_WIDTH * k) / (BASE_WIDTH / 2),
      `${name}: 横の「索敵/半幅」の比が 4:3 から動いている`
    );
  }
});

// --- 縦の力関係の保存 ---

test('the vertical sight radius keeps its 4:3 absolute value', () => {
  for (const [name, k] of Object.entries(BASE_K)) {
    assertClose(
      CURRENT_SIGHT[name] * SIGHT_ASPECT,
      BASE_WIDTH * k,
      `${name}: 縦の索敵の絶対値が 4:3 から動いている`
    );
  }
});

test('SIGHT_VERTICAL_BASE is the 4:3 width, so the vertical side never moved', () => {
  assert.equal(SIGHT_VERTICAL_BASE, BASE_WIDTH);
});

// --- 画面比 ---

test('the canvas is 16:9 within a tenth of a percent', () => {
  const ratio = CANVAS_WIDTH / CANVAS_HEIGHT;
  assert.ok(
    Math.abs(ratio - 16 / 9) / (16 / 9) < 0.001,
    `${CANVAS_WIDTH}x${CANVAS_HEIGHT} は 16:9 から離れすぎ (${ratio})`
  );
});

// --- 射程が索敵をカバーしているか ---
//
// 発砲のゲートは索敵だけで、別途の射程チェックが無い。索敵の横半径より
// 弾の射程が短いと「撃たれるが弾が目の前で消える帯」ができる。

const RANGE_COVERAGE = [
  // [名前, 索敵の横半径, 弾の射程]
  ['tank',      ENEMY_TANK_SIGHT_RANGE,   ENEMY_BULLET_SPEED * ENEMY_BULLET_LIFETIME],
  ['turret',    ENEMY_TURRET_SIGHT_RANGE, ENEMY_BULLET_SPEED * ENEMY_BULLET_LIFETIME],
  // アタッカーは EnemyBullet ではなく素の Missile を撃つ（attacker/combat.js:_fire）
  ['standard',  ENEMY_ATTACKER_TYPES.standard.sightRange, MISSILE_SPEED * MISSILE_LIFETIME],
  ['rival',     ENEMY_ATTACKER_TYPES.rival.sightRange,    MISSILE_SPEED * MISSILE_LIFETIME],
  ['heavy',     ENEMY_ATTACKER_TYPES.heavy.sightRange,    MISSILE_SPEED * MISSILE_LIFETIME],
  // artillery だけ EnemyHomingMissile
  ['artillery', ENEMY_ATTACKER_TYPES.artillery.sightRange,
                ENEMY_HOMING_MISSILE_MAX_SPEED * ENEMY_HOMING_MISSILE_LIFETIME],
];

for (const [name, sight, reach] of RANGE_COVERAGE) {
  test(`${name}: the projectile reaches the edge of its own sight`, () => {
    assert.ok(reach >= sight, `索敵 ${sight}px に対し射程 ${reach}px しかない`);
  });
}

// ドローンは既知の例外。4:3 の時点で索敵 717 に対し弾 540 と 177px 足りて
// いない。実害が無いのは、索敵範囲いっぱいから撃たずに
// ENEMY_DRONE_HOVER_DIST_X = 180 / _Y = 120 のホバー定位置まで寄ってから
// 撃つため（実効の交戦距離は約 216px）。既存の設計なので直さない。
test('the drone is the documented exception: its bullet does not reach its sight', () => {
  const reach = ENEMY_BULLET_SPEED * ENEMY_BULLET_LIFETIME;
  assert.ok(
    reach < ENEMY_DRONE_SIGHT_RANGE,
    'ドローンが例外でなくなったなら、上のコメントごと見直すこと'
  );
});

// --- 緊急防衛の真円が、楕円の外側でも効くこと ---
//
// 総攻撃中の緊急索敵 250px は画面比と無関係な「至近距離の反応」なので、
// 楕円に混ぜず真円のまま OR で足してある（EnemyDrone / EnemyAttacker）。
// 16:9 では楕円の縦が縮むので、「楕円の外・真円の内」という点が実在する。
// そこで OR が効いていなければ、総攻撃中の敵が真上の自機を見落とす。

test('the 250px emergency circle covers points the sight ellipse misses', () => {
  const range = 100;                       // テストの偽 config が使っている値
  const ry = range * SIGHT_ASPECT;
  const dy = EMERGENCY_DEFENSE_SIGHT_RANGE - 10;  // 240: 真円の内側

  assert.ok(dy > ry, `楕円の縦半径 ${ry} より外に取れていない`);
  assert.equal(withinSight(0, dy, range), false, '楕円の外であること');
  assert.ok(
    dy * dy < EMERGENCY_DEFENSE_SIGHT_RANGE ** 2,
    '真円の内であること'
  );
});

// --- 自機側 ---

test('player weapons still outrange half the screen as they did at 4:3', () => {
  const halfW = CANVAS_WIDTH / 2;
  // 4:3 での比: ミサイル 2.11、MG 1.41
  assert.ok((MISSILE_SPEED * MISSILE_LIFETIME) / halfW >= 2.0, 'ミサイルの射程が縮んだ');
  assert.ok((PLAYER_MG_SPEED * PLAYER_MG_LIFETIME) / halfW >= 1.3, 'MG の射程が縮んだ');
});
