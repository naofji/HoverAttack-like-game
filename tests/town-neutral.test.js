// 町は敵の所有物ではなく中立の建物（ユーザー判断 2026-10-31）。敵のグレネード・ミサイル・弾でも、
// 爆発物（ドラム缶など）は誘爆する。地雷は敵の爆発では誘爆しない（friendly-fire.test.js）が、町は別。
// 誘爆した爆風が敵機に当たるのも、中立の建物の爆発として受け入れる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grenade } from '../src/js/entities/Grenade.js';
import { Missile } from '../src/js/entities/Missile.js';
import { TILE_SIZE, TOWN_EXPLOSIVE_DAMAGE } from '../src/js/utils/Constants.js';
import { drum, unit, world } from './helpers/town-explosive-fixtures.js';

/** world() の game に、グレネードが要る最低限の地図まわりを足す */
function withGrenadeMap(w) {
  Object.assign(w.game.map, {
    width: 10000, height: 10000,
    pixelToTile: (x, y) => ({ r: Math.floor(y / TILE_SIZE), c: Math.floor(x / TILE_SIZE) }),
  });
  w.game.addScore = () => {};
  return w;
}

test('敵のグレネードの爆風で、近くのドラム缶は誘爆する（敵機はその爆風を受ける）', () => {
  const w = withGrenadeMap(world([drum(100, 100)]));   // 中心 (104, 108)
  const b = w.town.buildings[0];
  w.game.enemies.push(unit(104, 108 - 20));
  const g = new Grenade(w.game, 104, 108, 0);
  g.isPlayerOwned = false;
  g._explode();
  w.step(40);
  assert.equal(b.exploded, true, '敵のグレネードでドラム缶が爆発していない');
  assert.deepEqual(w.game.enemies[0].hits, [TOWN_EXPLOSIVE_DAMAGE]);
});

test('敵のミサイルが当たったドラム缶は爆発する', () => {
  const w = withGrenadeMap(world([drum(100, 100, 16, 68)]));
  const b = w.town.buildings[0];
  const m = new Missile(w.game, 108, 104, 0, false);
  m.vx = 4; m.vy = 0; m._prevX = 92; m._prevY = 104;
  w.game.projectiles.push(m);
  w.town.sweepProjectile(m);
  w.step(40);
  assert.equal(m.alive, false, 'ミサイルは壁で止まる');
  assert.equal(b.exploded, true, '敵のミサイルでドラム缶が爆発していない');
});
