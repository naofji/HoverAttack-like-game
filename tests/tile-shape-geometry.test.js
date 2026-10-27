// タイルの形の幾何（点・矩形・列の上端と下端）のテスト。座標はタイル内のローカル px（0〜16）。
// 期待値は斜辺の式から手で計算した値。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    Q_EMPTY, Q_FULL, Q_TRI_NO_TL, Q_TRI_NO_TR, Q_TRI_NO_BL, Q_TRI_NO_BR,
    packShape, SHAPE_EMPTY, SHAPE_FULL, computeTileShape,
    shapeContainsPoint, shapeOverlapsRect, shapeTopY, shapeBottomY,
} from '../src/js/utils/tileShape.js';

const F = Q_FULL, E = Q_EMPTY, TL = Q_TRI_NO_TL, TR = Q_TRI_NO_TR, BL = Q_TRI_NO_BL, BR = Q_TRI_NO_BR;
const RAMP_UP_RIGHT = packShape(E, TL, TL, F);   // 右へ上る段（斜辺 y = 16 − x、岩は右下）
const CEIL_RAMP = packShape(BL, F, E, BL);       // 天井側の段（斜辺 y = x、岩は右上）

test('満ちは全点で岩、空は全点で空', () => {
    for (let y = 0; y < 16; y += 0.5) {
        for (let x = 0; x < 16; x += 0.5) {
            assert.equal(shapeContainsPoint(SHAPE_FULL, x, y), true);
            assert.equal(shapeContainsPoint(SHAPE_EMPTY, x, y), false);
        }
    }
});

test('三角の象限は斜辺の上を岩とし、両側の点で岩と空が分かれる', () => {
    // 左上の象限に各三角を入れ、局所座標 (u, v) で確かめる
    const one = (q) => packShape(q, E, E, E);
    // NO_TL: u + v >= 8 が岩
    assert.equal(shapeContainsPoint(one(TL), 5, 2.9), false);
    assert.equal(shapeContainsPoint(one(TL), 5, 3), true);
    assert.equal(shapeContainsPoint(one(TL), 5, 3.1), true);
    // NO_BR: u + v <= 8 が岩
    assert.equal(shapeContainsPoint(one(BR), 5, 3), true);
    assert.equal(shapeContainsPoint(one(BR), 5, 3.1), false);
    // NO_TR: v >= u が岩（左下側）
    assert.equal(shapeContainsPoint(one(TR), 3, 3), true);
    assert.equal(shapeContainsPoint(one(TR), 3.1, 3), false);
    // NO_BL: u >= v が岩（右上側）
    assert.equal(shapeContainsPoint(one(BL), 3, 3), true);
    assert.equal(shapeContainsPoint(one(BL), 3, 3.1), false);
    // 象限の位置ずれを見落とさないよう、右下の象限でも1つ
    assert.equal(shapeContainsPoint(packShape(E, E, E, TL), 13, 11), true);  // u=5, v=3
    assert.equal(shapeContainsPoint(packShape(E, E, E, TL), 13, 10.9), false);
});

test('矩形: 斜めの段で、斜辺の上の空中は当たらず、斜辺を越えれば当たる（半開区間）', () => {
    assert.equal(shapeOverlapsRect(RAMP_UP_RIGHT, 0, 0, 4, 4), false);   // 空の象限
    assert.equal(shapeOverlapsRect(RAMP_UP_RIGHT, 9, 0, 12, 3), false);  // 右上の象限、斜辺の手前
    assert.equal(shapeOverlapsRect(RAMP_UP_RIGHT, 9, 0, 12, 4), false);  // 右下の角がちょうど斜辺（届かない）
    assert.equal(shapeOverlapsRect(RAMP_UP_RIGHT, 9, 0, 12, 4.5), true); // 斜辺を越える
    assert.equal(shapeOverlapsRect(RAMP_UP_RIGHT, 2, 2, 7, 11), true);   // 左下の象限で越える
    assert.equal(shapeOverlapsRect(RAMP_UP_RIGHT, 0, 0, 6, 10), false);  // 左下の象限の斜辺 u+v=8 にちょうど
    // 他の三角も1つずつ: 天井の段（岩は右上、斜辺 y = x）
    assert.equal(shapeOverlapsRect(CEIL_RAMP, 0, 4, 4, 8), false);        // 斜辺の左下
    assert.equal(shapeOverlapsRect(CEIL_RAMP, 0, 4, 4.5, 8), true);
    // NO_BR（右下が空）: 左上の頂点が斜辺にちょうど乗れば当たる（下限は閉じている）
    const brCut = packShape(F, F, F, BR);
    assert.equal(shapeOverlapsRect(brCut, 12, 12, 16, 16), true);   // u0+v0 = 8
    assert.equal(shapeOverlapsRect(brCut, 12.5, 12, 16, 16), false);
    // NO_TR（右上が空）: 左下側が岩
    const trCut = packShape(F, TR, F, F);
    assert.equal(shapeOverlapsRect(trCut, 13, 0, 16, 5), false);    // b1 − a0 = 5 − 5 = 0
    assert.equal(shapeOverlapsRect(trCut, 13, 0, 16, 5.5), true);
});

test('矩形: 満ちのタイルはどんな矩形でも当たる。細い矩形も', () => {
    assert.equal(shapeOverlapsRect(SHAPE_FULL, 0, 0, 16, 16), true);
    assert.equal(shapeOverlapsRect(SHAPE_FULL, 15.9, 0, 16, 1), true);
    assert.equal(shapeOverlapsRect(SHAPE_EMPTY, 0, 0, 16, 16), false);
});

test('shapeTopY: 列で岩が始まる y', () => {
    assert.equal(shapeTopY(RAMP_UP_RIGHT, 1), 15);
    assert.equal(shapeTopY(RAMP_UP_RIGHT, 8), 8);
    assert.equal(shapeTopY(RAMP_UP_RIGHT, 15), 1);
    const chamfer = packShape(TL, F, F, F);
    assert.equal(shapeTopY(chamfer, 2), 6);
    assert.equal(shapeTopY(chamfer, 12), 0);
    assert.equal(shapeTopY(SHAPE_FULL, 5), 0);
    assert.equal(shapeTopY(SHAPE_EMPTY, 5), null);
});

test('shapeBottomY: 列で岩が終わる y', () => {
    assert.equal(shapeBottomY(CEIL_RAMP, 1), 1);
    assert.equal(shapeBottomY(CEIL_RAMP, 15), 15);
    assert.equal(shapeBottomY(packShape(F, F, F, BR), 12), 12); // 右下の面取り: v <= 8 − u
    assert.equal(shapeBottomY(SHAPE_FULL, 5), 16);
    assert.equal(shapeBottomY(SHAPE_EMPTY, 5), null);
});

/** 規則が作る形を、規則のテストと同じような格子から集める */
function shapesFromRule() {
    const grids = [
        ['...', '.#.', '...'],
        ['.....', '.##..', '.....'],
        ['......', '....##', '...###', '..####', '######'],
        ['......', '##....', '###...', '####..', '######'],
        ['######', '..####', '...###', '....##', '......'],
        ['######', '####..', '###...', '##....', '......'],
        ['......', '###...', '###...', '######'],
        ['...', '.#.', '.#.', '###'],
    ];
    const set = new Set();
    for (const g of grids) {
        const cellAt = (r, c) => (r < 0 || r >= g.length || c < 0 || c >= g[0].length)
            ? 'polished' : g[r][c] === '#' ? 'rock' : 'empty';
        for (let r = 0; r < g.length; r++) {
            for (let c = 0; c < g[0].length; c++) set.add(computeTileShape(cellAt, r, c, 'snowSlope'));
        }
    }
    return [...set];
}

test('総当たり: 点が岩なら、その点を含む小さな矩形も当たる。上端・下端は点の判定と一致する', () => {
    const shapes = shapesFromRule();
    assert.ok(shapes.length >= 8, `集まった形が少ない: ${shapes.length}`);
    for (const code of shapes) {
        for (let y = 0; y < 16; y += 0.5) {
            for (let x = 0; x < 16; x += 0.5) {
                if (shapeContainsPoint(code, x, y)) {
                    assert.equal(shapeOverlapsRect(code, x, y, x + 0.5, y + 0.5), true, `code=${code} (${x},${y})`);
                }
            }
        }
        for (let x = 0.25; x < 16; x += 0.5) {
            const top = shapeTopY(code, x), bottom = shapeBottomY(code, x);
            for (let y = 0.25; y < 16; y += 0.5) {
                const inside = top !== null && y >= top && y <= bottom;
                assert.equal(shapeContainsPoint(code, x, y), inside, `code=${code} (${x},${y}) top=${top} bottom=${bottom}`);
            }
        }
    }
});
