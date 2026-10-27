// 形から坂の向きを読む問い合わせと、形の表を持つ偽地図（makeMap）のテスト。
// 坂の符号は自機の slopeDir と同じ: +1 = 右へ上る。天井は +1 = 右へ下がる（右ほど天井が低い）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    Q_EMPTY, Q_FULL, Q_TRI_NO_TL, Q_TRI_NO_TR, Q_TRI_NO_BL, Q_TRI_NO_BR,
    packShape, SHAPE_FULL, shapeFloorSlope, shapeCeilingSlope,
} from '../src/js/utils/tileShape.js';
import { makeMap } from './helpers/enemy-world.js';
import { TILE_SIZE as T } from '../src/js/utils/Constants.js';

const F = Q_FULL, E = Q_EMPTY, TL = Q_TRI_NO_TL, TR = Q_TRI_NO_TR, BL = Q_TRI_NO_BL, BR = Q_TRI_NO_BR;

test('shapeFloorSlope: 上面の傾き（+1 = 右へ上る）', () => {
    for (const lx of [1, 7, 9, 15]) {
        assert.equal(shapeFloorSlope(packShape(E, TL, TL, F), lx), 1, `右へ上る段 lx=${lx}`);
        assert.equal(shapeFloorSlope(packShape(TR, E, F, TR), lx), -1, `左へ上る段 lx=${lx}`);
        assert.equal(shapeFloorSlope(SHAPE_FULL, lx), 0);
    }
    const chamfer = packShape(TL, F, F, F);
    assert.equal(shapeFloorSlope(chamfer, 3), 1);
    assert.equal(shapeFloorSlope(chamfer, 12), 0);
});

test('shapeCeilingSlope: 下面の傾き（+1 = 右へ下がる）', () => {
    for (const lx of [1, 7, 9, 15]) {
        assert.equal(shapeCeilingSlope(packShape(BL, F, E, BL), lx), 1, `lx=${lx}`);
        assert.equal(shapeCeilingSlope(packShape(F, BR, BR, E), lx), -1, `lx=${lx}`);
        assert.equal(shapeCeilingSlope(SHAPE_FULL, lx), 0);
    }
});

const STAIRS = ['......', '....##', '...###', '..####', '######'];

test("makeMap(…, { tileShape: 'snowSlope' }) の階段で floorSlopeAt が段の向きを返し、平らな床では 0", () => {
    const m = makeMap(STAIRS, null, { tileShape: 'snowSlope' });
    assert.equal(m.tileShapeRule, 'snowSlope');
    // (3,2) の段の上面: x = 2T+4 で y = 3T + 12
    assert.equal(m.terrainTopY(2 * T + 4, 0, 5 * T - 1), 3 * T + 12);
    assert.equal(m.floorSlopeAt(2 * T + 4, 3 * T + 12), 1);
    assert.equal(m.floorSlopeAt(4, 4 * T), 0);
    assert.equal(m.hasShapedTileIn(2 * T, 3 * T, 4, 4), true);
    assert.equal(m.hasShapedTileIn(0, 4 * T, 16, 16), false);
});

test('makeMap の既定は四角: 同じ階段でも坂は無く、hasShapedTileIn は常に false', () => {
    const m = makeMap(STAIRS);
    assert.equal(m.tileShapeRule, 'square');
    assert.equal(m.terrainTopY(2 * T + 4, 0, 5 * T - 1), 3 * T);
    assert.equal(m.floorSlopeAt(2 * T + 4, 3 * T), 0);
    assert.equal(m.hasShapedTileIn(0, 0, 6 * T, 5 * T), false);
    assert.equal(m.isSolidPoint(2 * T + 4, 3 * T + 1), true);
});

test('ceilingSlopeAt は、下面がタイル境目ちょうどでもその上のタイルを読む', () => {
    // (1,3) は右下が空いた天井の斜め packShape(F, BR, BR, E)。左端 lx=0 の下面は y = 2T（境目）
    const m = makeMap(['######', '####..', '###...', '##....', '......'], null, { tileShape: 'snowSlope' });
    assert.equal(m.tileShapeAt(1, 3), packShape(F, BR, BR, E));
    assert.equal(m.terrainBottomY(3 * T, 4 * T, 0), 2 * T);
    assert.equal(m.ceilingSlopeAt(3 * T, 2 * T), -1);
    assert.equal(m.ceilingSlopeAt(3 * T + 4, 2 * T - 4), -1);
});
