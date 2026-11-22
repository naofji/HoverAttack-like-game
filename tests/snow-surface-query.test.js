// 雪の積もった上面の問い合わせ（Map.snowSurfaceY）。弾の着弾・爆発で雪を舞わせるかをここで決める。
// 雪面の定義は描画（mapRender の積雪の帯）と同じ: 5面で、積雪ビット exposedAtGen が立つマスの上面。
// 側面・天井の下面・ビットの無い上面（掘った穴の底など）からは雪を出さない。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMap } from './helpers/enemy-world.js';
import { TILE_SIZE } from '../src/js/utils/Constants.js';

const T = TILE_SIZE;
const FLOOR_Y = 20 * T;

/**
 * row 20 から下が床。列 10〜11 は row 12 から下の壁、列 3〜5 の row 5 は浮いた板（天井の下面を撃つ用）。
 * 列 14〜17 は 1 段ずつ上がる階段（snowSlope で坂になる）。
 */
function worldRows() {
    const rows = [];
    for (let r = 0; r < 24; r++) {
        let s = '';
        for (let c = 0; c < 24; c++) {
            let solid = r >= 20;
            if ((c === 10 || c === 11) && r >= 12) solid = true;
            if (c >= 3 && c <= 5 && r === 5) solid = true;
            if (c >= 14 && c <= 17 && r >= 19 - (c - 14)) solid = true;
            s += solid ? '#' : '.';
        }
        rows.push(s);
    }
    return rows;
}

const snowMap = (opts = {}) => makeMap(worldRows(), null, { envKind: 'snow', snowCaps: true, ...opts });

test('雪の上面に上から入れば上面の y を返す', () => {
    const map = snowMap();
    const x = 7 * T + 5;
    assert.equal(map.snowSurfaceY(x, FLOOR_Y - 10, FLOOR_Y + 3), FLOOR_Y);
});

test('壁の側面に横から当たったら null（側面に雪は無い）', () => {
    const map = snowMap();
    const x = 10 * T + 1;          // 壁の左端の中
    // 壁の一番上のマス（row 12。積雪ビットが立つ）の側面。下のマスだとビットが無いので、側面の判定を試せない
    const y = 12 * T + 4;
    assert.equal(map.snowSurfaceY(x, y - 0.5, y), null);
});

test('天井の下面に下から当たったら null', () => {
    const map = snowMap();
    const x = 4 * T + 8;
    const y = 5 * T + T - 1;       // 板の下面のすぐ内側
    assert.equal(map.snowSurfaceY(x, y, y), null);
});

test('積雪ビットの無い上面は null（掘った穴の底など）', () => {
    const map = snowMap();
    const c = 7;
    map.exposedAtGen[20 * map.cols + c] = 0;
    assert.equal(map.snowSurfaceY(c * T + 5, FLOOR_Y - 10, FLOOR_Y + 3), null);
});

test('雪の面でなければ null', () => {
    const cave = makeMap(worldRows(), null, { envKind: 'cave', snowCaps: true });
    assert.equal(cave.snowSurfaceY(7 * T + 5, FLOOR_Y - 10, FLOOR_Y + 3), null);
});

test('積雪ビットを持たない地図でも例外を投げず null', () => {
    const bare = makeMap(worldRows(), null, { envKind: 'snow' });
    assert.equal(bare.snowSurfaceY(7 * T + 5, FLOOR_Y - 10, FLOOR_Y + 3), null);
});

test('範囲の中に上面が無ければ null', () => {
    const map = snowMap();
    assert.equal(map.snowSurfaceY(7 * T + 5, FLOOR_Y - 40, FLOOR_Y - 10), null);
});

test('坂の上面に上から入れば坂の高さ（terrainTopY と同じ値）を返す', () => {
    const map = snowMap({ tileShape: 'snowSlope' });
    const x = 15 * T + 5;
    const top = map.terrainTopY(x, 10 * T, 22 * T);
    assert.ok(top > 17 * T && top < 19 * T, `坂の高さが想定外: ${top}`);
    assert.notEqual(top % T, 0, '坂ではなく平らな面を拾っている（fixture を見直す）');
    assert.equal(map.snowSurfaceY(x, 10 * T, 22 * T), top);
});
