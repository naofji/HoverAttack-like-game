import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import {
    buildBaseBuilding, buildControlRoom, buildCrane, buildFactoryLamp,
} from '../src/js/world/town/militaryBase.js';
import { rasterizeParts, SOLID, MAT_MASK, MAT_METAL, MAT_CONCRETE } from '../src/js/world/town/chunks.js';

// 6面の基地 B（spec 1章）。観点は3面の tests/town-mining.test.js と同じ

function partsInside(b) {
    for (const p of b.parts) {
        assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= b.w && p.y + p.h <= b.h,
            `${b.kind} の部品 ${JSON.stringify(p)} が ${b.w}x${b.h} からはみ出す`);
    }
}
const cellsOf = (b) => rasterizeParts(b.parts, b.w, b.h);

test('床の建物は上限を守り、部品は外接矩形に収まる（5種とも出る）', () => {
    const rng = new SeededRNG(7);
    const kinds = new Set();
    for (let i = 0; i < 400; i++) {
        const maxW = 16 + Math.floor(rng.next() * 60);
        const maxH = 24 + Math.floor(rng.next() * 100);
        const b = buildBaseBuilding(rng, { maxW, maxH });
        if (!b) continue;
        kinds.add(b.kind);
        assert.ok(b.footW <= maxW, `${b.kind} 足元 ${b.footW} > ${maxW}`);
        assert.ok(b.h <= maxH, `${b.kind} 高さ ${b.h} > ${maxH}`);
        assert.ok(b.footX >= 0 && b.footX + b.footW <= b.w);
        partsInside(b);
    }
    assert.deepEqual([...kinds].sort(), ['factoryHall', 'hangar', 'radar', 'warehouse', 'watchtower']);
});

test('狭い・低い所には建てない', () => {
    const rng = new SeededRNG(1);
    assert.equal(buildBaseBuilding(rng, { maxW: 12, maxH: 100 }), null);
    assert.equal(buildBaseBuilding(rng, { maxW: 60, maxH: 20 }), null);
    assert.equal(buildControlRoom(rng, { maxReach: 24 }), null);
    assert.equal(buildCrane(rng, { span: 64, maxHang: 16 }), null);
});

test('床の建物の最下段は床に埋まる', () => {
    const rng = new SeededRNG(3);
    for (let i = 0; i < 120; i++) {
        const b = buildBaseBuilding(rng, { maxW: 64, maxH: 120 });
        const { cells, cw, ch } = cellsOf(b);
        assert.ok(Array.from(cells.slice((ch - 1) * cw, ch * cw)).some((v) => v), `${b.kind} の最下段が空`);
    }
});

test('倉庫・工場棟の壁はコンクリートの厚い壁、監視塔とレーダーには細い金属（脚・骨）がある', () => {
    const rng = new SeededRNG(9);
    const seen = new Set();
    for (let i = 0; i < 300; i++) {
        const b = buildBaseBuilding(rng, { maxW: 64, maxH: 120 });
        const { cells } = cellsOf(b);
        const has = (mat, solid) => cells.some((v) => (v & MAT_MASK) === mat && Boolean(v & SOLID) === solid);
        if (b.kind === 'warehouse' || b.kind === 'factoryHall') assert.ok(has(MAT_CONCRETE, true), `${b.kind} にコンクリートの壁が無い`);
        if (b.kind === 'watchtower' || b.kind === 'radar') assert.ok(has(MAT_METAL, false), `${b.kind} に細い金属が無い`);
        // 6面の金属は燃えない。木を使わない（spec 2章）
        assert.ok(cells.every((v) => !v || [MAT_METAL, MAT_CONCRETE].includes(v & MAT_MASK)), `${b.kind} に金属・コンクリート以外`);
        seen.add(b.kind);
    }
    assert.equal(seen.size, 5);
});

test('制御室は壁に打ち込まれ（x 0〜4 にかけら）、部品は収まる', () => {
    const rng = new SeededRNG(4);
    for (let i = 0; i < 80; i++) {
        const b = buildControlRoom(rng, { maxReach: 32 + 4 * Math.floor(rng.next() * 16) });
        assert.ok(b);
        partsInside(b);
        const { cells, cw, ch } = cellsOf(b);
        let wall = false;
        for (let j = 0; j < ch; j++) if (cells[j * cw]) wall = true;
        assert.ok(wall, '壁に埋まる列が無い');
    }
});

test('クレーンは天井に埋まり、幅は span、高さは maxHang 以下', () => {
    const rng = new SeededRNG(6);
    for (let i = 0; i < 100; i++) {
        const span = 64 + 4 * Math.floor(rng.next() * 25);
        const maxHang = 24 + Math.floor(rng.next() * 100);
        const b = buildCrane(rng, { span, maxHang });
        assert.ok(b, `span ${span} maxHang ${maxHang} で建たない`);
        assert.equal(b.w, span);
        assert.ok(b.h <= maxHang);
        partsInside(b);
        const { cells, cw } = cellsOf(b);
        assert.ok(Array.from(cells.slice(0, cw)).some((v) => v), '最上段が空（天井に埋まらない）');
    }
});

test('照明は天井に埋まり、maxHang 以下', () => {
    const rng = new SeededRNG(2);
    for (let i = 0; i < 40; i++) {
        const maxHang = 16 + Math.floor(rng.next() * 60);
        const b = buildFactoryLamp(rng, { maxHang });
        assert.ok(b.h <= maxHang, `${b.h} > ${maxHang}`);
        partsInside(b);
        const { cells, cw } = cellsOf(b);
        assert.ok(Array.from(cells.slice(0, cw)).some((v) => v));
    }
});

test('同じ絵の建物はほとんど出ない', () => {
    const rng = new SeededRNG(5);
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(JSON.stringify(buildBaseBuilding(rng, { maxW: 64, maxH: 120 }).parts));
    assert.ok(seen.size >= 150, `${seen.size} 種類しかない`);
});
