// pickMiniMapCorner の置き場所選択ロジックを縛るテスト。
// canvas を使わない純関数なので、幾何だけを直接検証できる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickMiniMapCorner } from '../src/js/ui/minimapPlacement.js';

const BASE = { canvasW: 1024, canvasH: 768, mapW: 300, mapH: 150, margin: 16, hudTop: 60, hudBottom: 0 };

test('避けるものが無ければ左上', () => {
    const p = pickMiniMapCorner({ ...BASE, avoid: [] });
    assert.equal(p.x, BASE.margin);
    assert.equal(p.y, BASE.hudTop + BASE.margin);
});

test('左上に点があれば左下', () => {
    const topLeft = { x: BASE.margin + 10, y: BASE.hudTop + BASE.margin + 10 };
    const p = pickMiniMapCorner({ ...BASE, avoid: [topLeft] });
    assert.equal(p.x, BASE.margin);
    assert.equal(p.y, BASE.canvasH - BASE.hudBottom - BASE.margin - BASE.mapH);
});

test('左上と左下に点があれば右上', () => {
    const topLeft = { x: BASE.margin + 10, y: BASE.hudTop + BASE.margin + 10 };
    const bottomLeftY = BASE.canvasH - BASE.hudBottom - BASE.margin - BASE.mapH;
    const bottomLeft = { x: BASE.margin + 10, y: bottomLeftY + 10 };
    const p = pickMiniMapCorner({ ...BASE, avoid: [topLeft, bottomLeft] });
    assert.equal(p.x, BASE.canvasW - BASE.margin - BASE.mapW);
    assert.equal(p.y, BASE.hudTop + BASE.margin);
});

test('左上・左下・右上に点があれば右下', () => {
    const topLeft = { x: BASE.margin + 10, y: BASE.hudTop + BASE.margin + 10 };
    const bottomY = BASE.canvasH - BASE.hudBottom - BASE.margin - BASE.mapH;
    const bottomLeft = { x: BASE.margin + 10, y: bottomY + 10 };
    const rightX = BASE.canvasW - BASE.margin - BASE.mapW;
    const topRight = { x: rightX + 10, y: BASE.hudTop + BASE.margin + 10 };
    const p = pickMiniMapCorner({ ...BASE, avoid: [topLeft, bottomLeft, topRight] });
    assert.equal(p.x, rightX);
    assert.equal(p.y, bottomY);
});

test('四隅すべてに点があれば左上にフォールバック', () => {
    const rightX = BASE.canvasW - BASE.margin - BASE.mapW;
    const bottomY = BASE.canvasH - BASE.hudBottom - BASE.margin - BASE.mapH;
    const topY = BASE.hudTop + BASE.margin;
    const avoid = [
        { x: BASE.margin + 5, y: topY + 5 },
        { x: BASE.margin + 5, y: bottomY + 5 },
        { x: rightX + 5, y: topY + 5 },
        { x: rightX + 5, y: bottomY + 5 },
    ];
    const p = pickMiniMapCorner({ ...BASE, avoid });
    assert.equal(p.x, BASE.margin);
    assert.equal(p.y, topY);
});

test('選ばれた矩形は画面からはみ出さず、HUD帯にも重ならない', () => {
    const cases = [
        [],
        [{ x: BASE.margin + 5, y: BASE.hudTop + BASE.margin + 5 }],
    ];
    for (const avoid of cases) {
        const p = pickMiniMapCorner({ ...BASE, avoid });
        assert.ok(p.x >= 0, 'x が画面外(左)');
        assert.ok(p.y >= 0, 'y が画面外(上)');
        assert.ok(p.x + BASE.mapW <= BASE.canvasW, '右端がはみ出す');
        assert.ok(p.y + BASE.mapH <= BASE.canvasH, '下端がはみ出す');
        assert.ok(p.y >= BASE.hudTop, '上部HUD帯に重なる');
        assert.ok(p.y + BASE.mapH <= BASE.canvasH - BASE.hudBottom, '下部HUD帯に重なる');
    }
});

test('ミニマップが大きい場合（600x300）でも壊れない', () => {
    const big = { ...BASE, mapW: 600, mapH: 300 };
    const p = pickMiniMapCorner({ ...big, avoid: [] });
    assert.ok(p.x >= 0 && p.y >= 0);
    assert.ok(p.x + big.mapW <= big.canvasW);
    assert.ok(p.y + big.mapH <= big.canvasH);
});
