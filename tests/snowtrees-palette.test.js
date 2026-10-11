import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SNOWTREE_COLORS, SNOWTREE_PARTICLE_COLORS } from '../src/js/world/town/palette.js';
import { backdropColors } from '../src/js/world/CaveBackdrop.js';
import { STAGE_PALETTES, STAGE_ENVIRONMENTS, SNOW_CAP_COLOR } from '../src/js/utils/Constants.js';
import { luminance } from '../src/js/utils/color.js';

// 5面の木は「遠景より手前・地形より奥」の層に描く。針葉と幹は遠景の岩の層より暗いと穴に見える。
// 雪は岩より明るくしないと雪に見えないが、足場の雪のふち（SNOW_CAP_COLOR）より白いと足場を読み違える
const FILL = STAGE_PALETTES[4].fill;
const back = backdropColors(FILL, STAGE_ENVIRONMENTS[4].backdrop);

test('針葉と幹は遠景の rockLight 以上で、地形の岩より暗い', () => {
    for (const hex of [...SNOWTREE_COLORS.needle, ...SNOWTREE_COLORS.trunk]) {
        assert.ok(luminance(hex) >= luminance(back.rockLight), `${hex} が暗すぎる (${luminance(hex).toFixed(1)})`);
        assert.ok(luminance(hex) < luminance(FILL), `${hex} が岩より明るい`);
    }
});

test('雪は地形の岩より明るく、足場の雪のふちより暗い', () => {
    for (const hex of SNOWTREE_COLORS.snow) {
        assert.ok(luminance(hex) > luminance(FILL), `${hex} が岩より暗く、雪に見えない`);
        assert.ok(luminance(hex) < luminance(SNOW_CAP_COLOR), `${hex} が足場の雪のふちより白い`);
    }
});

test('雪の4色は暗い順に並ぶ（影・本体・明るい面・頂の光。絵の描き順がこの並びを前提にする）', () => {
    const l = SNOWTREE_COLORS.snow.map(luminance);
    for (let i = 1; i < l.length; i++) assert.ok(l[i] > l[i - 1]);
});

test('砕けた粒の色は雪の色か針葉の色', () => {
    const known = new Set([...SNOWTREE_COLORS.snow, ...SNOWTREE_COLORS.needle]);
    for (const hex of SNOWTREE_PARTICLE_COLORS) assert.ok(known.has(hex), hex);
});
