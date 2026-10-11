import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAT_ADOBE, MAT_WOOD, MAT_METAL, CHARRED } from '../src/js/world/town/chunks.js';
import { Town } from '../src/js/world/town/Town.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { fakeCanvas } from './helpers/town-fixtures.js';
import { made, townOf, run } from './helpers/town-fire-fixtures.js';

const charredCount = (b) => [...b.cells].filter((v) => v & CHARRED).length;

test('火は材料に沿って隣のかけらへ燃え進む（木は土より速く広がる）', () => {
    const spreadOf = (mat) => {
        let total = 0;
        for (let seed = 1; seed <= 20; seed++) {
            const town = townOf([made(0, 0, 64, 4, mat)], seed);   // 横一列 16 かけら
            town.fire.ignite(town.buildings[0], 0);
            run(town, 120);                                          // 2秒
            total += charredCount(town.buildings[0]);
        }
        return total / 20;
    };
    const wood = spreadOf(MAT_WOOD), adobe = spreadOf(MAT_ADOBE);
    assert.ok(wood >= 4, `木 ${wood}`);
    assert.ok(wood > adobe * 2, `木 ${wood} / 土 ${adobe}`);
});

test('金属は燃えず、燃え移りを中継しない（金属の向こうの木は燃えない）', () => {
    // 木(1) | 金属(2) | 木(1) を横に並べた1棟。左の木に火をつける
    const spec = {
        site: 'floor', style: 'C', kind: 'shack', x: 0, y: 0, w: 16, h: 4,
        parts: [
            { x: 0, y: 0, w: 4, h: 4, color: '#5a3d1e', mat: MAT_WOOD, solid: true },
            { x: 4, y: 0, w: 8, h: 4, color: '#4f4a42', mat: MAT_METAL, solid: true },
            { x: 12, y: 0, w: 4, h: 4, color: '#5a3d1e', mat: MAT_WOOD, solid: true },
        ],
    };
    for (let seed = 1; seed <= 10; seed++) {
        const town = townOf([spec], seed);
        const b = town.buildings[0];
        town.fire.ignite(b, 0);
        run(town, 1500);
        assert.equal(b.cells[3] & CHARRED, 0, `seed ${seed}: 右の木が焦げた`);
        assert.ok(!town.fire.fires.some((f) => f.k === 1 || f.k === 2), '金属の上に火元がある');
    }
});

test('燃え移り: 8px 以内の別の建物へ、相手の材料の燃え移りやすさで（木は土より移りやすい）', () => {
    const catchRate = (mat) => {
        let caught = 0;
        for (let seed = 1; seed <= 40; seed++) {
            // 左は燃え広がらないかけら1つの木、右は 4px あけて相手の材料
            const town = townOf([made(0, 0, 4, 4, MAT_WOOD), made(8, 0, 16, 16, mat)], seed);
            town.fire.ignite(town.buildings[0], 0);
            // 1秒（燃え進み 10 回）。長く待つと土でも何度も試すうちに移ってしまい差が見えない
            // （catch 0.02 で 50 回なら 64%）
            run(town, 60);
            if (charredCount(town.buildings[1]) > 0) caught++;
        }
        return caught;
    };
    const wood = catchRate(MAT_WOOD), adobe = catchRate(MAT_ADOBE);
    assert.ok(wood >= 25, `木 ${wood}/40`);
    assert.ok(wood > adobe * 2, `木 ${wood} / 土 ${adobe}`);
});

test('8px より離れた建物には燃え移らない', () => {
    for (let seed = 1; seed <= 10; seed++) {
        const town = townOf([made(0, 0, 4, 4, MAT_WOOD), made(16, 0, 16, 16, MAT_WOOD)], seed);
        town.fire.ignite(town.buildings[0], 0);
        run(town, 600);
        assert.equal(charredCount(town.buildings[1]), 0);
    }
});

test('燃えた家はやがて自分から崩れる（焦げたかけらが抜けて、支えが切れた上が落ちる）', () => {
    let fell = 0;
    for (let seed = 1; seed <= 10; seed++) {
        const rng = new SeededRNG(seed);
        // 細い木の柱（幅 4px）。支えは最下段だけ
        const town = new Town([made(0, 0, 4, 40, MAT_WOOD)], {
            createCanvas: fakeCanvas, isSolidTile: (r) => r === 2, random: () => rng.next(),
        });
        const b = town.buildings[0];
        town.fire.ignite(b, 5);
        run(town, 1200);
        if (town.falling.length > 0 || b.remaining < b.total) fell++;
    }
    assert.ok(fell >= 5, `${fell}/10`);
});

test('崩れは燃えているあいだだけ。火が消えた建物の焦げたかけらは残り続ける', () => {
    const town = townOf([made(0, 0, 16, 16, MAT_WOOD)], 3);
    const b = town.buildings[0];
    town.fire.ignite(b, 0);
    let f = 0;
    while (town.fire.fires.length > 0 && f < 10000) { run(town, 1); f++; }
    const left = b.remaining;
    run(town, 3000);
    assert.equal(b.remaining, left);
});

test('崩壊で焦げた土台（CHARRED）はもう燃えない', () => {
    const town = townOf([made(0, 0, 16, 16, MAT_WOOD)]);
    const b = town.buildings[0];
    for (let k = 0; k < b.cells.length; k++) b.cells[k] |= CHARRED;
    assert.equal(town.fire.ignite(b, 0), false);
});
