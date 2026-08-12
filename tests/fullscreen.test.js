import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toggleFullscreen, enterFullscreen } from '../src/js/utils/fullscreen.js';

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

test('element を省略すると doc.documentElement を対象にする', () => {
    const docEl = fakeElement();
    const doc = { calls: [], documentElement: docEl, fullscreenElement: null };
    toggleFullscreen(undefined, doc);
    assert.deepEqual(docEl.calls, ['request']);
});

test('reject する Promise を返しても未処理拒否にならない', async () => {
    const el = fakeElement(Promise.reject(new Error('denied')));
    toggleFullscreen(el, fakeDoc(null));
    // catch が付いていなければ、この await の間に unhandledRejection でプロセスが落ちる
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(el.calls, ['request']);
});

// --- enterFullscreen（ゲーム開始時の自動最大化に使う） ---

test('enterFullscreen は全画面でなければ requestFullscreen を呼ぶ', () => {
    const el = fakeElement();
    const doc = fakeDoc(null);
    enterFullscreen(el, doc);
    assert.deepEqual(el.calls, ['request']);
});

// toggle と違って冪等であることが要件。ゲーム開始のたびに呼ばれるので、
// トグルだと「M で全画面にしてから始めると、開始と同時に全画面が解ける」ことになる。
test('enterFullscreen は全画面中なら何もしない（exit しない・冪等）', () => {
    const el = fakeElement();
    const doc = fakeDoc(el);
    enterFullscreen(el, doc);
    assert.deepEqual(doc.calls, [], 'exitFullscreen を呼んでしまっている');
    assert.deepEqual(el.calls, [], 'requestFullscreen を呼び直してしまっている');
});

test('enterFullscreen は element 省略で doc.documentElement を対象にする', () => {
    const docEl = fakeElement();
    const doc = { calls: [], documentElement: docEl, fullscreenElement: null };
    enterFullscreen(undefined, doc);
    assert.deepEqual(docEl.calls, ['request']);
});

test('enterFullscreen は document 相当が無くても例外を投げない', () => {
    assert.doesNotThrow(() => enterFullscreen(undefined, undefined));
    assert.doesNotThrow(() => enterFullscreen({}, fakeDoc(null)));
});

test('enterFullscreen も reject する Promise で未処理拒否にならない', async () => {
    const el = fakeElement(Promise.reject(new Error('denied')));
    enterFullscreen(el, fakeDoc(null));
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(el.calls, ['request']);
});
