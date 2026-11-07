// ミニマップの四隅の座標（miniMapCornerPositions）と、Tab で回す順番（nextMiniMapCorner）を縛るテスト。
// canvas を使わない純関数なので、幾何と順番だけを直接検証できる。
//
// 2026-11-07 までは自機・クロスヘアを避けて隅を選ぶ関数（pickMiniMapCorner /
// pickStickyMiniMapCorner）のテストもここと minimap-placement-sticky.test.js にあった。
// 「チラチラ動いて邪魔」で自動移動ごと撤去したので一緒に消した。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    miniMapCornerPositions, nextMiniMapCorner, miniMapOverlaps, stepMiniMapOverlapFade,
} from '../src/js/ui/minimapPlacement.js';
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

// ---- 重なったら薄くする（自動移動のかわり） ----
const RECT = { x: 100, y: 100, w: 200, h: 100 };

test('機体の矩形が少しでも掛かれば重なり（中心が外でも）', () => {
    // 中心 (95, 150) は矩形の外、右半分だけ掛かっている
    assert.equal(miniMapOverlaps(RECT, { x: 85, y: 140, w: 20, h: 20 }, null), true);
});

test('機体の矩形が辺に接しているだけなら重なりではない', () => {
    assert.equal(miniMapOverlaps(RECT, { x: 80, y: 140, w: 20, h: 20 }, null), false);
    assert.equal(miniMapOverlaps(RECT, { x: 150, y: 200, w: 20, h: 20 }, null), false);
});

test('クロスヘアの点が中にあれば重なり、外なら重なりではない', () => {
    assert.equal(miniMapOverlaps(RECT, null, { x: 299, y: 199 }), true);
    assert.equal(miniMapOverlaps(RECT, null, { x: 301, y: 150 }), false);
});

test('機体もクロスヘアも無ければ重なりではない', () => {
    assert.equal(miniMapOverlaps(RECT, null, null), false);
});

test('重なっている間は low まで下がって止まり、外れたら 1 まで戻って止まる', () => {
    let f = 1;
    for (let i = 0; i < 20; i++) f = stepMiniMapOverlapFade(f, true, 0.3, 0.15);
    assert.equal(f, 0.3);
    for (let i = 0; i < 20; i++) f = stepMiniMapOverlapFade(f, false, 0.3, 0.15);
    assert.equal(f, 1);
});

test('1フレームで変わるのは speed ぶんだけ（一瞬で切り替わらない）', () => {
    assert.ok(Math.abs(stepMiniMapOverlapFade(1, true, 0.3, 0.15) - 0.85) < 1e-9);
    assert.ok(Math.abs(stepMiniMapOverlapFade(0.3, false, 0.3, 0.15) - 0.45) < 1e-9);
});
