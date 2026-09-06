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
  BLOCK_EMPTY, BLOCK_NORMAL, BLOCK_HARD, BLOCK_METAL,
  FORTRESS_WALL_THICKNESS, HARD_BLOCK_HP, METAL_BLOCK_HP,
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

test('外壁は上・左・下が金属、右だけ硬い岩', () => {
  const b = blankBoard();
  buildZoneWalls(b.grid, b.blockHP, ZONE, FORTRESS_WALL_THICKNESS);
  const bands = zoneBands(ZONE, FORTRESS_WALL_THICKNESS);

  for (const name of ['top', 'left', 'bottom']) {
    forEachInRect(bands[name], (r, c) => {
      assert.equal(b.grid[r][c], BLOCK_METAL, `${name} 帯 (${r},${c})`);
      assert.equal(b.blockHP[r][c], METAL_BLOCK_HP, `${name} 帯の HP (${r},${c})`);
    });
  }
  forEachInRect(bands.right, (r, c) => {
    assert.equal(b.grid[r][c], BLOCK_HARD, `右帯 (${r},${c})`);
    assert.equal(b.blockHP[r][c], HARD_BLOCK_HP, `右帯の HP (${r},${c})`);
  });
});

test('外壁に壊せないブロックは1つも無い（マップを分断しない）', () => {
  // 壊せない装甲をやめたのが今回の作り直しの要点。全部掘れることを縛る
  const b = blankBoard();
  buildZoneWalls(b.grid, b.blockHP, ZONE, FORTRESS_WALL_THICKNESS);
  const bands = zoneBands(ZONE, FORTRESS_WALL_THICKNESS);
  for (const band of Object.values(bands)) {
    forEachInRect(band, (r, c) => {
      assert.ok(b.blockHP[r][c] > 0, `掘れないブロックがある (${r},${c})`);
    });
  }
});

test('弱点は右だけ。上・左・下は右の2倍の手数が要る', () => {
  const b = blankBoard();
  buildZoneWalls(b.grid, b.blockHP, ZONE, FORTRESS_WALL_THICKNESS);
  const bands = zoneBands(ZONE, FORTRESS_WALL_THICKNESS);
  // 厚さ2層ぶんの合計 HP で比べる
  const cost = (band) => {
    let sum = 0;
    forEachInRect(band, (r, c) => { sum += b.blockHP[r][c]; });
    return sum / ((band.r1 - band.r0 + 1) * (band.c1 - band.c0 + 1)) * FORTRESS_WALL_THICKNESS;
  };
  const weak = cost(bands.right);
  for (const name of ['top', 'left', 'bottom']) {
    assert.ok(cost(bands[name]) >= weak * 2, `${name} が右より十分硬くない`);
  }
  assert.equal(weak, HARD_BLOCK_HP * FORTRESS_WALL_THICKNESS, '右の弱点が 6発でない');
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

import { buildZoneInterior } from '../src/js/world/fortress.js';
import {
  FORTRESS_CEILING_H, FORTRESS_FLOOR_H, FORTRESS_SHAFT_W,
} from '../src/js/utils/Constants.js';

function interiorOpts(rng) {
  return {
    thickness: FORTRESS_WALL_THICKNESS,
    ceilingH: FORTRESS_CEILING_H,
    floorH: FORTRESS_FLOOR_H,
    shaftW: FORTRESS_SHAFT_W,
    rng,
  };
}

/** 区画の内側（外壁の内）で、空洞の連結成分の数を数える。 */
function openComponents(grid, zone, T) {
  const r0 = zone.r0 + T, r1 = zone.r1 - T, c0 = zone.c0 + T, c1 = zone.c1 - T;
  const seen = new Set();
  let components = 0;
  for (let sr = r0; sr <= r1; sr++) {
    for (let sc = c0; sc <= c1; sc++) {
      if (grid[sr][sc] !== BLOCK_EMPTY) continue;
      if (seen.has(`${sr},${sc}`)) continue;
      components++;
      const stack = [[sr, sc]];
      seen.add(`${sr},${sc}`);
      while (stack.length) {
        const [r, c] = stack.pop();
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = r + dr, nc = c + dc;
          if (nr < r0 || nr > r1 || nc < c0 || nc > c1) continue;
          if (grid[nr][nc] !== BLOCK_EMPTY) continue;
          const key = `${nr},${nc}`;
          if (seen.has(key)) continue;
          seen.add(key);
          stack.push([nr, nc]);
        }
      }
    }
  }
  return components;
}

test('区画の中は横に長い階が縦に積み、シャフトで全部つながる', () => {
  const b = blankBoard();
  buildZoneWalls(b.grid, b.blockHP, ZONE, FORTRESS_WALL_THICKNESS);
  const { floors, shafts } = buildZoneInterior(b.grid, b.blockHP, ZONE, interiorOpts(new SeededRNG(5)));
  assert.ok(floors.length >= 2, `階が ${floors.length} しかない`);
  assert.equal(shafts.length, floors.length - 1, '階の境目の数だけシャフトが要る');
  assert.equal(openComponents(b.grid, ZONE, FORTRESS_WALL_THICKNESS), 1,
    'シャフトで全部の階がつながっていない');
});

test('階は横に長い（真上から見た格子ではない）', () => {
  const b = blankBoard();
  buildZoneWalls(b.grid, b.blockHP, ZONE, FORTRESS_WALL_THICKNESS);
  const { floors } = buildZoneInterior(b.grid, b.blockHP, ZONE, interiorOpts(new SeededRNG(5)));
  const innerW = (ZONE.c1 - FORTRESS_WALL_THICKNESS) - (ZONE.c0 + FORTRESS_WALL_THICKNESS) + 1;
  for (const f of floors) {
    const h = f.r1 - f.r0 + 1;
    assert.ok(innerW > h * 2, `階が横に長くない（幅 ${innerW} / 高さ ${h}）`);
  }
});

test('階の境目は金属の床（掘って抜けるが手間）', () => {
  const b = blankBoard();
  buildZoneWalls(b.grid, b.blockHP, ZONE, FORTRESS_WALL_THICKNESS);
  const { floors, shafts } = buildZoneInterior(b.grid, b.blockHP, ZONE, interiorOpts(new SeededRNG(5)));
  const T = FORTRESS_WALL_THICKNESS;
  for (let i = 0; i + 1 < floors.length; i++) {
    const shaft = shafts[i];
    for (let r = floors[i].r1 + 1; r <= floors[i + 1].r0 - 1; r++) {
      for (let c = ZONE.c0 + T; c <= ZONE.c1 - T; c++) {
        const inShaft = c >= shaft.c && c < shaft.c + shaft.w;
        if (inShaft) {
          assert.equal(b.grid[r][c], BLOCK_EMPTY, `シャフトが塞がっている (${r},${c})`);
        } else {
          assert.equal(b.grid[r][c], BLOCK_METAL, `床が金属でない (${r},${c})`);
          assert.equal(b.blockHP[r][c], METAL_BLOCK_HP, `床の HP (${r},${c})`);
        }
      }
    }
  }
});

test('シャフトは階ごとに位置がずれる（一直線に落ちられない）', () => {
  // 真上に並ぶと各階を横断させる意味が無くなる
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const b = blankBoard();
    buildZoneWalls(b.grid, b.blockHP, ZONE, FORTRESS_WALL_THICKNESS);
    const { shafts } = buildZoneInterior(b.grid, b.blockHP, ZONE, interiorOpts(new SeededRNG(seed)));
    for (let i = 1; i < shafts.length; i++) {
      const a = shafts[i - 1];
      const c = shafts[i];
      const overlap = Math.min(a.c + a.w, c.c + c.w) - Math.max(a.c, c.c);
      assert.ok(overlap <= 0, `seed ${seed}: シャフトが縦に重なっている (${a.c} と ${c.c})`);
    }
  }
});

import { openZoneGates } from '../src/js/world/fortress.js';
import { FORTRESS_OPENING_TUNNEL_MAX, FORTRESS_GATE_SIZE } from '../src/js/utils/Constants.js';

/** 全部岩の盤面。開口の外にトンネルが掘られることを見たいので空洞を作らない。 */
function solidBoard(rows = 60, cols = 80) {
  const grid = [], blockHP = [];
  for (let r = 0; r < rows; r++) {
    grid.push(new Array(cols).fill(BLOCK_NORMAL));
    blockHP.push(new Array(cols).fill(1));
  }
  return { grid, blockHP, rows, cols };
}

function buildZone(board, zone, rng) {
  buildZoneWalls(board.grid, board.blockHP, zone, FORTRESS_WALL_THICKNESS);
  const { floors, shafts } = buildZoneInterior(board.grid, board.blockHP, zone, interiorOpts(rng));
  const gates = openZoneGates(board.grid, board.blockHP, zone, {
    thickness: FORTRESS_WALL_THICKNESS, floors, gateSize: FORTRESS_GATE_SIZE,
    rng, tunnelMax: FORTRESS_OPENING_TUNNEL_MAX,
    rows: board.rows, cols: board.cols,
  });
  return { floors, shafts, gates };
}

test('開口は上辺と左辺に1つずつ', () => {
  const { gates } = buildZone(solidBoard(), ZONE, new SeededRNG(3));
  assert.equal(gates.length, 2);
  assert.deepEqual(gates.map((g) => g.side).sort(), ['left', 'top']);
});

test('入り口は左上（最上階）にあり、大きさは3ブロック', () => {
  // 実機の指摘。開口が階ごとにばらけると入り口が探しづらく、階の高さぶん
  // （5タイル）開いていると「壁が崩れている」ようにも見えた
  const b = solidBoard();
  const { floors, gates } = buildZone(b, ZONE, new SeededRNG(3));
  const left = gates.find((g) => g.side === 'left');
  const top = floors[0];
  assert.equal(left.w, FORTRESS_GATE_SIZE, '開口の高さが3ブロックでない');
  assert.ok(left.r >= top.r0 && left.r + left.w - 1 <= top.r1,
    `開口 ${left.r}〜${left.r + left.w - 1} が最上階 ${top.r0}〜${top.r1} の中に無い`);
  const T = FORTRESS_WALL_THICKNESS;
  for (let r = left.r; r < left.r + left.w; r++) {
    for (let c = ZONE.c0; c < ZONE.c0 + T; c++) {
      assert.equal(b.grid[r][c], BLOCK_EMPTY, `左の開口が空洞でない (${r},${c})`);
    }
  }
});

test('入り口は最上階の床の上に開く（宙に浮いた穴にしない）', () => {
  const b = solidBoard();
  const { floors, gates } = buildZone(b, ZONE, new SeededRNG(3));
  const left = gates.find((g) => g.side === 'left');
  assert.equal(left.r + left.w - 1, floors[0].r1,
    '開口の下端が最上階の床と揃っていない（扉ではなく壁の穴に見える）');
});

test('階が何階でも入り口は最上階（seed を変えても動かない）', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const b = solidBoard();
    const { floors, gates } = buildZone(b, ZONE, new SeededRNG(seed));
    const left = gates.find((g) => g.side === 'left');
    assert.equal(left.r + left.w - 1, floors[0].r1, `seed ${seed}: 入り口が最上階でない`);
  }
});

test('上の開口も3ブロックの縦穴で、最上階へ通じる', () => {
  const b = solidBoard();
  const { gates } = buildZone(b, ZONE, new SeededRNG(3));
  const top = gates.find((g) => g.side === 'top');
  assert.equal(top.w, FORTRESS_GATE_SIZE);
  const T = FORTRESS_WALL_THICKNESS;
  for (let c = top.c; c < top.c + top.w; c++) {
    for (let r = ZONE.r0; r < ZONE.r0 + T; r++) {
      assert.equal(b.grid[r][c], BLOCK_EMPTY, `上の開口が空洞でない (${r},${c})`);
    }
  }
});

test('開口の外へトンネルが掘られ、区画の外の空洞につながる', () => {
  const b = solidBoard();
  for (let r = 0; r < b.rows; r++) for (let c = 3; c <= 5; c++) { b.grid[r][c] = BLOCK_EMPTY; b.blockHP[r][c] = 0; }
  const { gates } = buildZone(b, ZONE, new SeededRNG(3));
  const left = gates.find((g) => g.side === 'left');
  for (let c = 5; c < ZONE.c0; c++) {
    assert.equal(b.grid[left.r][c], BLOCK_EMPTY, `トンネルが途切れている (${left.r},${c})`);
  }
});

test('同じ rng なら同じ開口', () => {
  const a = buildZone(solidBoard(), ZONE, new SeededRNG(8)).gates;
  const c = buildZone(solidBoard(), ZONE, new SeededRNG(8)).gates;
  assert.deepEqual(a, c);
});

import { carveFortressZones } from '../src/js/world/fortress.js';
import { reachable } from './helpers/map-reach.js';

const START = { r: 11, c: 13 };

test('7面には要塞区画があり、他の面には無い', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const fort = new Map({ rng: new SeededRNG(1) }, 6);
  assert.ok(fort.fortressZones.length > 0, '7面に区画が1つも無い');
  assert.ok(fort.fortress.some((v) => v === 1), '7面に印が1つも立っていない');
  for (let lv = 0; lv < 6; lv++) {
    const m = new Map({ rng: new SeededRNG(1) }, lv);
    assert.deepEqual(m.fortressZones, [], `面${lv + 1} に区画がある`);
    assert.equal(m.fortress.some((v) => v === 1), false, `面${lv + 1} に印が立っている`);
  }
});

test('同じ seed なら同じ要塞・同じ敵配置（生成は決定的）', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const a = new Map({ rng: new SeededRNG(11) }, 6);
  const b = new Map({ rng: new SeededRNG(11) }, 6);
  assert.deepEqual(a.fortressZones, b.fortressZones);
  assert.deepEqual(a.enemyTankSpawns, b.enemyTankSpawns);
  assert.deepEqual(a.enemyAttackerSpawns, b.enemyAttackerSpawns);
  const c = new Map({ rng: new SeededRNG(12) }, 6);
  assert.notDeepEqual(a.fortressZones, c.fortressZones, 'seed を変えても同じ区画になっている');
});

test('carveFortressZones は渡された rng だけを使う', () => {
  // Map が派生ストリームを渡している以上、純関数側が外の乱数に触れていない
  // ことを直接見ておく。引数の rng を数えて実際に使われていることを確かめ、
  // 同じ rng なら完全に同じ結果になることで「他の乱数源が混ざっていない」と言える。
  //
  // 補足: 「7面と6面で game.rng の消費回数が一致する」という形のテストは書けない。
  // 要塞は grid を書き換えるので、あとで走るスポーン探索の候補数が変わり、
  // シャッフルで引く回数が変わる。雪の階段（5面）も同じ理由で6面と 223 回ずれている。
  // 派生ストリームが守っているのは「要塞の乱数が洞窟生成の乱数列を割り込まない」
  // ことであって、総消費回数が面によらず一定になることではない。
  const board = solidBoard(60, 200);
  const rooms = [];
  for (let c = 30; c < 180; c += 25) rooms.push({ centerR: 30, centerC: c });
  let draws = 0;
  const inner = new SeededRNG(21);
  const counting = { next: () => { draws++; return inner.next(); } };
  const args = {
    rows: board.rows, cols: board.cols, rooms, excludeRects: [],
    count: FORTRESS_ZONE_COUNT,
    wMin: FORTRESS_ZONE_W_MIN, wRange: FORTRESS_ZONE_W_RANGE,
    hMin: FORTRESS_ZONE_H_MIN, hRange: FORTRESS_ZONE_H_RANGE,
    margin: FORTRESS_ZONE_MARGIN,
    thickness: FORTRESS_WALL_THICKNESS, ceilingH: FORTRESS_CEILING_H,
    floorH: FORTRESS_FLOOR_H, shaftW: FORTRESS_SHAFT_W,
    tunnelMax: FORTRESS_OPENING_TUNNEL_MAX,
  };
  const first = carveFortressZones({ ...args, grid: board.grid, blockHP: board.blockHP, rng: counting });
  assert.ok(draws > 0, '渡した rng が使われていない');
  const board2 = solidBoard(60, 200);
  const second = carveFortressZones({
    ...args, grid: board2.grid, blockHP: board2.blockHP, rng: new SeededRNG(21),
  });
  assert.deepEqual(second.zones, first.zones, '同じ seed で結果が変わる＝別の乱数源が混ざっている');
});

test('印は区画の矩形の中にしか立たない', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const m = new Map({ rng: new SeededRNG(2) }, 6);
  for (let r = 0; r < m.rows; r++) {
    for (let c = 0; c < m.cols; c++) {
      if (m.fortress[r * m.cols + c] !== 1) continue;
      const inside = m.fortressZones.some((z) => r >= z.r0 && r <= z.r1 && c >= z.c0 && c <= z.c1);
      assert.ok(inside, `区画の外に印が立っている (${r},${c})`);
    }
  }
});

test('区画は開始の部屋・基地の部屋と重ならない', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  for (const seed of [1, 2, 3, 4, 5]) {
    const m = new Map({ rng: new SeededRNG(seed) }, 6);
    for (const z of m.fortressZones) {
      for (const rect of m._reservedRects()) {
        assert.equal(rectsOverlap(z, rect), false,
          `seed ${seed}: 区画 ${JSON.stringify(z)} が予約矩形と重なっている`);
      }
    }
  }
});

test('要塞を入れても基地へ到達できる', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const m = new Map({ rng: new SeededRNG(seed) }, 6);
    assert.ok(reachable(m, START, m.enemyBaseCenter), `seed ${seed}: 基地へ到達できない`);
  }
});

test('掘らなくても区画に出入りできる（開口が効いている）', async () => {
  // 基地への到達可能性は要塞に鈍感だった。区画を丸ごと塞いでも、洞窟の中の
  // 島でしかないので経路が迂回してしまう（変異を入れても赤くならなかった）。
  // 開口が守っているのは「掘らずに出入りできる」ことなので、そちらを直接測る。
  // 空洞だけを辿って、区画の内側から外へ出られることを確かめる
  const { Map } = await import('../src/js/world/Map.js');
  const { floodEmpty } = await import('./helpers/map-reach.js');
  for (const seed of [1, 2, 3, 4, 5]) {
    const m = new Map({ rng: new SeededRNG(seed) }, 6);
    assert.ok(m.fortressZones.length > 0, `seed ${seed}: 区画が無い`);
    for (const z of m.fortressZones) {
      const gate = z.openings.find((g) => g.side === 'left');
      assert.ok(gate, `seed ${seed}: 左の開口が無い`);
      // 開口の中心から空洞だけを辿る
      const start = { r: gate.r + 1, c: z.c0 };
      const seen = floodEmpty(m, start);
      const escaped = [...seen].some((key) => {
        const [r, c] = key.split(',').map(Number);
        return r < z.r0 || r > z.r1 || c < z.c0 || c > z.c1;
      });
      assert.ok(escaped,
        `seed ${seed}: 区画 ${JSON.stringify({ r0: z.r0, c0: z.c0 })} から掘らずに外へ出られない`);
      const inside = [...seen].some((key) => {
        const [r, c] = key.split(',').map(Number);
        return r > z.r0 + 2 && r < z.r1 - 2 && c > z.c0 + 2 && c < z.c1 - 2;
      });
      assert.ok(inside, `seed ${seed}: 開口から中の廊下へ入れない`);
    }
  }
});

import { FORTRESS_TREASURE_COUNT, FORTRESS_GARRISON_TURRETS, FORTRESS_GARRISON_TANKS } from '../src/js/utils/Constants.js';

test('お宝は一番下の階の、開口から一番遠い側に並ぶ', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const m = new Map({ rng: new SeededRNG(1) }, 6);
  for (const z of m.fortressZones) {
    assert.equal(z.treasures.length, FORTRESS_TREASURE_COUNT, '宝の数が違う');
    const bottom = z.floors[z.floors.length - 1];
    const half = (z.c0 + z.c1) / 2;
    for (const t of z.treasures) {
      assert.ok(t.r >= bottom.r0 && t.r <= bottom.r1, `宝が最下階に無い (${t.r})`);
      assert.ok(t.c > half, `宝が右寄りでない (${t.c} / 中央 ${half})`);
      assert.equal(m.grid[t.r][t.c], BLOCK_EMPTY, `宝が岩に埋まっている (${t.r},${t.c})`);
      assert.ok(m.grid[t.r + 1][t.c] !== BLOCK_EMPTY, `宝の足元が空洞 (${t.r},${t.c})`);
    }
    // 稀少なオーバードライブが必ず含まれる
    assert.ok(z.treasures.some((t) => t.kind === 'overdrive'), 'オーバードライブが無い');
    assert.ok(z.treasures.some((t) => t.kind === 'repair'), 'リペアキットが無い');
  }
});

test('バリアは階ごとに1本立ち、シャフトと重ならない', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  for (const seed of [1, 2, 3]) {
    const m = new Map({ rng: new SeededRNG(seed) }, 6);
    for (const z of m.fortressZones) {
      assert.equal(z.barriers.length, z.floors.length, '階の数だけバリアが要る');
      for (const b of z.barriers) {
        const floor = z.floors.find((f) => f.r0 === b.top && f.r1 === b.bottom);
        assert.ok(floor, `バリア ${b.c} がどの階とも合っていない`);
        // 上下のユニットが立つマスは、その階の天井と床に接している
        assert.equal(m.grid[b.top][b.c], BLOCK_EMPTY, 'バリア上端が空洞でない');
        assert.equal(m.grid[b.bottom][b.c], BLOCK_EMPTY, 'バリア下端が空洞でない');
        for (const s of z.shafts) {
          assert.ok(b.c < s.c - 1 || b.c > s.c + s.w, `バリア ${b.c} がシャフト ${s.c} と近すぎる`);
        }
      }
    }
  }
});

test('お宝はバリアより奥（右）にある', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const m = new Map({ rng: new SeededRNG(1) }, 6);
  for (const z of m.fortressZones) {
    const bottom = z.floors[z.floors.length - 1];
    const barrier = z.barriers.find((b) => b.top === bottom.r0);
    const leftmost = Math.min(...z.treasures.map((t) => t.c));
    assert.ok(barrier.c < leftmost, `バリア ${barrier.c} が宝 ${leftmost} より奥にある`);
  }
});

test('要塞区画に守備隊が追加されている', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const fort = new Map({ rng: new SeededRNG(1) }, 6);
  const inZone = (pos) => fort.fortressZones.some((z) => {
    const r = Math.floor(pos.y / 16), c = Math.floor(pos.x / 16);
    return r >= z.r0 && r <= z.r1 && c >= z.c0 && c <= z.c1;
  });
  const turrets = fort.enemyTurretSpawns.filter(inZone).length;
  const tanks = fort.enemyTankSpawns.filter(inZone).length;
  const zones = fort.fortressZones.length;
  assert.ok(turrets >= zones * FORTRESS_GARRISON_TURRETS,
    `区画内の砲台が ${turrets} しかない（最低 ${zones * FORTRESS_GARRISON_TURRETS}）`);
  assert.ok(tanks >= zones * FORTRESS_GARRISON_TANKS,
    `区画内の戦車が ${tanks} しかない（最低 ${zones * FORTRESS_GARRISON_TANKS}）`);
});

test('お宝が実際にゲームへ置かれる（7面だけ）', async () => {
  const { SpawnManager } = await import('../src/js/systems/SpawnManager.js');
  const { Map } = await import('../src/js/world/Map.js');
  for (const lv of [0, 6]) {
    const map = new Map({ rng: new SeededRNG(1) }, lv);
    const game = { map, repairKits: [], missileKits: [] };
    new SpawnManager(game).spawnTreasures();
    const total = game.repairKits.length + game.missileKits.length;
    if (lv === 6) {
      assert.equal(total, map.fortressZones.length * FORTRESS_TREASURE_COUNT, '7面の宝の数が合わない');
      assert.ok(game.missileKits.length > 0, 'オーバードライブが置かれていない');
      assert.ok(game.repairKits.length > 0, 'リペアキットが置かれていない');
    } else {
      assert.equal(total, 0, `面${lv + 1} に宝が置かれている`);
    }
  }
});

test('床は金属1層。シャフトのほうが速いが、掘るのも現実的な範囲', () => {
  // 硬い岩1層(3発)では掘るほうが速すぎ、金属2層(12発)では重すぎた。
  // 金属1層(6発)が実機で決めた着地点（ミサイル1発では抜けない、という線）
  assert.equal(FORTRESS_FLOOR_H, 1, '床が1層でない');
  assert.equal(METAL_BLOCK_HP * FORTRESS_FLOOR_H, 6,
    `床を抜くのに要る弾が 6 発でない (${METAL_BLOCK_HP * FORTRESS_FLOOR_H})`);
  assert.ok(METAL_BLOCK_HP * FORTRESS_FLOOR_H > HARD_BLOCK_HP,
    '床が硬い岩1層より柔らかい');
});

import { FORTRESS_BARRIER_CLEARANCE } from '../src/js/utils/Constants.js';

test('バリアの上に敵も地雷も湧かない', async () => {
  // バリアの中に砲台が居ると、開ける前に一方的に撃たれるうえ、撃ち返した弾は
  // バリアに吸われて届かない。守備隊（要塞が置く側）と、面全体の湧き
  // （要塞を知らない側）の両方を確かめる
  const { Map } = await import('../src/js/world/Map.js');
  for (const seed of [1, 2, 3, 4, 5]) {
    const m = new Map({ rng: new SeededRNG(seed) }, 6);
    const lists = {
      砲台: m.enemyTurretSpawns, 戦車: m.enemyTankSpawns,
      ドローン: m.enemyDroneSpawns, アタッカー: m.enemyAttackerSpawns,
      地雷: m.landmineSpawns,
    };
    for (const [name, list] of Object.entries(lists)) {
      for (const pos of list) {
        const r = Math.floor(pos.y / 16);
        const c = Math.floor(pos.x / 16);
        for (const z of m.fortressZones) {
          for (const b of z.barriers) {
            const onIt = Math.abs(b.c - c) <= FORTRESS_BARRIER_CLEARANCE
              && r >= b.top && r <= b.bottom;
            assert.equal(onIt, false,
              `seed ${seed}: ${name} がバリア(列 ${b.c}, 行 ${b.top}〜${b.bottom}) の上に居る (${r},${c})`);
          }
        }
      }
    }
  }
});
