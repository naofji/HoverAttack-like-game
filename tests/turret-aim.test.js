// 砲台（機関砲・反射ビーム）の砲身は、自機を見つけた瞬間に跳ばず、今の向きから一定の速さで
// 回してから撃つ（ユーザー指定 2026-11-05。以前は currentAngle = targetAngle の即時照準）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyTurret } from '../src/js/entities/EnemyTurret.js';
import { makeMap } from './helpers/enemy-world.js';
import { stepBarrelAngle, isBarrelAimed, wrapAngle } from '../src/js/utils/turretAim.js';
import {
  ENEMY_TURRET_TURN_SPEED, REFLECT_BEAM_TURN_SPEED, ENEMY_TURRET_AIM_TOLERANCE,
} from '../src/js/utils/Constants.js';

const UP = -Math.PI / 2;     // 床の砲台の休みの向き
const DOWN = Math.PI / 2;    // 天井の砲台の休みの向き

// ---------- 回し方（純粋関数） ----------

test('砲身は1フレームに speed ずつ、行き過ぎずに目標へ回る', () => {
  let a = UP;
  const target = 0; // 真右
  const steps = [];
  for (let i = 0; i < 100; i++) {
    const next = stepBarrelAngle(a, target, UP, 0.04);
    steps.push(next - a);
    a = next;
  }
  assert.ok(Math.abs(wrapAngle(a - target)) < 1e-9, '目標に着いていない');
  const moving = steps.filter((d) => Math.abs(d) > 1e-12);
  // 最後の1歩（端数）以外は同じ速さ
  for (const d of moving.slice(0, -1)) assert.ok(Math.abs(d - 0.04) < 1e-9, `速さが一定でない: ${d}`);
  assert.ok(moving.at(-1) <= 0.04 + 1e-9, '最後の1歩で行き過ぎた');
});

test('床の砲台は台座の側（真下）を通って回らない', () => {
  // 左やや下 → 右やや下。最短の向きだと真下（床の中）を通るが、上を回って行くこと
  let a = Math.PI - 0.15;
  const target = 0.15;
  for (let i = 0; i < 200; i++) {
    a = stepBarrelAngle(a, target, UP, 0.04);
    const fromDown = Math.abs(wrapAngle(a - DOWN));
    assert.ok(fromDown >= 0.15 - 1e-9, `砲身が床の中（真下から ${fromDown} rad）を向いた`);
  }
  assert.ok(Math.abs(wrapAngle(a - target)) < 1e-9);
});

test('天井の砲台は台座の側（真上）を通って回らない', () => {
  let a = -(Math.PI - 0.15);  // 左やや上
  const target = -0.15;       // 右やや上
  for (let i = 0; i < 200; i++) {
    a = stepBarrelAngle(a, target, DOWN, 0.04);
    assert.ok(Math.abs(wrapAngle(a - UP)) >= 0.15 - 1e-9, '砲身が天井の中を向いた');
  }
  assert.ok(Math.abs(wrapAngle(a - target)) < 1e-9);
});

test('isBarrelAimed は許容のずれの内側だけ真', () => {
  assert.equal(isBarrelAimed(0, 0.04, UP, 0.05), true);
  assert.equal(isBarrelAimed(0, 0.06, UP, 0.05), false);
});

// ---------- 砲台への配線 ----------

const ROOM = [
  '########################',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '########################',
];

function makeGame() {
  return {
    map: makeMap(ROOM), enemies: [], enemyBullets: [], particles: [], projectiles: [],
    missionsCompleted: 6,
    // 砲台の真横（右）。休みの向き（真上）から 90 度回さないと撃てない
    player: { x: 300, y: 44, width: 16, height: 16, alive: true, docked: false },
    carrier: null,
    addScore() {}, spawnDebris() {}, spawnSparks() {}, spawnExplosion() {},
  };
}

for (const [type, speed] of [['gun', ENEMY_TURRET_TURN_SPEED], ['beam', REFLECT_BEAM_TURN_SPEED]]) {
  test(`${type}: 自機を見つけても砲身は跳ばず、1フレームに ${speed} rad ずつ回る`, () => {
    const game = makeGame();
    const t = new EnemyTurret(game, 32, 40, false, type);
    const before = t.currentAngle;
    t.update();
    assert.ok(Math.abs(t.currentAngle - before) <= speed + 1e-9, `1フレームで ${t.currentAngle - before} rad 跳んだ`);
  });

  test(`${type}: 砲身が自機を向くまで撃たず、向いてから撃つ`, () => {
    const game = makeGame();
    const t = new EnemyTurret(game, 32, 40, false, type);
    t.cooldownTimer = 0; // すぐ撃てる状態にして、待つ理由を「砲身が向いていない」だけにする
    const cx = t.x + t.width / 2, cy = t.y + t.height / 2;
    const toPlayer = Math.atan2(game.player.y + 8 - cy, game.player.x + 8 - cx);
    const turnFrames = Math.ceil((Math.abs(wrapAngle(toPlayer - UP)) - ENEMY_TURRET_AIM_TOLERANCE) / speed);

    let firstShot = -1;
    for (let f = 1; f <= 400 && firstShot < 0; f++) {
      t.update();
      if (game.enemyBullets.length > 0) firstShot = f;
    }
    assert.ok(firstShot > 0, '撃たなかった');
    assert.ok(firstShot >= turnFrames, `砲身が向く前（${firstShot} フレーム目、回すのに ${turnFrames} 要る）に撃った`);
    const b = game.enemyBullets[0];
    const shotAngle = Math.atan2(b.vy, b.vx);
    // 機関砲は ±0.05 の散らばりが乗る
    assert.ok(Math.abs(wrapAngle(shotAngle - toPlayer)) <= ENEMY_TURRET_AIM_TOLERANCE + 0.05 + 1e-9, '自機の方へ撃っていない');
  });
}
