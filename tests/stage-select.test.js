import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { SaveManager } from '../src/js/systems/SaveManager.js';
import { makeSave } from '../src/js/utils/saveData.js';
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
    g.score = 0;
    g.totalTime = 0;
    g.missionsCompleted = 0;
    g.stageResults = [];
    g.runTries = 1;
    g.stageSelectRun = false;
    g.gameState = 'stage_select';
    g.stateTimer = 0;
    g.stageSelectIndex = 1;
    g.resetCalls = 0;
    g.restartCalls = 0;
    g.demoState = null;
    g.input = fakeInput();
    g.stateManager = {
        resetLevel(resetScore) { g.resetCalls++; g.lastResetScore = resetScore; },
        restart() { g.restartCalls++; },
    };
    g._restoreFullscreen = () => {};
    g._enterDemoState = (s) => { g.demoState = s; g.gameState = s; };
    Object.assign(g, over);
    g.saveManager = new SaveManager(g, over.storage || fakeStorage());
    return g;
}

/** reached を n にした storage。 */
function storageReached(n) {
    const storage = fakeStorage();
    makeGame({ storage }).saveManager.recordReached(n);
    return storage;
}

test('A / D で選択が動き、1..reached で止まる', async () => {
    const storage = storageReached(3);
    let game = makeGame({ storage, stageSelectIndex: 1, input: fakeInput(['KeyA']) });
    game._updateStageSelect();
    assert.equal(game.stageSelectIndex, 1, '1 より下がらない');

    game = makeGame({ storage, stageSelectIndex: 1, input: fakeInput(['KeyD']) });
    game._updateStageSelect();
    assert.equal(game.stageSelectIndex, 2);

    game = makeGame({ storage, stageSelectIndex: 3, input: fakeInput(['KeyD']) });
    game._updateStageSelect();
    assert.equal(game.stageSelectIndex, 3, 'reached を超えない');
});

test('W でその面から始まる', async () => {
    const game = makeGame({
        storage: storageReached(5), stageSelectIndex: 4, input: fakeInput(['KeyW']),
    });
    game._updateStageSelect();
    assert.equal(game.gameState, 'playing');
    assert.equal(game.missionsCompleted, 3, '4面 = missionsCompleted 3');
    assert.equal(game.stageSelectRun, true);
    assert.equal(game.score, 0);
    assert.equal(game.totalTime, 0);
    assert.equal(game.stageResults.length, 0);
    assert.equal(game.resetCalls, 1);
    assert.equal(game.lastResetScore, false, 'resetLevel(true) だと missionsCompleted が 0 に戻ってしまう');
});

test('Escape でタイトルへ戻る', async () => {
    const game = makeGame({ storage: storageReached(3), input: fakeInput(['Escape']) });
    game._updateStageSelect();
    assert.equal(game.demoState, 'title');
});

test('面セレクトのランはトライ数 1', async () => {
    const game = makeGame({
        storage: storageReached(2), stageSelectIndex: 2, input: fakeInput(['KeyW']),
    });
    game._updateStageSelect();
    assert.equal(game.runTries, 1);
});

test('面セレクト画面は到達した数だけ番号を描く', async () => {
    const game = makeGame({ storage: storageReached(4), stageSelectIndex: 2 });
    game.canvas = { width: 960, height: 720 };
    const ctx = makeFakeCtx();
    new ScreenRenderer(game).drawStageSelect(ctx);
    const texts = ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
    for (const n of ['1', '2', '3', '4']) assert.ok(texts.includes(n), `${n} が無い: ${texts.join(' | ')}`);
    assert.ok(!texts.includes('5'), '未到達の面は出さない');
    assert.ok(texts.some((t) => t.includes('STAGE RANKINGS ONLY')));
    // 選択中の1つだけ枠が付く
    assert.equal(ctx.calls.filter((c) => c.name === 'strokeRect').length, 1);
});

// stageSelectRun が false に戻るタイミングの回帰テスト。
// stageSelectRun = true にするのは _startStageSelectRun() だけ、false に戻すのは
// 従来 _startGameIfRequested() だけだった。面セレクトのランを Escape で切り上げて
// タイトルへ戻っても true のまま残り、_drawSaveHints() は sm.save だけを見るので
// 「[C] CONTINUE」の行は出るのに、_updateTitle の C 分岐は canContinueHere()
// (= !stageSelectRun && ...) を見るため C を押しても反応しない、という不整合になっていた。
test('面セレクトのランを終えてタイトルに戻ると stageSelectRun が false に戻る', () => {
    const storage = storageReached(2);
    const game = makeGame({ storage, stageSelectIndex: 2, input: fakeInput(['KeyW']) });
    game._updateStageSelect(); // 面セレクトのランを開始
    assert.equal(game.stageSelectRun, true, '前提: 面セレクトのランが始まっている');

    // セーブがある状態を作る（makeGame のデフォルトは _enterDemoState をフェイクに
    // 差し替えているので、ここでは本物の Game._enterDemoState を直接呼んで検証する）
    game.saveManager.progress.save = makeSave({
        mode: 'normal', missionsCompleted: 2, score: 50000, totalTime: 12000, stageResults: [],
    });

    Game._enterDemoState.call(game, 'title');

    assert.equal(game.stageSelectRun, false, 'タイトルに戻ってもランが終わった扱いになっていない');
    assert.equal(game.canContinueHere(), true, 'セーブがあるのに C が効かない状態のまま');
});

// continueFromSave() 側でも明示的に false へ戻す（セーブからの再開は必ず通しラン）。
// _enterDemoState 側だけに直しても、面セレクトのラン中に C を押すケースは
// canContinueHere() が !stageSelectRun を見て弾くので通常は到達しないが、
// 「判定側と描画側を揃えるだけでは駄目」という設計判断を継続からも二重に守る。
test('continueFromSave() は stageSelectRun を false に戻す', () => {
    const storage = storageReached(2);
    const game = makeGame({ storage });
    game.stageSelectRun = true;
    game.saveManager.progress.save = makeSave({
        mode: 'normal', missionsCompleted: 2, score: 50000, totalTime: 12000, stageResults: [],
    });

    Game.continueFromSave.call(game);

    assert.equal(game.stageSelectRun, false);
});
