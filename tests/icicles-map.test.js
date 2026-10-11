import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { STAGE_ENVIRONMENTS } from '../src/js/utils/Constants.js';

// document が無い環境で Map を作る（MapDeterminism.test.js と同じ）
const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };

const SNOW_STAGE = 4;   // missionLevel（0 始まり）。5面
const buildMap = async (seed, mission = SNOW_STAGE) => {
    const { Map } = await import('../src/js/world/Map.js');
    return new Map({ rng: new SeededRNG(seed) }, mission);
};
const hash = (x) => crypto.createHash('md5').update(JSON.stringify(x)).digest('hex');

test('5面は props: snow。4面は ferns、3面は town のまま', () => {
    assert.equal(STAGE_ENVIRONMENTS[4].props, 'snow');
    assert.equal(STAGE_ENVIRONMENTS[3].props, 'ferns');
    assert.equal(STAGE_ENVIRONMENTS[2].props, 'town');
});

test('5面の Town に、雪の木とつららが両方載る。つららは brittle で flora ice、木は soft で flora snow', async () => {
    const m = await buildMap(42);
    const trees = m.town.buildings.filter((b) => b.flora === 'snow');
    const icicles = m.town.buildings.filter((b) => b.brittle);
    assert.ok(trees.length > 50, `木 ${trees.length}`);
    assert.ok(icicles.length > 30, `つらら ${icicles.length}`);
    assert.equal(trees.length + icicles.length, m.town.buildings.length);
    for (const b of icicles) { assert.equal(b.flora, 'ice'); assert.equal(b.site, 'ceiling'); }
});

test('木の設計図は、つららを足す前と同一（木の本数・位置・乱数の流れが変わらない）。建物の番号も木が先で変わらない', async () => {
    const m = await buildMap(42);
    const treeSpecs = m._buildSnowTreeSpecs();
    const trees = m.town.buildings.filter((b) => b.flora === 'snow');
    assert.equal(trees.length, treeSpecs.length);
    assert.deepEqual(trees.map((b) => [b.kind, b.x, b.y, b.width, b.height]), treeSpecs.map((s) => [s.kind, s.x, s.y, s.w, s.h]));
    assert.deepEqual(trees.map((b) => b.id), treeSpecs.map((_, i) => i), '木の建物の番号が変わった（かけらの欠け方の乱数が変わる）');
});

test('つららは、開始の部屋と基地の部屋に掛からない。木は基地の部屋だけを避けたまま（開始の部屋には置く）', async () => {
    const m = await buildMap(42);
    const [start, base] = m._reservedRects();
    const hits = (b, rc) => b.x / 16 <= rc.c1 && (b.x + b.width - 1) / 16 >= rc.c0 && b.y / 16 <= rc.r1 && (b.y + b.height - 1) / 16 >= rc.r0;
    for (const b of m.town.buildings.filter((q) => q.brittle)) {
        assert.ok(!hits(b, start), `つらら (${b.x},${b.y}) が開始の部屋に掛かる`);
        assert.ok(!hits(b, base), `つらら (${b.x},${b.y}) が基地の部屋に掛かる`);
    }
    for (const b of m.town.buildings.filter((q) => q.flora === 'snow')) assert.ok(!hits(b, base), `木 (${b.x},${b.y}) が基地の部屋に掛かる`);
    assert.ok(m.town.buildings.some((b) => b.flora === 'snow' && hits(b, start)), '開始の部屋に木が 1 本も無い（木の除外の矩形が変わった）');
});

test('同じ乱数なら同じ 5 面（つららを含む）。違う seed なら違う', async () => {
    const sig = (m) => hash(m.town.buildings.map((b) => [b.kind, b.x, b.y, b.width, b.height, b.damage]));
    assert.equal(sig(await buildMap(42)), sig(await buildMap(42)));
    assert.notEqual(sig(await buildMap(42)), sig(await buildMap(43)));
});

test('つららの設計図は game.rng を消費しない（このあと SpawnManager が使う）', async () => {
    const { Map } = await import('../src/js/world/Map.js');
    const withIcicles = { rng: new SeededRNG(42) };
    new Map(withIcicles, SNOW_STAGE);
    const original = Map.prototype._buildIcicleSpecs;
    Map.prototype._buildIcicleSpecs = function () { return []; };
    const without = { rng: new SeededRNG(42) };
    try { new Map(without, SNOW_STAGE); } finally { Map.prototype._buildIcicleSpecs = original; }
    assert.equal(withIcicles.rng.state, without.rng.state);
});

test('つららは 5 面にだけ。4 面・6 面・3 面にはつららが無い。debugStartMission で面数を超えても剰余で 5 面', async () => {
    for (const mission of [2, 3, 5]) {
        const m = await buildMap(42, mission);
        assert.ok(!m.town || m.town.buildings.every((b) => !b.brittle), `${mission + 1}面につららがある`);
    }
    const wrapped = await buildMap(42, 4 + 7);
    assert.ok(wrapped.town.buildings.some((b) => b.brittle));
});
