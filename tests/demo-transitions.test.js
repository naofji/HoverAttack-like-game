import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Game } from '../src/js/main.js';
import { audioManager } from '../src/js/audio/AudioManager.js';

/**
 * デモループ（タイトル → 遊び方 → 各ランキング → タイトル…）の自動送り。
 *
 * 画面に入るときの始末（順位のハイライト消し、面送りの巻き戻し、タイトル曲）
 * は以前 _enterDemoState() と自動送りの両方に書かれていて、自動送りで入った
 * ときだけ抜ける形になりやすかった。今は入口が _enterDemoState() 1本なので、
 * その始末が本当に効いていることをここで縛る。
 */

/** audioManager のメソッド呼び出しを記録する。音は鳴らせないので呼び出しで確かめる。 */
function spyAudio(names) {
    const calls = [];
    const originals = {};
    for (const n of names) {
        originals[n] = audioManager[n];
        audioManager[n] = (...args) => calls.push({ name: n, args });
    }
    return {
        calls,
        restore() { for (const n of names) audioManager[n] = originals[n]; },
        names() { return calls.map((c) => c.name); },
        called(n) { return calls.some((c) => c.name === n); },
    };
}

const NO_INPUT = {
    isKeyPressed: () => false,
    isLeftClickPressed: () => false,
    isRightClickPressed: () => false,
    isKeyDown: () => false,
};

const TIMED_OUT = 99999;   // どの画面の表示時間も超える経過ミリ秒

/**
 * デモ画面を1つ進める。入力は無く、時間切れによる自動送りだけが起きる。
 * @returns {{state:string, timer:number, localRankIndex:number,
 *            globalRankIndex:number, stageDisplayIndex:number, sounds:string[]}}
 */
function advance(fromState, overrides = {}) {
    const spy = spyAudio(['stopEnemyHover', 'playTitleBGM', 'startBGM']);
    const savedRefresh = Game._refreshOnline;
    const savedMaxStage = Game.maxStageReached;
    try {
        Game._refreshOnline = async () => {};
        Game.maxStageReached = () => 3;

        Object.assign(Game, {
            gameState: fromState,
            stateTimer: 0,
            stageDisplayTimer: 0,
            stageDisplayIndex: 0,
            // 前の周回の名残に見立てて、消えるべき値を入れておく
            localRankIndex: 9,
            globalRankIndex: 9,
            input: NO_INPUT,
            onlineStatus: 'offline',
            onlineData: null,
        }, overrides);

        Game._updateGameState(TIMED_OUT);

        return {
            state: Game.gameState,
            timer: Game.stateTimer,
            localRankIndex: Game.localRankIndex,
            globalRankIndex: Game.globalRankIndex,
            stageDisplayIndex: Game.stageDisplayIndex,
            sounds: spy.names(),
        };
    } finally {
        spy.restore();
        Game._refreshOnline = savedRefresh;
        Game.maxStageReached = savedMaxStage;
    }
}

test('タイトルは時間切れで遊び方へ送る', () => {
    const r = advance('title');
    assert.equal(r.state, 'how_to_play');
    assert.equal(r.timer, 0);
});

test('遊び方からローカル順位に入ると、前回のハイライトが消える', () => {
    const r = advance('how_to_play');
    assert.equal(r.state, 'local_ranking_display');
    assert.equal(r.localRankIndex, -1);
    assert.equal(r.globalRankIndex, -1);
});

test('オンラインの記録が無ければ GLOBAL を飛ばしてタイトルに戻る', () => {
    const r = advance('local_ranking_display');
    assert.equal(r.state, 'title');
    assert.ok(r.sounds.includes('playTitleBGM'), 'タイトルに戻ったら曲を鳴らす');
});

test('オンラインの記録があれば GLOBAL へ進む', () => {
    const r = advance('local_ranking_display', {
        onlineStatus: 'ok', onlineData: { ranking: [] },
    });
    assert.equal(r.state, 'global_ranking_display');
    assert.ok(!r.sounds.includes('playTitleBGM'), 'タイトル曲は鳴らさない');
});

test('GLOBAL から面別に入ると、面送りが1面目に巻き戻る', () => {
    const r = advance('global_ranking_display', { stageDisplayIndex: 5 });
    assert.equal(r.state, 'stage_ranking_display');
    assert.equal(r.stageDisplayIndex, 0);
});

test('未到達なら面別を飛ばして WALL OF FAME へ', () => {
    const savedMaxStage = Game.maxStageReached;
    try {
        const spy = spyAudio(['stopEnemyHover', 'playTitleBGM', 'startBGM']);
        Object.assign(Game, {
            gameState: 'global_ranking_display', stateTimer: 0,
            input: NO_INPUT, onlineStatus: 'offline', onlineData: null,
        });
        Game.maxStageReached = () => 0;
        Game._updateGameState(TIMED_OUT);
        spy.restore();
        assert.equal(Game.gameState, 'wall_of_fame_display');
    } finally {
        Game.maxStageReached = savedMaxStage;
    }
});

test('最後の面を出し終えたら WALL OF FAME へ', () => {
    // maxStageReached() は 3。3面目まで出し終えた状態から送る
    const r = advance('stage_ranking_display', { stageDisplayIndex: 2 });
    assert.equal(r.state, 'wall_of_fame_display');
    assert.equal(r.timer, 0);
});

test('WALL OF FAME から一周してタイトルに戻り、曲が鳴る', () => {
    const r = advance('wall_of_fame_display');
    assert.equal(r.state, 'title');
    assert.ok(r.sounds.includes('playTitleBGM'));
});

test('どの自動送りでも敵のホバー音を止める（音源を残したまま画面を移らない）', () => {
    const froms = [
        'title', 'how_to_play', 'local_ranking_display',
        'global_ranking_display', 'wall_of_fame_display',
    ];
    for (const from of froms) {
        assert.ok(
            advance(from).sounds.includes('stopEnemyHover'),
            `${from} からの自動送りでホバー音が止まっていない`,
        );
    }
});
