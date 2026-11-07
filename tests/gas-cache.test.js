// doGet のキャッシュ（CacheService）を、GAS のサービスを偽物に差し替えて本物の
// doGet / doPost で確かめる。gas-core.test.js は純粋関数だけを見ているので、
// こちらは「シートを何回読んだか」で効き方を縛る。
//
// node --test はファイルごとに別プロセスなので、globalThis に置く偽物は
// gas-core.test.js には漏れない。
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const dir = path.dirname(fileURLToPath(import.meta.url));
new vm.Script(readFileSync(path.join(dir, '../gas/Code.gs'), 'utf8')).runInThisContext();
const ctx = globalThis;

const HEADER = ['ts', 'week', 'name', 'score', 'mission', 'clearTime', 'country', 'tries'];

function fakeSheet(rows) {
  const sh = {
    rows,
    reads: 0,
    getLastRow: () => sh.rows.length,
    getLastColumn: () => (sh.rows[0] ? sh.rows[0].length : 0),
    getRange: (r, c, nr, nc) => ({
      getValues: () => { sh.reads++; return sh.rows.slice(r - 1, r - 1 + nr).map((x) => x.slice(c - 1, c - 1 + nc)); },
    }),
    appendRow: (row) => { sh.rows.push(row); },
  };
  return sh;
}

let sheets, cache;

beforeEach(() => {
  sheets = {
    // 見出しだけだと readRows_ が getValues を呼ばず読んだ回数を数えられないので、
    // ランキングに影響しない昔の週の行を1つ置く
    Scores: fakeSheet([HEADER.slice(), ['2020-01-06', '2020-W02', 'OLD', 20000, 1, '', '', 1]]),
    Fame: fakeSheet([HEADER.slice()]),
    StageScores: fakeSheet([HEADER.slice(0, 7)]),
  };
  cache = { store: new Map(), puts: 0, failPut: false };
  globalThis.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheetByName: (n) => sheets[n] || null }) };
  globalThis.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ text: s, setMimeType() { return this; } }) };
  globalThis.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
  globalThis.CacheService = {
    getScriptCache: () => ({
      get: (k) => (cache.store.has(k) ? cache.store.get(k) : null),
      put: (k, v) => { if (cache.failPut) throw new Error('Argument too large'); cache.puts++; cache.store.set(k, v); },
    }),
  };
});

const get = () => JSON.parse(ctx.doGet({}).text);
const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text);
const scoreReads = () => sheets.Scores.reads;

test('doGet は2回目をキャッシュから返し、シートを読み直さない', () => {
  const a = get();
  assert.equal(scoreReads(), 1);
  const b = get();
  assert.equal(scoreReads(), 1, '2回目はシートを読まない');
  assert.deepEqual(b, a);
});

test('doPost で記録が増えたら、次の doGet は読み直して新しい記録を含む', () => {
  get();
  const res = post({ name: 'NEW', score: 50000, mission: 3, weekId: ctx.isoWeekId(new Date()) });
  assert.equal(res.ok, true);
  const readsAfterPost = scoreReads();
  const after = get();
  assert.equal(scoreReads(), readsAfterPost + 1, '登録の直後はキャッシュを使わない');
  assert.deepEqual(after.ranking.map((e) => e.name), ['NEW']);
});

test('面別の登録（kind: stages）でもキャッシュは古くならない', () => {
  get();
  const res = post({ kind: 'stages', name: 'STG', country: 'JP', stages: [{ stage: 1, timeMs: 12345, score: 100 }], weekId: ctx.isoWeekId(new Date()) });
  assert.equal(res.ok, true);
  const after = get();
  assert.equal(after.stageRankings[0].time[0].name, 'STG');
});

// 効きすぎの確認: 弾かれた送信はシートを変えないので、キャッシュも捨てない
test('弾かれた doPost はキャッシュを捨てない', () => {
  get();
  const res = post({ name: 'BAD', score: 5 }); // MIN_SCORE 以下
  assert.equal(res.ok, false);
  get();
  assert.equal(scoreReads(), 1);
});

test('読み込みの途中に登録が挟まって古い結果が書き戻されても、それは使われない', () => {
  // doGet がシートを読んだ後・キャッシュへ書く前に doPost が割り込む状況を、
  // put の瞬間に登録を差し込んで再現する
  const realPut = CacheService.getScriptCache().put;
  let injected = false;
  globalThis.CacheService = {
    getScriptCache: () => ({
      get: (k) => (cache.store.has(k) ? cache.store.get(k) : null),
      put: (k, v) => {
        if (!injected) { injected = true; post({ name: 'MID', score: 60000, mission: 2, weekId: ctx.isoWeekId(new Date()) }); }
        realPut(k, v);
      },
    }),
  };
  const first = get(); // MID を含まない古い結果（これは仕方ない）
  assert.deepEqual(first.ranking.map((e) => e.name), []);
  const second = get(); // 古い結果は世代の違う鍵に書かれたので、ここで読み直す
  assert.deepEqual(second.ranking.map((e) => e.name), ['MID']);
});

test('キャッシュに書けなくても（大きすぎる等）doGet は普通に返す', () => {
  cache.failPut = true;
  const a = get();
  assert.equal(a.ok, true);
  const b = get();
  assert.equal(b.ok, true);
  assert.equal(scoreReads(), 2, '書けなかったので毎回シートを読む');
});
