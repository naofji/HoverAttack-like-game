import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { SaveManager } from '../src/js/systems/SaveManager.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';

function fakeStorage(initial = {}) {
    const data = { ...initial };
    return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

function fakeInput(pressed = []) {
    return {
        isKeyPressed: (code) => pressed.includes(code),
        isLeftClickPressed: () => false,
        isRightClickPressed: () => false,   // _anyKeyOrClick が見る
        getTypedChars: () => [],
    };
}

function makeGame(over = {}) {
    const g = Object.create(Game);
    g.week = { weekId: '2026-W33', seed: 1 };
    g.mode = 'normal';
    g.gameSpeed = 0.8;
    g.score = 34500;
    g.totalTime = 1000;
    g.missionsCompleted = 3;
    g.stageResults = [];
    g.runTries = 1;
    g.stageSelectRun = false;
    g.gameState = 'title';
    g.stateTimer = 0;
    g.resetCalls = 0;
    g.restartCalls = 0;
    g.input = fakeInput();
    g.stateManager = {
        resetLevel(resetScore) { g.resetCalls++; g.lastResetScore = resetScore; },
        restart() { g.restartCalls++; },
    };
    g._restoreFullscreen = () => {};
    g._handleDemoJump = () => false;
    g._enterDemoState = () => {};
    Object.assign(g, over);
    g.saveManager = new SaveManager(g, over.storage || fakeStorage());
    return g;
}

function storageWithSave() {
    const storage = fakeStorage();
    makeGame({ storage }).saveManager.saveHere();
    return storage;
}

test('タイトルで C を押すとセーブ地点から再開する', async () => {
    const game = makeGame({ storage: storageWithSave(), input: fakeInput(['KeyC']) });
    game._updateTitle(16);
    assert.equal(game.gameState, 'playing');
    assert.equal(game.resetCalls, 1);
    assert.equal(game.restartCalls, 0, '1面からのやり直しにならない');
    assert.equal(game.runTries, 2, 'タイトル経由でもトライ数は増える');
});

test('セーブが無ければ C はキーとして無視され、何も始まらない', () => {
    // C は _anyKeyOrClick() の対象外。セーブが無ければ横取りもされないので
    // タイトルに留まる（誤って C を押しても勝手にゲームが始まらない）
    const game = makeGame({ input: fakeInput(['KeyC']) });
    game._updateTitle(16);
    assert.equal(game.restartCalls, 0);
    assert.equal(game.gameState, 'title');
});

test('通常スタートしてもセーブは消えない', () => {
    // _anyKeyOrClick() が見るのは Enter とマウスクリックだけ（任意キーではない）
    const game = makeGame({ storage: storageWithSave(), input: fakeInput(['Enter']) });
    game._updateTitle(16);
    assert.equal(game.restartCalls, 1);
    assert.equal(game.saveManager.save.missionsCompleted, 3, 'セーブは残る');
    assert.equal(game.runTries, 1, '新しいランなのでトライ数は 1');
    assert.equal(game.stageSelectRun, false);
});

test('タイトルのヒントは再開する面とモードを出す', async () => {
    const game = makeGame({ storage: storageWithSave() });
    game.canvas = { width: 960, height: 720 };
    const ctx = makeFakeCtx();
    new ScreenRenderer(game)._drawSaveHints(ctx, game.canvas);
    const texts = ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
    assert.ok(texts.some((t) => t.includes('STAGE 4') && t.includes('NORMAL') && t.includes('TRY 1')), texts.join(' | '));
});

test('セーブも到達も無ければヒントを出さない', async () => {
    const game = makeGame();
    game.canvas = { width: 960, height: 720 };
    const ctx = makeFakeCtx();
    new ScreenRenderer(game)._drawSaveHints(ctx, game.canvas);
    assert.equal(ctx.calls.filter((c) => c.name === 'fillText').length, 0);
});
