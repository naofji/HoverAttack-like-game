import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { SaveManager } from '../src/js/systems/SaveManager.js';
import { CONTINUE_COUNTDOWN_MS, GAMEOVER_WAIT_MS } from '../src/js/utils/Constants.js';
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
    g.gameState = 'gameover';
    g.stateTimer = 0;
    g.rankingCalls = 0;
    g.resetCalls = 0;
    g.input = fakeInput();
    g.stateManager = { resetLevel(resetScore) { g.resetCalls++; g.lastResetScore = resetScore; } };
    g._restoreFullscreen = () => {};
    g._tryGoToRanking = () => { g.rankingCalls++; };
    Object.assign(g, over);
    g.saveManager = new SaveManager(g, over.storage || fakeStorage());
    return g;
}

/** セーブ済みの storage を作る。 */
function storageWithSave() {
    const storage = fakeStorage();
    makeGame({ storage }).saveManager.saveHere();
    return storage;
}

test('セーブが無ければ従来どおり 4 秒でランキングへ', async () => {
    const game = makeGame();
    assert.equal(game.canContinueHere(), false);
    game._updateGameOver(GAMEOVER_WAIT_MS - 1);
    assert.equal(game.rankingCalls, 0);
    game._updateGameOver(2);
    assert.equal(game.rankingCalls, 1);
});

test('セーブがあれば C で再開し、ランキングへ行かない', async () => {
    const game = makeGame({ storage: storageWithSave(), input: fakeInput(['KeyC']) });
    assert.equal(game.canContinueHere(), true);
    game._updateGameOver(16);
    assert.equal(game.rankingCalls, 0);
    assert.equal(game.gameState, 'playing');
    assert.equal(game.resetCalls, 1);
    assert.equal(game.lastResetScore, false);   // スコアを消さない
    assert.equal(game.runTries, 2);
    assert.equal(game.saveManager.save.tries, 2);
});

test('放置すればカウントダウン満了でランキングへ', async () => {
    const game = makeGame({ storage: storageWithSave() });
    game._updateGameOver(GAMEOVER_WAIT_MS + 100);
    assert.equal(game.rankingCalls, 0, '4秒では出ていかない');
    game._updateGameOver(CONTINUE_COUNTDOWN_MS);
    assert.equal(game.rankingCalls, 1);
});

test('面セレクトのランではコンティニューを出さない', async () => {
    const game = makeGame({
        storage: storageWithSave(), stageSelectRun: true, input: fakeInput(['KeyC']),
    });
    assert.equal(game.canContinueHere(), false);
    game._updateGameOver(GAMEOVER_WAIT_MS + 1);
    assert.equal(game.rankingCalls, 1);
    assert.equal(game.gameState, 'gameover');
});

test('残り秒は 9 から 0 へ減り、負にならない', async () => {
    const game = makeGame({ storage: storageWithSave() });
    assert.equal(game.continueSecondsLeft(), CONTINUE_COUNTDOWN_MS / 1000);
    game.stateTimer = CONTINUE_COUNTDOWN_MS / 2;
    assert.equal(game.continueSecondsLeft(), Math.ceil(CONTINUE_COUNTDOWN_MS / 2000));
    game.stateTimer = CONTINUE_COUNTDOWN_MS + 5000;
    assert.equal(game.continueSecondsLeft(), 0);
});

test('ゲームオーバー画面はどの面から再開するかと残り秒を出す', async () => {
    const game = makeGame({ storage: storageWithSave() });
    game.canvas = { width: 960, height: 720 };
    game.stateTimer = 0;
    const ctx = makeFakeCtx();
    new ScreenRenderer(game).drawGameOver(ctx);
    const texts = ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
    assert.ok(texts.some((t) => t.includes('CONTINUE FROM STAGE 4?')), texts.join(' | '));
    assert.ok(texts.includes('9'));
    assert.ok(texts.some((t) => t.includes('TRY 1')));
});

test('セーブが無いゲームオーバー画面は従来のまま', async () => {
    const game = makeGame();
    game.canvas = { width: 960, height: 720 };
    const ctx = makeFakeCtx();
    new ScreenRenderer(game).drawGameOver(ctx);
    const texts = ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
    assert.ok(texts.includes('PLEASE WAIT...'));
    assert.ok(!texts.some((t) => t.includes('CONTINUE')));
});
