import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyDrone } from '../src/js/entities/EnemyDrone.js';
import { makeMap, makeGame, flatFloorRows } from './helpers/enemy-world.js';
import { TILE_SIZE } from '../src/js/utils/Constants.js';

test('drone stops one tile above water instead of entering it', () => {
  const map = makeMap(flatFloorRows());
  const SURFACE = 16 * TILE_SIZE;           // row 16 から下が水（床 row 20 の上4段）
  map.isWaterAtPixel = (x, y) => y >= SURFACE && y < 20 * TILE_SIZE;
  const game = makeGame(map);
  game.player = null;
  const d = new EnemyDrone(game, 5 * TILE_SIZE, 10 * TILE_SIZE);
  for (let i = 0; i < 300; i++) {
    d.vy = 2; // 毎フレーム下向きに押す（状態機械の速度を上書き）
    d._moveAndCollide();
    assert.ok(d.y + d.height <= SURFACE + 0.001, `frame ${i}: drone bottom ${d.y + d.height} entered water at ${SURFACE}`);
  }
});
