// drawMiniMap() の枠色・置き場所（四隅から自機/クロスヘアを避けて選ぶ）を縛るテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';
import { makeFakeCtx, extractSets, extractFillRectsWithColor } from './helpers/fake-ctx.js';
import {
    COLOR_MINIMAP_BORDER, MINIMAP_MARGIN, HUD_TOP_HEIGHT, HUD_BOTTOM_HEIGHT, TILE_SIZE,
    MINIMAP_ALPHA, MINIMAP_MAX_WIDTH_RATIO, MINIMAP_FADE_SPEED,
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

// ⑾ 最終的な濃さが3つの積になっていること。MINIMAP_ALPHA の具体値（0.55）は
// 実機フィードバックで調整され続けている数値なので、ここでは「地形を完全な
// 不透明にも透明にもしない範囲に収まっている」程度の緩い検証に留める
// （このリポジトリはバランス調整を低リスクな数値調整で行う方針で、値を
// 変えるたびにここも直す必要が出るのは調整の摩擦になる）。
test('MINIMAP_ALPHA は 0 より大きく 1 未満', () => {
    assert.ok(MINIMAP_ALPHA > 0 && MINIMAP_ALPHA < 1, `MINIMAP_ALPHA が範囲外: ${MINIMAP_ALPHA}`);
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

// 点（自機・敵・母艦）も開閉フェードと遷移フェードには乗るが、地形の減光
// (MINIMAP_ALPHA) は受けない。地形の上に沈める値なので、点にまで掛けると
// 情報として読みにくくなるため。呼び出し時点の globalAlpha を fillRect ごとに
// 追跡して確かめる（この確認をせずに ctx.globalAlpha = 1.0 で丸ごとリセットして
// いたことがあり、その場合は開閉フェードも遷移フェードも点に効かなくなる）。
function alphaAtEachFillRect(calls) {
    let alpha = 1;
    const out = [];
    for (const c of calls) {
        if (c.name === 'set:globalAlpha') alpha = c.args[0];
        else if (c.name === 'fillRect') out.push(alpha);
    }
    return out;
}

test('点（母艦）は開閉フェード(miniMapAlpha)を受ける。地形の MINIMAP_ALPHA は掛からない', () => {
    const game = makeGame({ carrierPos: { x: 100, y: 100 } });
    game.miniMapAlpha = 0.4;
    const calls = draw(game);

    const carrierDotColor = '#0088FF';
    const dots = extractFillRectsWithColor(calls).filter((r) => r.color === carrierDotColor);
    assert.ok(dots.length >= 1, 'carrier のドットが描かれていない');

    const alphas = alphaAtEachFillRect(calls);
    // 色つき fillRect の列と alphas の列は同じ長さ・同じ順序で並ぶので、
    // carrier 色に対応する alpha を突き合わせる。
    const colored = extractFillRectsWithColor(calls);
    const carrierAlphaIdx = colored.findIndex((r) => r.color === carrierDotColor);
    const carrierAlpha = alphas[carrierAlphaIdx];

    // 期待値は miniMapAlpha * 遷移フェード(初回描画なので1)。MINIMAP_ALPHA(0.55)は含まない。
    const expected = game.miniMapAlpha * 1;
    assert.ok(Math.abs(carrierAlpha - expected) < 0.0001,
        `点の globalAlpha が期待どおりでない（MINIMAP_ALPHA を含んでいるか、フェードが効いていない）: got ${carrierAlpha}, expected ${expected}`);
    assert.notEqual(carrierAlpha, 1, '点が常にフルオパシティのまま描かれている（開閉フェードが効いていない）');
});

// 配線側の結合テスト。同じ ScreenRenderer インスタンスで drawMiniMap() を2回以上
// 呼び、避ける条件（自機の位置）を変えて、隅の切り替えフェードが実際に
// globalAlpha へ積まれるか・フェード中は旧位置に据え置かれるかを確かめる。
// これまでのテストは常に新しいインスタンス（＝初回描画で fade=1）だけを見ていたため、
// フェード中の挙動は purely-functional な advanceMiniMapTransition() のテストでしか
// 裏付けられていなかった。
test('隅の切り替え中は、旧位置に据え置かれたまま globalAlpha に遷移フェードが積まれる（点も含めて）', () => {
    // 「避ける」対象は操作中の機体（自機がいればそれ、いなければ母艦）なので、
    // 母艦は avoid には使わず、carrierPos は「点が正しく描かれるか」を見るための
    // ものとして別に置く。自機の位置を画面中央（何も避けない）→左上寄り
    // （左上を避けて bottomLeft が望ましくなる）と動かして隅の切り替えを起こす。
    const game = makeGame({
        playerPos: { x: CANVAS_W / 2, y: CANVAS_H / 2 },
    });
    game.carrier = { alive: true, x: 100, y: 100, width: 0, height: 0 };
    const renderer = new ScreenRenderer(game);

    // 1回目: 自機が画面中央付近にいて何も避けないので左上に置かれ、
    // 初回描画は fade=1（フェード無し）。
    const calls1 = (() => {
        const ctx = makeFakeCtx();
        renderer.drawMiniMap(ctx);
        return ctx.calls;
    })();
    const drawImage1 = calls1.find((c) => c.name === 'drawImage');
    const topLeftX = drawImage1.args[1];
    const topLeftY = drawImage1.args[2];
    assert.equal(topLeftY, HUD_TOP_HEIGHT + MINIMAP_MARGIN, 'テストの前提が崩れている（1回目が左上ではない）');

    // 2回目: 自機を左上へ動かして、望ましい隅を bottomLeft に変える。
    // まだフェードアウトの途中（1歩ぶんしか進んでいない）なので、corner は
    // topLeft のまま・fade は 1 - MINIMAP_FADE_SPEED になっているはず。
    game.player.x = 5 * TILE_SIZE;
    game.player.y = 5 * TILE_SIZE;
    const calls2 = (() => {
        const ctx = makeFakeCtx();
        renderer.drawMiniMap(ctx);
        return ctx.calls;
    })();

    const drawImage2 = calls2.find((c) => c.name === 'drawImage');
    assert.equal(drawImage2.args[1], topLeftX, '隅の切り替え中に位置が旧位置(topLeft)から動いてしまっている');
    assert.equal(drawImage2.args[2], topLeftY, '隅の切り替え中に位置が旧位置(topLeft)から動いてしまっている');

    const expectedFade = 1 - MINIMAP_FADE_SPEED;
    const alphas2 = extractSets(calls2, 'globalAlpha');
    const expectedTerrainAlpha = MINIMAP_ALPHA * game.miniMapAlpha * expectedFade;
    assert.ok(alphas2.some((a) => Math.abs(a - expectedTerrainAlpha) < 0.0001),
        `地形の globalAlpha に遷移フェードが積まれていない: got ${alphas2}, expected ${expectedTerrainAlpha}`);

    // 点（母艦）も同じ遷移フェードを受けているはず（MINIMAP_ALPHA は含まない）。
    const alphasAtDots2 = alphaAtEachFillRect(calls2);
    const colored2 = extractFillRectsWithColor(calls2);
    const carrierAlphaIdx2 = colored2.findIndex((r) => r.color === '#0088FF');
    const carrierAlpha2 = alphasAtDots2[carrierAlphaIdx2];
    const expectedDotAlpha = game.miniMapAlpha * expectedFade;
    assert.ok(Math.abs(carrierAlpha2 - expectedDotAlpha) < 0.0001,
        `点の globalAlpha に遷移フェードが積まれていない: got ${carrierAlpha2}, expected ${expectedDotAlpha}`);
    assert.notEqual(carrierAlpha2, 1, '点が隅の切り替え中もフルオパシティのままになっている');
});
