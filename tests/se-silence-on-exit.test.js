import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Game } from '../src/js/main.js';
import { audioManager } from '../src/js/audio/AudioManager.js';

/**
 * ミッションを抜けたら効果音が鳴りっぱなしにならないこと。
 *
 * ホバー音・敵のホバー音・母艦のエンジン・回復ハムの4つは、止める指示が
 * あるまで鳴り続ける（毎フレームの更新で音量を追従させる作り）。
 * ミッションを抜けるとその更新も止まるので、抜けるときに明示的に
 * 止めないとタイトル画面で鳴り続ける。Escape で抜けたときに実際そうなった。
 */

/** audioManager の音の停止系を記録する。必ず元へ戻す。 */
function spyAudio(fn) {
    const names = [
        'fadeOutSe', 'resumeSe', 'stopLoopingSe',
        'stopHover', 'stopEnemyHover', 'stopCarrierEngine', 'stopRepairHum',
        'stopBGM', 'playTitleBGM', 'playSuccess', 'playGameOver', 'startBGM',
        'playRankingBGM',
    ];
    const originals = {};
    const calls = [];
    for (const n of names) {
        originals[n] = audioManager[n];
        audioManager[n] = (...args) => calls.push(n);
    }
    try {
        return fn(calls);
    } finally {
        for (const n of names) audioManager[n] = originals[n];
    }
}

const NO_INPUT = {
    isKeyPressed: () => false,
    isLeftClickPressed: () => false,
    isRightClickPressed: () => false,
    isKeyDown: () => false,
    getTypedChars: () => [],
};

/** Escape だけが押されている入力。 */
const ESCAPE = { ...NO_INPUT, isKeyPressed: (code) => code === 'Escape' };

test('Escape でミッションを抜けると効果音が落ちる', () => {
    spyAudio((calls) => {
        Object.assign(Game, { gameState: 'playing', input: ESCAPE, stateTimer: 0 });
        Game.update(16);

        assert.equal(Game.gameState, 'title', 'タイトルに戻っていない');
        assert.ok(calls.includes('fadeOutSe'),
            `効果音が落ちていない: ${calls.join(',') || '（呼び出しなし）'}`);
    });
});

test('デモ画面へ入るときは必ず効果音を落とす', () => {
    // Escape だけでなく、左右キーでの移動・自動送りもここを通る
    for (const state of ['title', 'how_to_play', 'local_ranking_display',
        'global_ranking_display', 'stage_ranking_display', 'wall_of_fame_display']) {
        spyAudio((calls) => {
            Game._enterDemoState(state);
            assert.ok(calls.includes('fadeOutSe'), `${state} で効果音が落ちていない`);
        });
    }
});

test('ミッションクリアでは鳴り続ける音だけ止め、バスは引かない', () => {
    // バスごと引くとクリアのファンファーレまで消える（同じバスを通るため）
    spyAudio((calls) => {
        Object.assign(Game, {
            gameState: 'playing', missionsCompleted: 0, score: 0, stageStartScore: 0,
            missionTimer: 1000, stageResults: [], targetTimeBonus: 0, currentTimeBonus: 0,
            flag: { scoreValue: 100 },
            stageRankingManager: { wouldRankTime: () => false, wouldRankScore: () => false },
            onlineData: null,
        });
        Game._onFlagCaptured();

        assert.ok(calls.includes('stopLoopingSe'), '鳴り続ける音が止まっていない');
        assert.ok(!calls.includes('fadeOutSe'), 'バスを引くとファンファーレが消える');
        assert.ok(calls.includes('playSuccess'), 'ファンファーレが鳴っていない');
    });
});

test('ゲームオーバーでは効果音を落とす（従来どおり）', () => {
    spyAudio((calls) => {
        Object.assign(Game, { gameState: 'playing', stateTimer: 0 });
        Game._triggerGameOver();

        assert.equal(Game.gameState, 'gameover');
        assert.ok(calls.includes('fadeOutSe'), '効果音が落ちていない');
        assert.ok(calls.includes('playGameOver'), 'ゲームオーバー音が鳴っていない');
    });
});

test('ゲームを始めると効果音が戻る', () => {
    // fadeOutSe は seFaded を立てるだけなので、戻す側が無いと二度と鳴らない
    spyAudio((calls) => {
        Object.assign(Game, { gameState: 'playing', input: NO_INPUT });
        Game._tickVolumeHud = () => {};
        Game._updateVolumeControl = () => {};
        Game._updateGameState = () => {};
        Game.update(16);
        assert.ok(calls.includes('resumeSe'), 'プレイ中に効果音が戻っていない');
    });
});

test('stopLoopingSe は鳴り続ける音を4つとも止める', () => {
    spyAudio((calls) => {
        // spyAudio が stopLoopingSe 自体も差し替えるので、本物を呼ぶ
        const real = Object.getPrototypeOf(audioManager).stopLoopingSe;
        real.call(audioManager);
        for (const n of ['stopHover', 'stopEnemyHover', 'stopCarrierEngine', 'stopRepairHum']) {
            assert.ok(calls.includes(n), `${n} が呼ばれていない`);
        }
    });
});

test('効果音を止める系は引数なしで呼んでも落ちない', () => {
    assert.doesNotThrow(() => {
        audioManager.stopLoopingSe();
        audioManager.stopLoopingSe();   // 二度呼んでも平気なこと
    });
});
