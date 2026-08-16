import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { SaveManager } from '../src/js/systems/SaveManager.js';

function fakeStorage(initial = {}) {
    const data = { ...initial };
    return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

function makeGame(overrides = {}) {
    const g = Object.create(Game);
    g.week = { weekId: '2026-W33', seed: 1 };
    g.mode = 'normal';
    g.gameSpeed = 0.8;
    g.score = 0;
    g.totalTime = 0;
    g.missionsCompleted = 2;
    g.stageResults = [];
    g.runTries = 1;
    Object.assign(g, overrides);
    g.saveManager = new SaveManager(g, overrides.storage || fakeStorage());
    return g;
}

test('_recordStageReached は saveManager にも記録する', () => {
    const g = makeGame();
    // missionsCompleted 2 = いま遊んでいるのは3面
    g._recordStageReached();
    assert.equal(g.saveManager.reached, 3);
});

test('7面を超えて記録されない', () => {
    const g = makeGame({ missionsCompleted: 9 });
    g._recordStageReached();
    assert.equal(g.saveManager.reached, 7);
});
