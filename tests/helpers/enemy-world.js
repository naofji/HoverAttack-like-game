// Minimal world mocks for EnemyAttacker simulation tests
import { TILE_SIZE, ENEMY_ATTACKER_TYPES } from '../../src/js/utils/Constants.js';
import { EnemyAttacker } from '../../src/js/entities/EnemyAttacker.js';

/** Build a map mock from ASCII rows ('#' = solid). Out of bounds is solid. */
export function makeMap(rows) {
  const grid = rows.map((s) => s.split(''));
  return {
    rows: grid.length,
    cols: grid[0].length,
    isSolid(r, c) {
      if (r < 0 || c < 0 || r >= grid.length || c >= grid[0].length) return true;
      return grid[r][c] === '#';
    },
    isSolidAtPixel(x, y) {
      return this.isSolid(Math.floor(y / TILE_SIZE), Math.floor(x / TILE_SIZE));
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
    autoAimUnits: [],
    rng: { next: () => Math.random() },
    spawnSparks() {},
    spawnExplosion() {},
    addScore() {},
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
