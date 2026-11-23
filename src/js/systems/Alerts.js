// ============================================
// 警報（母艦の接近警報・敵基地の緊急防衛）
// ============================================
//
// 母艦に敵・敵弾が近づいたときの警報と、敵基地が攻撃されたときに守備隊を呼び戻す
// 緊急防衛モードの入口。main.js から切り出した（2026-11-24、中身は動かしただけ）。
// 画面の表示は HUD（_drawProximityAlert / _drawBaseEmergencyAlert）が状態を読んで描く。
//
// AutoAim.js と同じく **Object.assign で Game に混ぜる前提**の
// オブジェクトリテラルで、`this` は Game を指す。

import { CARRIER_PROXIMITY_ALERT_RANGE, BASE_EMERGENCY_MISSION } from '../utils/Constants.js';
import { centerOf } from '../utils/Physics.js';
import { EnemyAttacker } from '../entities/EnemyAttacker.js';
import { EnemyDrone } from '../entities/EnemyDrone.js';
import { audioManager } from '../audio/AudioManager.js';

export const Alerts = {
    _updateProximityAlert() {
        if (!this.carrier || !this.carrier.alive || this.gameState !== 'playing') {
            this.proximityAlertActive = false;
            return;
        }

        const cx = this.carrier.x + this.carrier.width / 2;
        const cy = this.carrier.y + this.carrier.height / 2;
        const rangeSq = CARRIER_PROXIMITY_ALERT_RANGE * CARRIER_PROXIMITY_ALERT_RANGE;

        // 敵も敵弾も、機体の中心が範囲に入ったら警報。x,y が左上か中心かは
        // クラスによって違うので、中心の求め方は centerOf に任せる。
        const nearCarrier = (obj) => {
            if (!obj.alive) return false;
            const c = centerOf(obj);
            return (cx - c.x) ** 2 + (cy - c.y) ** 2 < rangeSq;
        };

        this.proximityAlertActive = this.enemies.some(nearCarrier)
            || this.enemyBullets.some(nearCarrier);

        // Play alarm sound periodically while threat is near
        if (this.proximityAlertActive) {
            if (Math.floor(this.totalTime / 16) % 30 === 0) {
                audioManager.playAlarm();
            }
        }
    },

    /**
     * Enter "Enemy Base Emergency Defense Mode" — called by EnemyBase.takeDamage()
     * on mission 2+ once the base is under attack. One-shot latch: once active,
     * subsequent calls are no-ops until a fresh mission (or base destruction)
     * resets the flags.
     * @param {EnemyBase} enemyBase - the base under attack; stored so redirected
     *   defenders (and newly-spawned ones, via SpawnManager) know their rally point.
     */
    triggerBaseEmergencyAlert(enemyBase) {
        if (this.baseEmergencyAlert) return; // one-shot latch: already active

        if (this.missionsCompleted < BASE_EMERGENCY_MISSION) return; // 基地側でも見ているが念のため（defense in depth）

        this.baseEmergencyAlert = true;
        this.emergencyTargetBase = enemyBase;
        this.baseEmergencyAlertStartTime = Date.now();

        for (const enemy of this.enemies) {
            if (enemy instanceof EnemyAttacker || enemy instanceof EnemyDrone) {
                enemy.setEmergencyDefense(true, enemyBase);
            }
        }

        audioManager.playAlarm();
    },
};
