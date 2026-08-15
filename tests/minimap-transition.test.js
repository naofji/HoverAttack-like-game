// advanceMiniMapTransition() の遷移ロジックを縛るテスト。
// canvas を使わない純関数なので、フレームを進めるだけで検証できる
// （乱数・Date.now() に依存しない）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceMiniMapTransition } from '../src/js/ui/minimapTransition.js';
import { MINIMAP_FADE_SPEED } from '../src/js/utils/Constants.js';

test('desired が同じなら fade は 1 へ向かう', () => {
    let state = { corner: 'topLeft', fade: 0.3, phase: 'in' };
    state = advanceMiniMapTransition(state, 'topLeft', MINIMAP_FADE_SPEED);
    assert.equal(state.corner, 'topLeft');
    assert.ok(state.fade > 0.3, 'fade が増えていない');
});

test('desired が同じで既に fade=1 なら 1 のまま', () => {
    let state = { corner: 'topLeft', fade: 1, phase: 'idle' };
    state = advanceMiniMapTransition(state, 'topLeft', MINIMAP_FADE_SPEED);
    assert.equal(state.fade, 1);
});

test('desired が違うと fade が下がり、その間 corner は変わらない', () => {
    let state = { corner: 'topLeft', fade: 1, phase: 'idle' };
    state = advanceMiniMapTransition(state, 'bottomLeft', MINIMAP_FADE_SPEED);
    assert.equal(state.corner, 'topLeft', 'フェードアウト中に corner が変わってしまっている');
    assert.ok(state.fade < 1, 'fade が下がっていない');
});

test('fade が 0 に達したら corner が desired に切り替わり、fade が上がり始める', () => {
    let state = { corner: 'topLeft', fade: 1, phase: 'idle' };
    // 0 に達するまで同じ desired で進める
    const steps = Math.ceil(1 / MINIMAP_FADE_SPEED) + 1;
    for (let i = 0; i < steps; i++) {
        state = advanceMiniMapTransition(state, 'bottomLeft', MINIMAP_FADE_SPEED);
        if (state.corner === 'bottomLeft') break;
    }
    assert.equal(state.corner, 'bottomLeft', 'fade が 0 に達しても corner が切り替わっていない');
    assert.ok(state.fade >= 0, 'fade が負');
    // さらに進めるとフェードインで増える
    const next = advanceMiniMapTransition(state, 'bottomLeft', MINIMAP_FADE_SPEED);
    assert.ok(next.fade >= state.fade, 'フェードインで fade が増えていない');
});

test('フェードアウト中にさらに desired が変わったら、切り替わるのは最新の desired', () => {
    let state = { corner: 'topLeft', fade: 1, phase: 'idle' };
    // 一度 bottomLeft へ向けてフェードアウトを始める（まだ 0 には達しない程度に1歩だけ進める）
    state = advanceMiniMapTransition(state, 'bottomLeft', MINIMAP_FADE_SPEED);
    assert.equal(state.corner, 'topLeft');
    assert.ok(state.fade > 0, 'テストの前提が崩れている（1歩で0に達してしまった）');

    // 0 に達するまで、今度は topRight を desired として進める（最新の希望が topRight）
    const steps = Math.ceil(state.fade / MINIMAP_FADE_SPEED) + 1;
    for (let i = 0; i < steps; i++) {
        state = advanceMiniMapTransition(state, 'topRight', MINIMAP_FADE_SPEED);
        if (state.fade === 0 || state.corner === 'topRight') break;
    }
    assert.equal(state.corner, 'topRight', '最新の desired (topRight) ではなく、古い desired に切り替わっている');
});

test('fade は 0 未満にも 1 超にもならない', () => {
    let state = { corner: 'topLeft', fade: 0.02, phase: 'out' };
    // 1歩で 0 を割り込む量を渡す
    state = advanceMiniMapTransition(state, 'bottomLeft', 0.5);
    assert.ok(state.fade >= 0);

    state = { corner: 'topLeft', fade: 0.98, phase: 'in' };
    state = advanceMiniMapTransition(state, 'topLeft', 0.5);
    assert.ok(state.fade <= 1);
});

test('フェードイン中に desired がまた変わったら、いまの隅のままフェードアウトを再開する', () => {
    // topLeft → bottomLeft への切り替えを完了させ、bottomLeft へのフェードインを
    // 少しだけ進めた状態（0 < fade < 1、phase='in'）を作る。
    let state = { corner: 'topLeft', fade: 1, phase: 'idle' };
    const stepsToSwitch = Math.ceil(1 / MINIMAP_FADE_SPEED) + 1;
    for (let i = 0; i < stepsToSwitch; i++) {
        state = advanceMiniMapTransition(state, 'bottomLeft', MINIMAP_FADE_SPEED);
        if (state.corner === 'bottomLeft') break;
    }
    assert.equal(state.corner, 'bottomLeft', 'テストの前提が崩れている（まだ切り替わっていない）');
    // フェードインを数歩進めて、まだ1未満・かつ次の1歩の減速分より十分大きいところで止める
    // （fade が小さいままだと次の1歩でちょうど0を割り込み、即座に切り替わってしまう
    // ＝この後で確かめたい「フェードイン途中はいったんフェードアウトへ転じる」が
    // 検証できなくなる）。
    for (let i = 0; i < 5; i++) {
        state = advanceMiniMapTransition(state, 'bottomLeft', MINIMAP_FADE_SPEED);
    }
    assert.ok(state.fade > MINIMAP_FADE_SPEED * 2 && state.fade < 1,
        'テストの前提が崩れている（フェードインの途中になっていない）');
    const fadeDuringFadeIn = state.fade;

    // ここで行き先が topRight に変わる。「今の隅(bottomLeft)のまま再び
    // フェードアウトを始め、0 に達したら最新の行き先(topRight)へ切り替える」
    // という一貫した挙動になっているはず。
    const next = advanceMiniMapTransition(state, 'topRight', MINIMAP_FADE_SPEED);
    assert.equal(next.corner, 'bottomLeft', '行き先が変わった直後に corner が飛んでしまっている');
    assert.ok(next.fade < fadeDuringFadeIn, 'フェードインの途中から即座にフェードアウトへ転じていない');

    // 0 に達するまで topRight を desired として進め続けると、最終的に topRight へ切り替わる
    let s = next;
    const stepsToZero = Math.ceil(s.fade / MINIMAP_FADE_SPEED) + 1;
    for (let i = 0; i < stepsToZero; i++) {
        s = advanceMiniMapTransition(s, 'topRight', MINIMAP_FADE_SPEED);
        if (s.corner === 'topRight') break;
    }
    assert.equal(s.corner, 'topRight', 'フェードイン中に変わった desired (topRight) へ最終的に切り替わっていない');
});

test('引数の state を書き換えない', () => {
    const state = { corner: 'topLeft', fade: 0.5, phase: 'out' };
    const snapshot = { ...state };
    advanceMiniMapTransition(state, 'bottomLeft', MINIMAP_FADE_SPEED);
    assert.deepEqual(state, snapshot, 'state が書き換えられている');
});
