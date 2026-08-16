// ミニマップ上の「今この画面に映っている範囲」のハイライトを縛るテスト。
//
// ミニマップの表示サイズをマップの広さによらず一定にした結果、「全体マップが
// どれくらい広いのか分からなくなった」という実機フィードバックへの対応。
// 可視領域は常に 64x48 タイル固定なので、それがミニマップに占める割合が
// そのまま縮尺になる（最小マップで 43%x64%、最大マップで 21%x32%）。
//
// 表現は「外を暗くする」ではなく「中を明るくする」を選んだ。ミニマップは既に
// 彩度・明度を落として沈めてあり、これ以上暗い部分を作るとマップとして読めなく
// なるため（ユーザー判断）。
//
// 「明るくする」を**白の半透明を重ねる**形で実装しているのは、ミニマップが
// ライブのゲーム画面の上に半透明で乗っているから。地形をもう一度重ねて
// 不透明度を上げる方式だと、背後に何が映っているかでコントラストが変わって
// しまい、狙った差が出る保証がない。白を足すのは背後に依存しない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import {
    TILE_SIZE, MINIMAP_VIEWPORT_HIGHLIGHT, COLOR_MINIMAP_VIEWPORT,
} from '../src/js/utils/Constants.js';

const CANVAS_W = 1024;
const CANVAS_H = 768;
// 最大サイズのマップ相当（300x150 タイル、miniMapScale=2）
const MM_W = 600;
const MM_H = 300;
const MAP_W = (MM_W / 2) * TILE_SIZE;   // ワールドのピクセル幅
const MAP_H = (MM_H / 2) * TILE_SIZE;

function makeGame({ camera = { x: 0, y: 0 }, enemies = [] } = {}) {
    return {
        canvas: { width: CANVAS_W, height: CANVAS_H },
        camera,
        map: {
            refreshMiniMap() {},
            miniMapCanvas: { width: MM_W, height: MM_H },
            miniMapScale: 2,
            width: MAP_W,
            height: MAP_H,
        },
        miniMapAlpha: 1,
        autoAimTarget: null,
        input: { crosshairLocked: false, lockedWorldX: 0, lockedWorldY: 0, mouse: { x: CANVAS_W / 2, y: CANVAS_H / 2 } },
        enemies,
        carrier: null,
        player: null,
    };
}

function draw(game) {
    const ctx = makeFakeCtx();
    new ScreenRenderer(game).drawMiniMap(ctx);
    return ctx.calls;
}

/** fillRect 呼び出しを、その時点の色と globalAlpha 付きで取り出す。 */
function fillRects(calls) {
    const out = [];
    let color = '';
    let alpha = 1;
    calls.forEach((c, i) => {
        if (c.name === 'set:fillStyle') color = c.args[0];
        else if (c.name === 'set:globalAlpha') alpha = c.args[0];
        else if (c.name === 'fillRect') out.push({ i, x: c.args[0], y: c.args[1], w: c.args[2], h: c.args[3], color, alpha });
    });
    return out;
}

function highlightOf(calls) {
    return fillRects(calls).filter((r) => r.color === COLOR_MINIMAP_VIEWPORT);
}

function mapImage(calls) {
    const c = calls.find((x) => x.name === 'drawImage');
    return { i: calls.indexOf(c), x: c.args[1], y: c.args[2], w: c.args[3], h: c.args[4] };
}

test('可視領域のハイライトが1枚だけ描かれる', () => {
    const hl = highlightOf(draw(makeGame()));
    assert.equal(hl.length, 1, `ハイライトの枚数が違う: ${hl.length}`);
});

test('ハイライトの位置と大きさがカメラと縮尺に一致する', () => {
    // カメラをマップの中ほどへ。端でクランプされない位置を選ぶ
    const camera = { x: 1000, y: 500 };
    const calls = draw(makeGame({ camera }));
    const img = mapImage(calls);
    const hl = highlightOf(calls)[0];

    // 縮尺は点(drawDot)と同じ「miniMapScale × 縮小率」
    const scale = 2 * (img.w / MM_W);
    assert.ok(Math.abs(hl.x - (img.x + (camera.x / TILE_SIZE) * scale)) < 0.001, `x がずれている: ${hl.x}`);
    assert.ok(Math.abs(hl.y - (img.y + (camera.y / TILE_SIZE) * scale)) < 0.001, `y がずれている: ${hl.y}`);
    assert.ok(Math.abs(hl.w - (CANVAS_W / TILE_SIZE) * scale) < 0.001, `幅がずれている: ${hl.w}`);
    assert.ok(Math.abs(hl.h - (CANVAS_H / TILE_SIZE) * scale) < 0.001, `高さがずれている: ${hl.h}`);
});

// マップの端まで寄ったとき、ハイライトがミニマップの縁にぴったり収まること。
// カメラは [0, マップ幅 - 画面幅] にクランプされるので、ここが実際に起こりうる
// 端の値になる（可視領域の右端 = マップの右端 = ミニマップの右端）
test('カメラがマップの端にあるとき、ハイライトはミニマップの縁にちょうど収まる', () => {
    const camera = { x: MAP_W - CANVAS_W, y: MAP_H - CANVAS_H };
    const calls = draw(makeGame({ camera }));
    const img = mapImage(calls);
    const hl = highlightOf(calls)[0];
    assert.ok(Math.abs((hl.x + hl.w) - (img.x + img.w)) < 0.001, `右端が合っていない: ${hl.x + hl.w} vs ${img.x + img.w}`);
    assert.ok(Math.abs((hl.y + hl.h) - (img.y + img.h)) < 0.001, `下端が合っていない: ${hl.y + hl.h} vs ${img.y + img.h}`);
});

// 上のとおり通常はクランプに掛からないが、画面揺れ(camera.shake)などで
// カメラが範囲外へ出ることはありうる。そのとき白がミニマップの外へ漏れないこと。
// 完全に外へ出た場合は描かれない（枚数0）のが正しいので、存在は要求しない
test('カメラが範囲外へ出てもハイライトはミニマップの外へ漏れない', () => {
    for (const camera of [{ x: -50, y: -50 }, { x: MAP_W, y: MAP_H }]) {
        const calls = draw(makeGame({ camera }));
        const img = mapImage(calls);
        for (const hl of highlightOf(calls)) {
            assert.ok(hl.x >= img.x - 0.001, `左に漏れている: ${hl.x} < ${img.x}`);
            assert.ok(hl.y >= img.y - 0.001, `上に漏れている: ${hl.y} < ${img.y}`);
            assert.ok(hl.x + hl.w <= img.x + img.w + 0.001, '右に漏れている');
            assert.ok(hl.y + hl.h <= img.y + img.h + 0.001, '下に漏れている');
        }
    }
});

// ミニマップを開ける一番の目的は「見えていない敵がどこにいるか」。
// ハイライトが点の上に乗ると、その目的を損なう
test('敵の点はハイライトより後に描かれる（白に埋もれない）', () => {
    const enemies = [{ alive: true, x: 1200, y: 600, width: 0, height: 0 }];
    const calls = draw(makeGame({ enemies }));
    const hl = highlightOf(calls)[0];
    const enemyDot = fillRects(calls).find((r) => r.color === '#FF3333');
    assert.ok(enemyDot, '敵の点が描かれていない');
    assert.ok(enemyDot.i > hl.i, '敵の点がハイライトより先に描かれている');
});

test('ハイライトは地形より後に描かれる', () => {
    const calls = draw(makeGame());
    assert.ok(highlightOf(calls)[0].i > mapImage(calls).i, 'ハイライトが地形より先に描かれている');
});

// 開閉フェード（miniMapAlpha）に追随しないと、閉じかけのミニマップの上に
// ハイライトだけが残る。点で一度やらかしている失敗なので回帰として縛る
test('ハイライトの濃さは開閉フェードに追随する', () => {
    const game = makeGame();
    game.miniMapAlpha = 0.5;
    const hl = highlightOf(draw(game))[0];
    assert.ok(
        Math.abs(hl.alpha - MINIMAP_VIEWPORT_HIGHLIGHT * 0.5) < 0.001,
        `開閉フェードが掛かっていない: alpha=${hl.alpha}`,
    );
});

// 「これ以上暗くすると読めない」というユーザー判断への対応が白の重ね方式
// なので、逆に濃すぎて地形を潰さないことも縛っておく
test('ハイライトは薄い（地形を白く潰さない）', () => {
    assert.ok(
        MINIMAP_VIEWPORT_HIGHLIGHT > 0 && MINIMAP_VIEWPORT_HIGHLIGHT <= 0.25,
        `ハイライトの濃さが範囲外: ${MINIMAP_VIEWPORT_HIGHLIGHT}`,
    );
});
