import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

function installStorage() {
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear(),
    };
    return store;
}
beforeEach(() => installStorage());

test('empty stage returns empty lists', async () => {
    const { StageRankingManager } = await import('../src/js/systems/StageRankingManager.js');
    const m = new StageRankingManager('2026-W10');
    assert.deepEqual(m.getStage(1), { time: [], score: [] });
});

test('time sorts ascending, score sorts descending, top 5 each', async () => {
    const { StageRankingManager } = await import('../src/js/systems/StageRankingManager.js');
    const m = new StageRankingManager('2026-W10');
    for (let i = 1; i <= 7; i++) {
        m.addStageResult(2, { name: 'P' + i, timeMs: i * 1000, score: i * 100, country: 'JP' });
    }
    const s = m.getStage(2);
    assert.equal(s.time.length, 5);
    assert.equal(s.score.length, 5);
    assert.equal(s.time[0].timeMs, 1000);          // fastest first
    assert.equal(s.time[4].timeMs, 5000);
    assert.equal(s.score[0].score, 700);           // highest first
    assert.equal(s.score[4].score, 300);
});

test('wouldRankTime / wouldRankScore boundaries', async () => {
    const { StageRankingManager } = await import('../src/js/systems/StageRankingManager.js');
    const m = new StageRankingManager('2026-W10');
    for (let i = 1; i <= 5; i++) m.addStageResult(1, { name: 'P' + i, timeMs: i * 1000, score: i * 100, country: '' });
    // time list full with 1000..5000; a 4500 beats the 5th (5000) -> ranks
    assert.equal(m.wouldRankTime(1, 4500), true);
    assert.equal(m.wouldRankTime(1, 5000), false); // not strictly faster than slowest kept
    // score list full with 100..500; 450 beats the 5th (100) -> ranks
    assert.equal(m.wouldRankScore(1, 450), true);
    assert.equal(m.wouldRankScore(1, 100), false);
});

test('rolls over when weekId changes', async () => {
    const { StageRankingManager } = await import('../src/js/systems/StageRankingManager.js');
    const a = new StageRankingManager('2026-W10');
    a.addStageResult(1, { name: 'X', timeMs: 1000, score: 999, country: '' });
    const b = new StageRankingManager('2026-W11'); // different week
    assert.deepEqual(b.getStage(1), { time: [], score: [] });
});
