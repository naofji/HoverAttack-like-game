import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ICICLE_COLORS, ICE_PARTICLE_COLORS, SNOWTREE_COLORS } from '../src/js/world/town/palette.js';
import { MAT_ICE, MAT_MASK, MAT_PLANT, MAT_EXPLOSIVE } from '../src/js/world/town/chunks.js';
import { STAGE_PALETTES, SNOW_CAP_COLOR, TOWN_MATERIALS } from '../src/js/utils/Constants.js';
import { luminance } from '../src/js/utils/color.js';

// 5面のつららは「遠景より手前・地形より奥」の層に描く。岩（鋼青、輝度 118）より明るくないと氷に見えず、
// 足場の雪のふち（SNOW_CAP_COLOR、輝度 243）より白いと足場を読み違える。雪の木の白（色味がほぼ無い）とは、
// 青の強さ（最大チャンネルと最小チャンネルの差）で離す
const FILL = STAGE_PALETTES[4].fill;
const chroma = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return Math.max(r, g, b) - Math.min(r, g, b);
};

test('氷の色は、地形の岩より明るく、足場の雪のふちより暗い', () => {
    for (const hex of [...Object.values(ICICLE_COLORS), ...ICE_PARTICLE_COLORS]) {
        assert.ok(luminance(hex) > luminance(FILL), `${hex} が岩より暗く、氷に見えない`);
        assert.ok(luminance(hex) < luminance(SNOW_CAP_COLOR), `${hex} が足場の雪のふちより白い`);
    }
});

test('つららの本体の色は、雪の木の白より青が強い（雪の木と見分ける）', () => {
    const snowMax = Math.max(...SNOWTREE_COLORS.snow.map(chroma));
    for (const hex of Object.values(ICICLE_COLORS)) {
        assert.ok(chroma(hex) >= 45, `${hex} の青が弱い（${chroma(hex)}）`);
        assert.ok(chroma(hex) > snowMax + 15, `${hex} が雪の白に近い`);
    }
});

test('明るい面は本体より明るく、影は本体より暗い（描き順 body → light → dark の前提）', () => {
    assert.ok(luminance(ICICLE_COLORS.light) > luminance(ICICLE_COLORS.body));
    assert.ok(luminance(ICICLE_COLORS.dark) < luminance(ICICLE_COLORS.body));
});

test('MAT_ICE は材料の番号の範囲（下位 3 ビット）に収まり、他と重ならない。燃えず、延焼しない', () => {
    assert.ok(MAT_ICE >= 1 && MAT_ICE <= MAT_MASK);
    assert.notEqual(MAT_ICE, MAT_PLANT);
    assert.notEqual(MAT_ICE, MAT_EXPLOSIVE);
    const m = TOWN_MATERIALS[MAT_ICE];
    assert.ok(m, 'TOWN_MATERIALS に MAT_ICE の行が無い');
    assert.equal(m.burns, false);
    assert.equal(m.bulletIgnite, 0);
    assert.equal(m.spread, 0);
});
