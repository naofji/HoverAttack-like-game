// 6面のクレーンの荷（コンテナ・鉄骨）が落ちたら、つららと同じく機体にダメージ（ユーザーの指定 2026-11-07）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { buildCrane } from '../src/js/world/town/militaryBase.js';
import { MAT_METAL } from '../src/js/world/town/chunks.js';
import { FACTORY_LOAD_DAMAGE } from '../src/js/utils/Constants.js';
import { unit, world } from './helpers/town-explosive-fixtures.js';

test('荷を吊ったクレーンは荷の矩形と種類（heavy）を持ち、荷の無いクレーンは持たない', () => {
    const rng = new SeededRNG(4);
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
        const b = buildCrane(rng, { span: 96, maxHang: 120 });
        if (!b.heavy) continue;
        seen.add(b.heavy.kind);
        const { x, y, w, h } = b.heavy;
        assert.ok(x >= 0 && y >= 0 && x + w <= b.w && y + h <= b.h, '荷が外接矩形からはみ出す');
        assert.ok(y + h === b.h, '荷はいちばん下');
    }
    assert.deepEqual([...seen].sort(), ['beam', 'container']);
});

/**
 * 手で組んだクレーン（x=100, y=0）: 桁 0〜12（天井の岩＝行0 に支えられる）、ワイヤー x 116〜120 y 12〜40、
 * コンテナ x 104〜136 y 40〜52。床は行 12（y 192）から下
 */
function crane(heavyKind = 'container') {
    return {
        site: 'ceiling', style: 'B', kind: 'crane', x: 100, y: 0, w: 40, h: 52,
        parts: [
            { x: 0, y: 0, w: 40, h: 12, color: '#8a7020', mat: MAT_METAL, solid: true },
            { x: 16, y: 12, w: 4, h: 28, color: '#8890a0', mat: MAT_METAL, solid: false },
            { x: 4, y: 40, w: 32, h: 12, color: '#4e6a86', mat: MAT_METAL, solid: true },
        ],
        heavy: heavyKind ? { kind: heavyKind, x: 4, y: 40, w: 32, h: 12 } : undefined,
    };
}
const rock = (r) => r === 0 || r >= 12;

function dropOnto(spec, target) {
    const w = world([spec], { isSolidTile: rock });
    w.game.player = target;
    w.town.chip(w.town.buildings[0], 118, 24, 2);   // ワイヤーを切る
    assert.ok(w.town.falling.length > 0, '荷が落ちない');
    w.step(60);
    return w;
}

test('コンテナが落ちて下の機体に当たると FACTORY_LOAD_DAMAGE.container（1回だけ）', () => {
    const target = unit(120, 150);
    dropOnto(crane('container'), target);
    assert.deepEqual(target.hits, [FACTORY_LOAD_DAMAGE.container]);
});

test('鉄骨は FACTORY_LOAD_DAMAGE.beam', () => {
    const target = unit(120, 150);
    dropOnto(crane('beam'), target);
    assert.deepEqual(target.hits, [FACTORY_LOAD_DAMAGE.beam]);
});

test('荷の無い落ちる破片（3面と同じ）は当たっても痛くない', () => {
    const target = unit(120, 150);
    dropOnto(crane(null), target);
    assert.deepEqual(target.hits, []);
});

test('真下にいない機体には当たらない', () => {
    const target = unit(120 + 60, 150);
    dropOnto(crane('container'), target);
    assert.deepEqual(target.hits, []);
});

test('6面の生成で、荷を吊ったクレーンの設計図に heavy が渡る', async () => {
    const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
    const { Map } = await import('../src/js/world/Map.js');
    let n = 0;
    for (const seed of [1, 2, 3]) {
        const map = new Map({ rng: new SeededRNG(seed) }, 5);
        for (const b of map.town.buildings.filter((o) => o.kind === 'crane' && o.heavy)) {
            n++;
            assert.ok(['container', 'beam'].includes(b.heavy.kind));
        }
    }
    assert.ok(n >= 3, `荷を吊ったクレーンが ${n} 基`);
});
