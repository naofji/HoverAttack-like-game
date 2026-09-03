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

// コンティニューのたびにセーブ地点より前の面の記録が stageResults 経由で
// 何度も投稿される問題への回帰テスト。投稿側は止めない設計（セーブ後に一度も
// 投稿せず閉じた場合にセーブ前の面の記録が失われるのを避けるため）なので、
// 取り込み側の addStageResult で同一記録を弾く。
test('addStageResult: 同じ記録(name+timeMs+score完全一致)を2回入れても1件しか入らない', async () => {
    const { StageRankingManager } = await import('../src/js/systems/StageRankingManager.js');
    const m = new StageRankingManager('2026-W10');
    const rec = { name: 'AAA', timeMs: 12345, score: 5000, country: 'JP' };
    m.addStageResult(1, rec);
    m.addStageResult(1, rec); // 同じ記録をもう一度(コンティニューして再投稿した想定)
    const s = m.getStage(1);
    assert.equal(s.time.length, 1, `time に重複が入った: ${JSON.stringify(s.time)}`);
    assert.equal(s.score.length, 1, `score に重複が入った: ${JSON.stringify(s.score)}`);
});

test('addStageResult: timeMs か score だけ違えば別記録として2件とも入る', async () => {
    const { StageRankingManager } = await import('../src/js/systems/StageRankingManager.js');
    const m = new StageRankingManager('2026-W10');
    m.addStageResult(1, { name: 'AAA', timeMs: 12345, score: 5000, country: 'JP' });
    m.addStageResult(1, { name: 'AAA', timeMs: 12346, score: 5000, country: 'JP' }); // timeMs だけ違う
    m.addStageResult(1, { name: 'AAA', timeMs: 12345, score: 5001, country: 'JP' }); // score だけ違う
    const s = m.getStage(1);
    assert.equal(s.time.length, 3);
    assert.equal(s.score.length, 3);
});

test('rolls over when weekId changes', async () => {
    const { StageRankingManager } = await import('../src/js/systems/StageRankingManager.js');
    const a = new StageRankingManager('2026-W10');
    a.addStageResult(1, { name: 'X', timeMs: 1000, score: 999, country: '' });
    const b = new StageRankingManager('2026-W11'); // different week
    assert.deepEqual(b.getStage(1), { time: [], score: [] });
});
