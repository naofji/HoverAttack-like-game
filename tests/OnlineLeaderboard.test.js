import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { OnlineLeaderboard } from '../src/js/systems/OnlineLeaderboard.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

test('empty url returns not-configured without calling fetch', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return {}; };
  const lb = new OnlineLeaderboard('');
  assert.deepEqual(await lb.fetchData(), { ok: false, error: 'not-configured' });
  assert.deepEqual(await lb.submit({ name: 'A', score: 1, mission: 1, clearTime: null }), { ok: false, error: 'not-configured' });
  assert.equal(called, false);
});

test('fetchData returns parsed data on success', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ ok: true, weekId: '2026-W29', ranking: [{ name: 'A', score: 5, mission: 1, clearTime: null }], fame: [] }),
  });
  const lb = new OnlineLeaderboard('https://example.test/exec');
  const res = await lb.fetchData();
  assert.equal(res.ok, true);
  assert.equal(res.weekId, '2026-W29');
  assert.equal(res.ranking.length, 1);
  assert.deepEqual(res.fame, []);
});

test('fetchData returns bad-data when payload ok is not true', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: false }) });
  const lb = new OnlineLeaderboard('https://example.test/exec');
  assert.deepEqual(await lb.fetchData(), { ok: false, error: 'bad-data' });
});

test('fetchData returns network error when fetch throws', async () => {
  globalThis.fetch = async () => { throw new Error('boom'); };
  const lb = new OnlineLeaderboard('https://example.test/exec');
  assert.deepEqual(await lb.fetchData(), { ok: false, error: 'network' });
});

test('fetchData returns timeout when aborted', async () => {
  globalThis.fetch = async (url, opts) => {
    return await new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
  };
  const lb = new OnlineLeaderboard('https://example.test/exec');
  const res = await lb.fetchData(10); // 10ms timeout
  assert.deepEqual(res, { ok: false, error: 'timeout' });
});

test('submit posts as text/plain and returns rank', async () => {
  let seen = null;
  globalThis.fetch = async (url, opts) => {
    seen = opts;
    return { ok: true, json: async () => ({ ok: true, rank: 3, weekId: '2026-W29' }) };
  };
  const lb = new OnlineLeaderboard('https://example.test/exec');
  const res = await lb.submit({ name: 'A', score: 20000, mission: 4, clearTime: null });
  assert.deepEqual(res, { ok: true, rank: 3, weekId: '2026-W29' });
  assert.equal(seen.method, 'POST');
  assert.match(seen.headers['Content-Type'], /text\/plain/);
  assert.equal(typeof seen.body, 'string'); // JSON string body
});

test('submit surfaces server reason on ok:false', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: false, reason: 'rate-limited' }) });
  const lb = new OnlineLeaderboard('https://example.test/exec');
  assert.deepEqual(await lb.submit({ name: 'A', score: 20000, mission: 4, clearTime: null }), { ok: false, error: 'rate-limited' });
});
