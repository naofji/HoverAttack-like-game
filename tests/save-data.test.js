import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    PROGRESS_STORAGE_KEY, loadProgress, writeProgress, canSave, makeSave, bumpTries,
} from '../src/js/utils/saveData.js';
import { SAVE_COST } from '../src/js/utils/Constants.js';

/** localStorage の代わり。getItem が投げる場合も作れる。 */
function fakeStorage(initial = {}, { throwOnGet = false, throwOnSet = false } = {}) {
    const data = { ...initial };
    return {
        data,
        getItem(k) { if (throwOnGet) throw new Error('private browsing'); return k in data ? data[k] : null; },
        setItem(k, v) { if (throwOnSet) throw new Error('quota'); data[k] = String(v); },
    };
}

const SAMPLE = {
    mode: 'newtype',
    missionsCompleted: 3,
    score: 24500,
    totalTime: 182400,
    stageResults: [{ stage: 1, score: 1200, timeMs: 60000 }],
    tries: 1,
};

test('保存が無ければ既定値を返す', () => {
    const got = loadProgress('2026-W33', fakeStorage());
    assert.deepEqual(got, { save: null, reached: 0 });
});

test('同じ週の保存はそのまま読める', () => {
    const storage = fakeStorage();
    writeProgress('2026-W33', { save: SAMPLE, reached: 4 }, storage);
    const got = loadProgress('2026-W33', storage);
    assert.deepEqual(got.save, SAMPLE);
    assert.equal(got.reached, 4);
});

test('週が変われば save も reached も捨てる', () => {
    const storage = fakeStorage();
    writeProgress('2026-W33', { save: SAMPLE, reached: 4 }, storage);
    assert.deepEqual(loadProgress('2026-W34', storage), { save: null, reached: 0 });
});

test('壊れた JSON でも投げずに既定値', () => {
    const storage = fakeStorage({ [PROGRESS_STORAGE_KEY]: '{not json' });
    assert.deepEqual(loadProgress('2026-W33', storage), { save: null, reached: 0 });
});

test('save の形が壊れていれば save だけ捨て、reached は生かす', () => {
    const storage = fakeStorage({
        [PROGRESS_STORAGE_KEY]: JSON.stringify({
            weekId: '2026-W33', save: { mode: 'newtype' }, reached: 5,
        }),
    });
    const got = loadProgress('2026-W33', storage);
    assert.equal(got.save, null);
    assert.equal(got.reached, 5);
});

// sanitizeSave は mode を「非空文字列」としか見ていなかった。壊れた／改竄された
// mode が入ると SaveManager.applyContinue() の MODES[next.mode].gameSpeed で
// TypeError になる。ScreenRenderer._drawSaveHints() は MODES[s.mode] ? ... : s.mode
// で守られているため、「タイトルに行が出るのに C を押すと落ちる」という
// 最悪の見え方になっていた。未知の形はセーブ無しとして扱う設計に沿い、
// mode が MODE_ORDER に無ければ save ごと null にする。
test('mode が未知の文字列なら save は null になる(未知の形はセーブ無しとして扱う)', () => {
    const storage = fakeStorage({
        [PROGRESS_STORAGE_KEY]: JSON.stringify({
            weekId: '2026-W33',
            save: { ...SAMPLE, mode: 'totally-bogus-mode' },
            reached: 4,
        }),
    });
    const got = loadProgress('2026-W33', storage);
    assert.equal(got.save, null);
    assert.equal(got.reached, 4, 'save だけ捨て、reached は生かす');
});

test('localStorage が使えなくても投げない', () => {
    assert.deepEqual(loadProgress('2026-W33', fakeStorage({}, { throwOnGet: true })), { save: null, reached: 0 });
    assert.doesNotThrow(() => writeProgress('2026-W33', { save: null, reached: 1 }, fakeStorage({}, { throwOnSet: true })));
    assert.doesNotThrow(() => loadProgress('2026-W33', null));
});

test('canSave はコストちょうどで通る', () => {
    assert.equal(canSave(SAVE_COST - 1), false);
    assert.equal(canSave(SAVE_COST), true);
    assert.equal(canSave(Number.NaN), false);
});

test('makeSave はコストを引いた後のスコアを持つ', () => {
    const save = makeSave({
        mode: 'normal', missionsCompleted: 2, score: 34500, totalTime: 1000, stageResults: [],
    });
    // 引く前の 34500 が残っていたら、セーブし直すたびに得をする穴になる
    assert.equal(save.score, 34500 - SAVE_COST);
    assert.equal(save.tries, 1);
});

test('bumpTries は元を壊さずに +1 する', () => {
    const a = makeSave({ mode: 'normal', missionsCompleted: 1, score: 20000, totalTime: 0, stageResults: [] });
    const b = bumpTries(a);
    assert.equal(a.tries, 1);
    assert.equal(b.tries, 2);
    assert.equal(bumpTries(b).tries, 3);
});

test('stageResults は配列の実体をコピーして持つ', () => {
    const results = [{ stage: 1, score: 1, timeMs: 1 }];
    const save = makeSave({ mode: 'normal', missionsCompleted: 1, score: 20000, totalTime: 0, stageResults: results });
    results.push({ stage: 2, score: 2, timeMs: 2 });
    assert.equal(save.stageResults.length, 1);
});
