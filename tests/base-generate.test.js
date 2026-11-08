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
import { MAT_METAL } from '../src/js/world/town/chunks.js';

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

test('倍率は爆風（Town.blast）には掛からない（グレネード・爆発は今までどおり）', () => {
  const removed = (chipScale) => {
    const t = new Town([block(200, 0, 32, 200)], { createCanvas: fakeCanvas, chipScale, isSolidTile: () => true });
    const b = t.buildings[0];
    t.blast(216, 100, 150);   // グレネードの粒の数
    return b.total - b.remaining;
  };
  assert.ok(removed(1) > 0);
  assert.equal(removed(BASE_TOWN_CHIP_SCALE), removed(1));
});

/** 帯（ビーム）を左から右へ、高さを変えて通し、欠けたかけらの合計 */
function beamChipped(chipScale) {
  let sum = 0;
  for (let y = 20; y < 180; y += 7) {
    const t = new Town([block(200, 0, 32, 200)], { createCanvas: fakeCanvas, chipScale, isSolidTile: () => true });
    const beam = { townKind: 'beam', isPlayerOwned: true, alive: true, exploded: false, segments: () => [{ x1: 150, y1: y, x2: 260, y2: y }] };
    t.sweepProjectile(beam);
    const b = t.buildings[0];
    sum += b.total - b.remaining;
  }
  return sum;
}

test('倍率は反射ビームの欠け方にも掛かる', () => {
  const normal = beamChipped(1), hard = beamChipped(BASE_TOWN_CHIP_SCALE);
  assert.ok(hard > 0 && hard < normal, `倍率 1 で ${normal}、0.75 で ${hard}`);
});

/** 細い部品だけの建物（弾が欠かして抜ける）に、高さを変えて弾を通し、欠けたかけらの合計 */
function thinChipped(chipScale) {
  let sum = 0;
  for (let y = 20; y < 180; y += 7) {
    const game = airWorld();
    const thin = { site: 'floor', style: 'K', kind: 'rail', x: 200, y: 0, w: 32, h: 200,
      parts: [{ x: 0, y: 0, w: 32, h: 200, color: '#5e6672', mat: MAT_METAL, solid: false }] };
    const t = new Town([thin], { createCanvas: fakeCanvas, chipScale, isSolidTile: () => true });
    game.map.town = t;
    const p = new PlayerBullet(game, 150, y, 0);
    for (let i = 0; i < 40 && p.alive; i++) { p._prevX = p.x; p._prevY = p.y; p.update(); t.sweepProjectile(p); }
    const b = t.buildings[0];
    sum += b.total - b.remaining;
  }
  return sum;
}

test('倍率は細い部品を抜ける弾の欠け方にも掛かる', () => {
  const normal = thinChipped(1), hard = thinChipped(BASE_TOWN_CHIP_SCALE);
  assert.ok(hard > 0 && hard < normal, `倍率 1 で ${normal}、0.75 で ${hard}`);
});

// ---------- 7面に組み込む（実際の地図、8シード） ----------

import { SHAPE_FULL } from '../src/js/utils/tileShape.js';

const SEVEN_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
let sevenCache = null;
async function sevenMaps() {
  if (sevenCache) return sevenCache;
  const { Map } = await import('../src/js/world/Map.js');
  sevenCache = SEVEN_SEEDS.map((s) => new Map({ rng: new SeededRNG(s) }, 6));
  return sevenCache;
}
const tilesOf = (b) => ({
  r0: Math.floor(b.y / T), r1: Math.floor((b.y + b.height - 1) / T),
  c0: Math.floor(b.x / T), c1: Math.floor((b.x + b.width - 1) / T),
});
const within = (t, a) => t.r0 >= a.r0 && t.r1 <= a.r1 && t.c0 >= a.c0 && t.c1 <= a.c1;
const touches = (t, a) => t.r0 <= a.r1 && t.r1 >= a.r0 && t.c0 <= a.c1 && t.c1 >= a.c0;

test('実際の7面: 建物はすべて施設エリアの中で、区画・開始の部屋・敵基地の部屋に掛からない', async () => {
  for (const m of await sevenMaps()) {
    assert.ok(m.town && m.town.buildings.length > 0, '7面に建物が無い');
    for (const b of m.town.buildings) {
      const t = tilesOf(b);
      assert.ok(m.facilityAreas.some((a) => within(t, a)), `施設エリアの外 ${b.kind} (${b.x},${b.y})`);
      for (const z of m.fortressZones) assert.ok(!touches(t, z), `区画に掛かる ${b.kind}`);
      for (const rc of m._reservedRects()) assert.ok(!touches(t, rc), `開始・敵基地の部屋に掛かる ${b.kind}`);
    }
  }
});

test('実際の7面: 床の建物の足元・壁の支え・天井の吊り元は、すべて四角いタイル（斜面の上に浮かない）', async () => {
  let floors = 0;
  for (const m of await sevenMaps()) {
    for (const b of m.town.buildings) {
      const t = tilesOf(b);
      // 根元・建物に重なる固いタイルは、どれも四角い
      // 床は外接矩形の全行（段の上の列では足元が r1-1 行の斜面になる。最終レビューの指摘）と、その下の行。
      // 壁・天井は外接矩形の全行。建物の外の行は根元ではないので見ない
      const span = Array.from({ length: t.r1 - t.r0 + 1 }, (_, i) => t.r0 + i);
      const rows = b.site === 'floor' ? [...span, t.r1 + 1] : span;
      for (const r of rows) {
        for (let c = t.c0; c <= t.c1; c++) {
          if (!m.isSolid(r, c)) continue;
          assert.equal(m.tileShapeAt(r, c), SHAPE_FULL, `${b.site} ${b.kind} の根元 (${r},${c}) が斜面`);
        }
      }
      if (b.site === 'floor') floors++;
    }
  }
  assert.ok(floors > 0);
});

test('実際の7面: 建物の数、爆発物なし、Town は焼ける金属で若干硬い', async () => {
  const { BASE_TOWN_CHIP_SCALE } = await import('../src/js/utils/Constants.js');
  let total = 0, areas = 0;
  for (const m of await sevenMaps()) {
    total += m.town.buildings.length;
    areas += m.facilityAreas.length;
    assert.ok(m.town.buildings.every((b) => !b.explosive), '爆発物がある');
    assert.ok(m.town.buildings.every((b) => b.style === 'K' || b.style === 'H'), '7面の系統ではない建物');
    assert.equal(m.town.metalHeat, true);
    assert.equal(m.town.chipScale, BASE_TOWN_CHIP_SCALE);
  }
  assert.ok(total >= areas, `8シードで ${total} 棟（施設エリア ${areas} 個）`);
});

test('実際の7面: 8シードのどこかでフェンスと研究室が建つ', async () => {
  const kinds = new Set();
  for (const m of await sevenMaps()) for (const b of m.town.buildings) kinds.add(b.kind);
  assert.ok(kinds.has('fence'), `フェンスが無い: ${[...kinds]}`);
  assert.ok(kinds.has('lab'), `研究室が無い: ${[...kinds]}`);
});

test('施設エリアが 0 個なら建物も 0 棟（例外にならない）', async () => {
  const [m] = await sevenMaps();
  const saved = m.facilityAreas;
  m.facilityAreas = [];
  try {
    assert.deepEqual(m._buildBaseSpecs(), []);
  } finally {
    m.facilityAreas = saved;
  }
});

test('建物を作っても game.rng を消費しない（このあと SpawnManager が使う）', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const g = { rng: new SeededRNG(5) };
  const m = new Map(g, 6);
  const state = g.rng.state;
  m._buildBaseSpecs();
  m._generateBase();
  assert.equal(g.rng.state, state);
});

test('縁の金属の帯を壊して支えを失った壁の建物は落ちる', async () => {
  for (const m of await sevenMaps()) {
    const wall = m.town.buildings.find((b) => b.site === 'wall');
    if (!wall) continue;
    // 壁の建物が張り付いているタイル（外接矩形の左端か右端の列で、固い所）を全部壊す
    const t = tilesOf(wall);
    const cols = [t.c0, t.c1].filter((c) => m.isSolid(Math.floor((wall.y + 2) / T), c));
    for (const c of cols) {
      for (let r = t.r0; r <= t.r1; r++) {
        while (m.isSolid(r, c) && m.blockHP[r][c] > 0 && m.blockHP[r][c] !== Infinity) m.damageBlock(r, c, m.blockHP[r][c]);
      }
    }
    const game = { particles: [], projectiles: [], enemyBullets: [], enemies: [], landmines: [], pickups: [], player: null, carrier: null, camera: null, canvas: null, map: m, spawnExplosion() {}, spawnSparks() {} };
    for (let i = 0; i < 5; i++) m.town.update(game);
    assert.ok(m.town.falling.length > 0 || wall.remaining < wall.total, '支えを失っても建物が残っている');
    return;
  }
  assert.fail('前提: 8シードのどこにも壁の建物が無い');
});

test('足元の判定: 左右どちらの端の列でも、根元が斜面なら置かない（左の壁に張り付く建物は右端の列が根元）', async () => {
  const [m] = await sevenMaps();
  // 斜面のタイル（固いが四角くない）で、左隣が空洞のものを探す
  let hit = null;
  for (let r = 1; r < m.rows - 1 && !hit; r++) {
    for (let c = 1; c < m.cols - 1; c++) {
      if (m.isSolid(r, c) && m.tileShapeAt(r, c) !== SHAPE_FULL && !m.isSolid(r, c - 1)) { hit = { r, c }; break; }
    }
  }
  assert.ok(hit, '前提: 斜面のタイルがある');
  const left = { site: 'wall', x: (hit.c - 1) * T, y: hit.r * T, w: 2 * T, h: T };   // 右端の列 = 斜面
  const right = { site: 'wall', x: hit.c * T, y: hit.r * T, w: 2 * T, h: T };        // 左端の列 = 斜面
  assert.equal(m._baseFootingOk(left), false, '右端の列の斜面を見ていない');
  assert.equal(m._baseFootingOk(right), false, '左端の列の斜面を見ていない');
});
