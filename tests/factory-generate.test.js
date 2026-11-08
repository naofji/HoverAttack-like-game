import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TILE_SIZE as T, TOWN_BASE_QUIET_INNER, TOWN_FOUNDATION_SINK } from '../src/js/utils/Constants.js';
import { MAT_EXPLOSIVE } from '../src/js/world/town/chunks.js';

// 6面（missionLevel 5）の工場・基地。置き方は3面と同じ generateTown、絵柄は FACTORY_THEME
before(() => {
    const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

const SEEDS = [11, 22, 33];
const BASE_KINDS = ['warehouse', 'hangar', 'watchtower', 'radar', 'factoryHall'];
const PLANT_KINDS = ['robotArm', 'press', 'drillPress', 'conveyor', 'compressor', 'chemTank'];

async function makeMap(seed, mission) {
    const { Map } = await import('../src/js/world/Map.js');
    return new Map({ rng: new SeededRNG(seed) }, mission);
}
const isExplosiveSpec = (s) => s.parts.some((p) => p.mat === MAT_EXPLOSIVE);

test('6面に工場と基地が建ち、町の無い面には無い', async () => {
    for (const seed of SEEDS) {
        const map = await makeMap(seed, 5);
        assert.ok(map.town, `seed ${seed}: 6面に町が無い`);
        assert.ok(map.town.buildings.length >= 20, `seed ${seed}: ${map.town.buildings.length} 棟しかない`);
        const kinds = new Set(map.town.buildings.map((b) => b.kind));
        assert.ok(BASE_KINDS.some((k) => kinds.has(k)), '基地の建物が無い');
        assert.ok(PLANT_KINDS.some((k) => kinds.has(k)), '工場の機械が無い');
        assert.ok(map.town.buildings.every((b) => b.style === 'B' || b.style === 'F'), 'style は B / F だけ');
    }
    // town を assert.equal で null と比べない（落ちると Town を表示しようとしてメモリを使い切る。MapDeterminism のコメント）
    for (const mission of [0, 1]) assert.ok((await makeMap(11, mission)).town === null, `${mission + 1}面に町がある`);   // 7面は基地（2026-11-08）
});

test('基地の部屋と最後の敵基地の周りには建てない', async () => {
    for (const seed of SEEDS) {
        const map = await makeMap(seed, 5);
        const room = map._reservedRects()[1];
        const base = map.enemyBaseCenter;
        for (const s of map._buildFactorySpecs()) {
            const r0 = Math.floor(s.y / T), r1 = Math.floor((s.y + s.h - 1) / T);
            const c0 = Math.floor(s.x / T), c1 = Math.floor((s.x + s.w - 1) / T);
            assert.ok(r1 < room.r0 || r0 > room.r1 || c1 < room.c0 || c0 > room.c1, `${s.kind} が基地の部屋に掛かる`);
            const nx = Math.max(s.x, Math.min((base.c + 0.5) * T, s.x + s.w));
            const ny = Math.max(s.y, Math.min((base.r + 0.5) * T, s.y + s.h));
            assert.ok(Math.hypot(nx / T - (base.c + 0.5), ny / T - (base.r + 0.5)) >= TOWN_BASE_QUIET_INNER, `${s.kind} が基地に近い`);
        }
    }
});

test('爆発物はあって、床の岩の上だけに置く', async () => {
    let n = 0;
    for (const seed of SEEDS) {
        const map = await makeMap(seed, 5);
        for (const s of map._buildFactorySpecs().filter(isExplosiveSpec)) {
            n++;
            assert.equal(s.site, 'floor');
            const ground = (s.y + s.h - TOWN_FOUNDATION_SINK) / T;
            for (let c = Math.floor(s.x / T); c <= Math.floor((s.x + s.w - 1) / T); c++) {
                assert.ok(map.isSolid(ground, c), `${s.kind} の下が岩でない`);
            }
        }
    }
    assert.ok(n >= 3, `爆発物が ${n} 個しかない`);
});

test('同じシードなら同じ工場で、game.rng を消費しない', async () => {
    const a = await makeMap(22, 5);
    const b = await makeMap(22, 5);
    const state = a.game.rng.state;
    const sa = a._buildFactorySpecs();
    assert.equal(a.game.rng.state, state, '設計図を作ると game.rng が進む');
    assert.deepEqual(sa, b._buildFactorySpecs());
});

test('6面の天井にはクレーンと配管の束が吊るされる（ユーザーが最初に挙げたもの。ceilingBoost）', async () => {
    const count = { crane: 0, pipeBundle: 0 };
    for (const seed of [1, 2, 3, 4, 5, 6]) {
        const map = await makeMap(seed, 5);
        for (const s of map._buildFactorySpecs()) if (s.kind in count && s.site === 'ceiling') count[s.kind]++;
    }
    // 倍率 1・割合 0.5 のときはクレーン 9・配管 13（6面ぶん）。倍率 2・0.8 / 0.75 で 23 / 24
    assert.ok(count.crane >= 18, `クレーン ${count.crane}`);
    assert.ok(count.pipeBundle >= 18, `配管の束 ${count.pipeBundle}`);
});
