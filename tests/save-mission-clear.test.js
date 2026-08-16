import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { SaveManager } from '../src/js/systems/SaveManager.js';
import { SAVE_COST } from '../src/js/utils/Constants.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';

function fakeStorage(initial = {}) {
    const data = { ...initial };
    return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

/** 押されたキーだけ true を返す入力。 */
function fakeInput(pressed = [], typed = []) {
    return {
        isKeyPressed: (code) => pressed.includes(code),
        isLeftClickPressed: () => false,
        isRightClickPressed: () => false,
        getTypedChars: () => typed,
    };
}

function makeGame(over = {}) {
    const g = Object.create(Game);
    g.week = { weekId: '2026-W33', seed: 1 };
    g.mode = 'normal';
    g.gameSpeed = 0.8;
    g.score = 34500;
    g.totalTime = 1000;
    g.missionsCompleted = 3;
    g.stageResults = [];
    g.runTries = 1;
    g.stageSelectRun = false;
    g.slotRunning = false;
    g.gameState = 'mission_clear';
    g.nextMissionCalls = 0;
    g.input = fakeInput();
    g.stateManager = { nextMission() { g.nextMissionCalls++; } };
    g._restoreFullscreen = () => {};
    Object.assign(g, over);
    g.saveManager = new SaveManager(g, over.storage || fakeStorage());
    return g;
}

test('S でセーブしてから次の面へ進む', () => {
    const game = makeGame({ input: fakeInput(['KeyS']) });
    game._updateMissionClear();
    assert.equal(game.score, 34500 - SAVE_COST);
    assert.equal(game.saveManager.save.missionsCompleted, 3);
    assert.equal(game.nextMissionCalls, 1);
    assert.equal(game.gameState, 'playing');
});

test('スコアが足りなければ S は無反応（次の面へも進まない）', async () => {
    const game = makeGame({ score: SAVE_COST - 1, input: fakeInput(['KeyS']) });
    game._updateMissionClear();
    assert.equal(game.score, SAVE_COST - 1);
    assert.equal(game.saveManager.save, null);
    assert.equal(game.nextMissionCalls, 0);
    assert.equal(game.gameState, 'mission_clear');
});

test('W では従来どおりセーブせずに進む', async () => {
    const game = makeGame({ input: fakeInput(['KeyW']) });
    game._updateMissionClear();
    assert.equal(game.score, 34500);
    assert.equal(game.saveManager.save, null);
    assert.equal(game.nextMissionCalls, 1);
});

test('S の入力が「任意のキー」として二重に効かない', async () => {
    // getTypedChars に 's' が乗っていても、進むのは1回だけ
    const game = makeGame({ input: fakeInput(['KeyS'], ['s']) });
    game._updateMissionClear();
    assert.equal(game.nextMissionCalls, 1);
    assert.equal(game.score, 34500 - SAVE_COST);
});

test('タイムボーナス加算中は何も受け付けない', async () => {
    const game = makeGame({
        slotRunning: true, currentTimeBonus: 0, targetTimeBonus: 500,
        input: fakeInput(['KeyS']),
    });
    game._updateMissionClear();
    assert.equal(game.saveManager.save, null);
    assert.equal(game.nextMissionCalls, 0);
});

// [S] SAVE & NEXT (+88, font('sub')=18px) と TOP 5! 通知が、行を足す前は
// +60/+90 で衝突していなかったのに、+88/+90 の並びでは2pxしか離れておらず
// ベースラインが重なって読めない。TOP 5! FASTEST TIME は序盤の面で普通に出る。
test('面クリア画面: [S] SAVE & NEXT と TOP 5! 通知は十分離れている(TOP5通知がある時)', () => {
    const canvas = { width: 960, height: 720 };
    const game = makeGame({ score: 34500 });
    game.canvas = canvas;
    game.missionTimer = 1000;
    game.targetTimeBonus = 0;
    game.currentTimeBonus = 0;
    game.stageTop5Time = true;
    game.stageTop5Score = false;
    const ctx = makeFakeCtx();
    new ScreenRenderer(game).drawMissionClear(ctx);
    const saveCall = ctx.calls.find((c) => c.name === 'fillText' && typeof c.args[0] === 'string' && c.args[0].includes('[S] SAVE & NEXT'));
    const top5Call = ctx.calls.find((c) => c.name === 'fillText' && typeof c.args[0] === 'string' && c.args[0].includes('TOP 5!'));
    assert.ok(saveCall, '[S] SAVE & NEXT が描かれていない');
    assert.ok(top5Call, 'TOP 5! 通知が描かれていない');
    const saveY = saveCall.args[2];
    const top5Y = top5Call.args[2];
    assert.ok(top5Y - saveY >= 24, `間隔が足りない: save=${saveY} top5=${top5Y}`);
});

// 実機で「面をクリアしてもセーブするか聞かれない」と報告されて発覚した退行の回帰。
// 描画が「TIME BONUS を出す」か「操作の案内を出す」かの if/else になっていて、
// targetTimeBonus は加算アニメが終わってもリセットされないため、ボーナスが付いた面
// （＝ほとんどの面）では案内が一度も出なかった。
// 上の描画テストが揃って targetTimeBonus = 0 を置いていたので誰も気づかなかった。
test('面クリア画面: タイムボーナスが付いた面でも加算後にセーブ行が出る', () => {
    const game = makeGame({ score: 34500 });
    game.canvas = { width: 960, height: 720 };
    game.missionTimer = 1000;
    // 加算アニメは終わっているが、獲得したボーナスの値は残ったまま（実機の状態）
    game.targetTimeBonus = 4200;
    game.currentTimeBonus = 4200;
    game.slotRunning = false;
    game.stageTop5Time = false;
    game.stageTop5Score = false;
    const ctx = makeFakeCtx();
    new ScreenRenderer(game).drawMissionClear(ctx);
    const texts = ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
    assert.ok(texts.some((t) => t.includes('[S] SAVE & NEXT')), texts.join(' | '));
    assert.ok(texts.some((t) => t.includes('[W] NEXT STAGE')), texts.join(' | '));
    // ボーナスの表示も消えていないこと（案内と排他にしない、が直しの要点）
    assert.ok(texts.some((t) => t.includes('TIME BONUS')), texts.join(' | '));
});

// 加算アニメ中は _updateMissionClear が入力を受けないので、案内も出してはいけない。
// 「押せるようになった瞬間」と「案内が出る瞬間」を一致させる。
test('面クリア画面: 加算アニメ中は操作の案内を出さない', () => {
    const game = makeGame({ score: 34500 });
    game.canvas = { width: 960, height: 720 };
    game.missionTimer = 1000;
    game.targetTimeBonus = 4200;
    game.currentTimeBonus = 1200;
    game.slotRunning = true;
    game.stageTop5Time = false;
    game.stageTop5Score = false;
    const ctx = makeFakeCtx();
    new ScreenRenderer(game).drawMissionClear(ctx);
    const texts = ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
    assert.ok(!texts.some((t) => t.includes('[S] SAVE & NEXT')), texts.join(' | '));
    assert.ok(!texts.some((t) => t.includes('[W] NEXT STAGE')), texts.join(' | '));
    assert.ok(texts.some((t) => t.includes('TIME BONUS')), texts.join(' | '));
});

test('面クリア画面はセーブ行を出し、払えないときは理由を出す', async () => {
    const canvas = { width: 960, height: 720 };
    for (const [score, expected] of [[34500, `-${SAVE_COST} PTS`], [10, 'SCORE TOO LOW']]) {
        const game = makeGame({ score });
        game.canvas = canvas;
        game.missionTimer = 1000;
        game.targetTimeBonus = 0;
        game.currentTimeBonus = 0;
        game.stageTop5Time = false;
        game.stageTop5Score = false;
        const ctx = makeFakeCtx();
        new ScreenRenderer(game).drawMissionClear(ctx);
        const texts = ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
        assert.ok(texts.some((t) => t.includes('[W] NEXT STAGE')));
        assert.ok(texts.some((t) => t.includes(expected)), `${score}: ${texts.join(' | ')}`);
    }
});
