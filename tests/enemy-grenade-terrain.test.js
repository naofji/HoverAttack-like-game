import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grenade } from '../src/js/entities/Grenade.js';
import {
  BLOCK_EMPTY, BLOCK_NORMAL, BLOCK_HARD,
  GRENADE_BLAST_RADIUS, GRENADE_BLOCK_DAMAGE, ENEMY_GRENADE_BLOCK_DAMAGE,
  HARD_BLOCK_HP,
} from '../src/js/utils/Constants.js';

/**
 * destroyArea だけを本物で動かすための最小の盤面。
 * Map をまるごと生成すると洞窟生成の乱数が絡んで「どのタイルが硬い岩か」を
 * 決め打ちできないので、grid と blockHP だけ持つ盤面に本物のメソッドを借りる。
 */
async function makeMap(fill) {
  const { Map } = await import('../src/js/world/Map.js');
  const rows = 9, cols = 9;
  const hp = fill === BLOCK_HARD ? HARD_BLOCK_HP : 1;
  const self = {
    rows, cols,
    grid: Array.from({ length: rows }, () => new Array(cols).fill(fill)),
    blockHP: Array.from({ length: rows }, () => new Array(cols).fill(hp)),
    water: null,
    invalidateTileRegion() {},
    pixelToTile: () => ({ r: 4, c: 4 }),
  };
  self.destroyArea = Map.prototype.destroyArea.bind(self);
  self.damageBlock = Map.prototype.damageBlock.bind(self);
  return self;
}

function makeGame(map) {
  return {
    map, particles: [], enemies: [], player: null, carrier: null,
    spawnExplosion() {},
    score: 0,
    addScore(n) { this.score += n; },
  };
}

/** 爆心の周り（半径 GRENADE_BLAST_RADIUS）で空洞になったタイル数。 */
function emptied(map) {
  let n = 0;
  for (const row of map.grid) for (const b of row) if (b === BLOCK_EMPTY) n++;
  return n;
}

async function blowUp(fill, isPlayerOwned) {
  const map = await makeMap(fill);
  const game = makeGame(map);
  const g = new Grenade(game, 4 * 16, 4 * 16, 0);
  g.isPlayerOwned = isPlayerOwned;
  g._explode();
  return { map, game, emptied: emptied(map) };
}

test('前提: 敵のグレネードのブロックへのダメージは自機より小さく、硬い岩を壊せない', () => {
  assert.ok(ENEMY_GRENADE_BLOCK_DAMAGE < GRENADE_BLOCK_DAMAGE);
  assert.ok(ENEMY_GRENADE_BLOCK_DAMAGE < HARD_BLOCK_HP,
    '硬い岩(HP3)を一撃で壊せてしまうと今回の変更の意味が無い');
  assert.ok(GRENADE_BLOCK_DAMAGE >= HARD_BLOCK_HP,
    '自機のグレネードは今までどおり硬い岩を一撃で壊す');
});

test('通常岩は自機のグレネードでも敵のグレネードでも同じだけ吹き飛ぶ', async () => {
  const mine = await blowUp(BLOCK_NORMAL, true);
  const theirs = await blowUp(BLOCK_NORMAL, false);
  assert.ok(mine.emptied > 0, '自機のグレネードで穴が開いていない');
  assert.equal(theirs.emptied, mine.emptied,
    '通常岩(HP1)はダメージ1でも消えるので、掘る速度は変わらないはず');
});

test('硬い岩は自機のグレネードで消えるが、敵のグレネードでは残る', async () => {
  const mine = await blowUp(BLOCK_HARD, true);
  const theirs = await blowUp(BLOCK_HARD, false);
  assert.ok(mine.emptied > 0, '自機のグレネードで硬い岩が消えていない');
  assert.equal(theirs.emptied, 0, '敵のグレネードで硬い岩が消えている');
});

test('敵のグレネードは、硬い岩を削りはする（3発で消える）', async () => {
  const map = await makeMap(BLOCK_HARD);
  const game = makeGame(map);
  for (let i = 0; i < HARD_BLOCK_HP; i++) {
    const g = new Grenade(game, 4 * 16, 4 * 16, 0);
    g.isPlayerOwned = false;
    g._explode();
  }
  assert.ok(emptied(map) > 0,
    `敵のグレネード ${HARD_BLOCK_HP} 発でも硬い岩が消えない（壁を掘れなくなる）`);
});

test('敵のグレネードが壊した地形ではプレイヤーに点が入らない', async () => {
  const mine = await blowUp(BLOCK_NORMAL, true);
  const theirs = await blowUp(BLOCK_NORMAL, false);
  assert.ok(mine.game.score > 0, '自機のグレネードで点が入っていない');
  assert.equal(theirs.game.score, 0,
    '敵が壊した地形でプレイヤーに点が入っている');
});

test('爆風の半径は持ち主で変えていない', () => {
  // 半径まで変えると「敵のグレネードが当たらない」ように見えてしまう。
  // 変えたのはブロックへのダメージだけ、を明示しておく
  assert.equal(GRENADE_BLAST_RADIUS, 2);
});
