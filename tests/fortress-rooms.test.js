// 7面の要塞の「室 → 廊下 → 室」。設計 docs/superpowers/specs/2026-10-29-stage7-fortress-rooms-design.md
// 縦穴の着地点・出発点・入り口・お宝の奥が室（天井高のまま）、室と室のあいだが天井に梁を足した廊下になる。
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { shapeZoneRooms, planZoneContents } from '../src/js/world/fortress.js';
import {
  BLOCK_EMPTY, BLOCK_METAL, METAL_BLOCK_HP, FORTRESS_WALL_THICKNESS, FORTRESS_CEILING_H,
  FORTRESS_CORRIDOR_H, FORTRESS_CORRIDOR_MIN_W, FORTRESS_ROOM_W, FORTRESS_ROOM_MARGIN,
} from '../src/js/utils/Constants.js';

before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

const SEEDS = [1, 2, 3, 4, 5];
const T = FORTRESS_WALL_THICKNESS;

async function maps() {
  const { Map } = await import('../src/js/world/Map.js');
  return SEEDS.map((seed) => new Map({ rng: new SeededRNG(seed) }, 6));
}

/** 列 c の、階の床（r1）から上へ数えた空洞の高さ */
function openHeight(grid, floor, c) {
  let h = 0;
  for (let r = floor.r1; r >= floor.r0 && grid[r][c] === BLOCK_EMPTY; r--) h++;
  return h;
}

test('室は天井高のまま、廊下は FORTRESS_CORRIDOR_H の高さ（天井に梁がある）', async () => {
  for (const m of await maps()) {
    for (const z of m.fortressZones) {
      assert.ok(z.rooms.length > 0 && z.corridors.length > 0, '室か廊下が無い');
      for (const k of z.corridors) {
        const floor = z.floors[k.floor];
        for (let c = k.c0; c <= k.c1; c++) {
          assert.equal(openHeight(m.grid, floor, c), FORTRESS_CORRIDOR_H, `廊下 (${k.floor},${c}) の高さが違う`);
          assert.equal(m.grid[floor.r0][c], BLOCK_METAL, `廊下 (${k.floor},${c}) の天井に梁が無い`);
        }
      }
      for (const rm of z.rooms) {
        const floor = z.floors[rm.floor];
        for (let c = rm.c0; c <= rm.c1; c++) {
          // 上に縦穴が開く列は、その階の天井より上まで空洞が続く。階の中の高さは天井高以上
          assert.ok(openHeight(m.grid, floor, c) >= FORTRESS_CEILING_H, `室 (${rm.floor},${c}) の天井が低い`);
        }
      }
    }
  }
});

test('廊下は FORTRESS_CORRIDOR_MIN_W 以上の幅（端の尾も、狭ければ室に取り込まれる）', async () => {
  for (const m of await maps()) {
    for (const z of m.fortressZones) {
      for (const k of z.corridors) assert.ok(k.c1 - k.c0 + 1 >= FORTRESS_CORRIDOR_MIN_W, `幅 ${k.c1 - k.c0 + 1} の廊下 ${JSON.stringify(k)}`);
    }
  }
});

test('室と廊下は、各階の内側の全幅を隙間なく重ならずに分ける', async () => {
  for (const m of await maps()) {
    for (const z of m.fortressZones) {
      const c0 = z.c0 + T, c1 = z.c1 - T;
      z.floors.forEach((_, i) => {
        const spans = [...z.rooms, ...z.corridors].filter((q) => q.floor === i)
          .map((q) => [q.c0, q.c1]).sort((a, b) => a[0] - b[0]);
        assert.equal(spans[0][0], c0, `階 ${i}: 左端から始まっていない`);
        for (let k = 1; k < spans.length; k++) assert.equal(spans[k][0], spans[k - 1][1] + 1, `階 ${i}: 隙間か重なり`);
        assert.equal(spans[spans.length - 1][1], c1, `階 ${i}: 右端で終わっていない`);
      });
    }
  }
});

test('縦穴の着地点・出発点は室の中、入り口とお宝の奥も室', async () => {
  for (const m of await maps()) {
    for (const z of m.fortressZones) {
      const inRoom = (floor, c) => z.rooms.some((rm) => rm.floor === floor && c >= rm.c0 && c <= rm.c1);
      z.shafts.forEach((sh, i) => {
        for (let c = sh.c; c < sh.c + sh.w; c++) {
          assert.ok(inRoom(i, c), `階 ${i} の出発点の穴 ${c} が室の外`);
          assert.ok(inRoom(i + 1, c), `階 ${i + 1} の着地点 ${c} が室の外`);
        }
      });
      const last = z.floors.length - 1;
      for (let c = z.c0 + T; c < z.c0 + T + FORTRESS_ROOM_W; c++) assert.ok(inRoom(0, c), `入り口の室の列 ${c} が室の外`);
      const top = z.openings.find((g) => g.side === 'top');
      for (let c = top.c; c < top.c + top.w; c++) assert.ok(inRoom(0, c), `上の縦穴の着地点 ${c} が室の外`);
      for (const t of z.treasures) assert.ok(inRoom(last, t.c), `お宝 ${t.c} が室の外`);
    }
  }
});

test('縦穴の室は、縦穴の左右に FORTRESS_ROOM_MARGIN だけ広がる（穴の縁ぎりぎりまで狭くしない）', async () => {
  for (const m of await maps()) {
    for (const z of m.fortressZones) {
      const c0 = z.c0 + T, c1 = z.c1 - T;
      const covers = (floor, a, b) => {
        for (let c = Math.max(c0, a); c <= Math.min(c1, b); c++) {
          assert.ok(z.rooms.some((rm) => rm.floor === floor && c >= rm.c0 && c <= rm.c1), `階 ${floor} の列 ${c} に室が無い`);
        }
      };
      z.shafts.forEach((sh, i) => {
        covers(i, sh.c - FORTRESS_ROOM_MARGIN, sh.c + sh.w - 1 + FORTRESS_ROOM_MARGIN);
        covers(i + 1, sh.c - FORTRESS_ROOM_MARGIN, sh.c + sh.w - 1 + FORTRESS_ROOM_MARGIN);
      });
      const top = z.openings.find((g) => g.side === 'top');
      covers(0, top.c - FORTRESS_ROOM_MARGIN, top.c + top.w - 1 + FORTRESS_ROOM_MARGIN);
    }
  }
});

test('区画の端に接する廊下（行き止まりの尾）は「あいだ」ではなく、室に挟まれた廊下だけが「あいだ」', async () => {
  for (const m of await maps()) {
    for (const z of m.fortressZones) {
      const c0 = z.c0 + T, c1 = z.c1 - T;
      for (const k of z.corridors) {
        const dead = k.c0 === c0 || k.c1 === c1;
        assert.equal(k.between, !dead, `廊下 ${JSON.stringify(k)}: 行き止まりかどうかと between が合わない`);
      }
    }
  }
});

test('最下階は、左に着地してから廊下を通って右のお宝の室へ行く（お宝の手前に廊下がある）', async () => {
  for (const m of await maps()) {
    for (const z of m.fortressZones) {
      const last = z.floors.length - 1;
      const between = z.corridors.filter((k) => k.floor === last && k.between);
      assert.ok(between.length >= 1, '最下階に室と室のあいだの廊下が無い');
      const leftmostTreasure = Math.min(...z.treasures.map((t) => t.c));
      assert.ok(between.every((k) => k.c1 < leftmostTreasure), '廊下がお宝の室より右にある');
    }
  }
});

test('区画の中は全部つながっている（梁を足しても階・室・廊下は孤立しない）', async () => {
  for (const m of await maps()) {
    for (const z of m.fortressZones) {
      const r0 = z.r0 + T, r1 = z.r1 - T, c0 = z.c0 + T, c1 = z.c1 - T;
      let start = null, total = 0;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        if (m.grid[r][c] === BLOCK_EMPTY) { total++; start = start || [r, c]; }
      }
      const seen = new Set([`${start}`]);
      const stack = [start];
      while (stack.length) {
        const [r, c] = stack.pop();
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = r + dr, nc = c + dc;
          if (nr < r0 || nr > r1 || nc < c0 || nc > c1 || m.grid[nr][nc] !== BLOCK_EMPTY || seen.has(`${nr},${nc}`)) continue;
          seen.add(`${nr},${nc}`);
          stack.push([nr, nc]);
        }
      }
      assert.equal(seen.size, total, '区画の内側の空洞が複数に分かれている');
    }
  }
});

test('守備隊は足場のある所に立つ（天井の砲台は上が岩、床の砲台と戦車は下が岩）', async () => {
  for (const m of await maps()) {
    for (const z of m.fortressZones) {
      for (const t of z.garrison.turrets) {
        assert.equal(m.grid[t.r][t.c], BLOCK_EMPTY, `砲台 (${t.r},${t.c}) が岩に埋まっている`);
        if (t.isCeiling) assert.notEqual(m.grid[t.r - 1][t.c], BLOCK_EMPTY, `天井の砲台 (${t.r},${t.c}) の上が空洞`);
        else assert.notEqual(m.grid[t.r + 1][t.c], BLOCK_EMPTY, `床の砲台 (${t.r},${t.c}) の下が空洞`);
      }
      for (const t of z.garrison.tanks) {
        assert.equal(m.grid[t.r][t.c], BLOCK_EMPTY, `戦車 (${t.r},${t.c}) が岩に埋まっている`);
        assert.notEqual(m.grid[t.r + 1][t.c], BLOCK_EMPTY, `戦車 (${t.r},${t.c}) の下が空洞`);
      }
    }
  }
});

// ---- shapeZoneRooms 単体（合成した盤面）------------------------------------------

function box(rows, cols, zone, floors) {
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(BLOCK_METAL));
  const blockHP = Array.from({ length: rows }, () => new Array(cols).fill(METAL_BLOCK_HP));
  for (const f of floors) for (let r = f.r0; r <= f.r1; r++) for (let c = zone.c0 + T; c <= zone.c1 - T; c++) { grid[r][c] = BLOCK_EMPTY; blockHP[r][c] = 0; }
  return { grid, blockHP };
}
const OPTS = (extra) => ({
  thickness: T, corridorH: FORTRESS_CORRIDOR_H, roomW: FORTRESS_ROOM_W, roomMargin: FORTRESS_ROOM_MARGIN,
  corridorMinW: FORTRESS_CORRIDOR_MIN_W, openings: [], ...extra,
});

test('室のあいだが狭すぎれば併合する（廊下は FORTRESS_CORRIDOR_MIN_W 以上）', () => {
  const zone = { r0: 0, r1: 12, c0: 0, c1: 33 };         // 内側の列 2..31
  const floors = [{ r0: 2, r1: 7 }, { r0: 9, r1: 12 }];
  const { grid, blockHP } = box(14, 40, zone, floors);
  // 出発点の穴を、入り口の室（列 2..9）の右 2 列先に置く → 穴の室 [sc-2..] との隙間が 2 で併合
  const shafts = [{ r: 8, c: 13, w: 4 }];
  const { corridors, rooms } = shapeZoneRooms(grid, blockHP, zone, OPTS({ floors: [floors[0]], shafts }));
  assert.ok(corridors.every((k) => k.c1 - k.c0 + 1 >= FORTRESS_CORRIDOR_MIN_W), `狭い廊下が残っている: ${JSON.stringify(corridors)}`);
  assert.equal(rooms.filter((rm) => rm.floor === 0).length, 2, '併合後の室が想定と違う（入り口の室＋併合した室、右端のお宝の室ではなく）');
});

test('廊下が無い階（室で埋まる）にはバリア用の廊下が返らない', () => {
  const zone = { r0: 0, r1: 12, c0: 0, c1: 21 };         // 内側の列 2..19（幅18）
  const floors = [{ r0: 2, r1: 7 }];
  const { grid, blockHP } = box(14, 30, zone, floors);
  const { corridors } = shapeZoneRooms(grid, blockHP, zone, OPTS({ floors, shafts: [] }));
  // 入り口の室 8 + お宝の室 8、残りは幅 2 の隙間（併合）→ 廊下なし
  assert.equal(corridors.filter((k) => k.between).length, 0);
});

test('最上階の天井の砲台は、上の入り口（縦穴）の下には立たない（天井が無く宙に浮く）', () => {
  const zone = { r0: 0, r1: 12, c0: 0, c1: 33 };           // 内側の列 2..31
  const floors = [{ r0: 2, r1: 7 }];
  const openings = [{ r: 0, c: 8, side: 'top', w: 5 }];     // 縦穴 8..12
  const rooms = [{ floor: 0, c0: 7, c1: 18 }];             // 室の左端 +1 = 8 が縦穴の真下（先頭の候補）
  const first = { next: () => 0 };                          // いつも候補の先頭を選ぶ
  const { garrison } = planZoneContents(zone, floors, [], openings, rooms, [], {
    thickness: T, treasureCount: 0, garrisonTurrets: 2, garrisonTanks: 0, barrierClearance: 0,
    guardType: 'gun', guardInset: 1, rng: first,
  });
  const ceilings = garrison.turrets.filter((t) => t.isCeiling);
  assert.equal(ceilings.length, 1);
  assert.ok(ceilings[0].c < 8 || ceilings[0].c > 12, `天井の砲台 ${ceilings[0].c} が縦穴 8..12 の真下`);
});
