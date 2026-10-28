// ホバー中の自機・敵アタッカーの粉雪も、岩の中ではなく地面の上面から出す（キャリアは
// carrier-snow-mist-on-slope.test.js）。地面は 4px 刻みで探すので、見つかった点は上面から 0〜4px 下の
// 岩の中になり、そこから出た粒は動き出した途端に岩に当たって消える。浮いている高さで食い込みが
// 変わるので、キャリアほどではないが、高さによっては大半が消えていた（ユーザー指定で同じように直す）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { makeMap, makeGame, makeAttacker, flatFloorRows } from './helpers/enemy-world.js';
import { TILE_SIZE, PLAYER_HEIGHT, ICE_SLIDE, HOVER_SNOW_MIST_MAX_ALT, HOVER_SNOW_MIST_BURST_COUNT } from '../src/js/utils/Constants.js';

const SNOW = { motionAt: () => ({ speed: 1, gravity: 1, slide: ICE_SLIDE }), sightScale: 1, kind: 'snow' };
const FLOOR_Y = 20 * TILE_SIZE; // flatFloorRows(): row 20 から下が地形

// 4px 刻みの探索の半端が全部出るよう、0.5px ずつ上限まで
const HEIGHTS = [];
for (let h = 0; h < HOVER_SNOW_MIST_MAX_ALT - 4; h += 0.5) HEIGHTS.push(h);

function originsOf(makeEntity) {
  const ys = [];
  for (const h of HEIGHTS) {
    const game = makeGame(makeMap(flatFloorRows()));
    game.env = SNOW;
    game.spawnSnowMist = (x, y, n) => { if (n === HOVER_SNOW_MIST_BURST_COUNT) ys.push({ h, y }); };
    const e = makeEntity(game, FLOOR_Y - h - PLAYER_HEIGHT);
    e.onGround = false;
    e.onTerrain = false;
    e.motion = SNOW.motionAt();
    e._burstSnowPuff = true;   // 間引きを待たずに 1 回出させる
    e._kickHoverSnowMist();
  }
  return ys;
}

for (const [name, make] of [
  ['自機', (game, y) => new Player(game, 5 * TILE_SIZE, y)],
  ['敵アタッカー', (game, y) => { const a = makeAttacker(game, 5 * TILE_SIZE, y); return a; }],
]) {
  test(`${name}: どの高さでホバーしていても、粉雪は雪面の上面から出る（岩の中から出ない）`, () => {
    const ys = originsOf(make);
    assert.equal(ys.length, HEIGHTS.length, '全部の高さで出ている');
    const off = ys.filter((k) => Math.abs(k.y - FLOOR_Y) > 1e-6).map((k) => `${k.h}px上: ${(k.y - FLOOR_Y).toFixed(2)}`);
    assert.deepEqual(off.slice(0, 6), [], `${off.length} / ${ys.length} の高さで上面からずれた`);
  });
}
