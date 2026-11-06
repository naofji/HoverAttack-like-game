import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    FACTORY_COLORS, FACTORY_DETAIL_COLORS, FACTORY_HEAT_COLORS, TOWN_RUBBLE_COLORS, shade,
} from '../src/js/world/town/palette.js';
import { MAT_CONCRETE, MAT_MASK } from '../src/js/world/town/chunks.js';
import { backdropColors } from '../src/js/world/CaveBackdrop.js';
import { STAGE_PALETTES, TOWN_MATERIALS } from '../src/js/utils/Constants.js';
import { luminance } from '../src/js/utils/color.js';

// 6面（霧）の工場。3面の町と同じ考え方（遠景より手前・地形の岩より奥）を、6面の暗い岩 Cafe Noir で当てる
const FILL = STAGE_PALETTES[5].fill;
const back = backdropColors(FILL, 'fog');
const MAX = luminance(FILL) * 0.85;
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

test('本体は rockLight 以上、岩の 0.85 倍以下（影は空洞以上）', () => {
    for (const [name, list] of Object.entries(FACTORY_COLORS)) {
        assert.ok(list.length > 0);
        for (const hex of list) {
            const l = luminance(hex);
            assert.ok(l >= luminance(back.rockLight), `${name} ${hex} が暗すぎる (${l.toFixed(1)})`);
            assert.ok(l <= MAX, `${name} ${hex} が明るすぎる (${l.toFixed(1)} > ${MAX.toFixed(1)})`);
            const s = luminance(shade(hex));
            assert.ok(s >= luminance(back.voidColor) && s <= MAX, `${name} の影 ${shade(hex)} (${s.toFixed(1)})`);
        }
    }
});

test('差し色は空洞以上、岩の輝度以下', () => {
    for (const [name, hex] of Object.entries(FACTORY_DETAIL_COLORS)) {
        const l = luminance(hex);
        assert.ok(l >= luminance(back.voidColor), `${name} ${hex} が空洞より暗い (${l.toFixed(1)})`);
        assert.ok(l <= luminance(FILL), `${name} ${hex} が岩より明るい (${l.toFixed(1)})`);
    }
});

test('赤熱は赤く、弾の黄色から離れている', () => {
    const [r, g, b] = rgb(FACTORY_HEAT_COLORS.hot);
    assert.ok(r > g * 1.6 && r > b * 1.6, `${FACTORY_HEAT_COLORS.hot} が赤く見えない`);
    for (const bullet of ['#FFDD33', '#FFCC00']) {
        const d = Math.hypot(...rgb(FACTORY_HEAT_COLORS.hot).map((v, i) => v - rgb(bullet)[i]));
        assert.ok(d > 150, `赤熱が弾 ${bullet} に近い (${d.toFixed(0)})`);
    }
    // 冷めきった色は赤熱より暗い（焼け跡）
    assert.ok(luminance(FACTORY_HEAT_COLORS.burnt) < luminance(FACTORY_HEAT_COLORS.hot));
});

test('コンクリートは日干し煉瓦と同じ燃え方、瓦礫は灰色', () => {
    assert.deepEqual(TOWN_MATERIALS[MAT_CONCRETE], TOWN_MATERIALS[1]);
    const c = rgb(TOWN_RUBBLE_COLORS[MAT_CONCRETE]);
    assert.ok(Math.max(...c) - Math.min(...c) <= 16, `瓦礫 ${TOWN_RUBBLE_COLORS[MAT_CONCRETE]} が灰色でない`);
});

test('MAT_CONCRETE は MAT_MASK に収まり、既存の材料と重ならない', () => {
    assert.equal(MAT_CONCRETE & MAT_MASK, MAT_CONCRETE);
    assert.ok(MAT_CONCRETE > 6);
});
