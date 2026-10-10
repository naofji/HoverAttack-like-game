// 村の配置と、場所ごとの建てる確率（villages.js）。
// 実機で「建物が多い・どこも同じ密度」と言われて、一律の TOWN_FLOOR_FILL から置き換えた。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import {
    TOWN_VILLAGE_DENSE_FILL, TOWN_VILLAGE_SPARSE_FILL, TOWN_VILLAGE_OUTSIDE_FILL, TOWN_VILLAGE_GRID_COLS,
} from '../src/js/utils/Constants.js';
import { placeVillages, villageFill } from '../src/js/world/town/villages.js';

const dense = { c: 50, r: 40, radius: 20, peak: TOWN_VILLAGE_DENSE_FILL };

test('villageFill: 村の中心は村の密度、村の外は村の外の密度', () => {
    assert.equal(villageFill([dense], 50, 40), TOWN_VILLAGE_DENSE_FILL);
    assert.equal(villageFill([dense], 50 + 25, 40), TOWN_VILLAGE_OUTSIDE_FILL);
    assert.equal(villageFill([], 10, 10), TOWN_VILLAGE_OUTSIDE_FILL);
});

test('villageFill: 中心から縁へなめらかに下がる（境目で急に途切れない）', () => {
    let prev = Infinity;
    for (let d = 0; d <= 22; d++) {
        const f = villageFill([dense], 50 + d, 40);
        assert.ok(f <= prev, `d=${d}: ${f} > ${prev}`);
        if (d > 0) assert.ok(prev - f < 0.2, `d=${d}: ${prev} → ${f} と急に下がる`);
        prev = f;
    }
    const mid = villageFill([dense], 50 + 15, 40);
    assert.ok(mid > TOWN_VILLAGE_OUTSIDE_FILL && mid < TOWN_VILLAGE_DENSE_FILL);
});

test('villageFill: 村が重なる所は濃いほうの村に従う', () => {
    const sparse = { c: 55, r: 40, radius: 20, peak: TOWN_VILLAGE_SPARSE_FILL };
    assert.equal(villageFill([sparse, dense], 50, 40), TOWN_VILLAGE_DENSE_FILL);
});

test('placeVillages: 密集した村とまばらな集落の両方があり、面の左・中・右のどこにも村がある', () => {
    const cols = 225, rows = 112;
    let denseN = 0, sparseN = 0;
    for (let seed = 1; seed <= 20; seed++) {
        const vs = placeVillages(new SeededRNG(seed), rows, cols);
        for (const v of vs) {
            assert.ok(v.c >= 0 && v.c < cols && v.r >= 0 && v.r < rows);
            if (v.peak === TOWN_VILLAGE_DENSE_FILL) denseN++;
            if (v.peak === TOWN_VILLAGE_SPARSE_FILL) sparseN++;
        }
        for (let third = 0; third < 3; third++) {
            const lo = (cols / 3) * third, hi = (cols / 3) * (third + 1);
            assert.ok(vs.some((v) => v.c >= lo && v.c < hi), `seed ${seed}: 3分割の ${third} 番目に村が無い`);
        }
    }
    assert.ok(denseN > 0 && sparseN > 0, `dense ${denseN} sparse ${sparseN}`);
});

test('placeVillages: 同じ乱数なら同じ村', () => {
    assert.deepEqual(placeVillages(new SeededRNG(5), 112, 225), placeVillages(new SeededRNG(5), 112, 225));
});

test('placeVillages: どの升も「村なし」を引いても、縦の列ごとに1つはまばらな集落を置く', () => {
    // 升の村なしは 2割。20種では1列まるごと村なしになる場面がほぼ出ないので、乱数を固定して作る
    const allNone = { next: () => 0.99 };
    const cols = 225, rows = 112;
    const vs = placeVillages(allNone, rows, cols);
    for (let gx = 0; gx < TOWN_VILLAGE_GRID_COLS; gx++) {
        const lo = (cols / TOWN_VILLAGE_GRID_COLS) * gx, hi = (cols / TOWN_VILLAGE_GRID_COLS) * (gx + 1);
        const here = vs.filter((v) => v.c >= lo && v.c < hi);
        assert.equal(here.length, 1, `列 ${gx}: ${here.length}`);
        assert.equal(here[0].peak, TOWN_VILLAGE_SPARSE_FILL);
    }
});

test('quietFactor: 静かな区域の内側は 0、外側は 1、あいだはなめらかに増える', async () => {
    const { quietFactor } = await import('../src/js/world/town/villages.js');
    const z = { c: 100, r: 50, inner: 20, outer: 40 };
    assert.equal(quietFactor([], 100, 50), 1);
    assert.equal(quietFactor([z], 100, 50), 0);
    assert.equal(quietFactor([z], 119, 50), 0);
    assert.equal(quietFactor([z], 141, 50), 1);
    let prev = 0;
    for (let d = 20; d <= 40; d++) {
        const f = quietFactor([z], 100 + d, 50);
        assert.ok(f >= prev && f - prev < 0.15, `d=${d}: ${prev} → ${f}`);
        prev = f;
    }
});
