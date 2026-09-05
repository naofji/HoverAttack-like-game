// 母艦の方向矢印(HUD.drawCarrierArrow)がミニマップ(_drawOverlays)より後に
// 描かれることを縛るテスト。
//
// ソース文字列を grep すると「呼ばれているが到達しない」ケースを見逃すため、
// 実際に Game.draw() を呼んで呼び出し順を記録する形にする（CLAUDE.md の方針）。
// _drawWorld・hud・crosshair・screenRenderer は重い実体を作らずスパイに差し替え、
// draw() が実際に辿る順序だけを見る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';

function makeGame() {
    const g = Object.create(Game);
    g.gameState = 'playing';
    g.ctx = { fillRect() {}, save() {}, restore() {} };
    g.canvas = { width: 1024, height: 768 };
    const calls = [];
    g._drawWorld = () => calls.push('drawWorld');
    // Game.env は Task 8 で追加された環境（霧・雪・地底湖）。この画面は
    // draw() 全体の呼び出し順だけを見るのでスタブでよい。
    g.env = { update() {}, drawBehindTerrain() {}, drawOverWorld() {}, drawOverlay() {} };
    g.hud = {
        draw: () => calls.push('hud.draw'),
        drawCarrierArrow: () => calls.push('hud.drawCarrierArrow'),
    };
    g.crosshair = { draw: () => calls.push('crosshair.draw') };
    g._drawOverlays = () => calls.push('drawOverlays(minimap)');
    g.calls = calls;
    return g;
}

test('drawCarrierArrow はミニマップ(_drawOverlays)より後に呼ばれる', () => {
    const g = makeGame();
    g.draw();
    const overlaysIdx = g.calls.indexOf('drawOverlays(minimap)');
    const arrowIdx = g.calls.indexOf('hud.drawCarrierArrow');
    assert.ok(overlaysIdx >= 0, '_drawOverlays が呼ばれていない');
    assert.ok(arrowIdx >= 0, 'hud.drawCarrierArrow が呼ばれていない');
    assert.ok(arrowIdx > overlaysIdx, `矢印がミニマップより先に描かれている: ${g.calls.join(',')}`);
});

test('HUD.draw() の中では矢印を描かない（main.js が別途呼ぶ形になっている）', () => {
    const g = makeGame();
    g.draw();
    // hud.draw と hud.drawCarrierArrow が両方1回ずつ、別々の呼び出しとして
    // 記録されていること（hud.draw の中で drawCarrierArrow が呼ばれるなら
    // 呼び出し順が hud.draw の直後になってしまうはずだが、実際は
    // _drawOverlays を挟んだ後になる = 分離されている証拠）。
    const drawIdx = g.calls.indexOf('hud.draw');
    const overlaysIdx = g.calls.indexOf('drawOverlays(minimap)');
    const arrowIdx = g.calls.indexOf('hud.drawCarrierArrow');
    assert.ok(drawIdx < overlaysIdx, 'hud.draw が overlays より前であること');
    assert.ok(overlaysIdx < arrowIdx, 'overlays と arrow の間の順序');
});
