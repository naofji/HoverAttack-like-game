// 7面の施設エリアに並べる基地の建物（壊せる町並み）。
// 設計: docs/superpowers/specs/2026-11-08-stage7-base-facilities-design.md
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TILE_SIZE as T, BLOCK_EMPTY, BLOCK_NORMAL } from '../src/js/utils/Constants.js';
import { generateTown } from '../src/js/world/town/generate.js';
import { FACTORY_THEME } from '../src/js/world/town/themes.js';

before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

// ---------- generateTown の置ける範囲（includeRects）と足元の判定（accept） ----------

/** 岩の中に、床の平らな部屋を左右に2つ掘った地図（行 8〜19 が空洞、行 20 から下が床） */
function twoRooms() {
  const rows = 40, cols = 64;
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const inA = c >= 4 && c < 28, inB = c >= 36 && c < 60;
      row.push(r >= 8 && r < 20 && (inA || inB) ? BLOCK_EMPTY : BLOCK_NORMAL);
    }
    grid.push(row);
  }
  return { grid, rows, cols };
}
const ROOM_A = { r0: 7, r1: 20, c0: 3, c1: 28 };
// 2つの部屋の中心に密な村（村の外でも少しは建つので、その差を includeRects で見る）
const VILLAGES = [{ c: 16, r: 14, radius: 20, peak: 1 }, { c: 48, r: 14, radius: 20, peak: 1 }];

function gen(seed, extra = {}) {
  const { grid, rows, cols } = twoRooms();
  return generateTown({ grid, rows, cols, rng: new SeededRNG(seed), villages: VILLAGES, theme: FACTORY_THEME, ...extra });
}

const insideRect = (s, rc) => s.x >= rc.c0 * T && s.y >= rc.r0 * T
  && s.x + s.w <= (rc.c1 + 1) * T && s.y + s.h <= (rc.r1 + 1) * T;

test('includeRects を渡すと、建物の外接矩形はどれかの矩形に収まる', () => {
  let total = 0, outsideWithout = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const specs = gen(seed, { includeRects: [ROOM_A] });
    for (const s of specs) assert.ok(insideRect(s, ROOM_A), `seed ${seed}: 矩形の外 ${s.site} (${s.x},${s.y},${s.w},${s.h})`);
    total += specs.length;
    outsideWithout += gen(seed).filter((s) => !insideRect(s, ROOM_A)).length;
  }
  assert.ok(total > 0, '矩形の中に1棟も建たない');
  assert.ok(outsideWithout > 0, '前提: 渡さなければ矩形の外（右の部屋）にも建つ');
});

test('includeRects も accept も省略したときと null を渡したときで、設計図は同じ', () => {
  for (const seed of [1, 2, 3]) {
    assert.deepEqual(gen(seed, { includeRects: null, accept: null }), gen(seed));
  }
});

test('accept が false を返した建物は置かれない', () => {
  let walls = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    walls += gen(seed).filter((s) => s.site === 'wall').length;
    const specs = gen(seed, { accept: (s) => s.site !== 'wall' });
    assert.equal(specs.filter((s) => s.site === 'wall').length, 0, `seed ${seed}`);
  }
  assert.ok(walls > 0, '前提: 渡さなければ壁の建物がある');
});

// ---------- 欠ける量の倍率（7面は若干硬め） ----------

import { Town } from '../src/js/world/town/Town.js';
import { PlayerBullet } from '../src/js/entities/PlayerBullet.js';
import { Missile } from '../src/js/entities/Missile.js';
import { fakeCanvas, block } from './helpers/town-fixtures.js';
import { BASE_TOWN_CHIP_SCALE } from '../src/js/utils/Constants.js';

function airWorld() {
  const game = {
    particles: [], landmines: [], enemies: [], projectiles: [], enemyBullets: [],
    spawnSparks() {}, spawnExplosion() {}, addScore() {},
    camera: { x: 0, y: 0, shake() {} }, canvas: { width: 800, height: 600 }, player: null, carrier: null,
  };
  game.map = {
    width: 4000, height: 4000, rows: 250, cols: 250,
    isSolid: () => false, isSolidAtPixel: () => false,
    isSolidPoint: () => false, slopeHitAlong: () => null, popOutOfRock: () => null, hasShapedTileIn: () => false,
    pixelToTile: (x, y) => ({ r: Math.floor(y / 16), c: Math.floor(x / 16) }),
    damageBlock: () => {}, destroyArea: () => 0, isWaterAtPixel: () => false,
  };
  return game;
}

/**
 * 厚い壁 x=200〜232 の町に、左から弾を1発ずつ、高さを変えて撃ち込み、抜けたかけらの合計を返す。
 * かけらは 4px 角なので、1か所だけだと半径 4px と 3px で同じ数になることがある（当たった位置しだい）。
 * 高さを変えた合計で比べる（実測: 1発あたり平均 2.65 個 → 0.75 倍で 1.73 個）
 */
function chippedBy(Cls, chipScale, ...rest) {
  let sum = 0;
  for (let y = 20; y < 180; y += 7) {
    const game = airWorld();
    const t = new Town([block(200, 0, 32, 200)], { createCanvas: fakeCanvas, chipScale, isSolidTile: () => true });
    game.map.town = t;
    const p = new Cls(game, 150, y, 0, ...rest);
    for (let i = 0; i < 60 && p.alive && !p.exploded; i++) {
      p._prevX = p.x; p._prevY = p.y; p.update(); t.sweepProjectile(p);
    }
    const b = t.buildings[0];
    sum += b.total - b.remaining;
  }
  return sum;
}

test('7面の欠ける倍率は 0.75（半径 4px → 3px。ユーザー「若干硬め」）', () => {
  assert.equal(BASE_TOWN_CHIP_SCALE, 0.75);
});

test('倍率 0.75 の町は、弾・ミサイル1発で欠けるかけらが倍率 1 より少ない（0 ではない）', () => {
  for (const [Cls, rest] of [[PlayerBullet, []], [Missile, [true]]]) {
    const normal = chippedBy(Cls, 1, ...rest);
    const hard = chippedBy(Cls, BASE_TOWN_CHIP_SCALE, ...rest);
    assert.ok(hard > 0, `${Cls.name}: 1つも欠けない`);
    assert.ok(hard < normal, `${Cls.name}: 倍率 1 で ${normal}、0.75 で ${hard}`);
  }
});

test('倍率は爆風（chip の blast）には掛からない', () => {
  const removed = (chipScale) => {
    const t = new Town([block(200, 0, 32, 200)], { createCanvas: fakeCanvas, chipScale, isSolidTile: () => true });
    const b = t.buildings[0];
    t.chip(b, 216, 100, 12, 'blast');
    return b.total - b.remaining;
  };
  assert.equal(removed(BASE_TOWN_CHIP_SCALE), removed(1));
});
