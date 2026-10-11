import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLANT_COLORS, PLANT_LEAF_PARTICLE_COLORS, shade } from '../src/js/world/town/palette.js';
import { backdropColors } from '../src/js/world/CaveBackdrop.js';
import { STAGE_PALETTES, STAGE_ENVIRONMENTS } from '../src/js/utils/Constants.js';
import { luminance } from '../src/js/utils/color.js';

// 4面の植物は「遠景より手前・地形より奥」の層に描く（町と同じ考え方）。遠景より暗いと穴に見え、
// 地形の岩より明るいと岩と競合して足場を読み違える
const FILL = STAGE_PALETTES[3].fill;
const back = backdropColors(FILL, STAGE_ENVIRONMENTS[3].backdrop);
const MAX = luminance(FILL) * 0.85;
const hue = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d === 0) return 0;
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
};

test('植物の色は遠景の rockLight 以上、地形の岩の 0.85 倍以下（影も空洞以上）', () => {
    for (const [name, list] of Object.entries(PLANT_COLORS)) {
        for (const hex of list) {
            const l = luminance(hex);
            assert.ok(l >= luminance(back.rockLight), `${name} ${hex} が暗すぎる (${l.toFixed(1)})`);
            assert.ok(l <= MAX, `${name} ${hex} が明るすぎる (${l.toFixed(1)} > ${MAX.toFixed(1)})`);
            assert.ok(luminance(shade(hex)) >= luminance(back.voidColor), `${name} ${hex} の影が空洞より暗い`);
        }
    }
    for (const hex of PLANT_LEAF_PARTICLE_COLORS) assert.ok(luminance(hex) <= MAX);
});

test('葉の色は 4面の岩（青緑）より黄緑寄りで、色相で離れている', () => {
    const rock = hue(FILL);
    for (const hex of [...PLANT_COLORS.moss, ...PLANT_COLORS.leaf, ...PLANT_COLORS.vine]) {
        assert.ok(rock - hue(hex) >= 20, `${hex} の色相 ${hue(hex).toFixed(0)} が岩 ${rock.toFixed(0)} に近い`);
    }
});
