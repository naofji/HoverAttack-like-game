import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SaveManager } from '../src/js/systems/SaveManager.js';
import { SAVE_COST } from '../src/js/utils/Constants.js';

function fakeStorage(initial = {}) {
    const data = { ...initial };
    return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

/** SaveManager が触る分だけの Game。 */
function fakeGame(over = {}) {
    return {
        week: { weekId: '2026-W33' },
        mode: 'newtype',
        gameSpeed: 1.0,
        score: 34500,
        totalTime: 182400,
        missionsCompleted: 3,
        stageResults: [{ stage: 1, score: 1200, timeMs: 60000 }],
        runTries: 1,
        ...over,
    };
}

test('払えるときはコストを引いて保存する', () => {
    const game = fakeGame();
    const sm = new SaveManager(game, fakeStorage());
    assert.equal(sm.saveHere(), true);
    assert.equal(game.score, 34500 - SAVE_COST);
    assert.equal(sm.save.score, 34500 - SAVE_COST);
    assert.equal(sm.save.missionsCompleted, 3);
    assert.equal(sm.save.mode, 'newtype');
    assert.equal(sm.save.tries, 1);
});

test('払えないときは何も起きない', () => {
    const game = fakeGame({ score: SAVE_COST - 1 });
    const sm = new SaveManager(game, fakeStorage());
    assert.equal(sm.canSaveNow(), false);
    assert.equal(sm.saveHere(), false);
    assert.equal(game.score, SAVE_COST - 1);
    assert.equal(sm.save, null);
});

test('保存した内容は別のインスタンスから読める', () => {
    const storage = fakeStorage();
    new SaveManager(fakeGame(), storage).saveHere();
    const fresh = new SaveManager(fakeGame({ score: 0 }), storage);
    assert.equal(fresh.save.missionsCompleted, 3);
});

test('週が変われば読み込みで消える', () => {
    const storage = fakeStorage();
    new SaveManager(fakeGame(), storage).saveHere();
    const nextWeek = new SaveManager(fakeGame({ week: { weekId: '2026-W34' } }), storage);
    assert.equal(nextWeek.save, null);
    assert.equal(nextWeek.reached, 0);
});

test('applyContinue はトライ数を増やして game に流し込む', () => {
    const storage = fakeStorage();
    new SaveManager(fakeGame(), storage).saveHere();

    const game = fakeGame({ score: 999, totalTime: 0, missionsCompleted: 0, stageResults: [], mode: 'normal' });
    const sm = new SaveManager(game, storage);
    assert.equal(sm.applyContinue(), true);
    assert.equal(game.score, 34500 - SAVE_COST);
    assert.equal(game.missionsCompleted, 3);
    assert.equal(game.totalTime, 182400);
    assert.equal(game.stageResults.length, 1);
    assert.equal(game.mode, 'newtype');      // モードは保存値に固定される
    assert.equal(game.gameSpeed, 1.0);
    assert.equal(game.runTries, 2);
    assert.equal(sm.save.tries, 2);
});

test('applyContinue はセーブが無ければ false で何も触らない', () => {
    const game = fakeGame({ score: 111 });
    const sm = new SaveManager(game, fakeStorage());
    assert.equal(sm.applyContinue(), false);
    assert.equal(game.score, 111);
});

test('トライ数は保存し直すと 1 に戻る', () => {
    const storage = fakeStorage();
    const game = fakeGame();
    const sm = new SaveManager(game, storage);
    sm.saveHere();
    sm.applyContinue();
    assert.equal(sm.save.tries, 2);
    game.score = 50000;
    game.missionsCompleted = 4;
    sm.saveHere();
    assert.equal(sm.save.tries, 1);
    assert.equal(sm.save.missionsCompleted, 4);
});

test('recordReached は増えるときだけ書く', () => {
    const storage = fakeStorage();
    const sm = new SaveManager(fakeGame(), storage);
    sm.recordReached(3);
    assert.equal(sm.reached, 3);
    sm.recordReached(2);
    assert.equal(sm.reached, 3);
    sm.recordReached(5);
    assert.equal(sm.reached, 5);
    assert.equal(new SaveManager(fakeGame(), storage).reached, 5);
});

test('storage が無くても投げない', () => {
    const sm = new SaveManager(fakeGame(), null);
    assert.doesNotThrow(() => sm.saveHere());
    assert.doesNotThrow(() => sm.recordReached(2));
});
