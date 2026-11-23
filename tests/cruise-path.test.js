// 敵基地の巡航ミサイル（7面）の経路探索 utils/cruisePath.js。
// EnemyBase のメソッドだったころはテストが1本も無かった（2026-11-24 に切り出して足した）。
// 本物のマップでの挙動が切り出しの前後で同じことは、使い捨ての総当たり（3シード×7面×12組）で
// 確かめてある。ここでは「何を約束している関数か」を手作りのマップで縛る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCruisePath, smoothCruisePath, hasClearCorridor } from '../src/js/utils/cruisePath.js';
import { hasLineOfSight } from '../src/js/utils/Physics.js';
import { TILE_SIZE } from '../src/js/utils/Constants.js';

const TS = TILE_SIZE;

/** '#' が岩、'.' が空。範囲の外は岩（本物の mapShapes.isSolid と同じ） */
function gridMap(rows) {
    const grid = rows.map((row) => [...row]);
    const map = {
        rows: grid.length,
        cols: grid[0].length,
        isSolid(r, c) {
            if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return true;
            return grid[r][c] === '#';
        },
        isSolidAtPixel(x, y) { return this.isSolid(Math.floor(y / TS), Math.floor(x / TS)); },
        pixelToTile(x, y) { return { c: Math.floor(x / TS), r: Math.floor(y / TS) }; },
    };
    return map;
}

const center = (r, c) => [c * TS + TS / 2, r * TS + TS / 2];

/** 経路のどの区間もミサイルの幅ぶん通れること（平滑化が岩を貫いていない） */
function assertCorridors(map, path) {
    for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        assert.ok(hasClearCorridor(map, a.x, a.y, b.x, b.y), `区間 ${i}: (${a.x},${a.y})→(${b.x},${b.y}) が岩に当たる`);
    }
}

// 広い空洞。壁から3タイル以上離れた帯が通れる
const OPEN = [
    '##############################',
    ...Array.from({ length: 12 }, () => '#............................#'),
    '##############################',
];

test('開けた空洞: 先頭は出発点そのもの、最後は相手のタイルの中心、間はまっすぐ1本', () => {
    const map = gridMap(OPEN);
    const [fx, fy] = [5 * TS + 3, 6 * TS + 5];   // タイルの中心からずらした出発点
    const [tx, ty] = center(7, 24);
    const path = findCruisePath(map, fx, fy, tx + 2, ty - 3);
    assert.ok(path);
    assert.deepEqual(path[0], { x: fx, y: fy });
    assert.deepEqual(path[path.length - 1], { x: tx, y: ty });
    // 遮るものが無いので、糸を引くと出発点→相手の2点になる
    assert.equal(path.length, 2);
});

test('同じタイルにいる相手には経路を出さない', () => {
    const map = gridMap(OPEN);
    const [x, y] = center(6, 10);
    assert.equal(findCruisePath(map, x, y, x + 3, y + 3), null);
});

test('完全に仕切られた向こうの相手には経路が無い', () => {
    const rows = OPEN.map((row, r) => (r === 0 || r === OPEN.length - 1) ? row
        : row.slice(0, 15) + '#' + row.slice(16));
    const map = gridMap(rows);
    assert.equal(findCruisePath(map, ...center(6, 5), ...center(6, 24)), null);
});

test('壁の隙間を通る: 経路は隙間の列を隙間の行で越え、どの区間も幅ぶん通れる', () => {
    // 15列目に壁、5〜9行目だけ開いている（幅5タイル＝左右16pxずつの余裕が取れる）
    const rows = OPEN.map((row, r) => (r === 0 || r === OPEN.length - 1 || (r >= 5 && r <= 9)) ? row
        : row.slice(0, 15) + '#' + row.slice(16));
    const map = gridMap(rows);
    const path = findCruisePath(map, ...center(2, 5), ...center(11, 25));
    assert.ok(path, '隙間があるのに経路が無い');
    assertCorridors(map, path);
    // 壁の列（x = 15*16〜16*16）をまたぐ区間の、壁の列での高さが隙間の行の中にある
    const wallX = 15 * TS + TS / 2;
    const crossing = path.findIndex((p, i) => i > 0 && path[i - 1].x < wallX && p.x >= wallX);
    assert.ok(crossing > 0, '壁の列をまたいでいない');
    const a = path[crossing - 1], b = path[crossing];
    const yAtWall = a.y + (b.y - a.y) * (wallX - a.x) / (b.x - a.x);
    assert.ok(yAtWall >= 5 * TS && yAtWall < 10 * TS, `壁の列を y=${yAtWall} で越えた`);
});

test('角を斜めに切らない: 斜めの隣だけが空いていても通らない', () => {
    // 1マスずつずれた市松の仕切り。斜めにしか抜けられない
    const map = gridMap([
        '#######',
        '#..#..#',
        '#..#..#',
        '###.###',
        '#..#..#',
        '#######',
    ]);
    // (2,2) から (4,4): (3,3) を斜めに抜ける必要があるが、角を切る斜め移動は許さない
    assert.equal(findCruisePath(map, ...center(2, 1), ...center(4, 5)), null);
});

test('hasClearCorridor は中心線だけでなく左右 16px も見る（視線の判定とは別物）', () => {
    const map = gridMap([
        '##########',
        '#........#',
        '#........#',
        '#....#...#',
        '#........#',
        '#........#',
        '##########',
    ]);
    // 岩 (3,5) の上の行を水平に通る線。中心は空いているが、下 16px に岩がある
    const y = 2 * TS + TS / 2;
    const [x0, x1] = [1 * TS + 8, 8 * TS + 8];
    assert.equal(hasLineOfSight(x0, y, x1, y, map), true, '前提: 中心線は通る');
    assert.equal(hasClearCorridor(map, x0, y, x1, y), false);
    assert.equal(hasClearCorridor(map, x0, y, x0, y), true, '長さ0は通れる');
});

test('hasClearCorridor: 上下 16px も空いている線は通れる', () => {
    const map = gridMap(OPEN);
    const y = 6 * TS + TS / 2;   // 1〜12行目が空き。上下 16px は5行目と7行目
    assert.equal(hasClearCorridor(map, 2 * TS, y, 27 * TS, y), true);
    // 斜めでも、左右の幅は進む向きに直交して取る
    assert.equal(hasClearCorridor(map, 3 * TS, 3 * TS, 26 * TS, 10 * TS), true);
});

test('平滑化は、遮られた点で先を見るのをやめる（その先がまた見えても飛ばない）', () => {
    // 本物のマップでは A* の経路が壁を避けて揺れるので、遮られた点の先がまた見えることがよくある。
    // そこまで飛ぶと 7面の経路の約半分が変わる（3シード×7面×12組で 123/252）
    const map = gridMap([
        '##############',
        '#............#',
        '#............#',
        '#............#',
        '#............#',
        '#.....#......#',
        '#............#',
        '#............#',
        '##############',
    ]);
    const [sx, sy] = center(5, 2);
    const gridPath = [{ r: 5, c: 2 }, { r: 5, c: 3 }, { r: 5, c: 10 }, { r: 2, c: 8 }];
    const at = (p) => center(p.r, p.c);
    assert.equal(hasClearCorridor(map, sx, sy, ...at(gridPath[2])), false, '前提: 3点目は柱の陰');
    assert.equal(hasClearCorridor(map, sx, sy, ...at(gridPath[3])), true, '前提: 4点目はまた見える');
    const path = smoothCruisePath(map, gridPath, sx, sy);
    assert.deepEqual(path[1], { x: at(gridPath[1])[0], y: at(gridPath[1])[1] });
});
