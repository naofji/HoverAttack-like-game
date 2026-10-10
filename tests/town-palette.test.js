import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOWN_BODY_COLORS, TOWN_DETAIL_COLORS, shade } from '../src/js/world/town/palette.js';
import { backdropColors } from '../src/js/world/CaveBackdrop.js';
import { STAGE_PALETTES } from '../src/js/utils/Constants.js';
import { luminance } from '../src/js/utils/color.js';

// 町は「遠景より手前・地形より奥」の層に描く。壁が遠景より暗いと穴に見え、
// 地形の岩より明るいと岩と競合して足場を読み違える（遠景の階調テストと同じ考え方）
const FILL = STAGE_PALETTES[2].fill;
const back = backdropColors(FILL, 'cave');
const MAX = luminance(FILL) * 0.85;

test('壁の色は遠景の rockLight 以上、地形の岩の 0.85 倍以下', () => {
    for (const [name, list] of Object.entries(TOWN_BODY_COLORS)) {
        for (const hex of list) {
            const l = luminance(hex);
            assert.ok(l >= luminance(back.rockLight), `${name} ${hex} が暗すぎる (${l.toFixed(1)})`);
            assert.ok(l <= MAX, `${name} ${hex} が明るすぎる (${l.toFixed(1)} > ${MAX.toFixed(1)})`);
        }
    }
});

test('細かい描き込みと影色は、遠景の空洞以上・地形の岩の 0.85 倍以下', () => {
    const all = [
        ...Object.values(TOWN_DETAIL_COLORS),
        ...Object.values(TOWN_BODY_COLORS).flat().map(shade),
    ];
    for (const hex of all) {
        const l = luminance(hex);
        assert.ok(l >= luminance(back.voidColor), `${hex} が空洞より暗い (${l.toFixed(1)})`);
        assert.ok(l <= MAX, `${hex} が明るすぎる (${l.toFixed(1)})`);
    }
});

test('窓の灯りは弾の黄色より十分暗い', () => {
    // 弾は #FFDD33 / #FFCC00。灯りは輝度の上限で暗い琥珀にしてあるので、
    // 同じ色相でも明るさで見分けられる。ここでは輝度の差を縛る
    assert.ok(luminance('#FFCC00') - luminance(TOWN_DETAIL_COLORS.winLit) > 60);
});
