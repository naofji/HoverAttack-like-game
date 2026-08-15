// carrierArrowScreenPos() の切り出しを縛るテスト。
// ミニマップが矢印を隠さないよう「避ける対象」として使うには、実際に
// _drawCarrierArrow() が描く位置と完全に一致する必要がある（Crosshair.js の
// crosshairScreenPos() と同じ理由）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUD, carrierArrowScreenPos } from '../src/js/ui/HUD.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { HUD_TOP_HEIGHT, CARRIER_ARROW_ALPHA } from '../src/js/utils/Constants.js';

const CANVAS_W = 1024;
const CANVAS_H = 768;

function makeGame({ playerDocked = false, carrier, camera = { x: 0, y: 0 } } = {}) {
    return {
        canvas: { width: CANVAS_W, height: CANVAS_H },
        camera,
        carrier,
        player: { docked: playerDocked },
        missionTimer: 0,
        missionsCompleted: 0,
        score: 0,
        liveTimeBonus: () => ({ current: 0, max: 0 }),
        base: null,
        baseEmergencyAlert: false,
        proximityAlertActive: false,
    };
}

// 母艦がカメラから大きく離れた位置（画面外）にいる、共通のケース。
function offscreenCarrier() {
    return { alive: true, x: 5000, y: 5000, width: 40, height: 40 };
}

test('母艦が無ければ null', () => {
    const game = makeGame({ carrier: null });
    assert.equal(carrierArrowScreenPos(game), null);
});

test('母艦が死んでいれば null', () => {
    const game = makeGame({ carrier: { alive: false, x: 5000, y: 5000, width: 40, height: 40 } });
    assert.equal(carrierArrowScreenPos(game), null);
});

test('自機がドッキング中なら null', () => {
    const game = makeGame({ carrier: offscreenCarrier(), playerDocked: true });
    assert.equal(carrierArrowScreenPos(game), null);
});

test('母艦が画面内にいれば null', () => {
    // カメラ原点(0,0)、キャンバス中央付近に母艦を置く＝画面内
    const game = makeGame({ carrier: { alive: true, x: 400, y: 300, width: 40, height: 40 } });
    assert.equal(carrierArrowScreenPos(game), null);
});

test('母艦が画面外なら座標(x,y,angle)を返す', () => {
    const game = makeGame({ carrier: offscreenCarrier() });
    const pos = carrierArrowScreenPos(game);
    assert.notEqual(pos, null);
    assert.equal(typeof pos.x, 'number');
    assert.equal(typeof pos.y, 'number');
    assert.equal(typeof pos.angle, 'number');

    // _drawCarrierArrow() が元々計算していた式と同じ値になっていること
    const carrier = game.carrier;
    const cam = game.camera;
    const w = game.canvas.width;
    const cx = carrier.x + carrier.width / 2;
    const cy = carrier.y + carrier.height / 2;
    const screenCenterX = cam.x + w / 2;
    const screenCenterY = cam.y + game.canvas.height / 2;
    const expectedAngle = Math.atan2(cy - screenCenterY, cx - screenCenterX);
    const radiusX = (w / 2) - 30;
    const radiusY = (game.canvas.height / 2) - HUD_TOP_HEIGHT - 10;
    const expectedX = w / 2 + Math.cos(expectedAngle) * radiusX;
    const expectedY = game.canvas.height / 2 + Math.sin(expectedAngle) * radiusY;

    assert.ok(Math.abs(pos.x - expectedX) < 0.0001, `x mismatch: got ${pos.x}, expected ${expectedX}`);
    assert.ok(Math.abs(pos.y - expectedY) < 0.0001, `y mismatch: got ${pos.y}, expected ${expectedY}`);
    assert.ok(Math.abs(pos.angle - expectedAngle) < 0.0001, `angle mismatch: got ${pos.angle}, expected ${expectedAngle}`);
});

// _drawCarrierArrow() が実際に carrierArrowScreenPos() と同じ位置・角度で
// translate/rotate しているかを、fake-ctx の呼び出し列で確かめる。
// 矢印の見た目（形・色）を変えていないことも合わせて縛る。
test('_drawCarrierArrow() は carrierArrowScreenPos() と同じ位置・角度で描く', () => {
    const game = makeGame({ carrier: offscreenCarrier() });
    const hud = Object.create(HUD.prototype);
    hud.game = game;
    const ctx = makeFakeCtx();
    hud.drawCarrierArrow(ctx);

    const pos = carrierArrowScreenPos(game);
    const translateCall = ctx.calls.find((c) => c.name === 'translate');
    const rotateCall = ctx.calls.find((c) => c.name === 'rotate');
    assert.ok(translateCall, 'translate が呼ばれていない');
    assert.ok(rotateCall, 'rotate が呼ばれていない');
    assert.equal(translateCall.args[0], pos.x);
    assert.equal(translateCall.args[1], pos.y);
    assert.equal(rotateCall.args[0], pos.angle);

    // 見た目（矢印の形・塗り色）は変えない
    const fillStyles = ctx.calls.filter((c) => c.name === 'set:fillStyle').map((c) => c.args[0]);
    assert.ok(fillStyles.includes('#FFFF00'), '矢印の色が変わっている');
    const fillCall = ctx.calls.find((c) => c.name === 'fill');
    assert.ok(fillCall, 'fill が呼ばれていない');
});

// ミニマップより上の面に描くようになった結果、不透明のままだと下のミニマップを
// 塗りつぶしてしまう。半透明にして両方読めるようにしている。
test('_drawCarrierArrow() は CARRIER_ARROW_ALPHA で半透明に描く', () => {
    const game = makeGame({ carrier: offscreenCarrier() });
    const hud = Object.create(HUD.prototype);
    hud.game = game;
    const ctx = makeFakeCtx();
    hud.drawCarrierArrow(ctx);

    const alphas = ctx.calls.filter((c) => c.name === 'set:globalAlpha').map((c) => c.args[0]);
    assert.ok(alphas.includes(CARRIER_ARROW_ALPHA),
        `globalAlpha に CARRIER_ARROW_ALPHA が設定されていない: got ${alphas}`);
});

// globalAlpha を戻し忘れると、以降に描かれる HUD やミニマップが全部薄くなる
// （このプロジェクトで実際にレビューで問題になった前例がある）。save/restore の
// 内側で設定していること＝restore で自動的に戻ることを、呼び出し順で縛る。
test('_drawCarrierArrow() の globalAlpha 設定は save/restore の内側に収まっている', () => {
    const game = makeGame({ carrier: offscreenCarrier() });
    const hud = Object.create(HUD.prototype);
    hud.game = game;
    const ctx = makeFakeCtx();
    hud.drawCarrierArrow(ctx);

    const saveIndex = ctx.calls.findIndex((c) => c.name === 'save');
    const restoreIndex = ctx.calls.findIndex((c) => c.name === 'restore');
    const alphaIndex = ctx.calls.findIndex((c) => c.name === 'set:globalAlpha');

    assert.ok(saveIndex !== -1, 'save が呼ばれていない');
    assert.ok(restoreIndex !== -1, 'restore が呼ばれていない');
    assert.ok(alphaIndex !== -1, 'globalAlpha が設定されていない');
    assert.ok(saveIndex < alphaIndex && alphaIndex < restoreIndex,
        'globalAlpha の設定が save/restore の外にある（以降の描画が薄くなり続ける）');
});

test('母艦が画面内なら _drawCarrierArrow() は何も描かない', () => {
    const game = makeGame({ carrier: { alive: true, x: 400, y: 300, width: 40, height: 40 } });
    const hud = Object.create(HUD.prototype);
    hud.game = game;
    const ctx = makeFakeCtx();
    hud.drawCarrierArrow(ctx);
    assert.equal(ctx.calls.length, 0, '画面内なのに何か描かれている');
});
