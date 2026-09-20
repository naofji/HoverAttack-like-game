// キャリア（母艦）の下でも雪面で粉雪が舞う。
//
// 自機・敵アタッカーと違い、キャリアには重力に逆らうホバー推力が無く、
// 地形に衝突した位置でそのまま止まる（実機の指摘: 実際のプレイでは
// SpawnManager が床にぴったり乗る高さへ配置するため、地面から16〜32px
// 浮いた状態はほぼ発生しない）。「止まっていても常にスラスターは動いている」
// という想定なので、キャリアだけは下限を実質0にして、接地に近い状態（clearance
// が浅い）でも上限(HOVER_SNOW_MIST_MAX_ALT)までは常に粉雪が出るようにする。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Carrier } from '../src/js/entities/Carrier.js';
import { makeMap, makeGame, flatFloorRows } from './helpers/enemy-world.js';
import {
  TILE_SIZE, ICE_SLIDE,
  HOVER_SNOW_MIST_MIN_ALT, HOVER_SNOW_MIST_MAX_ALT, HOVER_SNOW_MIST_INTERVAL,
} from '../src/js/utils/Constants.js';

const SNOW = { motionAt: () => ({ speed: 1, gravity: 1, slide: ICE_SLIDE }), sightScale: 1, kind: 'snow' };
const FLOOR_Y = 20 * TILE_SIZE; // flatFloorRows(): row 20 から下が地形

function hoveringCarrier(env, clearance, rows = flatFloorRows()) {
  const game = makeGame(makeMap(rows));
  game.env = env;
  const mists = [];
  game.spawnSnowMist = (x, y, n) => mists.push({ x, y, n });
  const c = new Carrier(game, 5 * TILE_SIZE, 0);
  c.y = FLOOR_Y - clearance - c.height;
  c.motion = env.motionAt();
  game.carrier = c;
  return { game, c, mists };
}

function callMany(fn, times = HOVER_SNOW_MIST_INTERVAL) {
  for (let i = 0; i < times; i++) fn();
}

test('雪面から1〜2ブロック上空にいるキャリアの下でも粉雪が舞う', () => {
  const { c, mists } = hoveringCarrier(SNOW, (HOVER_SNOW_MIST_MIN_ALT + HOVER_SNOW_MIST_MAX_ALT) / 2);
  callMany(() => c._kickHoverSnowMist());
  assert.ok(mists.length > 0, '一度も撒かれていない');
});

test('接地に近くても(clearance=0)粉雪は出る（キャリアは下限が無い）', () => {
  const { c, mists } = hoveringCarrier(SNOW, 0);
  callMany(() => c._kickHoverSnowMist());
  assert.ok(mists.length > 0, '出ていない');
});

test('高すぎる（2ブロックより上）と出さない', () => {
  const { c, mists } = hoveringCarrier(SNOW, HOVER_SNOW_MIST_MAX_ALT + TILE_SIZE);
  callMany(() => c._kickHoverSnowMist());
  assert.deepEqual(mists, []);
});

test('雪の面でなければ出さない', () => {
  const LAND = { motionAt: () => ({ speed: 1, gravity: 1, slide: 0 }), sightScale: 1, kind: 'none' };
  const { c, mists } = hoveringCarrier(LAND, (HOVER_SNOW_MIST_MIN_ALT + HOVER_SNOW_MIST_MAX_ALT) / 2);
  callMany(() => c._kickHoverSnowMist());
  assert.deepEqual(mists, []);
});

// --- 見た目の船底との補正 --------------------------------------------------------
// draw() は当たり判定より8px上に船体を描く（「Shifted up to simulate float」）。
// 見た目の船底基準で判定したいので、当たり判定の下端をそのまま使うと
// 実際より8px遠い（＝高く飛んでいる）ものとして扱ってしまう。上限(MAX_ALT)の
// 判定でその差が出ることを確かめる ── 補正が無ければ range 内、補正が
// あれば range 外になる距離を選ぶ。

test('当たり判定基準では上限内でも、見た目の船底基準(+8px)なら上限を超えて出ない', () => {
  const rawD = HOVER_SNOW_MIST_MAX_ALT - 4; // 当たり判定基準では上限未満、+8px補正で上限を超える
  const { c, mists } = hoveringCarrier(SNOW, rawD);
  callMany(() => c._kickHoverSnowMist());
  assert.deepEqual(mists, [], '補正されておらず、上限を超えているのに出てしまっている');
});

// --- 左・中・右の3カ所で独立に判定 -------------------------------------------------
// キャリアは横幅が広い(CARRIER_WIDTH=64px=4タイル)ので、船体中心1点だけでなく
// 左・中央・右それぞれの下で独立に地面までの距離を見て、雪煙も別々に出す
// （実機の指摘: 左右2カ所では足りず、中央も欲しい）。

test('平地では左・中・右の3カ所それぞれから粉雪が出る（別々の x 座標）', () => {
  const { c, mists } = hoveringCarrier(SNOW, (HOVER_SNOW_MIST_MIN_ALT + HOVER_SNOW_MIST_MAX_ALT) / 2);
  callMany(() => c._kickHoverSnowMist());
  const xs = [...new Set(mists.map((m) => m.x))].sort((a, b) => a - b);
  assert.equal(xs.length, 3, `発生地点が3カ所になっていない: ${xs}`);
  const [left, mid, right] = xs;
  assert.ok(left < mid && mid < right, `左<中<右になっていない: ${xs}`);
});

/** 列7未満(左側)は行20から、列7以上(中央・右側)は行35から地形にする段差マップ。 */
function stepFloorRows() {
  const rows = [];
  for (let r = 0; r < 40; r++) {
    let s = '';
    for (let c = 0; c < 24; c++) {
      const floorRow = c < 7 ? 20 : 35;
      s += r >= floorRow ? '#' : '.';
    }
    rows.push(s);
  }
  return rows;
}

test('1カ所だけ範囲内なら、その場所だけ独立して出る（他の2カ所は出ない）', () => {
  // 左1/3(中心x≈90.7, col5)は行20の床から見て範囲内、中央・右1/3(col7・col8)は
  // 行35のずっと下の床まで遠すぎて範囲外になる高さに置く
  const { c, mists } = hoveringCarrier(
    SNOW, (HOVER_SNOW_MIST_MIN_ALT + HOVER_SNOW_MIST_MAX_ALT) / 2, stepFloorRows(),
  );
  callMany(() => c._kickHoverSnowMist());
  assert.ok(mists.length > 0, '左側からも出ていない');
  const leftThirdEnd = c.x + c.width / 3;
  for (const m of mists) {
    assert.ok(m.x < leftThirdEnd, `左1/3以外からも出てしまっている: x=${m.x}`);
  }
});
