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

test('引数の state を書き換えない', () => {
    const state = { corner: 'topLeft', fade: 0.5, phase: 'out' };
    const snapshot = { ...state };
    advanceMiniMapTransition(state, 'bottomLeft', MINIMAP_FADE_SPEED);
    assert.deepEqual(state, snapshot, 'state が書き換えられている');
});
