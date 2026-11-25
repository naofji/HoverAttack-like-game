// ============================================
// 面クリア（敵基地を壊す → フラッグを立てる → 取ったら面の結果を記録）
// ============================================
//
// main.js から切り出した（2026-11-25、中身は動かしただけ）。ランキングに入るかの
// 見込み（_wouldStageRankTime / _wouldStageRankScore）は OnlineFlow.js。
//
// AutoAim.js と同じく **Object.assign で Game に混ぜる前提**の
// オブジェクトリテラルで、`this` は Game を指す。

import { ENEMY_BASE_DRAW_OVERHANG, FLAG_HEIGHT, STAGE_COUNT } from '../utils/Constants.js';
import { Flag } from '../entities/Flag.js';
import { buildStageResult } from '../utils/scoring.js';
import { audioManager } from '../audio/AudioManager.js';

export const MissionClear = {
    _checkMissionClear() {
        if (this.base && !this.base.alive && !this.flag && this.gameState === 'playing') {
            // 足元は箱の下端ではなく床の表面に合わせる。基地の箱は構造物の絵のはみ出し
            // （ENEMY_BASE_DRAW_OVERHANG）ぶん床より上に置いてあるので、箱の下端に合わせると
            // フラッグが 12px 浮いて見えた（実機の指摘）。
            const floorY = this.base.y + this.base.height + ENEMY_BASE_DRAW_OVERHANG;
            this.flag = new Flag(this, this.base.x + this.base.width / 2 - 6, floorY - FLAG_HEIGHT);
        }

        if (!this.flag) return;
        this.flag.update();

        if (this.player && this.player.alive && !this.player.docked && this.flag.collidesWith(this.player)) {
            this._onFlagCaptured();
        }
    },

    _onFlagCaptured() {
        this.score += this.flag.scoreValue;
        this.flag = null;
        this.missionsCompleted++;

        // Time bonus: the live decaying value at the moment of capture (see liveTimeBonus).
        this.targetTimeBonus = this.liveTimeBonus().current;
        this.currentTimeBonus = 0;

        // Record this stage's result (finalised: kills + flag + time bonus).
        const clearedStage = this.missionsCompleted; // already incremented above (1..STAGE_COUNT)
        const stageResult = buildStageResult({
            stage: clearedStage,
            scoreNow: this.score,
            stageStartScore: this.stageStartScore,
            targetTimeBonus: this.targetTimeBonus,
            timeMs: this.missionTimer,
        });
        this.stageResults.push(stageResult);

        // Preliminary "would this make top 5?" notice for the mission-clear screen.
        // Prefer online stage rankings if loaded, else local manager.
        this.stageTop5Time = this._wouldStageRankTime(clearedStage, stageResult.timeMs);
        this.stageTop5Score = this._wouldStageRankScore(clearedStage, stageResult.score);

        this.slotRunning = true;

        this.gameState = this.missionsCompleted >= STAGE_COUNT ? 'game_clear' : 'mission_clear';
        this.stateTimer = 0;
        audioManager.stopBGM();
        // ここでシミュレーションが止まるので、鳴り続ける音は自分で止める。
        // バスは引かない（この直後のファンファーレは同じバスを通るため）
        audioManager.stopLoopingSe();
        audioManager.playSuccess();
    },
};
