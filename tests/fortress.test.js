import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';

before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }),
  };
});

test('Map は面ごとの terrain を持つ', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const cave = new Map({ rng: new SeededRNG(1) }, 0);
  const fort = new Map({ rng: new SeededRNG(1) }, 6);
  assert.equal(cave.envTerrain, 'cave');
  assert.equal(fort.envTerrain, 'fortress');
  // debugStartMission で面数を超えた値が来るので剰余で丸める（envKind と同じ）
  const wrapped = new Map({ rng: new SeededRNG(1) }, 13);
  assert.equal(wrapped.envTerrain, 'fortress');
});

import { pickFortressZones, rectsOverlap } from '../src/js/world/fortress.js';
import {
  FORTRESS_ZONE_COUNT, FORTRESS_ZONE_W_MIN, FORTRESS_ZONE_W_RANGE,
  FORTRESS_ZONE_H_MIN, FORTRESS_ZONE_H_RANGE, FORTRESS_ZONE_MARGIN,
} from '../src/js/utils/Constants.js';

/** 実寸に近い盤面の引数一式。rooms は格子状に散らす。 */
function zoneArgs(overrides = {}) {
  const rooms = [];
  for (let r = 20; r < 140; r += 15) {
    for (let c = 20; c < 290; c += 20) rooms.push({ centerR: r, centerC: c });
  }
  return {
    rows: 150, cols: 300, rooms, excludeRects: [], rng: new SeededRNG(9),
    count: FORTRESS_ZONE_COUNT,
    wMin: FORTRESS_ZONE_W_MIN, wRange: FORTRESS_ZONE_W_RANGE,
    hMin: FORTRESS_ZONE_H_MIN, hRange: FORTRESS_ZONE_H_RANGE,
    margin: FORTRESS_ZONE_MARGIN,
    ...overrides,
  };
}

test('区画は指定した数だけ取れ、互いに重ならず、盤面に収まる', () => {
  const zones = pickFortressZones(zoneArgs());
  assert.equal(zones.length, FORTRESS_ZONE_COUNT);
  for (const z of zones) {
    assert.ok(z.r0 >= FORTRESS_ZONE_MARGIN && z.c0 >= FORTRESS_ZONE_MARGIN, `はみ出し ${JSON.stringify(z)}`);
    assert.ok(z.r1 < 150 - FORTRESS_ZONE_MARGIN && z.c1 < 300 - FORTRESS_ZONE_MARGIN, `はみ出し ${JSON.stringify(z)}`);
    const w = z.c1 - z.c0 + 1;
    const h = z.r1 - z.r0 + 1;
    assert.ok(w >= FORTRESS_ZONE_W_MIN && w <= FORTRESS_ZONE_W_MIN + FORTRESS_ZONE_W_RANGE, `幅 ${w}`);
    assert.ok(h >= FORTRESS_ZONE_H_MIN && h <= FORTRESS_ZONE_H_MIN + FORTRESS_ZONE_H_RANGE, `高さ ${h}`);
  }
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      assert.equal(rectsOverlap(zones[i], zones[j]), false, `区画 ${i} と ${j} が重なっている`);
    }
  }
});

test('excludeRects と重なる区画は取らない', () => {
  // 盤面の左半分を丸ごと除外する。取れた区画は全部右半分にあるはず
  const exclude = [{ r0: 0, r1: 149, c0: 0, c1: 149 }];
  const zones = pickFortressZones(zoneArgs({ excludeRects: exclude }));
  assert.ok(zones.length > 0, '右半分に1つも置けていない');
  for (const z of zones) {
    assert.equal(rectsOverlap(z, exclude[0]), false, `除外矩形と重なっている ${JSON.stringify(z)}`);
  }
});

test('盤面全部を除外すると1つも取れない', () => {
  const zones = pickFortressZones(zoneArgs({ excludeRects: [{ r0: 0, r1: 149, c0: 0, c1: 299 }] }));
  assert.deepEqual(zones, []);
});

test('同じ rng なら同じ区画', () => {
  const a = pickFortressZones(zoneArgs({ rng: new SeededRNG(4) }));
  const b = pickFortressZones(zoneArgs({ rng: new SeededRNG(4) }));
  assert.deepEqual(a, b);
  const c = pickFortressZones(zoneArgs({ rng: new SeededRNG(5) }));
  assert.notDeepEqual(a, c);
});

test('部屋が密集していても区画は重ならない', () => {
  // 上の「盤面に収まる」テストは盤面が広く、重なり判定を外しても偶然通ってしまった。
  // 部屋を狭い範囲に固めて、判定が無ければ必ず重なる状況を作る
  const rooms = [];
  for (let r = 40; r <= 60; r += 4) {
    for (let c = 60; c <= 100; c += 4) rooms.push({ centerR: r, centerC: c });
  }
  const zones = pickFortressZones(zoneArgs({ rooms, count: 6, rng: new SeededRNG(17) }));
  assert.ok(zones.length >= 2, `密集させても区画が ${zones.length} 個しか取れない`);
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      assert.equal(rectsOverlap(zones[i], zones[j]), false,
        `区画 ${JSON.stringify(zones[i])} と ${JSON.stringify(zones[j])} が重なっている`);
    }
  }
});

import { buildZoneWalls, zoneBands } from '../src/js/world/fortress.js';
import {
  BLOCK_EMPTY, BLOCK_NORMAL, BLOCK_HARD, BLOCK_INDESTRUCTIBLE,
  FORTRESS_WALL_THICKNESS, HARD_BLOCK_HP,
} from '../src/js/utils/Constants.js';

/** 全部空洞の盤面。区画だけを見たいので周りは何も無い。 */
function blankBoard(rows = 60, cols = 80) {
  const grid = [], blockHP = [];
  for (let r = 0; r < rows; r++) {
    grid.push(new Array(cols).fill(BLOCK_EMPTY));
    blockHP.push(new Array(cols).fill(0));
  }
  return { grid, blockHP, rows, cols };
}

function forEachInRect(rect, fn) {
  for (let r = rect.r0; r <= rect.r1; r++) for (let c = rect.c0; c <= rect.c1; c++) fn(r, c);
}

const ZONE = { r0: 10, r1: 34, c0: 10, c1: 44 };

test('外壁は上と左が装甲、下と右が硬い岩', () => {
  const b = blankBoard();
  buildZoneWalls(b.grid, b.blockHP, ZONE, FORTRESS_WALL_THICKNESS);
  const bands = zoneBands(ZONE, FORTRESS_WALL_THICKNESS);

  forEachInRect(bands.top, (r, c) => {
    assert.equal(b.grid[r][c], BLOCK_INDESTRUCTIBLE, `上帯 (${r},${c})`);
    assert.equal(b.blockHP[r][c], -1, `上帯の HP (${r},${c})`);
  });
  forEachInRect(bands.left, (r, c) => {
    assert.equal(b.grid[r][c], BLOCK_INDESTRUCTIBLE, `左帯 (${r},${c})`);
  });
  forEachInRect(bands.bottom, (r, c) => {
    assert.equal(b.grid[r][c], BLOCK_HARD, `下帯 (${r},${c})`);
    assert.equal(b.blockHP[r][c], HARD_BLOCK_HP, `下帯の HP (${r},${c})`);
  });
  forEachInRect(bands.right, (r, c) => {
    assert.equal(b.grid[r][c], BLOCK_HARD, `右帯 (${r},${c})`);
  });
});

test('背面（下帯と右帯）に装甲は1つも無い＝掘って回り込める', () => {
  const b = blankBoard();
  buildZoneWalls(b.grid, b.blockHP, ZONE, FORTRESS_WALL_THICKNESS);
  const bands = zoneBands(ZONE, FORTRESS_WALL_THICKNESS);
  for (const band of [bands.bottom, bands.right]) {
    forEachInRect(band, (r, c) => {
      assert.notEqual(b.grid[r][c], BLOCK_INDESTRUCTIBLE,
        `背面に装甲がある (${r},${c})。掘って入れなくなる`);
    });
  }
});

test('4つの帯は互いに重ならず、外周を隙間なく覆う', () => {
  const T = FORTRESS_WALL_THICKNESS;
  const bands = zoneBands(ZONE, T);
  const seen = new Map();
  for (const [name, band] of Object.entries(bands)) {
    forEachInRect(band, (r, c) => {
      const key = `${r},${c}`;
      assert.equal(seen.has(key), false, `${key} が ${seen.get(key)} と ${name} で重複`);
      seen.set(key, name);
    });
  }
  let expected = 0;
  for (let r = ZONE.r0; r <= ZONE.r1; r++) {
    for (let c = ZONE.c0; c <= ZONE.c1; c++) {
      const inner = r >= ZONE.r0 + T && r <= ZONE.r1 - T && c >= ZONE.c0 + T && c <= ZONE.c1 - T;
      if (!inner) expected++;
    }
  }
  assert.equal(seen.size, expected, '外周に覆われていないマスがある');
});
