// 週境界をまたいだときにオンラインのランキング記録先がずれる問題の回帰テスト。
// this.week は init() で1回だけ決まる値で、マップ生成に使ったものと必ず一致する。
// _submitOnline / _updateRankingEntry がそれをペイロードに含めて送っていることを縛る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';

/** onlineLeaderboard.submit / submitStages の呼び出し引数を記録する偽オブジェクト。 */
function makeFakeLeaderboard() {
    return {
        url: 'https://example.test/exec',
        submitCalls: [],
        submitStagesCalls: [],
        async submit(entry) { this.submitCalls.push(entry); return { ok: true, rank: 0 }; },
        async submitStages(payload) { this.submitStagesCalls.push(payload); return { ok: true }; },
        async fetchData() { return { ok: false, error: 'not-configured' }; },
    };
}

function makeGame(overrides = {}) {
    const g = Object.create(Game);
    g.week = { weekId: '2026-W29', seed: 1 };
    g.onlineLeaderboard = makeFakeLeaderboard();
    g.onlineStatus = 'offline';
    return Object.assign(g, overrides);
}

test('_submitOnline は this.week.weekId をペイロードに含める', async () => {
    const g = makeGame();
    await g._submitOnline('AAA', 20000, 4, null, 'JP');
    assert.equal(g.onlineLeaderboard.submitCalls.length, 1);
    assert.equal(g.onlineLeaderboard.submitCalls[0].weekId, '2026-W29');
});

test('_updateRankingEntry の submitStages 呼び出しも this.week.weekId を含める', () => {
    const g = makeGame({
        input: { getTypedChars: () => ['Enter'] },
        playerNameInput: 'AAA',
        missionsCompleted: 7,
        totalTime: 12345,
        score: 999999,
        stageResults: [{ stage: 1, timeMs: 1000, score: 500 }],
        highScoreManager: { isHighScore: () => false },
        stageRankingManager: { addStageResult: () => {} },
        _restoreFullscreen: () => {},
    });
    g._updateRankingEntry();
    assert.equal(g.onlineLeaderboard.submitStagesCalls.length, 1);
    assert.equal(g.onlineLeaderboard.submitStagesCalls[0].weekId, '2026-W29');
});

test('_submitOnline は tries をペイロードに含める', async () => {
    const g = makeGame();
    await g._submitOnline('AAA', 20000, 4, null, 'JP', 4);
    assert.equal(g.onlineLeaderboard.submitCalls[0].tries, 4);
});

test('_updateRankingEntry は runTries をそのまま送る', () => {
    const g = makeGame({
        input: { getTypedChars: () => ['Enter'] },
        playerNameInput: 'AAA',
        missionsCompleted: 7,
        totalTime: 12345,
        score: 999999,
        runTries: 3,
        stageSelectRun: false,
        stageResults: [{ stage: 1, timeMs: 1000, score: 500 }],
        highScoreManager: { isHighScore: () => true, addScore: () => 0 },
        stageRankingManager: { addStageResult: () => {} },
        _restoreFullscreen: () => {},
    });
    g._updateRankingEntry();
    assert.equal(g.onlineLeaderboard.submitCalls[0].tries, 3);
});
