// ============================================
// ループ音の更新役（敵のホバー音・バリアの唸り・母艦のエンジン音）
// ============================================
//
// 毎ティック、いま鳴らすべき音量と位置を audioManager に渡すだけの手順。main.js から切り出した
// （2026-11-24、中身は動かしただけ）。どれも「聞こえる相手が居なくなっても止めずに 0 を渡す」
// 作りで、本当に止めるのは面を抜けるとき（stopLoopingSe / resetLevel）。
//
// 電流の床（_updateElectricFloors）は床そのものを進める更新でもあるので main.js に残した。
//
// AutoAim.js と同じく **Object.assign で Game に混ぜる前提**の
// オブジェクトリテラルで、`this` は Game を指す。

import { CARRIER_SPEED } from '../utils/Constants.js';
import { nearestHoveringEnemy, nearestActiveBarrier } from '../utils/audioFalloff.js';
import { audioManager } from '../audio/AudioManager.js';

export const LoopSounds = {
    /**
     * 敵のホバー音。画面に映っている敵は満音量、画面外は半分で、
     * 1画面ぶん離れると聞こえなくなる。左右はその敵の横位置で振る。
     */
    _updateEnemyHoverSound() {
        const nearest = nearestHoveringEnemy(this.enemies, this._viewRect());
        // 聞こえる敵が居なくなっても止めるのではなく 0 を渡す。音源を残した
        // まま滑らかに引くため。本当に止めるのはミッションを抜けるとき。
        if (!nearest) {
            audioManager.setEnemyHover(0);
            return;
        }
        audioManager.setEnemyHover(nearest.volume, nearest.x);
    },

    /**
     * バリアの唸り。敵のホバー音と同じく、いちばん近い1本だけを鳴らす
     * （7面には10本前後あるので、足すと本数ぶん青天井になる）。
     */
    _updateBarrierSound() {
        const nearest = nearestActiveBarrier(this.barriers, this._viewRect());
        audioManager.setBarrierHum(nearest ? nearest.volume : 0, nearest ? nearest.x : null);
    },

    /**
     * 母艦のエンジン音。ドッキング中（＝母艦を操作できる間）だけ鳴らす。
     * 移動しているほど音が上がる。
     */
    _updateCarrierEngineSound() {
        const player = this.player;
        const carrier = this.carrier;
        const running = player && player.docked && player.alive && carrier.alive;
        if (!running) {
            audioManager.stopCarrierEngine();
            audioManager.stopRepairHum(); // 母艦の撃墜で強制離脱したときもハムを残さない
            return;
        }
        const throttle = Math.min(1, Math.abs(carrier.vx) / CARRIER_SPEED);
        audioManager.startCarrierEngine(throttle);
    },
};
