// Minimal world mocks for EnemyAttacker simulation tests
import { TILE_SIZE, ENEMY_ATTACKER_TYPES } from '../../src/js/utils/Constants.js';
import { EnemyAttacker } from '../../src/js/entities/EnemyAttacker.js';
import { Map as GameMap } from '../../src/js/world/Map.js';
import { computeTileShape } from '../../src/js/utils/tileShape.js';

// 形で当てる問い合わせは本物の Map のメソッドをそのまま借りる（偽地図だけ別の経路を
// 通らないように。黙って isSolid に落とす作りにすると、テストが本番の判定を通らなくなる）
const SHAPE_QUERIES = [
  'tileShapeAt', 'isSolidPoint', 'rectHitsTerrain', 'terrainTopY', 'terrainBottomY',
  'floorSlopeAt', 'ceilingSlopeAt', 'hasShapedTileIn', 'slopeHitAlong', 'popOutOfRock',
];

/**
 * Build a map mock from ASCII rows ('#' = solid). Out of bounds is solid.
 * `waterRows`（'w' = 水）を渡すと isWater/isWaterAtPixel/getSurfaceY も使えるようになる
 * （渡さなければ既存の挙動どおり常に水なし）。
 * `options.tileShape` はタイルの形の規則（'square' が既定、5面と同じ坂は 'snowSlope'）。
 * 範囲外は本物の地図の外周と同じく磨き仕上げ（削らず、隣からは岩）として形を焼く。
 */
export function makeMap(rows, waterRows, { tileShape = 'square' } = {}) {
  const grid = rows.map((s) => s.split(''));
  const waterGrid = waterRows ? waterRows.map((s) => s.split('')) : null;
  const cellAt = (r, c) => {
    if (r < 0 || c < 0 || r >= grid.length || c >= grid[0].length) return 'polished';
    return grid[r][c] === '#' ? 'rock' : 'empty';
  };
  const tileShapes = new Uint16Array(grid.length * grid[0].length);
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[0].length; c++) tileShapes[r * grid[0].length + c] = computeTileShape(cellAt, r, c, tileShape);
  }
  const queries = {};
  for (const name of SHAPE_QUERIES) queries[name] = GameMap.prototype[name];
  return {
    ...queries,
    tileShapeRule: tileShape,
    tileShapes,
    rows: grid.length,
    cols: grid[0].length,
    isSolid(r, c) {
      if (r < 0 || c < 0 || r >= grid.length || c >= grid[0].length) return true;
      return grid[r][c] === '#';
    },
    isSolidAtPixel(x, y) {
      return this.isSolid(Math.floor(y / TILE_SIZE), Math.floor(x / TILE_SIZE));
    },
    isWater(r, c) {
      if (!waterGrid) return false;
      if (r < 0 || c < 0 || r >= waterGrid.length || c >= waterGrid[0].length) return false;
      return waterGrid[r][c] === 'w';
    },
    isWaterAtPixel(x, y) {
      return this.isWater(Math.floor(y / TILE_SIZE), Math.floor(x / TILE_SIZE));
    },
    getSurfaceY(r, c) {
      if (!this.isWater(r, c)) return -1;
      let top = r;
      while (top > 0 && this.isWater(top - 1, c)) top--;
      return top * TILE_SIZE;
    },
    pixelToTile(x, y) {
      return { r: Math.floor(y / TILE_SIZE), c: Math.floor(x / TILE_SIZE) };
    },
  };
}

/** Game mock with every property EnemyAttacker touches. */
export function makeGame(map) {
  return {
    map,
    player: null,
    carrier: null,
    enemies: [],
    projectiles: [],
    enemyBullets: [],
    missileKits: [],
    repairKits: [],
    // 破壊時の破片・フィナーレ演出が積まれる先
    particles: [],
    autoAimUnits: [],
    rng: { next: () => Math.random() },
    spawnSparks() {},
    spawnExplosion() {},
    addScore() {},
    // _popSmoke() が無条件で呼ぶので、テスト用の簡易 game にも必須（修正4で防御を外した）
    spawnSmokeScreen() {},
    // 環境。無いと motionFor が陸上へ落ちるので無くても動くが、
    // 明示しておくと「このテストは陸上」と読める
    env: null,
  };
}

/** Attacker with shooting disabled (huge fireInterval) for deterministic sims. */
export function makeAttacker(game, x, y, typeKey = 'heavy') {
  const config = { ...ENEMY_ATTACKER_TYPES[typeKey], fireInterval: 1e9 };
  const e = new EnemyAttacker(game, x, y, config);
  game.enemies.push(e);
  return e;
}

/** A 24x24 world: open air above a flat floor at row 20. */
export function flatFloorRows() {
  const rows = [];
  for (let r = 0; r < 20; r++) rows.push('.'.repeat(24));
  for (let r = 20; r < 24; r++) rows.push('#'.repeat(24));
  return rows;
}

/** 水面用。row 20 から下が水（makeMap の第2引数として渡す）。地形(rows)側はソリッド無しで使う想定。 */
export function flatWaterRows() {
  const rows = [];
  for (let r = 0; r < 20; r++) rows.push('.'.repeat(24));
  for (let r = 20; r < 24; r++) rows.push('w'.repeat(24));
  return rows;
}
