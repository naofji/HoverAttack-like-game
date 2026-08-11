import test from 'node:test';
import assert from 'node:assert';

import { formatClock } from '../src/js/utils/formatTime.js';

test('0ms は 00:00.00', () => {
    assert.strictEqual(formatClock(0), '00:00.00');
});

test('分・秒・1/100秒がそれぞれ2桁ゼロ詰めになる', () => {
    assert.strictEqual(formatClock(1000), '00:01.00');
    assert.strictEqual(formatClock(61000), '01:01.00');
    assert.strictEqual(formatClock(9 * 60000 + 8 * 1000 + 70), '09:08.07');
});

test('1/100秒は切り捨て（繰り上げて秒が進まない）', () => {
    assert.strictEqual(formatClock(1999), '00:01.99');
    assert.strictEqual(formatClock(59999), '00:59.99');
});

test('分は60で折り返さず、そのまま増える', () => {
    // 99分超の想定は無いが、桁あふれで表示が壊れないことは確かめておく
    assert.strictEqual(formatClock(60 * 60000), '60:00.00');
    assert.strictEqual(formatClock(100 * 60000), '100:00.00');
});

test('統合前の2実装と同じ文字列を返す（クリア画面と面別ランキングで表記がズレない）', () => {
    // 統合前: main._formatTime は分を ms/60000 から、
    // ScreenRenderer._formatMs は秒に直してから求めていた
    const byMinutes = (ms) => {
        const mm = Math.floor(ms / 60000).toString().padStart(2, '0');
        const ss = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
        const xx = Math.floor((ms % 1000) / 10).toString().padStart(2, '0');
        return `${mm}:${ss}.${xx}`;
    };
    const bySeconds = (ms) => {
        const totalSec = Math.floor(ms / 1000);
        const cs = Math.floor((ms % 1000) / 10);
        return `${String(Math.floor(totalSec / 60)).padStart(2, '0')}:`
            + `${String(totalSec % 60).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
    };

    for (let ms = 0; ms < 3600000; ms += 997) {
        assert.strictEqual(formatClock(ms), byMinutes(ms), `ms=${ms}`);
        assert.strictEqual(formatClock(ms), bySeconds(ms), `ms=${ms}`);
    }
});
