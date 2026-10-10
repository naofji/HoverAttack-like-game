import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supportsWater } from '../src/js/world/waterRules.js';
import { MAX_WATER_MASS } from '../src/js/utils/Constants.js';

// 2行×3列: 行0 は空、行1 は [岩, 満水, 満ちかけ]
const rows = 2, cols = 3;
const water = new Uint8Array(rows * cols);
water[1 * cols + 1] = MAX_WATER_MASS;
water[1 * cols + 2] = MAX_WATER_MASS - 1;
const isSolid = (r, c) => r === 1 && c === 0;

test('岩と満水は上の水を支え、満ちかけと空気は支えない', () => {
    assert.equal(supportsWater(water, rows, cols, isSolid, 1, 0), true);
    assert.equal(supportsWater(water, rows, cols, isSolid, 1, 1), true);
    assert.equal(supportsWater(water, rows, cols, isSolid, 1, 2), false);
    assert.equal(supportsWater(water, rows, cols, isSolid, 0, 2), false);
});

test('マップの底より下は支えとみなす（isSolid に範囲外を問い合わせない）', () => {
    const strict = (r, c) => {
        if (r < 0 || r >= rows || c < 0 || c >= cols) throw new Error(`範囲外 ${r},${c}`);
        return isSolid(r, c);
    };
    assert.equal(supportsWater(water, rows, cols, strict, rows, 1), true);
});
