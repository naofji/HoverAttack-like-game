// ============================================
// grenadePhysics - グレネードの1フレームの物理（純ロジック）
// ============================================
//
// Grenade.update（本体）と CombatActions._calcGrenadeTrajectory（照準の軌道予測）が
// 同じ式を2か所に書いていた。片方だけ直すと予測が実際の軌道とずれるので、1つにまとめて
// 両方から呼ぶ（tests/grenade-trajectory.test.js が一致を縛る）。
// 回転・寿命・画面外・バリアは呼んだ側に残す（予測と本体で扱いが違うため）。

import {
    GRENADE_GRAVITY, GRENADE_MAX_FALLING_SPEED, GRENADE_BOUNCE, GRENADE_FRICTION,
} from './Constants.js';
import { fallSpeedScaleFor } from '../world/StageEnvironment.js';

/**
 * グレネードを1フレーム進める（重力・最大落下速度・地形での跳ね返りと接地の摩擦）。
 * @param {object} map isSolidAtPixel を持つ
 * @param {{x:number,y:number,vx:number,vy:number}} g 書き換える
 * @param {object} motion motionFor の戻り値
 */
export function stepGrenade(map, g, motion) {
    g.vy += GRENADE_GRAVITY * motion.gravity + (motion.downforce || 0);
    const maxFall = GRENADE_MAX_FALLING_SPEED * fallSpeedScaleFor(motion);
    if (g.vy > maxFall) g.vy = maxFall;

    let nextX = g.x + g.vx * motion.speed;
    let nextY = g.y + g.vy * motion.speed;

    // 横 → 縦の順に、軸ごとに跳ね返す
    if (map.isSolidAtPixel(nextX, g.y)) {
        g.vx *= -GRENADE_BOUNCE;
        nextX = g.x + g.vx * motion.speed;
    }
    g.x = nextX;

    if (map.isSolidAtPixel(g.x, nextY)) {
        // 床か天井。速ければ跳ね返り、遅ければ接地して転がりに摩擦をかける
        if (Math.abs(g.vy) > 0.5) {
            g.vy *= -GRENADE_BOUNCE;
        } else {
            g.vy = 0;
            g.vx *= GRENADE_FRICTION;
        }
        nextY = g.y + g.vy * motion.speed;
    }
    g.y = nextY;
}
