import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyDrone } from '../src/js/entities/EnemyDrone.js';
import { makeMap, makeGame, flatFloorRows } from './helpers/enemy-world.js';
import { TILE_SIZE } from '../src/js/utils/Constants.js';

/** SURFACE(px) から下が水。液面の問い合わせも同じ高さを答える */
function flood(map, SURFACE) {
  map.isWaterAtPixel = (x, y) => y >= SURFACE && y < 20 * TILE_SIZE;
  map.getSurfaceY = (r) => ((r + 1) * TILE_SIZE > SURFACE && r < 20 ? SURFACE : -1);
}

test('drone stops one tile above water instead of entering it', () => {
  const map = makeMap(flatFloorRows());
  const SURFACE = 16 * TILE_SIZE;           // row 16 から下が水（床 row 20 の上4段）
  flood(map, SURFACE);
  const game = makeGame(map);
  game.player = null;
  const d = new EnemyDrone(game, 5 * TILE_SIZE, 10 * TILE_SIZE);
  for (let i = 0; i < 300; i++) {
    d.vy = 2; // 毎フレーム下向きに押す（状態機械の速度を上書き）
    d._moveAndCollide();
    assert.ok(d.y + d.height <= SURFACE + 0.001, `frame ${i}: drone bottom ${d.y + d.height} entered water at ${SURFACE}`);
  }
});

test('drone stops at the liquid level (getSurfaceY), even when it is in the middle of a tile', () => {
  const map = makeMap(flatFloorRows());
  // 液面は水量で決まるのでタイルの途中にある。以前は水面の「行」の上辺で
  // 止めていたので、液面より最大15px 上に浮いていた
  const SURFACE = 16 * TILE_SIZE + 6;
  map.isSolidAtPixel = () => false; // 高速落下でも地形には当たらない
  flood(map, SURFACE);
  const game = makeGame(map);
  game.player = null;
  const d = new EnemyDrone(game, 5 * TILE_SIZE, 0);
  for (let i = 0; i < 300; i++) {
    d.vy = 40; // 大きな速度で一気に水面をまたぐ動きを再現する
    d._moveAndCollide();
  }
  assert.equal(d.y + d.height, SURFACE);
});
