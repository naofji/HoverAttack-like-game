// ============================================
// environment-sight.test.js
// ============================================
//
// 霧の面では敵の索敵と Auto Aim のスナップ半径が縮む（sightScaleFor で倍率をかける）。
// withinSight 自体は純関数のまま変えず、呼び出し側で半径をスケールしていることを確かめる。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyTank } from '../src/js/entities/EnemyTank.js';
import { makeMap, makeGame, makeAttacker, flatFloorRows } from './helpers/enemy-world.js';
import { TILE_SIZE, ENEMY_TANK_SIGHT_RANGE, FOG_SIGHT_SCALE } from '../src/js/utils/Constants.js';

const FOG = { motionAt: () => ({ speed: 1, gravity: 1, slide: 0 }), sightScale: FOG_SIGHT_SCALE };

/** 索敵の内側ぎりぎり（陸上では見える、霧では見えない）の距離に標的を置く。 */
// 霧の端（range × FOG_SIGHT_SCALE）と陸上の端（range）のちょうど中間。以前は 0.8 × range の決め打ちで、
// 倍率を 0.5 → 0.9 にしたら霧でも見える距離になって落ちた（倍率を変えても性質だけを見るため）
const BETWEEN = (1 + FOG_SIGHT_SCALE) / 2;
function placeTarget(game, dx) {
  game.player = { x: 5 * TILE_SIZE + dx, y: 20 * TILE_SIZE - 24, width: 16, height: 24, alive: true, docked: false };
}

test('tank sees a target between the fog edge and the land edge on land but not in fog', () => {
  const dx = ENEMY_TANK_SIGHT_RANGE * BETWEEN;
  for (const [env, expected] of [[null, true], [FOG, false]]) {
    const game = makeGame(makeMap(flatFloorRows()));
    game.env = env;
    game.input = { isKeyDown: () => false };
    const t = new EnemyTank(game, 5 * TILE_SIZE, 20 * TILE_SIZE - 16);
    t.patrolDir = 1;
    placeTarget(game, dx);
    const found = t._findTarget ? t._findTarget() : null;
    assert.equal(!!found, expected, `env=${env ? 'fog' : 'land'}`);
  }
});

test('attacker sight shrinks in fog', () => {
  for (const [env, expected] of [[null, 'chase'], [FOG, 'patrol']]) {
    const game = makeGame(makeMap(flatFloorRows()));
    game.env = env;
    const a = makeAttacker(game, 5 * TILE_SIZE, 20 * TILE_SIZE - 24, 'standard');
    placeTarget(game, a.config.sightRange * BETWEEN);
    a.update();
    assert.equal(a.aiState, expected, `env=${env ? 'fog' : 'land'}`);
  }
});
