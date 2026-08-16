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
    // titleMenuIndex は**わざと置かない**。Game 側の初期値をそのまま使わせる。
    // ここで 0 を置いていたせいで「Game のフィールド宣言を書き忘れていて
    // 本番では undefined → NaN になり選択が動かない」を検出できなかった。
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

// 実機で「W/S で上下の選択ができない」と報告されて発覚した回帰。
// Game のオブジェクトリテラルに titleMenuIndex の宣言が無く、本番では
// undefined から始まっていた。Math.min(undefined, n) は NaN になるので、
// 以後どの計算も NaN のまま＝選択が動かず、強調も出ない。
// **初期値を与えずに動かす**テストでないと捕まらない。
test('初期状態（Game の既定値のまま）でも S で下へ動く', () => {
    const g = makeGame({ storage: storageReached(3, storageWithSave()), input: fakeInput(['KeyS']) });
    assert.equal(g.titleMenuIndex, 0, 'Game 側の初期値が 0 になっていない');
    g._updateTitle(16);
    assert.equal(g.titleMenuIndex, 1);
    assert.equal(g.selectedTitleItem(), 'continue');
});

test('初期状態でも決定できる（selectedTitleItem が undefined にならない）', () => {
    const g = makeGame({ storage: storageWithSave() });
    assert.equal(g.selectedTitleItem(), 'start');
});

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

// カーソルキーでも同じことができる。設定画面が元から W/S と ↑/↓ の両方を
// 受けていた（_updateSettings の nav ヘルパー）ので、タイトルだけ WASD 限定なのは
// 揃っていなかった。←/→ は足さない ── タイトルではデモ画面送り
// （_handleDemoJump）が使っていて衝突する。
test('↑/↓ でも上下に動く', () => {
    const storage = storageReached(3, storageWithSave());

    let g = makeGame({ storage, input: fakeInput(['ArrowDown']) });
    g._updateTitle(16);
    assert.equal(g.titleMenuIndex, 1);

    g = makeGame({ storage, titleMenuIndex: 2, input: fakeInput(['ArrowUp']) });
    g._updateTitle(16);
    assert.equal(g.titleMenuIndex, 1);
});

test('←/→ はデモ画面送りのままで、メニューを動かさない', () => {
    const storage = storageReached(3, storageWithSave());
    for (const key of ['ArrowLeft', 'ArrowRight']) {
        let jumped = false;
        const g = makeGame({
            storage, titleMenuIndex: 1, input: fakeInput([key]),
            _handleDemoJump: () => { jumped = true; return true; },
        });
        g._updateTitle(16);
        assert.equal(g.titleMenuIndex, 1, `${key} でメニューが動いた`);
        assert.ok(jumped, `${key} がデモ画面送りに渡っていない`);
    }
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

// 実機で「CONTINUE の文字数が多すぎてカーソルよりはみ出る」と報告されて発覚。
// ▶ ◀ を中央から ±190px の固定値で置いていたが、CONTINUE 行は
// 「CONTINUE - STAGE 7 / NEWTYPE  (TRY 12)」で 38 文字ほどになり、
// font('sub')=18px 等幅（幅係数 0.6）だと片側 205px を超える。
test('選択中の目印は一番長い項目より外側に置かれる', () => {
    const g = makeGame({ storage: storageReached(3, storageWithSave()) });
    // 最長になりうる状態にする（7面 / NEWTYPE / 2桁のトライ数）
    g.saveManager.progress.save = {
        ...g.saveManager.save, mode: 'newtype', missionsCompleted: 6, tries: 12,
    };
    g.canvas = { width: 960, height: 720 };
    const ctx = makeFakeCtx();
    const r = new ScreenRenderer(g);
    r._drawTitleMenu(ctx, g.canvas);

    const texts = ctx.calls.filter((c) => c.name === 'fillText');
    const markers = texts.filter((c) => c.args[0] === '▶' || c.args[0] === '◀');
    assert.equal(markers.length, 2, '目印は左右で2つ');

    const cx = g.canvas.width / 2;
    // 一番長いラベルの半幅（描画は中央揃えなので、右端は cx + halfWidth）
    ctx.font = '18px monospace';
    const halfWidest = Math.max(...g.titleMenuItems()
        .map((k) => ctx.measureText(r._titleMenuLabel(k)).width)) / 2;

    const right = markers.find((c) => c.args[0] === '◀').args[1];
    const left = markers.find((c) => c.args[0] === '▶').args[1];
    assert.ok(right - cx > halfWidest, `◀ が文字に重なる: gap=${right - cx} 半幅=${halfWidest}`);
    assert.ok(cx - left > halfWidest, `▶ が文字に重なる: gap=${cx - left} 半幅=${halfWidest}`);
    // 厳密一致にすると cx - (cx - gap) の丸めで 1e-13 ずれる
    assert.ok(Math.abs((right - cx) - (cx - left)) < 0.001, '左右の間隔が揃っていない');
});

test('目印の位置は選んでいる行が変わっても動かない', () => {
    // 行ごとに文字幅へ合わせると、上下に動かすたび目印が寄ったり離れたりして
    // 落ち着かない。一番長い項目に合わせて固定する
    const storage = storageReached(3, storageWithSave());
    const xs = [0, 1, 2].map((i) => {
        const g = makeGame({ storage, titleMenuIndex: i });
        g.canvas = { width: 960, height: 720 };
        const ctx = makeFakeCtx();
        new ScreenRenderer(g)._drawTitleMenu(ctx, g.canvas);
        return ctx.calls.find((c) => c.name === 'fillText' && c.args[0] === '▶').args[1];
    });
    assert.equal(xs[0], xs[1]);
    assert.equal(xs[1], xs[2]);
});
