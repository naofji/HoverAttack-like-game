// drawMiniMap() の枠色・置き場所（四隅から自機/クロスヘアを避けて選ぶ）を縛るテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';
import { makeFakeCtx, extractSets, extractFillRectsWithColor } from './helpers/fake-ctx.js';
import {
    COLOR_MINIMAP_BORDER, MINIMAP_MARGIN, HUD_TOP_HEIGHT, HUD_BOTTOM_HEIGHT, TILE_SIZE,
    MINIMAP_ALPHA, MINIMAP_MAX_WIDTH_RATIO,
} from '../src/js/utils/Constants.js';

const CANVAS_W = 1024;
const CANVAS_H = 768;
const MM_W = 300;
const MM_H = 150;

// mouse の既定値は「画面中央」。(-999,-999) のような画面外の値は
// crosshairScreenPos() の HUD 帯クランプで結局スクリーン端（左上付近）に
// 丸められてしまい、「クロスヘアを避ける」対象が無いテストのつもりでも
// 実際には左上隅のすぐそばに点が来ていた。MINIMAP_AVOID_PADDING を導入すると
// その丸められた点が左上隅の当たり判定に入ってしまうため、本当に「避けるものが
// 無い」状態を表す画面中央に変更した。
function makeGame({ playerPos = null, carrierPos = null, mouse = { x: CANVAS_W / 2, y: CANVAS_H / 2 }, mmW = MM_W, mmH = MM_H } = {}) {
    return {
        canvas: { width: CANVAS_W, height: CANVAS_H },
        camera: { x: 0, y: 0 },
        map: {
            refreshMiniMap() {},
            miniMapCanvas: { width: mmW, height: mmH },
            miniMapScale: 2,
        },
        miniMapAlpha: 1,
        autoAimTarget: null,
        input: { crosshairLocked: false, lockedWorldX: 0, lockedWorldY: 0, mouse },
        enemies: [],
        carrier: carrierPos ? { alive: true, x: carrierPos.x, y: carrierPos.y, width: 0, height: 0 } : null,
        player: playerPos ? { alive: true, docked: false, x: playerPos.x, y: playerPos.y, width: 0, height: 0 } : null,
    };
}

function draw(game) {
    const ctx = makeFakeCtx();
    new ScreenRenderer(game).drawMiniMap(ctx);
    return ctx.calls;
}

test('枠線は COLOR_MINIMAP_BORDER で、白ではない', () => {
    const calls = draw(makeGame());
    const strokes = extractSets(calls, 'strokeStyle');
    assert.ok(strokes.includes(COLOR_MINIMAP_BORDER), '枠色が COLOR_MINIMAP_BORDER になっていない');
    assert.equal(strokes.includes('#FFFFFF'), false, '枠が白のまま');
});

test('何も避けるものが無ければ左上に置かれる', () => {
    const calls = draw(makeGame());
    const drawImageCall = calls.find((c) => c.name === 'drawImage');
    assert.equal(drawImageCall.args[1], MINIMAP_MARGIN);
    assert.equal(drawImageCall.args[2], HUD_TOP_HEIGHT + MINIMAP_MARGIN);
});

test('自機が左上にいれば、ミニマップは他の空いている角へ移る（左上ではなくなる）', () => {
    // ミニマップのピクセル空間で (mmX+10, mmY+10) 付近に来るよう、ワールド座標を逆算する。
    // px = mmX + (worldX/TILE_SIZE)*scale なので、オフセット10には worldX = 5*TILE_SIZE でよい
    // (scale=2 のため)。
    const calls = draw(makeGame({ playerPos: { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE } }));
    const drawImageCall = calls.find((c) => c.name === 'drawImage');
    const mmX = drawImageCall.args[1];
    const mmY = drawImageCall.args[2];
    assert.notEqual(mmY, HUD_TOP_HEIGHT + MINIMAP_MARGIN, '自機のいる左上のままになっている');
});

test('点（母艦）の座標は、選ばれたミニマップの位置(mmX/mmY)に追随する（中央固定式が残っていない）', () => {
    // 自機・クロスヘアが無いデフォルト状態（左上に置かれる）で、母艦のドット座標を
    // mmX/mmY 基準の式から検算する。中央固定 (w-mm.width)/2 のままだと mmX がずれて一致しない。
    const game = makeGame();
    game.carrier = { alive: true, x: 5000, y: 3000, width: 0, height: 0 };

    const calls = draw(game);
    const drawImageCall = calls.find((c) => c.name === 'drawImage');
    const mmX = drawImageCall.args[1];
    const mmY = drawImageCall.args[2];
    // 中央固定式ではないこと（左上配置なので中央とは異なる値になっているはず）
    assert.notEqual(mmX, (CANVAS_W - MM_W) / 2, '中央固定の mmX のままになっている');

    const carrierDotColor = '#0088FF';
    const dots = extractFillRectsWithColor(calls).filter((r) => r.color === carrierDotColor);
    assert.ok(dots.length >= 1, 'carrier のドットが描かれていない');
    const expectedPx = mmX + (game.carrier.x / TILE_SIZE) * game.map.miniMapScale;
    const expectedPy = mmY + (game.carrier.y / TILE_SIZE) * game.map.miniMapScale;
    // fillRect は中心から size/2 だけずらして描くので、中心座標に戻して比較する
    const dot = dots[0];
    const centerX = dot.x + dot.w / 2;
    const centerY = dot.y + dot.h / 2;
    assert.ok(Math.abs(centerX - expectedPx) < 0.001, `x が mmX 基準になっていない: got ${centerX}, expected ${expectedPx}`);
    assert.ok(Math.abs(centerY - expectedPy) < 0.001, `y が mmY 基準になっていない: got ${centerY}, expected ${expectedPy}`);
});

// ⑻ 縮小率が効いている: 大きいミニマップ(600x300)を渡したとき、
// 転送先の幅が canvasW/3 以下になること。
test('大きいミニマップは画面幅の1/3以下に縮小される', () => {
    const game = makeGame({ mmW: 600, mmH: 300 });
    const calls = draw(game);
    const drawImageCall = calls.find((c) => c.name === 'drawImage');
    // ctx.drawImage(mm, dx, dy, dw, dh) の5引数形式で呼ばれているはず
    const destW = drawImageCall.args[3];
    assert.ok(destW !== undefined, 'drawImage が転送先サイズ指定なしで呼ばれている（等倍のまま）');
    assert.ok(destW <= CANVAS_W * MINIMAP_MAX_WIDTH_RATIO + 0.001, `縮小されていない: destW=${destW}`);
    // アスペクト比を保っていること
    const destH = drawImageCall.args[4];
    assert.ok(Math.abs(destW / destH - 600 / 300) < 0.01, 'アスペクト比が保たれていない');
});

// ⑼ 小さいミニマップは拡大されない（元が上限より小さければ等倍）。
test('小さいミニマップは拡大されない', () => {
    const game = makeGame({ mmW: MM_W, mmH: MM_H }); // 300x150 < 1024/3
    const calls = draw(game);
    const drawImageCall = calls.find((c) => c.name === 'drawImage');
    const destW = drawImageCall.args[3];
    const destH = drawImageCall.args[4];
    assert.equal(destW, MM_W, '拡大されないはずが等倍になっていない');
    assert.equal(destH, MM_H, '拡大されないはずが等倍になっていない');
});

// ⑽ 点の座標が縮小率に追随している: 縮小されたときに、点がミニマップの
// 矩形の中に収まっていること（縮小前の座標のままだと矩形からはみ出す）。
test('縮小されたミニマップでも、点の座標がミニマップの矩形の中に収まる', () => {
    const game = makeGame({ mmW: 600, mmH: 300 });
    // マップの右下寄りに母艦を置く。ワールド座標 → タイル座標 → *scale で
    // ミニマップ右下近くに来るように、mm 元サイズいっぱいに近い値を使う。
    // miniMapScale=2 なので、mm 内ピクセル位置 = (worldX/TILE_SIZE)*2。
    // mm 幅600いっぱいに近い位置 = worldX/TILE_SIZE*2 ≈ 590 → worldX ≈ 295*TILE_SIZE
    game.carrier = { alive: true, x: 295 * TILE_SIZE, y: 145 * TILE_SIZE, width: 0, height: 0 };

    const calls = draw(game);
    const drawImageCall = calls.find((c) => c.name === 'drawImage');
    const mmX = drawImageCall.args[1];
    const mmY = drawImageCall.args[2];
    const destW = drawImageCall.args[3];
    const destH = drawImageCall.args[4];

    const carrierDotColor = '#0088FF';
    const dots = extractFillRectsWithColor(calls).filter((r) => r.color === carrierDotColor);
    assert.ok(dots.length >= 1, 'carrier のドットが描かれていない');
    const dot = dots[0];
    const centerX = dot.x + dot.w / 2;
    const centerY = dot.y + dot.h / 2;

    assert.ok(centerX >= mmX && centerX <= mmX + destW,
        `点が縮小後のミニマップ矩形の外にはみ出している: centerX=${centerX}, mmX=${mmX}, destW=${destW}`);
    assert.ok(centerY >= mmY && centerY <= mmY + destH,
        `点が縮小後のミニマップ矩形の外にはみ出している: centerY=${centerY}, mmY=${mmY}, destH=${destH}`);
});

// ⑾ MINIMAP_ALPHA が 0.55 であること、最終的な濃さが3つの積になっていること。
test('MINIMAP_ALPHA は 0.55', () => {
    assert.equal(MINIMAP_ALPHA, 0.55);
});

test('最終的な濃さは MINIMAP_ALPHA × miniMapAlpha × 遷移フェードの積', () => {
    const game = makeGame();
    game.miniMapAlpha = 0.4;
    const calls = draw(game);
    const alphas = extractSets(calls, 'globalAlpha');
    // 初回描画では遷移フェードは 1（初期化直後は完全に見えている）なので、
    // 期待値は MINIMAP_ALPHA * miniMapAlpha * 1
    const expected = MINIMAP_ALPHA * game.miniMapAlpha;
    assert.ok(alphas.some((a) => Math.abs(a - expected) < 0.0001),
        `期待した積の globalAlpha が見つからない: got ${alphas}, expected ${expected}`);
});
