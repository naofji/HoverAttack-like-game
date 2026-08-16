import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';

function makeGame(over = {}) {
    const g = Object.create(Game);
    g.week = { weekId: '2026-W33', seed: 1 };
    g.score = 999999;
    g.missionsCompleted = 3;
    g.totalTime = 1000;
    g.stageResults = [];
    g.stageSelectRun = false;
    g.runTries = 1;
    g.gameState = 'gameover';
    g.playerNameInput = '';
    g.highScoreCalls = 0;
    g.submitCalls = 0;
    g.highScoreManager = {
        isHighScore: () => true,
        addScore() { g.highScoreCalls++; return 0; },
    };
    g._enterDemoState = (s) => { g.gameState = s; };
    g._anyStageWouldRank = () => false;
    return Object.assign(g, over);
}

test('通しランは従来どおり週ハイスコアで名前入力へ行く', async () => {
    const game = makeGame();
    game._tryGoToRanking();
    assert.equal(game.gameState, 'ranking_entry');
});

test('面セレクトのランは週ハイスコアでは名前入力へ行かない', async () => {
    const game = makeGame({ stageSelectRun: true });
    game._tryGoToRanking();
    assert.equal(game.gameState, 'title');
});

test('面セレクトでも面別トップ5なら名前入力へ行く', async () => {
    const game = makeGame({ stageSelectRun: true, _anyStageWouldRank: () => true });
    game._tryGoToRanking();
    assert.equal(game.gameState, 'ranking_entry');
});

test('面セレクトのランは週スコアに登録も送信もしない', () => {
    const game = makeGame({
        stageSelectRun: true,
        gameState: 'ranking_entry',
        playerNameInput: 'ABC',
        stageResults: [{ stage: 4, timeMs: 30000, score: 8000 }],
        stageRankingManager: { addStageResult: () => {} },
        onlineLeaderboard: null,   // URL 無し = submitStages も呼ばれない
        input: { getTypedChars: () => ['Enter'] },
        _restoreFullscreen: () => {},
    });
    game._submitOnline = async () => { game.submitCalls++; };
    game._updateRankingEntry();
    assert.equal(game.highScoreCalls, 0, '週ランキングに入れない');
    assert.equal(game.submitCalls, 0, 'オンラインにも送らない');
    assert.equal(game.gameState, 'local_ranking_display', '面別の保存は通る');
});
