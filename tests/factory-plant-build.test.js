import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import {
    buildMachine, buildWallPipes, buildPipeBundle, buildFactoryExplosive,
} from '../src/js/world/town/factory.js';
import { rasterizeParts, SOLID, MAT_MASK, MAT_METAL, MAT_EXPLOSIVE } from '../src/js/world/town/chunks.js';
import { TOWN_EXPLOSIVE_COLORS } from '../src/js/world/town/palette.js';

// 6面の工場 P（spec 1章）。観点は3面の tests/town-mining.test.js と同じ

function partsInside(b) {
    for (const p of b.parts) {
        assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= b.w && p.y + p.h <= b.h,
            `${b.kind} の部品 ${JSON.stringify(p)} が ${b.w}x${b.h} からはみ出す`);
    }
}
const cellsOf = (b) => rasterizeParts(b.parts, b.w, b.h);
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

test('機械は上限を守り、部品は外接矩形に収まる（6種とも出る）', () => {
    const rng = new SeededRNG(7);
    const kinds = new Set();
    for (let i = 0; i < 500; i++) {
        const maxW = 16 + Math.floor(rng.next() * 50);
        const maxH = 24 + Math.floor(rng.next() * 80);
        const b = buildMachine(rng, { maxW, maxH });
        if (!b) continue;
        kinds.add(b.kind);
        assert.ok(b.footW <= maxW, `${b.kind} 足元 ${b.footW} > ${maxW}`);
        assert.ok(b.h <= maxH, `${b.kind} 高さ ${b.h} > ${maxH}`);
        assert.ok(b.footX >= 0 && b.footX + b.footW <= b.w);
        partsInside(b);
    }
    assert.deepEqual([...kinds].sort(), ['chemTank', 'compressor', 'conveyor', 'drillPress', 'press', 'robotArm']);
});

test('狭い・低い所には建てない', () => {
    const rng = new SeededRNG(1);
    assert.equal(buildMachine(rng, { maxW: 12, maxH: 100 }), null);
    assert.equal(buildMachine(rng, { maxW: 60, maxH: 16 }), null);
    assert.equal(buildWallPipes(rng, { maxReach: 8 }), null);
});

test('機械の最下段は床に埋まり、機械は燃えない（金属だけ）', () => {
    const rng = new SeededRNG(3);
    for (let i = 0; i < 200; i++) {
        const b = buildMachine(rng, { maxW: 48, maxH: 80 });
        const { cells, cw, ch } = cellsOf(b);
        assert.ok(Array.from(cells.slice((ch - 1) * cw, ch * cw)).some((v) => v), `${b.kind} の最下段が空`);
        assert.ok(cells.every((v) => !v || (v & MAT_MASK) === MAT_METAL), `${b.kind} に金属以外のかけら`);
        assert.ok(cells.some((v) => v & SOLID), `${b.kind} に弾を止める本体が無い`);
    }
});

test('壁の配管は細い部品だけで、壁に埋まる（x 0〜4 にかけら）', () => {
    const rng = new SeededRNG(4);
    for (let i = 0; i < 80; i++) {
        const b = buildWallPipes(rng, { maxReach: 16 + 4 * Math.floor(rng.next() * 20) });
        assert.ok(b);
        partsInside(b);
        const { cells, cw, ch } = cellsOf(b);
        assert.ok(cells.every((v) => !(v & SOLID)), '厚い壁がある');
        assert.ok(cells.every((v) => !v || (v & MAT_MASK) === MAT_METAL));
        let wall = false;
        for (let j = 0; j < ch; j++) if (cells[j * cw]) wall = true;
        assert.ok(wall, '壁に埋まる列が無い');
    }
});

test('配管の束は天井に埋まり、maxHang・room に収まる', () => {
    const rng = new SeededRNG(6);
    for (let i = 0; i < 100; i++) {
        const room = 32 + 4 * Math.floor(rng.next() * 40);
        const maxHang = 32 + Math.floor(rng.next() * 100);
        const b = buildPipeBundle(rng, { room, maxHang });
        assert.ok(b, `room ${room} maxHang ${maxHang} で吊るせない`);
        assert.ok(b.h <= maxHang && b.w <= room);
        partsInside(b);
        const { cells, cw } = cellsOf(b);
        assert.ok(Array.from(cells.slice(0, cw)).some((v) => v), '最上段が空');
        assert.ok(cells.every((v) => !v || (v & MAT_MASK) === MAT_METAL));
    }
});

test('爆発物は全部爆発物の厚い壁で、赤く見える（3種とも出る）', () => {
    const rng = new SeededRNG(8);
    const kinds = new Set();
    for (let i = 0; i < 60; i++) {
        const b = buildFactoryExplosive(rng);
        kinds.add(b.kind);
        partsInside(b);
        const { cells } = cellsOf(b);
        assert.ok(cells.some((v) => v));
        assert.ok(cells.every((v) => !v || v === (MAT_EXPLOSIVE | SOLID)), `${b.kind} に爆発物でないかけら`);
    }
    assert.deepEqual([...kinds].sort(), ['chemTank', 'drum', 'gasRack']);
    const [r, g, b] = rgb(TOWN_EXPLOSIVE_COLORS.chemTank);
    assert.ok(r > g * 1.6 && r > b * 1.6, '化学タンクが赤く見えない');
});

test('同じ絵の機械はほとんど出ない', () => {
    const rng = new SeededRNG(5);
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(JSON.stringify(buildMachine(rng, { maxW: 48, maxH: 80 }).parts));
    assert.ok(seen.size >= 150, `${seen.size} 種類しかない`);
});
