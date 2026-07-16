import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// In-memory localStorage stub.
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

test('weekly ranking starts empty (no dummy scores)', async () => {
  const { HighScoreManager } = await import('../src/js/systems/HighScoreManager.js');
  const m = new HighScoreManager('2026-W10');
  assert.deepEqual(m.getTop10(), []);
  assert.deepEqual(m.getWallOfFame(), []);
});

test('isHighScore requires score above 10000, even when ranking is empty', async () => {
  const { HighScoreManager } = await import('../src/js/systems/HighScoreManager.js');
  const m = new HighScoreManager('2026-W10');
  assert.equal(m.isHighScore(0), false);
  assert.equal(m.isHighScore(10000), false); // boundary: not strictly greater
  assert.equal(m.isHighScore(10001), true);
});

test('addScore keeps top 20 sorted descending', async () => {
  const { HighScoreManager } = await import('../src/js/systems/HighScoreManager.js');
  const m = new HighScoreManager('2026-W10');
  for (let i = 1; i <= 25; i++) m.addScore('P' + i, i * 100, 1, null);
  const top = m.getTop10();
  assert.equal(top.length, 20);
  assert.equal(top[0].score, 2500);
  assert.equal(top[19].score, 600);
});

test('week rollover archives previous week top 3 into wall of fame and resets', async () => {
  const mod = await import('../src/js/systems/HighScoreManager.js');
  const { HighScoreManager } = mod;

  const m1 = new HighScoreManager('2026-W10');
  m1.addScore('AAA', 500, 3, null);
  m1.addScore('BBB', 400, 2, null);
  m1.addScore('CCC', 300, 2, null);
  m1.addScore('DDD', 200, 1, null);

  // New week: same storage, different weekId.
  const m2 = new HighScoreManager('2026-W11');
  assert.deepEqual(m2.getTop10(), []); // this week reset
  const fame = m2.getWallOfFame();
  assert.equal(fame.length, 1);
  assert.equal(fame[0].weekId, '2026-W10');
  assert.equal(fame[0].entries.length, 3); // only top 3 kept
  assert.deepEqual(fame[0].entries.map((e) => e.name), ['AAA', 'BBB', 'CCC']);
});

test('same week reload preserves this week ranking without re-archiving', async () => {
  const { HighScoreManager } = await import('../src/js/systems/HighScoreManager.js');
  const m1 = new HighScoreManager('2026-W10');
  m1.addScore('AAA', 500, 3, null);
  const m2 = new HighScoreManager('2026-W10');
  assert.equal(m2.getTop10().length, 1);
  assert.deepEqual(m2.getWallOfFame(), []);
});

test('addScore stores country and defaults to empty string', async () => {
  const { HighScoreManager } = await import('../src/js/systems/HighScoreManager.js');
  const m = new HighScoreManager('2026-W10');
  m.addScore('AAA', 20000, 4, null, 'JP');
  m.addScore('BBB', 15000, 3, null); // no country
  const top = m.getTop10();
  assert.equal(top[0].country, 'JP');
  assert.equal(top[1].country, '');
});
