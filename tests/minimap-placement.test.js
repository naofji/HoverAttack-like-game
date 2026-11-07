// ミニマップの四隅の座標（miniMapCornerPositions）と、Tab で回す順番（nextMiniMapCorner）を縛るテスト。
// canvas を使わない純関数なので、幾何と順番だけを直接検証できる。
//
// 2026-11-07 までは自機・クロスヘアを避けて隅を選ぶ関数（pickMiniMapCorner /
// pickStickyMiniMapCorner）のテストもここと minimap-placement-sticky.test.js にあった。
// 「チラチラ動いて邪魔」で自動移動ごと撤去したので一緒に消した。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miniMapCornerPositions, nextMiniMapCorner } from '../src/js/ui/minimapPlacement.js';
import { MINIMAP_CORNER_ORDER } from '../src/js/utils/Constants.js';

const BASE = { canvasW: 1024, canvasH: 768, mapW: 300, mapH: 150, margin: 16, hudTop: 60, hudBottom: 40 };

for (const size of [{ mapW: 300, mapH: 150 }, { mapW: 600, mapH: 300 }]) {
    test(`四隅どれも画面からはみ出さず、HUD帯にも重ならない（${size.mapW}x${size.mapH}）`, () => {
        const opts = { ...BASE, ...size };
        const positions = miniMapCornerPositions(opts);
        for (const name of MINIMAP_CORNER_ORDER) {
            const p = positions[name];
            assert.ok(p, `${name} の座標が無い`);
            assert.ok(p.x >= 0, `${name}: 左にはみ出す`);
            assert.ok(p.x + opts.mapW <= opts.canvasW, `${name}: 右にはみ出す`);
            assert.ok(p.y >= opts.hudTop, `${name}: 上部HUD帯に重なる`);
            assert.ok(p.y + opts.mapH <= opts.canvasH - opts.hudBottom, `${name}: 下部HUD帯に重なる`);
        }
    });
}

test('四隅は名前どおりの位置にある（左右・上下を取り違えていない）', () => {
    const p = miniMapCornerPositions(BASE);
    assert.ok(p.topLeft.x < p.topRight.x);
    assert.ok(p.bottomLeft.x < p.bottomRight.x);
    assert.ok(p.topLeft.y < p.bottomLeft.y);
    assert.ok(p.topRight.y < p.bottomRight.y);
    assert.equal(p.topLeft.x, p.bottomLeft.x);
    assert.equal(p.topLeft.y, p.topRight.y);
});

test('Tab の順番は 左上→右上→左下→右下→左上（ユーザー指定）', () => {
    const seen = [];
    let c = 'topLeft';
    for (let i = 0; i < 5; i++) {
        seen.push(c);
        c = nextMiniMapCorner(c);
    }
    assert.deepEqual(seen, ['topLeft', 'topRight', 'bottomLeft', 'bottomRight', 'topLeft']);
});

test('知らない隅（壊れた保存値・未設定）からは左上へ', () => {
    assert.equal(nextMiniMapCorner(undefined), 'topLeft');
    assert.equal(nextMiniMapCorner('center'), 'topLeft');
});
