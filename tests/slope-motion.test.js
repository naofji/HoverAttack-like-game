// 機体を坂から押し出す・坂へ吸着する共通の部品のテスト。
// 箱は自機と同じ 16x24、点判定の点は getDefaultCheckPoints（足は y+h-1、頭は y+2）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMap } from './helpers/enemy-world.js';
import { collidesWithMap, collidesWithTerrain, getDefaultCheckPoints } from '../src/js/utils/Physics.js';
import { liftOutOfFloor, dropOutOfCeiling, floorBelow, ceilingAbove } from '../src/js/utils/slopeMotion.js';
import { TILE_SIZE as T } from '../src/js/utils/Constants.js';

const EMPTY5 = ['......', '......', '......', '......', '......'];
// 右へ上る階段。斜めの段は (7,2)(6,3)(5,4)。(7,2) の上面は y = 7T + 16 − lx
const RAMP = [...EMPTY5, '....##', '...###', '..####', '######'];
// 天井の階段。斜めの段は (1,2)(2,3)(3,4)。(1,2) の下面は y = T + lx
const CEIL = ['######', '..####', '...###', '....##', ...EMPTY5];

const box = (x, y) => ({ x, y, width: 16, height: 24 });
const snow = (rows) => makeMap(rows, null, { tileShape: 'snowSlope' });

test('liftOutOfFloor: 足が斜辺に 3px めり込んだ箱は 3px 持ち上げれば出る。上限が足りなければ null', () => {
    const m = snow(RAMP);
    // 足の列は x+2, x+8, x+14 → 上面 7T+14, 7T+8, 7T+2。一番高い 7T+2 より 3px 下に足
    const b = box(2 * T, 7 * T + 5 - 24);
    assert.equal(collidesWithTerrain(b, m), true);
    assert.equal(liftOutOfFloor(m, b, 4), 3);
    assert.equal(liftOutOfFloor(m, b, 2), null);
    assert.equal(b.y, 7 * T + 5 - 24, '箱の位置を書き換えない');
});

test('liftOutOfFloor: 持ち上げた先で頭が岩に当たるなら null', () => {
    const rows = [...RAMP];
    rows[5] = '..#.##'; // 持ち上げた頭の点（y+2 = 5T + 12）の位置に浮いた岩（菱形。頭の中央の点が掛かる）
    const m = snow(rows);
    assert.equal(liftOutOfFloor(m, box(2 * T, 7 * T + 5 - 24), 4), null);
});

test('dropOutOfCeiling: 天井の斜面に頭が入った箱は、斜面の下面の 0.01px 下まで下ろす', () => {
    const m = snow(CEIL);
    // 頭の点 y+2 の列 x+14 で下面は T+14。頭の点がちょうどそこ
    const b = box(2 * T, T + 12);
    assert.equal(collidesWithTerrain(b, m), true);
    const drop = dropOutOfCeiling(m, b, 3);
    assert.ok(Math.abs(drop - 2.01) < 1e-9, `drop=${drop}`);
    assert.equal(dropOutOfCeiling(m, b, 1), null);
});

test('dropOutOfCeiling: 下ろした先で体の別の点が岩に当たるなら null', () => {
    const rows = [...CEIL];
    rows[3] = '..#.##'; // 体の下のほうに浮いた岩（菱形）
    const m = snow(rows);
    // 頭は上と同じく天井の斜面に入っている。足もとの点 (x+8, y+30) が下ろした先で岩に入る
    const points = (e) => [...getDefaultCheckPoints(e), { x: e.x + 8, y: e.y + 30 }];
    assert.equal(dropOutOfCeiling(m, box(2 * T, T + 12), 3, points), null);
});

test('floorBelow: 浮いた箱の足の列で一番高い床の y。届かなければ null', () => {
    const m = snow(RAMP);
    const b = box(2 * T, 7 * T - 3 - 24); // 足（y+h）は一番高い面 7T+2 の 5px 上
    assert.equal(floorBelow(m, b, 6), 7 * T + 2);
    assert.equal(floorBelow(m, b, 4), null);
    // 範囲を広げて3列とも床が見つかっても、一番高い面（足が最初に着く面）を返す
    assert.equal(floorBelow(m, b, 20), 7 * T + 2);
    // 四角い床でも使える
    const flat = makeMap([...EMPTY5, '......', '######']);
    assert.equal(floorBelow(flat, box(T, 6 * T - 24 - 2), 3), 6 * T);
});

test('ceilingAbove: 箱の頭の列で一番低い天井の y。届かなければ null', () => {
    const m = snow(CEIL);
    const b = box(2 * T, T + 17); // 頭（y）は一番低い下面 T+14 の 3px 下
    assert.equal(ceilingAbove(m, b, 4), T + 14);
    assert.equal(ceilingAbove(m, b, 2), null);
    // 3列とも天井が見つかっても、一番低い面（頭が最初に当たる面）を返す
    assert.equal(ceilingAbove(m, b, 20), T + 14);
});

test('collidesWithTerrain は斜辺の上の空中では偽、タイル単位の collidesWithMap は真', () => {
    const m = snow(RAMP);
    const b = box(2 * T, 7 * T + 2 - 24); // 足の点（y+h−1 = 7T+1）は (7,2) の斜辺の手前
    assert.equal(collidesWithTerrain(b, m), false);
    assert.equal(collidesWithMap(b, m), true);
});
