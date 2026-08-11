import test from 'node:test';
import assert from 'node:assert';

import { DEMO_CYCLE_STATES, DEMO_SCREEN_DRAWERS } from '../src/js/main.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';

/**
 * デモループ（タイトル／遊び方／各ランキング）の画面は、draw() 側が
 * 「表を引く → 描く → 位置ドットを重ねる」の1本にまとめてある。
 * 表に入れ忘れた画面は、遷移はするのに真っ黒のまま出る（ドットだけ描かれる）
 * ので、対応が崩れていないことをここで縛る。
 */

test('デモループの全状態に描画の実装がある', () => {
    for (const state of DEMO_CYCLE_STATES) {
        assert.strictEqual(
            typeof DEMO_SCREEN_DRAWERS[state], 'function',
            `${state} が DEMO_SCREEN_DRAWERS に無い`,
        );
    }
});

test('描画の表に、デモループに乗らない余計な画面が入っていない', () => {
    for (const state of Object.keys(DEMO_SCREEN_DRAWERS)) {
        assert.ok(
            DEMO_CYCLE_STATES.includes(state),
            `${state} は DEMO_CYCLE_STATES に無いのに描画だけある`,
        );
    }
});

test('各画面は ScreenRenderer の専用メソッドを1回だけ呼ぶ', () => {
    // 状態ごとに「どれを呼ぶはずか」。draw() の分岐を表に移したときに
    // 対応を取り違えていないか（例: GLOBAL の枠に LOCAL を描く）を見る。
    const expected = {
        title: 'drawTitleScreen',
        how_to_play: 'drawHowToPlay',
        local_ranking_display: 'drawLocalRanking',
        global_ranking_display: 'drawGlobalRanking',
        stage_ranking_display: 'drawStageRankings',
        wall_of_fame_display: 'drawWallOfFame',
    };

    for (const state of DEMO_CYCLE_STATES) {
        const calls = [];
        const screenRenderer = new Proxy({}, {
            get: (_t, name) => (...args) => calls.push({ name, args }),
        });

        const game = {
            screenRenderer,
            stateTimer: 0,
            stageDisplayIndex: 0,
            localRankIndex: -1,
            globalRankIndex: -1,
            onlineData: null,
            week: { weekId: '2026-W33' },
            highScoreManager: { getTop10: () => [] },
            stageRankingManager: { getStage: () => ({ time: [], score: [] }) },
        };

        DEMO_SCREEN_DRAWERS[state](game, makeFakeCtx());

        assert.strictEqual(calls.length, 1, `${state} の描画呼び出しが1回でない`);
        assert.strictEqual(calls[0].name, expected[state], `${state} の描画先が違う`);
    }
});

test('オンラインの記録が未取得でも描画は落ちない（読み込み中に真っ黒にしない）', () => {
    // onlineData が null のまま GLOBAL / FAME に入る経路が実際にある
    const drawn = [];
    const game = {
        screenRenderer: new Proxy({}, {
            get: (_t, name) => (...args) => drawn.push({ name, args }),
        }),
        stateTimer: 0,
        stageDisplayIndex: 0,
        localRankIndex: -1,
        globalRankIndex: -1,
        onlineData: null,
        week: { weekId: '2026-W33' },
        highScoreManager: { getTop10: () => [] },
        stageRankingManager: { getStage: () => ({ time: [], score: [] }) },
    };

    DEMO_SCREEN_DRAWERS.global_ranking_display(game, makeFakeCtx());
    DEMO_SCREEN_DRAWERS.wall_of_fame_display(game, makeFakeCtx());

    // GLOBAL は空配列の順位表と、その週の weekId を受け取る
    assert.deepStrictEqual(drawn[0].args[1], []);
    assert.strictEqual(drawn[0].args[3], '2026-W33');
    // FAME は空配列
    assert.deepStrictEqual(drawn[1].args[1], []);
});
