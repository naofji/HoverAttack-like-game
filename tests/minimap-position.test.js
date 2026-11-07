// drawMiniMap() の枠色・置き場所（設定の隅＝Tab で選んだ隅に出す。自機/クロスヘアは避けない）を縛るテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';
import { makeFakeCtx, extractSets, extractFillRectsWithColor } from './helpers/fake-ctx.js';
import {
    MINIMAP_MARGIN, HUD_TOP_HEIGHT, HUD_BOTTOM_HEIGHT, TILE_SIZE,
    MINIMAP_ALPHA, MINIMAP_MAX_WIDTH_RATIO, MINIMAP_FADE_SPEED,
    MINIMAP_SATURATION, MINIMAP_BRIGHTNESS, MINIMAP_OVERLAP_ALPHA,
} from '../src/js/utils/Constants.js';

const CANVAS_W = 1024;
const CANVAS_H = 768;
const MM_W = 300;
const MM_H = 150;

// mouse の既定値は「画面中央」＝どの隅のミニマップにも掛からない位置。画面外の値は
// crosshairScreenPos() の HUD 帯クランプで左上付近に丸められ、左上のミニマップに
// 重なって薄くなってしまうので使わない。
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

// サイズを上げて薄さを補ったあとは、枠が無いほうが地形に馴染むという
// 実機フィードバックで撤去した。strokeRect が復活したら気づけるよう、
// 「呼ばれていないこと」自体を縛る（COLOR_MINIMAP_BORDER 定数も削除済み）。
test('外枠(strokeRect)は描かない', () => {
    const calls = draw(makeGame());
    const strokeRects = calls.filter((c) => c.name === 'strokeRect');
    assert.equal(strokeRects.length, 0, '枠線(strokeRect)が描かれている');
});

test('設定に隅が無ければ左上に置かれる', () => {
    const calls = draw(makeGame());
    const drawImageCall = calls.find((c) => c.name === 'drawImage');
    assert.equal(drawImageCall.args[1], MINIMAP_MARGIN);
    assert.equal(drawImageCall.args[2], HUD_TOP_HEIGHT + MINIMAP_MARGIN);
});

// Tab で選んだ隅（settings.miniMapCorner）にそのまま出る。4隅それぞれで、左右・上下の
// どちらの端に寄っているかを見る（座標の式は minimap-placement.test.js が縛っている）。
for (const [corner, right, bottom] of [
    ['topLeft', false, false], ['topRight', true, false],
    ['bottomLeft', false, true], ['bottomRight', true, true],
]) {
    test(`設定の隅（${corner}）に置かれる`, () => {
        const game = makeGame();
        game.settings = { miniMapCorner: corner };
        const d = draw(game).find((c) => c.name === 'drawImage');
        const [x, y, dw, dh] = d.args.slice(1, 5);
        assert.equal(right ? CANVAS_W - MINIMAP_MARGIN - dw : MINIMAP_MARGIN, x, '左右が違う');
        assert.equal(bottom ? CANVAS_H - HUD_BOTTOM_HEIGHT - MINIMAP_MARGIN - dh : HUD_TOP_HEIGHT + MINIMAP_MARGIN, y, '上下が違う');
    });
}

// 自動で隅を選ぶ作りは「チラチラ動いて邪魔」との苦情で撤去した。以前のテストは
// 「自機が左上にいれば他の隅へ移る」だったので、ちょうど逆を縛る。
// 自機・クロスヘアの両方を左上の矩形の真ん中に置く（どちらかを避ける処理が
// 残っていれば必ず動く位置）。
test('自機とクロスヘアが左上に重なっても、ミニマップは動かない（自動移動は廃止）', () => {
    const game = makeGame({
        playerPos: { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE },
        mouse: { x: MINIMAP_MARGIN + 20, y: HUD_TOP_HEIGHT + MINIMAP_MARGIN + 20 },
    });
    const renderer = new ScreenRenderer(game);
    for (let i = 0; i < 30; i++) {
        const ctx = makeFakeCtx();
        renderer.drawMiniMap(ctx);
        const d = ctx.calls.find((c) => c.name === 'drawImage');
        assert.equal(d.args[1], MINIMAP_MARGIN, `${i} フレーム目に左右へ動いた`);
        assert.equal(d.args[2], HUD_TOP_HEIGHT + MINIMAP_MARGIN, `${i} フレーム目に上下へ動いた`);
    }
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
    // 縮尺は drawImage の転送先サイズから取る。miniMapScale をそのまま使うと
    // 「等倍で描かれる」前提になるが、表示サイズを一定に保つようになってからは
    // 小さいマップは拡大されるので、その前提は成り立たない
    const dotScale = game.map.miniMapScale * (drawImageCall.args[3] / MM_W);
    const expectedPx = mmX + (game.carrier.x / TILE_SIZE) * dotScale;
    const expectedPy = mmY + (game.carrier.y / TILE_SIZE) * dotScale;
    // fillRect は中心から size/2 だけずらして描くので、中心座標に戻して比較する
    const dot = dots[0];
    const centerX = dot.x + dot.w / 2;
    const centerY = dot.y + dot.h / 2;
    assert.ok(Math.abs(centerX - expectedPx) < 0.001, `x が mmX 基準になっていない: got ${centerX}, expected ${expectedPx}`);
    assert.ok(Math.abs(centerY - expectedPy) < 0.001, `y が mmY 基準になっていない: got ${centerY}, expected ${expectedPy}`);
});

// ⑻ 縮小率が効いている: 大きいミニマップ(600x300)を渡したとき、
// 転送先の幅が canvasW * MINIMAP_MAX_WIDTH_RATIO 以下になること。
// 定数を直接参照する形にしているので、上限の値そのものを変えてもこのテストは
// 直さずに済む（ただし「縮小されている」ことは元サイズ(600)と比較して確かめる）。
test('大きいミニマップは画面幅の MINIMAP_MAX_WIDTH_RATIO 以下に縮小される', () => {
    const game = makeGame({ mmW: 600, mmH: 300 });
    const calls = draw(game);
    const drawImageCall = calls.find((c) => c.name === 'drawImage');
    // ctx.drawImage(mm, dx, dy, dw, dh) の5引数形式で呼ばれているはず
    const destW = drawImageCall.args[3];
    assert.ok(destW !== undefined, 'drawImage が転送先サイズ指定なしで呼ばれている（等倍のまま）');
    assert.ok(destW < 600, `元サイズから縮小されていない: destW=${destW}`);
    assert.ok(destW <= CANVAS_W * MINIMAP_MAX_WIDTH_RATIO + 0.001, `縮小されていない: destW=${destW}`);
    // アスペクト比を保っていること
    const destH = drawImageCall.args[4];
    assert.ok(Math.abs(destW / destH - 600 / 300) < 0.01, 'アスペクト比が保たれていない');
});

// 母艦の方向インディケーター（HUD.drawCarrierArrow）はミニマップより上の面に
// 描くようになったため、ミニマップ側はもう避ける必要が無い。避けたままだと
// 「矢印が出るたびにミニマップが動く」という、往復を嫌ったユーザー要望に反する
// 挙動が残ってしまう。ここでは「矢印が出ていてもミニマップは動かない」ことを縛る
// （避ける対象が矢印だけ残っていたら、この判定に引っかかって失敗するはず）。
test('母艦の方向矢印が出ていても、ミニマップはその位置を避けない', () => {
    const game = makeGame({ playerPos: { x: CANVAS_W / 2, y: CANVAS_H / 2 } });
    // 自機は画面中央（=カメラ原点からのオフセットが半画面）なので、
    // カメラは (0,0) のまま。母艦をカメラ・画面中央から大きく左上に離す
    // （母艦の方向矢印が左上隅の近くに出る状況）。
    game.carrier = { alive: true, x: -100000, y: -100000, width: 0, height: 0 };

    const calls = draw(game);
    const drawImageCall = calls.find((c) => c.name === 'drawImage');
    const mmY = drawImageCall.args[2];

    assert.equal(mmY, HUD_TOP_HEIGHT + MINIMAP_MARGIN,
        '矢印がまだ避ける対象に残っていて、左上から動いてしまっている');
});

// ⑼ **マップの広さによらず表示サイズを一定に保つ**（実機フィードバック）。
// 以前は「上限より小さければ等倍」＝拡大しない作りだったので、面が進んで
// マップが広くなるほどミニマップも大きくなり、面ごとに見え方が変わっていた。
// 焼く解像度は cols*2 のまま（マップの広さに比例する）なので、小さいマップは
// 拡大されることになる。ミニマップは元々ぼかして沈めた絵なので許容する。
test('マップの広さが変わってもミニマップの表示サイズは一定', () => {
    const sizes = [];
    for (const [mmW, mmH] of [[300, 150], [450, 225], [600, 300]]) {
        const calls = draw(makeGame({ mmW, mmH }));
        const c = calls.find((x) => x.name === 'drawImage');
        sizes.push({ w: c.args[3], h: c.args[4] });
    }
    for (const s of sizes.slice(1)) {
        assert.ok(Math.abs(s.w - sizes[0].w) < 0.001, `表示幅がマップの広さで変わっている: ${JSON.stringify(sizes)}`);
        assert.ok(Math.abs(s.h - sizes[0].h) < 0.001, `表示高さがマップの広さで変わっている: ${JSON.stringify(sizes)}`);
    }
    assert.ok(
        Math.abs(sizes[0].w - CANVAS_W * MINIMAP_MAX_WIDTH_RATIO) < 0.001,
        `表示幅が画面幅の MINIMAP_MAX_WIDTH_RATIO になっていない: ${sizes[0].w}`,
    );
});

// 小さいマップでも拡大されること（上の一定サイズの裏返し。等倍で止まる実装が
// 戻ってきたらここで気づける）
test('上限より小さいミニマップは拡大される', () => {
    const calls = draw(makeGame({ mmW: MM_W, mmH: MM_H })); // 300x150
    const drawImageCall = calls.find((c) => c.name === 'drawImage');
    assert.ok(drawImageCall.args[3] > MM_W, `拡大されていない: destW=${drawImageCall.args[3]}`);
    // アスペクト比は保つ
    assert.ok(
        Math.abs(drawImageCall.args[3] / drawImageCall.args[4] - MM_W / MM_H) < 0.01,
        'アスペクト比が保たれていない',
    );
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

// トーニングの2つは 0..1 に収まっていること。ctx.filter が無い環境向けの
// フォールバック（Map._applyMiniMapToning）は `1 - 値` を globalAlpha に入れるので、
// 1 を超えると負の globalAlpha になって描画が壊れる。
// 「見づらいから明るく」で 1 を跨ぐのが一番ありそうな踏み外し方なので縛っておく
test('MINIMAP_SATURATION / MINIMAP_BRIGHTNESS は 0..1 に収まる', () => {
    assert.ok(MINIMAP_SATURATION >= 0 && MINIMAP_SATURATION <= 1,
        `MINIMAP_SATURATION が範囲外: ${MINIMAP_SATURATION}`);
    assert.ok(MINIMAP_BRIGHTNESS >= 0 && MINIMAP_BRIGHTNESS <= 1,
        `MINIMAP_BRIGHTNESS が範囲外: ${MINIMAP_BRIGHTNESS}（フォールバックの globalAlpha が負になる）`);
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
    // 自機がいないので母艦が「操作中の機体」になる。左上のミニマップに掛かると
    // 重なりで薄くなって別の倍率が混ざるので、画面の右下（どこにも掛からない）に置く
    const game = makeGame({ carrierPos: { x: CANVAS_W - 40, y: CANVAS_H - 40 } });
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
    // 隅の切り替えは Tab で設定の隅（settings.miniMapCorner）が変わったときに起きる。
    // 母艦は「点が正しく描かれるか」を見るために置く。
    const game = makeGame({
        playerPos: { x: CANVAS_W / 2, y: CANVAS_H / 2 },
    });
    game.settings = { miniMapCorner: 'topLeft' };
    game.carrier = { alive: true, x: 100, y: 100, width: 0, height: 0 };
    const renderer = new ScreenRenderer(game);

    // 1回目: 設定は左上。初回描画は fade=1（フェード無し）。
    const calls1 = (() => {
        const ctx = makeFakeCtx();
        renderer.drawMiniMap(ctx);
        return ctx.calls;
    })();
    const drawImage1 = calls1.find((c) => c.name === 'drawImage');
    const topLeftX = drawImage1.args[1];
    const topLeftY = drawImage1.args[2];
    assert.equal(topLeftY, HUD_TOP_HEIGHT + MINIMAP_MARGIN, 'テストの前提が崩れている（1回目が左上ではない）');

    // 2回目: Tab を押した後と同じく、設定の隅を topRight に変える。
    // まだフェードアウトの途中（1歩ぶんしか進んでいない）なので、corner は
    // topLeft のまま・fade は 1 - MINIMAP_FADE_SPEED になっているはず。
    game.settings = { miniMapCorner: 'topRight' };
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

// ---- 重なったら薄くする（自動移動のかわり） ----
// drawImage の直前に設定された globalAlpha（＝地形の濃さ）を、描画を何フレームか
// 進めて読む。期待値は定数から組み立てる（重なりの倍率は MINIMAP_OVERLAP_ALPHA）。
function terrainAlphaAfter(renderer, frames) {
    let alpha = null;
    for (let i = 0; i < frames; i++) {
        const ctx = makeFakeCtx();
        renderer.drawMiniMap(ctx);
        const idx = ctx.calls.findIndex((c) => c.name === 'drawImage');
        alpha = extractSets(ctx.calls.slice(0, idx), 'globalAlpha').at(-1);
    }
    return alpha;
}
const FULL = MINIMAP_ALPHA * 1;
const DIM = MINIMAP_ALPHA * MINIMAP_OVERLAP_ALPHA;
// 左上のミニマップの中に入る位置（左上の隅は x=MARGIN, y=HUD_TOP+MARGIN から）
const INSIDE_TOP_LEFT = { x: MINIMAP_MARGIN + 30, y: HUD_TOP_HEIGHT + MINIMAP_MARGIN + 30 };

test('自機がミニマップの下に入ると薄くなり、出ると戻る', () => {
    const game = makeGame({ playerPos: INSIDE_TOP_LEFT });
    game.player.width = 16; game.player.height = 24;
    const r = new ScreenRenderer(game);
    assert.ok(Math.abs(terrainAlphaAfter(r, 30) - DIM) < 1e-9, '重なっているのに薄くならない');
    game.player.x = CANVAS_W / 2; game.player.y = CANVAS_H / 2;
    assert.ok(Math.abs(terrainAlphaAfter(r, 30) - FULL) < 1e-9, '外れたのに戻らない');
});

test('薄くなるのは一瞬ではなく少しずつ（1フレーム目はまだ濃い）', () => {
    const game = makeGame({ playerPos: INSIDE_TOP_LEFT });
    const r = new ScreenRenderer(game);
    const first = terrainAlphaAfter(r, 1);
    assert.ok(first < FULL && first > DIM, `1フレーム目: ${first}`);
});

test('クロスヘアがミニマップの中にあると薄くなる', () => {
    const game = makeGame({ mouse: INSIDE_TOP_LEFT });
    const r = new ScreenRenderer(game);
    assert.ok(Math.abs(terrainAlphaAfter(r, 30) - DIM) < 1e-9);
});

test('ドッキング中は母艦が重なると薄くなる（自機は見ない）', () => {
    const game = makeGame({ playerPos: { x: CANVAS_W / 2, y: CANVAS_H / 2 } });
    game.player.docked = true;
    game.carrier = { alive: true, x: INSIDE_TOP_LEFT.x, y: INSIDE_TOP_LEFT.y, width: 64, height: 32 };
    const r = new ScreenRenderer(game);
    assert.ok(Math.abs(terrainAlphaAfter(r, 30) - DIM) < 1e-9);
});

test('何も重なっていなければ濃さはそのまま', () => {
    const r = new ScreenRenderer(makeGame({ playerPos: { x: CANVAS_W / 2, y: CANVAS_H / 2 } }));
    assert.ok(Math.abs(terrainAlphaAfter(r, 30) - FULL) < 1e-9);
});

test('隅を変えたら、判定も新しい隅の矩形で行う（左上に自機がいても右上なら濃いまま）', () => {
    const game = makeGame({ playerPos: INSIDE_TOP_LEFT });
    game.settings = { miniMapCorner: 'topRight' };
    const r = new ScreenRenderer(game);
    assert.ok(Math.abs(terrainAlphaAfter(r, 30) - FULL) < 1e-9);
});

test('点にも同じ倍率が掛かる（自機の下で点だけ濃く残らない）', () => {
    const game = makeGame({ playerPos: INSIDE_TOP_LEFT });
    const r = new ScreenRenderer(game);
    terrainAlphaAfter(r, 30);
    const ctx = makeFakeCtx();
    r.drawMiniMap(ctx);
    const alphas = alphaAtEachFillRect(ctx.calls);
    const colored = extractFillRectsWithColor(ctx.calls);
    const i = colored.findIndex((c) => c.color === '#FFFFFF' && c.w === 4);
    assert.ok(i >= 0, '自機の点が無い');
    assert.ok(Math.abs(alphas[i] - MINIMAP_OVERLAP_ALPHA) < 1e-9, `点の濃さ: ${alphas[i]}`);
});

// ---- アイテムと格納塔を緑の点で出す（ユーザー指定） ----
// 色はここに直接書く（実装の定数から導くと、色を変えても恒真になる）
const ITEM_GREEN = '#33FF66';
const box = (x, y, w, h, alive = true) => ({ alive, x, y, width: w, height: h });

test('落ちているアイテムが緑の点で出る（取られたものは出ない）', () => {
    const game = makeGame();
    game.pickups = [box(160, 160, 16, 16), box(800, 320, 16, 16), box(480, 480, 16, 16, false)];
    const greens = extractFillRectsWithColor(draw(game)).filter((r) => r.color === ITEM_GREEN);
    assert.equal(greens.length, 2);
});

test('格納塔も緑の点で出て、アイテムより一回り大きい（壊したものは出ない）', () => {
    const game = makeGame();
    game.pickups = [box(160, 160, 16, 16)];
    game.storageTowers = [box(640, 320, 40, 64), box(960, 320, 40, 64, false)];
    const greens = extractFillRectsWithColor(draw(game)).filter((r) => r.color === ITEM_GREEN);
    assert.equal(greens.length, 2);
    const [item, tower] = greens;
    assert.ok(tower.w > item.w, `塔 ${tower.w} がアイテム ${item.w} より大きくない`);
});

test('緑の点はアイテムの中心のミニマップ上の位置に出る', () => {
    const game = makeGame();
    game.pickups = [box(1000, 600, 16, 16)];
    const calls = draw(game);
    const d = calls.find((c) => c.name === 'drawImage');
    const scale = game.map.miniMapScale * (d.args[3] / MM_W);
    const g = extractFillRectsWithColor(calls).find((r) => r.color === ITEM_GREEN);
    assert.ok(Math.abs(g.x + g.w / 2 - (d.args[1] + (1008 / TILE_SIZE) * scale)) < 1e-9);
    assert.ok(Math.abs(g.y + g.h / 2 - (d.args[2] + (608 / TILE_SIZE) * scale)) < 1e-9);
});

test('アイテムは敵より先に描く（重なったら敵の赤が上）', () => {
    const game = makeGame();
    game.pickups = [box(160, 160, 16, 16)];
    game.enemies = [box(160, 160, 16, 16)];
    const colored = extractFillRectsWithColor(draw(game));
    const gi = colored.findIndex((r) => r.color === ITEM_GREEN);
    const ri = colored.findIndex((r) => r.color === '#FF3333');
    assert.ok(gi >= 0 && ri >= 0 && gi < ri, `緑 ${gi} / 赤 ${ri}`);
});

test('pickups / storageTowers を持たない game でも落ちない', () => {
    const game = makeGame();
    delete game.pickups;
    delete game.storageTowers;
    assert.doesNotThrow(() => draw(game));
});
