import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx, extractTextsWithFont, extractPolylines } from './helpers/fake-ctx.js';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';
import { CONTROLS_ROWS } from '../src/js/ui/controlsList.js';
import { SETTINGS_ITEMS, visibleSettingsItems } from '../src/js/ui/settingsItems.js';
import { DEFAULT_SETTINGS } from '../src/js/utils/settings.js';
import { Game } from '../src/js/main.js';

/**
 * 操作一覧は HOW TO PLAY と設定画面の2箇所から出る。表を1つにしただけでは
 * 意味がなく、**両方が同じ表を読んでいる**ことを縛らないと、片方が古い写しに
 * 戻っても気づけない。以下のテストは常に CONTROLS_ROWS を回して比べる。
 */

function textsOf(ctx) {
    return ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
}

function drawHowToPlayControls() {
    const ctx = makeFakeCtx();
    const renderer = new ScreenRenderer({ canvas: { width: 1024, height: 768 } });
    renderer.drawHowToPlay(ctx, 1);
    return { ctx, texts: textsOf(ctx) };
}

function drawSettings(state = {}) {
    const ctx = makeFakeCtx();
    const renderer = new ScreenRenderer({ canvas: { width: 1024, height: 768 } });
    renderer.drawSettings(ctx, {
        settings: DEFAULT_SETTINGS, index: 0, fromPlaying: true,
        confirmingQuit: false, showingControls: false, ...state,
    });
    return { ctx, texts: textsOf(ctx) };
}

/** キーを押した/押していないを差し替えられる入力のふり。 */
function fakeInput(pressed = []) {
    const set = new Set(pressed);
    return {
        isKeyPressed: (code) => set.has(code),
        isKeyDown: () => false,
        isCharPressed: (...chars) => chars.some((c) => set.has(c)),
        isLeftClickPressed: () => false,
        isRightClickPressed: () => false,
        getTypedChars: () => [],
        crosshairLocked: false,
        mouse: { x: 0, y: 0, left: false },
        endFrame() {},
    };
}

/** update() を呼べる最小の game。 */
function makeGame(overrides = {}) {
    const g = Object.create(Game);
    g.gameState = 'settings';
    g.settings = { ...DEFAULT_SETTINGS };
    g.settingsIndex = 0;
    g.settingsReturnTo = 'playing';
    g.confirmingQuit = false;
    g.showingControls = false;
    g.missionTimer = 0;
    g.totalTime = 0;
    g.simAccumulator = 0;
    g.gameSpeed = 1;
    g.input = fakeInput();
    g.camera = { x: 0, y: 0 };
    g.enemies = [];
    return Object.assign(g, overrides);
}

const rowFor = (key) => CONTROLS_ROWS.find((r) => r.key === key);

// ---- 表の中身（実装との照合で見つかった抜けの回帰） ----

// Player.js の fireHeld は `input.mouse.left || input.isKeyDown('Space')` で、
// Space は Input.js の PREVENT_DEFAULT_KEYS にも入っている＝意図して用意された
// 代替キーなのに一覧に無かった
test('発射の行に Space の代替が書いてある', () => {
    const row = rowFor('L-CLICK');
    assert.ok(row, 'L-CLICK の行が無い');
    assert.match(row.label, /SPACE/);
});

// Player._updateHorizontal と Carrier が ArrowLeft/ArrowRight も見ている
test('移動の行に矢印キーの代替が書いてある', () => {
    const row = rowFor('A / D');
    assert.ok(row, 'A / D の行が無い');
    assert.match(row.label, /←|→/);
});

// S 押しっぱなしは crouching を立て、移動もバーストも止める。知らないと
// 「S を押すと動けなくなる」と誤解する
test('S の行にしゃがみが書いてある', () => {
    const row = rowFor('S');
    assert.ok(row, 'S の行が無い');
    assert.match(row.label, /CROUCH/);
});

// main.js の _updateVolumeControl。HUD にインジケータは出るがキーの案内が
// どこにも無かった。08-13 に BGM から全体音量へ付け替えたときも未更新だった
test('全体音量の -/+ が載っている', () => {
    const row = CONTROLS_ROWS.find((r) => /-/.test(r.key) && /\+/.test(r.key));
    assert.ok(row, '-/+ の行が無い');
    assert.match(row.label, /VOLUME/);
});

// 長押しは「軌道プレビューを見てから投げる」のが利点で、そこが読めないと
// 短押しとの使い分けが分からない
test('グレネードの行に長押しで狙えることが書いてある', () => {
    const row = rowFor('R-CLICK');
    assert.ok(row, 'R-CLICK の行が無い');
    assert.match(row.label, /AIM/);
});

// 全画面中の Escape はブラウザが全画面解除に使い、keydown がページへ来ない。
// P を主として案内する判断（main.js の update() のコメント）を崩さない
test('Escape は案内しない（P を主にする判断を守る）', () => {
    assert.equal(CONTROLS_ROWS.some((r) => /ESC/i.test(r.key)), false);
});

// ---- 2つの画面が同じ表を読んでいること ----

// 画面ごとの中身（図とラベル）の検証は tests/controls-diagram.test.js に置いた。
// ここでは「表の行が両画面に届いていること」だけを見る
test('表の全行のラベルが両画面に出る', () => {
    for (const [name, { texts }] of [
        ['HOW TO PLAY', drawHowToPlayControls()],
        ['設定画面', drawSettings({ showingControls: true })],
    ]) {
        for (const row of CONTROLS_ROWS) {
            assert.ok(texts.includes(row.label), `${name}: ${row.key} のラベルが無い`);
        }
    }
});

test('操作一覧を開いていない設定画面には出ない', () => {
    const { texts } = drawSettings({ showingControls: false });
    assert.equal(texts.includes(CONTROLS_ROWS[0].label), false);
});

/**
 * パネルの右端を、drawPanel が描く見出し帯の fillRect(x+6, y+6, w-12, 30) から
 * 逆算する。高さ 30 の矩形は見出し帯だけなので見分けがつく。複数のパネルが
 * 重なる設定画面では**最後に描かれたもの**＝手前のパネルを見る。
 */
function frontPanel(ctx) {
    const i = ctx.calls.findLastIndex((c) => c.name === 'fillRect' && c.args[3] === 30);
    assert.ok(i >= 0, 'パネルの見出し帯が見つからない');
    const [x, , w] = ctx.calls[i].args;
    // 帯は左右6px内側なので枠まで戻す。afterHead は「パネルを描いた後の呼び出し」＝
    // 中身だけ。パネル自身の枠を巻き込まずに、行の要素の位置を測れる
    return { left: x - 6, right: x + w + 6, afterHead: ctx.calls.slice(i + 1) };
}

// 説明はキーごとに1行だけ（図と詳細で二重に出していたのをまとめた）。
// 文言を伸ばしたときに黙って枠から出ないよう、実際に描かれた文字の右端を測って縛る
test('操作一覧の説明がパネルの内側に収まる', () => {
    for (const [name, { ctx }] of [
        ['HOW TO PLAY', drawHowToPlayControls()],
        ['設定画面', drawSettings({ showingControls: true })],
    ]) {
        const { right } = frontPanel(ctx);
        const labels = new Set(CONTROLS_ROWS.map((r) => r.label));
        for (const t of extractTextsWithFont(ctx.calls)) {
            if (!labels.has(t.text)) continue;
            assert.ok(t.x + t.width <= right - 8,
                `${name}: 「${t.text}」が枠(${right})を超える: ${Math.round(t.x + t.width)}`);
        }
    }
});

// 図のキーは幅がキー名しだいで伸びる（SHIFT / SPACE は2升ぶん）。右端だけ見て
// いると長いキーで左へはみ出す。実際にオーバーレイでそれが起きた
test('キーキャップがパネルの左からはみ出さない', () => {
    for (const [name, { ctx }] of [
        ['HOW TO PLAY', drawHowToPlayControls()],
        ['設定画面', drawSettings({ showingControls: true })],
    ]) {
        const { left, right, afterHead } = frontPanel(ctx);
        // 見出し帯より後＝行の中身だけ。キャップの枠は矩形（4点）で入る。
        // 見出しの下線もここに混じるが、2点の線分なので点数で除ける
        const xs = extractPolylines(afterHead)
            .filter((p) => p.length >= 4).flat().map((p) => p.x);
        assert.ok(xs.length > 0, `${name}: キーキャップの枠が見つからない`);
        assert.ok(Math.min(...xs) >= left + 8,
            `${name}: キーキャップが左枠(${left})を超える: ${Math.round(Math.min(...xs))}`);
        assert.ok(Math.max(...xs) <= right - 8, `${name}: 右枠(${right})を超える要素がある`);
    }
});

// 行が増えてもパネルは中身から高さを決めるが、はみ出していないことは見ておく
test('操作一覧のパネルが画面に収まる', () => {
    for (const { ctx } of [drawHowToPlayControls(), drawSettings({ showingControls: true })]) {
        const ys = ctx.calls
            .filter((c) => c.name === 'fillText' || c.name === 'fillRect')
            .map((c) => (c.name === 'fillText' ? c.args[2] : c.args[1] + c.args[3]));
        assert.ok(Math.max(...ys) <= 768, `画面下端(768)を超えて描いている: ${Math.max(...ys)}`);
    }
});

// ---- 設定画面からの開き方 ----

test('VIEW CONTROLS の行がタイトルからでもプレイ中でも出る', () => {
    const item = SETTINGS_ITEMS.find((i) => i.key === 'viewControls');
    assert.ok(item, '表に viewControls が無い');
    assert.equal(item.type, 'action');
    // 進行を捨てる操作ではないので警告色にも確認にもしない
    assert.ok(!item.danger && !item.confirm);
    for (const fromPlaying of [true, false]) {
        assert.ok(visibleSettingsItems(fromPlaying).includes(item),
            `fromPlaying=${fromPlaying} で出ていない`);
    }
});

test('VIEW CONTROLS で Enter を押すと一覧が開く', () => {
    const items = visibleSettingsItems(true);
    const g = makeGame({
        settingsIndex: items.findIndex((i) => i.key === 'viewControls'),
        input: fakeInput(['Enter']),
    });
    g.update(16);
    assert.equal(g.showingControls, true);
});

// 一覧を読んでいる間に裏の設定が動くと、閉じたときに知らぬ間に値が変わっている
test('一覧を開いている間は設定の操作が効かない', () => {
    const g = makeGame({ showingControls: true, settingsIndex: 0, input: fakeInput(['KeyS', 'KeyD']) });
    const before = { ...g.settings };
    g.update(16);
    assert.equal(g.settingsIndex, 0, 'カーソルが動いている');
    assert.deepEqual(g.settings, before, '設定の値が変わっている');
});

// ここを飛ばすと Escape で設定ごと閉じ、戻り先を1段間違える
test('一覧を開いているときの P は一覧だけ閉じる', () => {
    const g = makeGame({ showingControls: true, input: fakeInput(['KeyP']) });
    g.update(16);
    assert.equal(g.showingControls, false);
    assert.equal(g.gameState, 'settings', '設定画面まで閉じている');
});

test('一覧を開いているときの Escape も一覧だけ閉じる', () => {
    const g = makeGame({ showingControls: true, input: fakeInput(['Escape']) });
    g.update(16);
    assert.equal(g.showingControls, false);
    assert.equal(g.gameState, 'settings', '設定画面まで閉じている');
});

test('一覧を開いているときの Enter も一覧を閉じる', () => {
    const g = makeGame({ showingControls: true, input: fakeInput(['Enter']) });
    g.update(16);
    assert.equal(g.showingControls, false);
    assert.equal(g.gameState, 'settings');
});

// 開いたまま閉じた設定を開き直すと、いきなり一覧が出てしまう
test('設定を開き直すと一覧は閉じた状態から始まる', () => {
    const g = makeGame({ gameState: 'playing', settingsReturnTo: null, showingControls: true });
    g._openSettings('playing');
    assert.equal(g.showingControls, false);
});

test('設定を閉じるときに一覧の状態も戻す', () => {
    const g = makeGame({ showingControls: true });
    g._closeSettings();
    assert.equal(g.showingControls, false);
});
