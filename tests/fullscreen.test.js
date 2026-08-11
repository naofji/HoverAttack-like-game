import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toggleFullscreen } from '../src/js/utils/fullscreen.js';

/** requestFullscreen を記録する偽 element */
function fakeElement(result = Promise.resolve()) {
    const calls = [];
    return { calls, requestFullscreen: () => { calls.push('request'); return result; } };
}

/** exitFullscreen を記録する偽 document */
function fakeDoc(fullscreenElement, result = Promise.resolve()) {
    const calls = [];
    return { calls, fullscreenElement, exitFullscreen: () => { calls.push('exit'); return result; } };
}

test('全画面でなければ requestFullscreen を呼ぶ', () => {
    const el = fakeElement();
    const doc = fakeDoc(null);
    toggleFullscreen(el, doc);
    assert.deepEqual(el.calls, ['request']);
    assert.deepEqual(doc.calls, []);
});

test('全画面中なら exitFullscreen を呼ぶ', () => {
    const el = fakeElement();
    const doc = fakeDoc(el);
    toggleFullscreen(el, doc);
    assert.deepEqual(doc.calls, ['exit']);
    assert.deepEqual(el.calls, []);
});

test('requestFullscreen を持たない element でも例外を投げない', () => {
    assert.doesNotThrow(() => toggleFullscreen({}, fakeDoc(null)));
});

test('exitFullscreen を持たない document でも例外を投げない', () => {
    const el = fakeElement();
    assert.doesNotThrow(() => toggleFullscreen(el, { fullscreenElement: el }));
});

test('document 相当が無くても例外を投げない', () => {
    assert.doesNotThrow(() => toggleFullscreen(undefined, undefined));
});

test('reject する Promise を返しても未処理拒否にならない', async () => {
    const el = fakeElement(Promise.reject(new Error('denied')));
    toggleFullscreen(el, fakeDoc(null));
    // catch が付いていなければ、この await の間に unhandledRejection でプロセスが落ちる
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(el.calls, ['request']);
});
