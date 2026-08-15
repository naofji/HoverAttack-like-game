// drawMiniMap() の枠色・置き場所（四隅から自機/クロスヘアを避けて選ぶ）を縛るテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';
import { makeFakeCtx, extractSets, extractFillRectsWithColor } from './helpers/fake-ctx.js';
import { COLOR_MINIMAP_BORDER, MINIMAP_MARGIN, HUD_TOP_HEIGHT, HUD_BOTTOM_HEIGHT, TILE_SIZE } from '../src/js/utils/Constants.js';

const CANVAS_W = 1024;
const CANVAS_H = 768;
const MM_W = 300;
const MM_H = 150;

function makeGame({ playerPos = null, carrierPos = null, mouse = { x: -999, y: -999 } } = {}) {
    return {
        canvas: { width: CANVAS_W, height: CANVAS_H },
        camera: { x: 0, y: 0 },
        map: {
            refreshMiniMap() {},
            miniMapCanvas: { width: MM_W, height: MM_H },
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
