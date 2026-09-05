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

test('drone stops at the pool surface row (waterSurfaceRow), not the tile below it', () => {
  const map = makeMap(flatFloorRows());
  const SURFACE_ROW = 16;
  const SURFACE = SURFACE_ROW * TILE_SIZE;
  map.isSolidAtPixel = () => false; // 高速落下でも地形には当たらない
  map.isWaterAtPixel = (x, y) => y >= SURFACE && y < 20 * TILE_SIZE;
  // プールの縁は斜めなので、水面はタイル境界と一致するとは限らない。
  // waterSurfaceRow が返す実際の水面行で止まることを確かめる
  map.waterSurfaceRow = (r, c) => (r >= SURFACE_ROW ? SURFACE_ROW : -1);
  const game = makeGame(map);
  game.player = null;
  const d = new EnemyDrone(game, 5 * TILE_SIZE, 0);
  for (let i = 0; i < 300; i++) {
    d.vy = 40; // 大きな速度で一気に水面をまたぐ動きを再現する
    d._moveAndCollide();
  }
  assert.equal(d.y + d.height, SURFACE);
});
