// 爆発物の絵（mining.js / adobe.js）。見て爆発物と分かること、かけらが全部爆発物の厚い壁であること（spec 3b章）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { buildMiningExplosive } from '../src/js/world/town/mining.js';
import { buildOilJarStore } from '../src/js/world/town/adobe.js';
import { rasterizeParts, MAT_EXPLOSIVE, MAT_MASK, SOLID } from '../src/js/world/town/chunks.js';
import { TOWN_FOUNDATION_SINK } from '../src/js/utils/Constants.js';

function all() {
    const out = [];
    for (let seed = 1; seed <= 40; seed++) {
        out.push(buildMiningExplosive(new SeededRNG(seed)));
        out.push(buildOilJarStore(new SeededRNG(seed)));
    }
    return out;
}

test('3種の坑道の爆発物と油壺の倉が出る', () => {
    const kinds = new Set(all().map((b) => b.kind));
    assert.deepEqual([...kinds].sort(), ['crate', 'drum', 'gas', 'oiljars']);
});

test('どのかけらも材料は爆発物・厚い壁で、外接矩形は全部かけらで埋まる', () => {
    for (const b of all()) {
        assert.equal(b.w % 4, 0, `${b.kind} の幅 ${b.w}`);
        assert.equal(b.h % 4, 0, `${b.kind} の高さ ${b.h}`);
        const { cells } = rasterizeParts(b.parts, b.w, b.h);
        for (const v of cells) {
            assert.equal(v & MAT_MASK, MAT_EXPLOSIVE, `${b.kind}: 爆発物でないかけら ${v}`);
            assert.ok(v & SOLID, `${b.kind}: 細い部品のかけら`);
        }
    }
});

test('床の岩に埋まる 4px を除いても、自機の弾で狙える大きさが見えている', () => {
    for (const b of all()) {
        assert.ok(b.h - TOWN_FOUNDATION_SINK >= 8, `${b.kind} は ${b.h - TOWN_FOUNDATION_SINK}px しか見えない`);
        assert.ok(b.w >= 8, `${b.kind} の幅 ${b.w}`);
    }
});
