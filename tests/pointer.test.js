import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canvasPointer } from '../src/js/utils/pointer.js';

const RECT_1X = { left: 0, top: 0, width: 1024, height: 768 };

test('等倍なら client 座標から rect のオフセットを引いた値になる', () => {
    const p = canvasPointer({ left: 100, top: 50, width: 1024, height: 768 }, 1024, 768, 300, 250);
    assert.deepEqual(p, { x: 200, y: 200 });
});

test('拡大表示では倍率を割り戻す', () => {
    // 1024 の canvas を 1440px 幅で表示 => 倍率 1.40625。720px は canvas 上の 512px
    const p = canvasPointer({ left: 0, top: 0, width: 1440, height: 1080 }, 1024, 768, 720, 540);
    assert.equal(p.x, 512);
    assert.equal(p.y, 384);
});

test('縮小表示でも倍率を割り戻す', () => {
    // 1024 の canvas を 512px 幅で表示 => 2倍に引き伸ばす
    const p = canvasPointer({ left: 0, top: 0, width: 512, height: 384 }, 1024, 768, 128, 96);
    assert.equal(p.x, 256);
    assert.equal(p.y, 192);
});

test('左上より外は 0 にクランプされる', () => {
    const p = canvasPointer(RECT_1X, 1024, 768, -50, -999);
    assert.deepEqual(p, { x: 0, y: 0 });
});

test('右下より外は canvas の端にクランプされる', () => {
    const p = canvasPointer(RECT_1X, 1024, 768, 5000, 5000);
    assert.deepEqual(p, { x: 1023, y: 767 });
});

test('rect の幅や高さが 0 でも NaN にならない', () => {
    const p = canvasPointer({ left: 0, top: 0, width: 0, height: 0 }, 1024, 768, 300, 300);
    assert.deepEqual(p, { x: 0, y: 0 });
});
