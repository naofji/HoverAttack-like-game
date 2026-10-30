// 7面の施設エリア（メタルパネルの地面・壁と金属の斜面）。
// 設計 docs/superpowers/specs/2026-10-31-stage7-facility-metal-design.md
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { pickFacilityAreas, metalizeFacilityBand } from '../src/js/world/facility.js';
import { carveSnowStairs } from '../src/js/world/snowStairs.js';
import {
  computeTileShape, packShape, SHAPE_FULL, SHAPE_EMPTY, Q_EMPTY, Q_FULL, Q_TRI_NO_TL,
} from '../src/js/utils/tileShape.js';
import { Player } from '../src/js/entities/Player.js';
import { Grenade } from '../src/js/entities/Grenade.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { drawMetalPanel, drawArmorPanel, drawPlatePanel, tileRng } from '../src/js/world/panelBlocks.js';
import { shapeContainsPoint } from '../src/js/utils/tileShape.js';
import {
  BLOCK_EMPTY as E, BLOCK_NORMAL as N, BLOCK_HARD as H, BLOCK_METAL as M, BLOCK_INDESTRUCTIBLE as X,
  METAL_BLOCK_HP, FORTRESS_ZONE_MARGIN, TILE_SIZE as T,
} from '../src/js/utils/Constants.js';

before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const overlap = (a, b) => a.r0 <= b.r1 && b.r0 <= a.r1 && a.c0 <= b.c1 && b.c0 <= a.c1;

let cache = null;
async function maps(level = 6) {
  const { Map } = await import('../src/js/world/Map.js');
  if (level !== 6) return SEEDS.slice(0, 2).map((s) => new Map({ rng: new SeededRNG(s) }, level));
  cache ??= SEEDS.map((s) => new Map({ rng: new SeededRNG(s) }, 6));
  return cache;
}

// ---------- エリアの選び方 ----------

test('pickFacilityAreas は除外矩形と重ならず、互いにも重ならない', () => {
  const rooms = [];
  for (let r = 10; r < 90; r += 6) for (let c = 10; c < 190; c += 7) rooms.push({ centerR: r, centerC: c });
  const excludeRects = [{ r0: 0, r1: 30, c0: 0, c1: 40 }, { r0: 50, r1: 70, c0: 100, c1: 140 }];
  const areas = pickFacilityAreas({
    rows: 100, cols: 200, rooms, excludeRects, rng: new SeededRNG(7),
    count: 8, wMin: 10, wRange: 10, hMin: 8, hRange: 6, margin: 3,
  });
  assert.ok(areas.length >= 3, `置けたのが ${areas.length} 個`);
  for (const a of areas) {
    for (const x of excludeRects) assert.ok(!overlap(a, x), `除外矩形と重なる ${JSON.stringify(a)}`);
    assert.ok(a.r0 >= 3 && a.c0 >= 3 && a.r1 < 97 && a.c1 < 197, '盤面の縁の余白に掛かる');
  }
  for (let i = 0; i < areas.length; i++) {
    for (let j = i + 1; j < areas.length; j++) assert.ok(!overlap(areas[i], areas[j]), '互いに重なる');
  }
});

test('metalizeFacilityBand は縁の岩だけを金属にし、空洞は空洞のまま、内側と壊せない岩は触らない', () => {
  const grid = [
    [N, N, E, N, N],
    [N, H, N, E, X],
    [E, N, N, N, N],
    [N, N, E, H, N],
  ];
  const blockHP = grid.map((row) => row.map((b) => (b === E ? 0 : 1)));
  const n = metalizeFacilityBand(grid, blockHP, { r0: 0, r1: 3, c0: 0, c1: 4 });
  assert.deepEqual(grid, [
    [M, M, E, M, M],
    [M, H, N, E, X],
    [E, N, N, N, M],
    [M, M, E, M, M],
  ]);
  assert.equal(n, 10);
  assert.equal(blockHP[0][0], METAL_BLOCK_HP);
  assert.equal(blockHP[1][1], 1, '内側の HP が変わった');
  assert.equal(blockHP[2][0], 0, '空洞の HP が変わった');
});

// ---------- 実際の7面 ----------

test('実際の7面: 施設エリアが 1 個以上あり、区画（余白込み）・開始の部屋・基地の部屋と重ならない', async () => {
  for (const m of await maps()) {
    assert.ok(m.facilityAreas.length >= 1, '施設エリアが無い');
    const zones = m.fortressZones.map((z) => ({
      r0: z.r0 - FORTRESS_ZONE_MARGIN, r1: z.r1 + FORTRESS_ZONE_MARGIN,
      c0: z.c0 - FORTRESS_ZONE_MARGIN, c1: z.c1 + FORTRESS_ZONE_MARGIN,
    }));
    for (const a of m.facilityAreas) {
      for (const x of [...m._reservedRects(), ...zones]) assert.ok(!overlap(a, x), '予約・区画と重なる');
    }
  }
});

test('実際の7面: facility の印は施設エリアの矩形の中だけに立つ', async () => {
  for (const m of await maps()) {
    let marked = 0;
    for (let r = 0; r < m.rows; r++) {
      for (let c = 0; c < m.cols; c++) {
        const inside = m.facilityAreas.some((a) => r >= a.r0 && r <= a.r1 && c >= a.c0 && c <= a.c1);
        assert.equal(m.facility[r * m.cols + c] === 1, inside, `(${r},${c})`);
        if (inside) marked++;
      }
    }
    assert.ok(marked > 0);
  }
});

test('実際の7面: 施設エリアの縁の岩は金属（壊せない岩を除く）', async () => {
  for (const m of await maps()) {
    for (const a of m.facilityAreas) {
      for (let r = a.r0; r <= a.r1; r++) {
        for (let c = a.c0; c <= a.c1; c++) {
          const edge = r === a.r0 || r === a.r1 || c === a.c0 || c === a.c1;
          const b = m.grid[r][c];
          if (edge && b !== E && b !== X) assert.equal(b, M, `縁 (${r},${c}) が ${b}`);
        }
      }
    }
  }
});

test('7面以外では施設エリアは無く、印も立たない', async () => {
  for (const level of [0, 4]) {
    for (const m of await maps(level)) {
      assert.deepEqual(m.facilityAreas, []);
      assert.ok(m.facility.every((v) => v === 0));
    }
  }
});

test('7面の Map を2回作っても同じ施設エリア（週次の決定性）', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const a = new Map({ rng: new SeededRNG(5) }, 6);
  const b = new Map({ rng: new SeededRNG(5) }, 6);
  assert.deepEqual(a.facilityAreas, b.facilityAreas);
  assert.deepEqual(a.grid, b.grid);
});

test('施設エリアの生成は game.rng を消費しない（消費すると敵の構成が変わる）', async () => {
  // 地形が変われば後の湧き探しの乱数の使い方も変わるので、生成の前後の state を直接比べる
  const { Map } = await import('../src/js/world/Map.js');
  const orig = Map.prototype._generateFacility;
  const seen = [];
  Map.prototype._generateFacility = function () {
    const before = this.game.rng.state;
    orig.call(this);
    seen.push([before, this.game.rng.state, this.facilityAreas.length]);
  };
  try {
    new Map({ rng: new SeededRNG(9) }, 6);
  } finally {
    Map.prototype._generateFacility = orig;
  }
  assert.equal(seen.length, 1);
  assert.ok(seen[0][2] > 0, '施設エリアが置かれていない（見本にならない）');
  assert.equal(seen[0][1], seen[0][0]);
});

// ---------- 金属の階段 ----------

/** 床が行 30 の大きな空洞（周りは岩）と、その中の部屋 */
function cave() {
  const rows = 40, cols = 60;
  const grid = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (
    r >= 5 && r < 30 && c >= 5 && c < 55 ? E : N)));
  const blockHP = grid.map((row) => row.map((b) => (b === E ? 0 : 1)));
  const rooms = [{ centerR: 20, centerC: 20 }, { centerR: 20, centerC: 40 }];
  return { grid, blockHP, rows, cols, rooms };
}
const stairArgs = (w, seed) => ({ ...w, rng: new SeededRNG(seed), count: 4, lengthMin: 3, lengthRange: 3 });

test('carveSnowStairs: block/hp/withinRects を省いた呼び出しと、既定値を明示した呼び出しは同じ階段を盛る', () => {
  for (const seed of [1, 2, 3, 4]) {
    const a = cave(), b = cave();
    const ra = carveSnowStairs(stairArgs(a, seed));
    const rb = carveSnowStairs({ ...stairArgs(b, seed), block: N, hp: 1, withinRects: null });
    assert.ok(ra.length > 0);
    assert.deepEqual(rb, ra);
    assert.deepEqual(b.grid, a.grid);
  }
});

test('carveSnowStairs: block/hp を渡すと、盛った段がそのブロック・HP になる', () => {
  const w = cave();
  const before = w.grid.map((row) => row.slice());
  const stairs = carveSnowStairs({ ...stairArgs(w, 2), block: M, hp: METAL_BLOCK_HP });
  assert.ok(stairs.length > 0);
  let added = 0;
  for (let r = 0; r < w.rows; r++) {
    for (let c = 0; c < w.cols; c++) {
      if (before[r][c] !== w.grid[r][c]) {
        added++;
        assert.equal(w.grid[r][c], M);
        assert.equal(w.blockHP[r][c], METAL_BLOCK_HP);
      }
    }
  }
  assert.ok(added > 0);
});

test('carveSnowStairs: withinRects を渡すと、段のセルは全部その矩形の中', () => {
  const within = [{ r0: 10, r1: 29, c0: 12, c1: 28 }];
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const w = cave();
    const before = w.grid.map((row) => row.slice());
    carveSnowStairs({ ...stairArgs(w, seed), withinRects: within });
    for (let r = 0; r < w.rows; r++) {
      for (let c = 0; c < w.cols; c++) {
        if (before[r][c] === w.grid[r][c]) continue;
        assert.ok(r >= 10 && r <= 29 && c >= 12 && c <= 28, `矩形の外に段 (${r},${c})`);
      }
    }
  }
});

test('実際の7面: 金属の階段がある（SEEDS 合計 1 本以上）。段は全部 BLOCK_METAL で施設エリアの中', async () => {
  let total = 0;
  for (const m of await maps()) {
    for (const st of m.metalStairs) {
      total++;
      for (let i = 0; i < st.length; i++) {
        const c = st.c + st.dir * i;
        for (let k = 0; k <= i; k++) {
          const r = st.r - k;
          assert.equal(m.grid[r][c], M, `段 (${r},${c}) が金属でない`);
          assert.equal(m.facility[r * m.cols + c], 1, `段 (${r},${c}) が施設エリアの外`);
        }
      }
    }
  }
  assert.ok(total >= 1, '金属の階段が1本も無い');
});

// ---------- 形の規則 'metalSlope' ----------

const asciiCell = (rows) => (r, c) => {
  if (r < 0 || c < 0 || r >= rows.length || c >= rows[0].length) return 'polished';
  return { '.': 'empty', '#': 'rock', 'P': 'polished' }[rows[r][c]];
};

test('metalSlope: 1段ずつの階段の段は、タイル1枚ぶんの45度の斜面になる', () => {
  const rows = ['.....', '..###', '.####', '#####'];
  // (1,2) は上と左が空、右と下と左下が岩 → 左上が開いた斜面
  assert.equal(computeTileShape(asciiCell(rows), 1, 2, 'metalSlope'),
    packShape(Q_EMPTY, Q_TRI_NO_TL, Q_TRI_NO_TL, Q_FULL));
});

test('metalSlope: 床の縁・浮いた板の先は削らない（雪の規則なら 8px の面取りになる配置）', () => {
  const plate = ['.....', '###..', '.....'];
  assert.notEqual(computeTileShape(asciiCell(plate), 1, 2, 'snowSlope'), SHAPE_FULL, '前提: 雪なら面取り');
  assert.equal(computeTileShape(asciiCell(plate), 1, 2, 'metalSlope'), SHAPE_FULL);
  const edge = ['.....', '###..', '#####'];
  // (1,2) は右と上が空、下と右下が岩 → 斜面の条件（右下が岩）を満たすので斜面。(1,1) の上の角は凹角で削らない
  assert.equal(computeTileShape(asciiCell(edge), 1, 1, 'metalSlope'), SHAPE_FULL);
});

test('metalSlope: 磨き仕上げ（polished）は削らない', () => {
  const rows = ['.....', '..PPP', '.PPPP', 'PPPPP'];
  assert.equal(computeTileShape(asciiCell(rows), 1, 2, 'metalSlope'), SHAPE_FULL);
});

test('実際の7面: 削れたタイルは全部施設エリアの中の金属で、斜面は SEEDS 合計 1 枚以上', async () => {
  let slopes = 0;
  for (const m of await maps()) {
    assert.equal(m.tileShapeRule, 'metalSlope');
    for (let r = 0; r < m.rows; r++) {
      for (let c = 0; c < m.cols; c++) {
        const code = m.tileShapeAt(r, c);
        if (code === SHAPE_FULL || code === SHAPE_EMPTY) continue;
        slopes++;
        assert.equal(m.facility[r * m.cols + c], 1, `施設エリアの外が削れた (${r},${c})`);
        assert.equal(m.grid[r][c], M, `斜面 (${r},${c}) が金属でない`);
        assert.equal(m.blockHP[r][c], METAL_BLOCK_HP);
      }
    }
  }
  assert.ok(slopes >= 1, '斜面が1枚も無い');
});

test('5面の形は従来どおり（雪の規則で各タイルを直接計算した結果と同じ）', async () => {
  for (const m of await maps(4)) {
    assert.equal(m.tileShapeRule, 'snowSlope');
    const cellAt = (r, c) => {
      if (r < 0 || r >= m.rows || c < 0 || c >= m.cols) return 'polished';
      const b = m.grid[r][c];
      if (b === E) return 'empty';
      return b === X || b === M ? 'polished' : 'rock';
    };
    for (let r = 0; r < m.rows; r++) {
      for (let c = 0; c < m.cols; c++) {
        assert.equal(m.tileShapes[r * m.cols + c], computeTileShape(cellAt, r, c, 'snowSlope'), `(${r},${c})`);
      }
    }
  }
});

// 左半分は床 row 11、列 10..19 が右へ下る階段（列 10 が row 11、列 19 が row 20）。tests/environment-snow-motion.test.js と同じ
function slopeRows() {
  const rows = [];
  for (let r = 0; r < 24; r++) {
    let s = '';
    for (let c = 0; c < 30; c++) {
      let floor = 20;
      if (c >= 10 && c < 20) floor = 11 + (c - 10);
      if (c < 10) floor = 11;
      s += r >= floor ? '#' : '.';
    }
    rows.push(s);
  }
  return rows;
}
const idle = () => ({
  keys: {}, isKeyDown: () => false, isKeyPressed: () => false, isCharPressed: () => false,
  mouse: { left: false, right: false }, isLeftClickPressed: () => false, isRightClickPressed: () => false,
  rightHoldFrames: 0, crosshairLocked: false,
  getMouseWorld: () => ({ x: 0, y: 0 }), getTargetWorld: () => ({ x: 0, y: 0 }),
});

test('金属の斜面の上で、入力なしの自機は滑らない（7面は雪の環境ではない）', () => {
  const game = makeGame(makeMap(slopeRows(), null, { tileShape: 'metalSlope' }));
  game.input = idle();
  const p = new Player(game, 13 * T, 14 * T - 24);
  game.player = p;
  for (let i = 0; i < 20 && !p.onGround; i++) p.update();
  assert.ok(p.onGround, '前提: 斜面に着地すること');
  const x0 = p.x;
  for (let i = 0; i < 60; i++) p.update();
  assert.ok(Math.abs(p.x - x0) < 0.5, `滑った: ${x0} → ${p.x}`);
});

test('金属の斜面で、グレネードは下へ転がり落ちる', () => {
  const map = makeMap(slopeRows(), null, { tileShape: 'metalSlope' });
  map.width = map.cols * T; map.height = map.rows * T;
  map.destroyArea = () => [];
  const game = makeGame(map);
  // 列 12 の段の少し上から、横の速さ 0 で落とす。斜面は右へ下る
  const g = new Grenade(game, 12 * T + 8, 12 * T, Math.PI / 2, 0);
  const x0 = g.x, y0 = g.y;
  for (let f = 0; f < 200; f++) { g.lifetime = 1e9; g.update(); }
  assert.ok(g.x - x0 >= T, `転がっていない: x ${x0} → ${g.x}`);
  assert.ok(g.y > y0 + T, `下っていない: y ${y0} → ${g.y}`);
});

test('実際の7面: 金属の段を壊し切るとそのタイルは空になり、上の段の斜面は残る（壊しても岩が増えない＝決定13）', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const m = new Map({ rng: new SeededRNG(1) }, 6);
  // 段 i=1 の列は2タイル（下 st.r、上 st.r-1）。上が斜面
  const st = m.metalStairs.find((x) => x.length >= 2);
  assert.ok(st, '前提: 2段以上の階段がある');
  const target = { r: st.r, c: st.c + st.dir };
  const above = (target.r - 1) * m.cols + target.c;
  const beforeAbove = m.tileShapes[above];
  assert.ok(beforeAbove !== SHAPE_FULL && beforeAbove !== SHAPE_EMPTY, '前提: 上の段が斜面');
  for (let i = 0; i < METAL_BLOCK_HP; i++) m.damageBlock(target.r, target.c, 1);
  assert.equal(m.grid[target.r][target.c], E);
  assert.equal(m.tileShapeAt(target.r, target.c), SHAPE_EMPTY);
  // 下が空いて斜面の条件は崩れるが、作り直しは前の形と両方に収まる形にするので、四角（岩が増える）に戻らない
  assert.equal(m.tileShapes[above], beforeAbove);
});

// ---------- 描画 ----------

/** _drawTile がどの絵で描いたかを記録する（panelBlocks の関数は Map が import しているので、Map のメソッドで見る） */
function drawnKinds(m, cells) {
  const seen = [];
  const orig = { panel: m._drawPanelBlock, rocky: m._drawRockyBlock };
  m._drawPanelBlock = (ctx, r, c, block) => seen.push(['panel', r, c, block]);
  m._drawRockyBlock = (ctx, r, c, block) => seen.push(['rock', r, c, block]);
  try {
    for (const [r, c] of cells) m._drawTile(makeFakeCtx(), r, c);
  } finally {
    m._drawPanelBlock = orig.panel; m._drawRockyBlock = orig.rocky;
  }
  return seen;
}

function findCell(m, pred) {
  for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) if (pred(r, c)) return [r, c];
  return null;
}

test('施設エリアの通常の岩・硬い岩・金属はパネルで描き、エリアの外の通常の岩・硬い岩は岩で描く', async () => {
  const [m] = await maps();
  const inF = (r, c) => m.facility[r * m.cols + c] === 1 && m.fortress[r * m.cols + c] !== 1;
  const outF = (r, c) => m.facility[r * m.cols + c] === 0 && m.fortress[r * m.cols + c] !== 1;
  const cells = [
    findCell(m, (r, c) => inF(r, c) && m.grid[r][c] === N),
    findCell(m, (r, c) => inF(r, c) && m.grid[r][c] === H),
    findCell(m, (r, c) => inF(r, c) && m.grid[r][c] === M),
    findCell(m, (r, c) => outF(r, c) && m.grid[r][c] === N),
    findCell(m, (r, c) => outF(r, c) && m.grid[r][c] === H),
  ];
  assert.ok(cells.every(Boolean), '前提: 各種のタイルがある');
  assert.deepEqual(drawnKinds(m, cells).map((x) => x[0]), ['panel', 'panel', 'panel', 'rock', 'rock']);
});

test('パネルの振り分け: 施設エリアの通常の岩は薄い板、硬い岩は装甲板、金属は金属パネル', async () => {
  const [m] = await maps();
  const calls = [];
  const inF = (r, c) => m.facility[r * m.cols + c] === 1;
  const which = (b) => findCell(m, (r, c) => inF(r, c) && m.grid[r][c] === b);
  // 絵の関数を見分ける: 薄い板は筋（白い1px高の横線）が無く、金属は筋がある。装甲板は四隅のボルト（2x2）
  for (const [b, expect] of [[N, 'plate'], [H, 'armor'], [M, 'metal']]) {
    const [r, c] = which(b);
    const ctx = makeFakeCtx();
    m._drawPanelBlock(ctx, r, c, b);
    calls.push([b, expect, kindOf(ctx)]);
  }
  for (const [b, expect, got] of calls) assert.equal(got, expect, `ブロック ${b}`);
});

/** fake ctx の記録から絵の種類を当てる */
function kindOf(ctx) {
  let style = '';
  let rolled = 0, bolts = 0;
  for (const call of ctx.calls) {
    if (call.name === 'set:fillStyle') style = call.args[0];
    if (call.name !== 'fillRect') continue;
    const [, , w, h] = call.args;
    if (h === 1 && w >= 10 && /^rgba\(255,255,255,0\.(0[5-9]|1[0-4])/.test(style)) rolled++;
    if (w === 2 && h === 2 && style === 'rgba(255,255,255,0.16)') bolts++;
  }
  if (bolts >= 4) return 'armor';
  return rolled > 0 ? 'metal' : 'plate';
}

test('薄い板は圧延の筋を描かず、金属パネルは描く（硬さの見分け）', () => {
  const exp = { t: false, b: false, l: false, r: false };
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      const plate = makeFakeCtx();
      drawPlatePanel(plate, 0, 0, T, { fill: '#556070', exp, rng: tileRng(r, c) });
      assert.equal(kindOf(plate), 'plate');
      const metal = makeFakeCtx();
      drawMetalPanel(metal, 0, 0, T, { fill: '#6B7A8C', exp, seamLeft: true, heat: 0, rng: tileRng(r, c) });
      assert.equal(kindOf(metal), 'metal');
    }
  }
});

/** 記録された fillRect が覆う画素（タイル内のローカル座標）を全部返す */
function paintedPixels(ctx, x0, y0) {
  const px = [];
  for (const call of ctx.calls) {
    if (call.name !== 'fillRect') continue;
    const [x, y, w, h] = call.args;
    for (let yy = Math.floor(y); yy < Math.floor(y) + Math.ceil(h); yy++) {
      for (let xx = Math.floor(x); xx < Math.floor(x) + Math.ceil(w); xx++) px.push([xx - x0, yy - y0]);
    }
  }
  return px;
}

test('斜面のパネルは形の外へ塗らず、形の中は塗り残さない（3種とも）', () => {
  const ramp = packShape(Q_EMPTY, Q_TRI_NO_TL, Q_TRI_NO_TL, Q_FULL);
  const exp = { t: true, b: false, l: true, r: false };
  const draws = [
    (ctx) => drawMetalPanel(ctx, 32, 48, T, { fill: '#6B7A8C', exp, seamLeft: true, heat: 0, rng: tileRng(3, 2), shape: ramp }),
    (ctx) => drawArmorPanel(ctx, 32, 48, T, { fill: '#555555', exp, damage: 1, rng: tileRng(3, 2), shape: ramp }),
    (ctx) => drawPlatePanel(ctx, 32, 48, T, { fill: '#556070', exp, rng: tileRng(3, 2), shape: ramp }),
  ];
  for (const draw of draws) {
    const ctx = makeFakeCtx();
    draw(ctx);
    const painted = paintedPixels(ctx, 32, 48);
    assert.ok(painted.length > 0);
    for (const [lx, ly] of painted) {
      assert.ok(lx >= 0 && lx < T && ly >= 0 && ly < T, `タイルの外 (${lx},${ly})`);
      assert.ok(shapeContainsPoint(ramp, lx + 0.5, ly + 0.5), `形の外を塗った (${lx},${ly})`);
    }
    const set = new Set(painted.map(([x, y]) => `${x},${y}`));
    for (let ly = 0; ly < T; ly++) {
      for (let lx = 0; lx < T; lx++) {
        if (shapeContainsPoint(ramp, lx + 0.5, ly + 0.5)) assert.ok(set.has(`${lx},${ly}`), `塗り残し (${lx},${ly})`);
      }
    }
  }
});

test('斜面のパネルは斜辺に沿って明るい縁を引く（光は左上から）', () => {
  const ramp = packShape(Q_EMPTY, Q_TRI_NO_TL, Q_TRI_NO_TL, Q_FULL);
  const exp = { t: true, b: false, l: true, r: false };
  const ctx = makeFakeCtx();
  drawMetalPanel(ctx, 0, 0, T, { fill: '#6B7A8C', exp, seamLeft: false, heat: 0, rng: tileRng(1, 1), shape: ramp });
  // 斜辺の画素（形の中で、すぐ上の画素が形の外）に、白い塗りが掛かっていること
  let style = '';
  const lit = new Set();
  for (const call of ctx.calls) {
    if (call.name === 'set:fillStyle') style = call.args[0];
    if (call.name === 'fillRect' && /^rgba\(255,255,255,0\.[3-9]/.test(style)) {
      const [x, y, w, h] = call.args;
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) lit.add(`${xx},${yy}`);
    }
  }
  let edge = 0, hit = 0;
  for (let ly = 1; ly < T; ly++) {
    for (let lx = 0; lx < T; lx++) {
      const inside = shapeContainsPoint(ramp, lx + 0.5, ly + 0.5);
      if (inside && !shapeContainsPoint(ramp, lx + 0.5, ly - 0.5)) { edge++; if (lit.has(`${lx},${ly}`)) hit++; }
    }
  }
  assert.ok(edge >= 8, `前提: 斜辺の画素 ${edge}`);
  assert.ok(hit >= edge - 1, `斜辺の縁が明るくない（${hit}/${edge}）`);
});

test('_drawPanelBlock は斜面のタイルに形を渡し、四角のタイルには渡さない', async () => {
  const [m] = await maps();
  const slope = findCell(m, (r, c) => {
    const k = m.tileShapeAt(r, c); return k !== SHAPE_FULL && k !== SHAPE_EMPTY;
  });
  assert.ok(slope);
  const ctx = makeFakeCtx();
  m._drawPanelBlock(ctx, slope[0], slope[1], m.grid[slope[0]][slope[1]]);
  const code = m.tileShapeAt(slope[0], slope[1]);
  for (const [lx, ly] of paintedPixels(ctx, slope[1] * T, slope[0] * T)) {
    assert.ok(shapeContainsPoint(code, lx + 0.5, ly + 0.5), `斜面のタイルで形の外を塗った (${lx},${ly})`);
  }
});
