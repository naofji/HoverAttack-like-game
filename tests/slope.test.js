import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { stairDirection, slopeDrawOffset, supportColumn, plateTipDirection, plateDrawOffset } from '../src/js/utils/slope.js';
import { makeMap } from './helpers/enemy-world.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TILE_SIZE } from '../src/js/utils/Constants.js';

before(() => {
  // Map のコンストラクタが雪キャップ焼き込みなどで canvas を作るため、
  // tests/environment-snow-cap.test.js と同じ最小限の document スタブが要る
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      return { width: 0, height: 0, getContext: () => ctx, _ctx: ctx };
    },
  };
});

// 右へ上る階段: 行 r の段が列 c、行 r-1 の段が列 c+1、…
function stairsRows() {
  const rows = [];
  for (let r = 0; r < 12; r++) {
    let s = '';
    for (let c = 0; c < 12; c++) s += (r >= 11 - c ? '#' : '.'); // 対角線の下が岩
    rows.push(s);
  }
  return rows;
}

test('stairDirection sees a rising-right staircase from a middle step', () => {
  const map = makeMap(stairsRows());
  // 段 (r=8, c=3): 右隣 (7,4) が1段高く、左隣 (8,2) は空で (9,2) が岩
  assert.equal(stairDirection(map, 8, 3), 1);
});

test('stairDirection is 0 on flat ground and on a single ledge', () => {
  const flat = makeMap(['............', '............', '############']);
  assert.equal(stairDirection(flat, 2, 5), 0);
  const ledge = makeMap(['............', '......######', '############']);
  assert.equal(stairDirection(ledge, 2, 4), 0); // 上りだけで下りが無い
});

// 坂の絵（Map._drawRockyBlock の対角線の面取り）は段の上端より1タイル低いので、
// 描画オフセットは**下向き（正）**。段の低い側の端で +TILE_SIZE、高い側の端で 0。
test('slopeDrawOffset interpolates +TILE..0 down a rising step and 0 on flat', () => {
  assert.equal(slopeDrawOffset(0, 100), 0);
  // dir=+1（右上がり）: 段の左端が低い側
  assert.equal(slopeDrawOffset(1, 3 * TILE_SIZE), TILE_SIZE);
  assert.equal(slopeDrawOffset(1, 3 * TILE_SIZE + TILE_SIZE / 2), TILE_SIZE / 2);
  assert.ok(slopeDrawOffset(1, 4 * TILE_SIZE - 0.001) < 0.1, 'right edge of a rising-right step is the high side');
  // dir=-1（左上がり）は鏡像: 段の右端が低い側
  assert.equal(slopeDrawOffset(-1, 3 * TILE_SIZE), 0);
  assert.equal(slopeDrawOffset(-1, 3 * TILE_SIZE + TILE_SIZE / 2), TILE_SIZE / 2);
  assert.ok(slopeDrawOffset(-1, 4 * TILE_SIZE - 0.001) > TILE_SIZE - 0.1, 'right edge of a rising-left step is the low side');
});

test('supportColumn picks the column whose top surface is at row r, not just any solid one', () => {
  const map = makeMap(stairsRows());
  // 段 (r=8) の上面は列 3。左の列 2 は行 8 では空、右の列 4 は行 8 も岩だが上面は行 7。
  // 足が列 3 と 4 にまたがっていても、乗っているのは列 3
  assert.equal(supportColumn(map, 8, 3 * TILE_SIZE + 8, 4 * TILE_SIZE + 7, 4 * TILE_SIZE), 3);
  // 中心の列がその行に上面を持つならそちらを優先する
  assert.equal(supportColumn(map, 8, 3 * TILE_SIZE, 3 * TILE_SIZE + 15, 3 * TILE_SIZE + 8), 3);
});

// 板状の突出（高さ1、上下が空洞）の先端検出。Map.js の chevronL/chevronR と同じ条件
// （chevronL = 左が露出＝右辺で繋がっている → -1）に一致させる。
test('plateTipDirection sees the two tips of a 2-wide plate', () => {
  const rows = [
    '...........',
    '.....##....', // 列5,6 が板。上下(row0,2)は空
    '...........',
  ];
  const map = makeMap(rows);
  assert.equal(plateTipDirection(map, 1, 5), -1, '左端: 右で繋がっている＝左へ露出');
  assert.equal(plateTipDirection(map, 1, 6), 1, '右端: 左で繋がっている＝右へ露出');
});

test('plateTipDirection is 0 on flat floor, a stair step, a lone pillar, and an interior plate tile', () => {
  // 平地: 下が岩なので板の条件（上下とも空洞）を満たさない
  const flat = makeMap(['............', '............', '############']);
  assert.equal(plateTipDirection(flat, 2, 5), 0);

  // 階段の段: 下が岩
  const ledge = makeMap(['............', '......######', '############']);
  assert.equal(plateTipDirection(ledge, 1, 6), 0);

  // 高さ1の柱: 上下は空洞だが左右も両方空洞（片側だけ露出ではない）
  const pillar = makeMap(['...........', '....#......', '...........']);
  assert.equal(plateTipDirection(pillar, 1, 4), 0);

  // 板の内側の1タイル: 上下は空洞だが左右は両方岩（先端ではない）
  const wide = makeMap(['...........', '..#####....', '...........']);
  assert.equal(plateTipDirection(wide, 1, 4), 0);
});

// 描画オフセット: 接している辺で0、タイル中心でTILE/2、露出側はTILE/2で頭打ち
// （露出側には描いた面が無いので、それより下げると足が宙に浮いて見える）
test('plateDrawOffset is 0 at the attached edge, TILE/2 at the centre and beyond, and 0 for dir=0', () => {
  assert.equal(plateDrawOffset(0, 100), 0);
  // dir=+1（右へ露出＝左辺で繋がっている）: 左端(frac=0)が接地辺
  assert.equal(plateDrawOffset(1, 3 * TILE_SIZE), 0);
  assert.ok(Object.is(plateDrawOffset(1, 3 * TILE_SIZE), 0), '0 は -0 であってはならない');
  assert.equal(plateDrawOffset(1, 3 * TILE_SIZE + TILE_SIZE / 2), TILE_SIZE / 2);
  assert.equal(plateDrawOffset(1, 3 * TILE_SIZE + TILE_SIZE - 0.001), TILE_SIZE / 2, '露出側は中心と同じTILE/2で頭打ち');
  // dir=-1（左へ露出＝右辺で繋がっている）は鏡像: 左端(frac=0)は露出側なのでTILE/2
  assert.equal(plateDrawOffset(-1, 3 * TILE_SIZE), TILE_SIZE / 2);
  assert.equal(plateDrawOffset(-1, 3 * TILE_SIZE + TILE_SIZE / 2), TILE_SIZE / 2);
});

// 検出器が手作りグリッドだけでなく実際の地形でも発火することの見張り。
// このブランチが本物のマップで一度も真にならない「死んだ分岐」でないことを確かめる
// （このブランチ自体が、以前このブランチで一度も発火しない雪の分岐を出荷した反省から）
test('plateTipDirection fires on at least one tile of a real generated stage-5 map', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const map = new Map({ rng: new SeededRNG(42) }, 4); // missionLevel 4 = 5面（積雪）
  let count = 0;
  for (let r = 1; r < map.rows - 1; r++) {
    for (let c = 1; c < map.cols - 1; c++) {
      if (plateTipDirection(map, r, c) !== 0) count++;
    }
  }
  assert.ok(count > 0, `実地形で plateTipDirection が一度も発火しなかった（死んだ分岐）: count=${count}`);
});
