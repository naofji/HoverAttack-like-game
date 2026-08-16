// ============================================
// 途中セーブと面セレクトの解放。Game と saveData.js の間をつなぐ。
//
// 永続化の理屈は utils/saveData.js（純ロジック）に置いてあり、ここは
// 「いつ払うか」「Game のどこへ流し込むか」だけを持つ。GameStateManager に
// 足さなかったのは、あちらの 120 行の見通しの良さが値打ちで、永続化と
// 週判定とスコア減算を混ぜると失うため。
// ============================================

import { MODES } from '../utils/modes.js';
import { SAVE_COST } from '../utils/Constants.js';
import { loadProgress, writeProgress, canSave, makeSave, bumpTries } from '../utils/saveData.js';

export class SaveManager {
    constructor(game, storage = globalThis.localStorage) {
        this.game = game;
        this.storage = storage;
        this.weekId = game.week.weekId;
        this.progress = loadProgress(this.weekId, storage);
    }

    get save() { return this.progress.save; }

    get reached() { return this.progress.reached; }

    /** 今のスコアでセーブ代を払えるか。 */
    canSaveNow() { return canSave(this.game.score); }

    _write() { writeProgress(this.weekId, this.progress, this.storage); }

    /**
     * 今のランをセーブする。**払えなければ何もしない**（呼び出し側で
     * 弾く前提だが、ここでも守る。二重に守っておかないと、表示と
     * 判定がずれたときに黙って負のスコアが生まれる）。
     * @returns {boolean} セーブできたか
     */
    saveHere() {
        if (!this.canSaveNow()) return false;
        const game = this.game;
        this.progress.save = makeSave({
            mode: game.mode,
            missionsCompleted: game.missionsCompleted,
            score: game.score,
            totalTime: game.totalTime,
            stageResults: game.stageResults,
        });
        game.score -= SAVE_COST;
        game.runTries = 1;   // このセーブ地点への挑戦は、これが1回目
        this._write();
        return true;
    }

    /**
     * セーブ地点から再開する。**トライ数を先に増やして保存してから**
     * game へ流し込む（保存前に落ちても回数が残るように）。
     * 面の再生成は呼び出し側（stateManager.resetLevel(false)）の仕事。
     * @returns {boolean} 再開できたか
     */
    applyContinue() {
        const save = this.progress.save;
        if (!save) return false;

        this.progress.save = bumpTries(save);
        this._write();

        const game = this.game;
        const next = this.progress.save;
        game.mode = next.mode;
        game.gameSpeed = MODES[next.mode].gameSpeed;
        game.missionsCompleted = next.missionsCompleted;
        game.score = next.score;
        game.totalTime = next.totalTime;
        game.stageResults = next.stageResults.slice();
        game.runTries = next.tries;
        return true;
    }

    /** 今週の到達最大面を記録する。面セレクトの解放はこれで決まる。 */
    recordReached(stage) {
        if (!Number.isFinite(stage) || stage <= this.progress.reached) return;
        this.progress.reached = stage;
        this._write();
    }
}
