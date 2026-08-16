// タイトルの縦メニュー（W/S で選び ENTER で決定）と、デモ画面の ENTER が
// タイトルへ戻ることの回帰。
//
// 以前は「どの画面でも ENTER／クリックで即 1面スタート」で、コンティニューと
// 面セレクトだけ専用キー（C / S）だった。画面ごとに ENTER の意味が変わるのと、
// 覚えるキーが増えるのが分かりにくいというユーザーの判断で、
// A/D=モード・W/S=縦の選択・ENTER=決定 に統一した。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { SaveManager } from '../src/js/systems/SaveManager.js';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';

function fakeStorage(initial = {}) {
    const data = { ...initial };
    return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

function fakeInput(pressed = []) {
    return {
        isKeyPressed: (code) => pressed.includes(code),
        isLeftClickPressed: () => false,
        isRightClickPressed: () => false,
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
    g.titleMenuIndex = 0;
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
    g._handleDemoJump = () => false;
    g._enterDemoState = (s) => { g.demoState = s; g.gameState = s; };
    g._refreshOnline = () => {};
    Object.assign(g, over);
    g.saveManager = new SaveManager(g, over.storage || fakeStorage());
    return g;
}

/** セーブ済みの storage。 */
function storageWithSave() {
    const storage = fakeStorage();
    makeGame({ storage }).saveManager.saveHere();
    return storage;
}

/** reached を n にした storage。 */
function storageReached(n, base) {
    const storage = base || fakeStorage();
    makeGame({ storage }).saveManager.recordReached(n);
    return storage;
}

// --- メニューの並び ---

test('使えない項目はメニューに並ばない', () => {
    const bare = makeGame();
    assert.deepEqual(bare.titleMenuItems(), ['start']);

    const withSave = makeGame({ storage: storageWithSave() });
    assert.deepEqual(withSave.titleMenuItems(), ['start', 'continue']);

    const withStages = makeGame({ storage: storageReached(3) });
    assert.deepEqual(withStages.titleMenuItems(), ['start', 'stageSelect']);

    const both = makeGame({ storage: storageReached(3, storageWithSave()) });
    assert.deepEqual(both.titleMenuItems(), ['start', 'continue', 'stageSelect']);
});

test('面セレクトのラン中は CONTINUE を並べない', () => {
    // canContinueHere() と同じ条件で揃える。行が出ているのに押せない、を作らない
    const g = makeGame({ storage: storageWithSave(), stageSelectRun: true });
    assert.deepEqual(g.titleMenuItems(), ['start']);
});

// --- W/S の移動 ---

test('W/S で上下に動き、両端で止まる', () => {
    const storage = storageReached(3, storageWithSave());

    let g = makeGame({ storage, titleMenuIndex: 0, input: fakeInput(["KeyS"]) });
    g._updateTitle(16);
    assert.equal(g.titleMenuIndex, 1);

    g = makeGame({ storage, titleMenuIndex: 2, input: fakeInput(['KeyS']) });
    g._updateTitle(16);
    assert.equal(g.titleMenuIndex, 2, '一番下より下へ行かない');

    g = makeGame({ storage, titleMenuIndex: 0, input: fakeInput(['KeyW']) });
    g._updateTitle(16);
    assert.equal(g.titleMenuIndex, 0, '一番上より上へ行かない');

    g = makeGame({ storage, titleMenuIndex: 2, input: fakeInput(['KeyW']) });
    g._updateTitle(16);
    assert.equal(g.titleMenuIndex, 1);
});

test('項目が減っても選択位置が範囲外に残らない', () => {
    // セーブがある状態で一番下を選び、セーブが消えた（週替わり）状況を作る
    const g = makeGame({ storage: storageReached(3, storageWithSave()), titleMenuIndex: 2 });
    g.saveManager.progress.save = null;      // CONTINUE が消える
    assert.deepEqual(g.titleMenuItems(), ['start', 'stageSelect']);
    assert.equal(g.selectedTitleItem(), 'stageSelect', '末尾へ丸められる');
});

// --- ENTER の決定 ---

test('START を決定すると新しい通しランが1面から始まる', () => {
    const g = makeGame({ storage: storageWithSave(), titleMenuIndex: 0, input: fakeInput(['Enter']) });
    g._updateTitle(16);
    assert.equal(g.gameState, 'playing');
    assert.equal(g.restartCalls, 1);
    assert.equal(g.runTries, 1);
    assert.equal(g.stageSelectRun, false);
    assert.ok(g.saveManager.save, 'セーブは消さない');
});

test('CONTINUE を決定するとセーブ地点から再開する', () => {
    const g = makeGame({ storage: storageWithSave(), titleMenuIndex: 1, input: fakeInput(['Enter']) });
    assert.equal(g.selectedTitleItem(), 'continue');
    g._updateTitle(16);
    assert.equal(g.gameState, 'playing');
    assert.equal(g.resetCalls, 1);
    assert.equal(g.restartCalls, 0, '1面からのやり直しにならない');
    assert.equal(g.runTries, 2, '再挑戦なのでトライ数が増える');
});

test('STAGE SELECT を決定すると面セレクト画面へ入る', () => {
    const g = makeGame({ storage: storageReached(4), titleMenuIndex: 1, input: fakeInput(['Enter']) });
    assert.equal(g.selectedTitleItem(), 'stageSelect');
    g._updateTitle(16);
    assert.equal(g.gameState, 'stage_select');
    assert.equal(g.stageSelectIndex, 1);
    assert.equal(g.restartCalls, 0, 'ゲームは始まらない');
});

test('A/D はモード切替のまま', () => {
    const g = makeGame({ input: fakeInput(['KeyD']) });
    g._updateTitle(16);
    assert.equal(g.mode, 'newtype');
    assert.equal(g.gameSpeed, 1.0);
    assert.equal(g.gameState, 'title', 'モードを変えても始まらない');
});

test('C / S はもうタイトルの入口ではない', () => {
    // 覚えるキーを減らすのが今回の狙いなので、旧キーは残さない
    for (const key of ['KeyC', 'KeyS']) {
        const g = makeGame({ storage: storageReached(3, storageWithSave()), input: fakeInput([key]) });
        g._updateTitle(16);
        assert.equal(g.gameState, 'title', `${key} で画面が変わってしまう`);
        assert.equal(g.restartCalls, 0);
        assert.equal(g.resetCalls, 0);
    }
});

// --- デモ画面 ---

test('デモ画面の ENTER はタイトルへ戻る（ゲームは始まらない）', () => {
    for (const state of ['how_to_play', 'local_ranking_display', 'global_ranking_display',
        'stage_ranking_display', 'wall_of_fame_display']) {
        const g = makeGame({ gameState: state, input: fakeInput(['Enter']) });
        assert.equal(g._returnToTitleIfRequested(), true, `${state} で拾えていない`);
        assert.equal(g.demoState, 'title');
        assert.equal(g.restartCalls, 0, `${state} からゲームが始まってしまう`);
    }
});

test('デモ画面で何も押していなければ何も起きない', () => {
    const g = makeGame({ gameState: 'local_ranking_display' });
    assert.equal(g._returnToTitleIfRequested(), false);
    assert.equal(g.demoState, null);
});

// --- 描画 ---

test('メニューは再開する面とモードを併記する', () => {
    const g = makeGame({ storage: storageReached(3, storageWithSave()), titleMenuIndex: 1 });
    g.canvas = { width: 960, height: 720 };
    const ctx = makeFakeCtx();
    new ScreenRenderer(g)._drawTitleMenu(ctx, g.canvas);
    const texts = ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
    assert.ok(texts.includes('START'));
    assert.ok(texts.some((t) => t.includes('CONTINUE') && t.includes('STAGE 4')
        && t.includes('NORMAL') && t.includes('TRY 1')), texts.join(' | '));
    assert.ok(texts.includes('STAGE SELECT'));
});

test('使えない項目は描かない', () => {
    const g = makeGame();   // セーブ無し・到達無し
    g.canvas = { width: 960, height: 720 };
    const ctx = makeFakeCtx();
    new ScreenRenderer(g)._drawTitleMenu(ctx, g.canvas);
    const texts = ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
    assert.ok(texts.includes('START'));
    assert.ok(!texts.some((t) => t.includes('CONTINUE')), texts.join(' | '));
    assert.ok(!texts.includes('STAGE SELECT'));
});

// タイトル下部は実測で埋まっている（canvas.height からの相対）:
//   [A/D] SELECT MODE -108 ／ モードのラベル -74 ／ モード説明文 -42 ／ 操作凡例 -20
//   ／ デモの位置ドット -5。以前ヒント行を -28/-12 に置いて凡例とドットに重ねた
//   ことがあるので、座標で縛る。
test('メニューはモードセレクタより上に描かれる', () => {
    const g = makeGame({ storage: storageReached(3, storageWithSave()) });
    g.canvas = { width: 960, height: 720 };
    const ctx = makeFakeCtx();
    new ScreenRenderer(g)._drawTitleMenu(ctx, g.canvas);
    const ys = ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[2]);
    assert.ok(ys.length > 0);
    for (const y of ys) {
        assert.ok(y < g.canvas.height - 120, `y=${y} がモードセレクタに近すぎる`);
    }
});
