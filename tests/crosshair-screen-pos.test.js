// crosshairScreenPos() の3分岐（オートエイム中／ロック中／マウス）＋ HUD帯クランプを縛る。
// ミニマップの置き場所選びが「実際に描かれる位置」を避けるために切り出した関数なので、
// Crosshair.draw() と計算が食い違っていないことをここで直接確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crosshairScreenPos } from '../src/js/ui/Crosshair.js';
import { HUD_TOP_HEIGHT, HUD_BOTTOM_HEIGHT } from '../src/js/utils/Constants.js';

function makeGame(overrides = {}) {
    return {
        canvas: { width: 1024, height: 768 },
        camera: { x: 0, y: 0 },
        autoAimTarget: null,
        input: {
            crosshairLocked: false,
            lockedWorldX: 0, lockedWorldY: 0,
            mouse: { x: 400, y: 300 },
        },
        ...overrides,
    };
}

test('オートエイム中は敵のスクリーン座標（カメラ差し引き）', () => {
    const game = makeGame({ autoAimTarget: { x: 500, y: 200 }, camera: { x: 50, y: 20 } });
    const p = crosshairScreenPos(game);
    assert.equal(p.x, 450);
    assert.equal(p.y, 180);
});

test('ロック中は lockedWorldX/Y - camera', () => {
    const game = makeGame({
        camera: { x: 10, y: 5 },
        input: { crosshairLocked: true, lockedWorldX: 300, lockedWorldY: 250, mouse: { x: 1, y: 1 } },
    });
    const p = crosshairScreenPos(game);
    assert.equal(p.x, 290);
    assert.equal(p.y, 245);
});

test('通常時はマウス座標そのまま', () => {
    const game = makeGame({ input: { crosshairLocked: false, lockedWorldX: 0, lockedWorldY: 0, mouse: { x: 123, y: 456 } } });
    const p = crosshairScreenPos(game);
    assert.equal(p.x, 123);
    assert.equal(p.y, 456);
});

test('画面外(左上)はクランプされ、方向フラグが立つ', () => {
    const game = makeGame({ input: { crosshairLocked: false, lockedWorldX: 0, lockedWorldY: 0, mouse: { x: -50, y: -50 } } });
    const p = crosshairScreenPos(game);
    assert.equal(p.x, 0);
    assert.equal(p.y, HUD_TOP_HEIGHT);
    assert.equal(p.clampedLeft, true);
    assert.equal(p.clampedUp, true);
    assert.equal(p.clampedRight, false);
    assert.equal(p.clampedDown, false);
});

test('画面外(右下)はクランプされ、方向フラグが立つ', () => {
    const game = makeGame({ input: { crosshairLocked: false, lockedWorldX: 0, lockedWorldY: 0, mouse: { x: 9999, y: 9999 } } });
    const p = crosshairScreenPos(game);
    assert.equal(p.x, 1024);
    assert.equal(p.y, 768 - HUD_BOTTOM_HEIGHT);
    assert.equal(p.clampedRight, true);
    assert.equal(p.clampedDown, true);
});
