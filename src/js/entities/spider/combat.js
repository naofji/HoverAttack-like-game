// ============================================
// EnemySpider: 撃つ（溜め・狙いの点・破裂する弾）
// ============================================
//
// entities/EnemySpider.js から切り出した（2026-11-25、中身は動かしただけ）。attacker/ と同じく
// **EnemySpider.prototype へ Object.assign で混ぜる前提**のオブジェクトリテラルで、`this` はインスタンス。
// 毎フレームどの順で何を進めるかは EnemySpider.js の update() が唯一の記述。

import {
    SPIDER_HOP_AFTER_FIRE_CHANCE, SPIDER_FIRE_INTERVAL, SPIDER_FIRE_RETRY, SPIDER_FIRE_WINDUP,
    SPIDER_MUZZLE_OFFSET, SPIDER_SHELL_SPEED, SPIDER_SHELL_GRAVITY, SPIDER_SHELL_AIM_ABOVE,
} from '../../utils/Constants.js';
import { hasSupport } from '../../utils/surfaceCrawl.js';
import { solveLaunch, simulateShell } from '../../utils/shellBallistics.js';
import { EnemyBurstShell } from '../EnemyBurstShell.js';

export const SpiderCombat = {
    // ------------------------------------------
    // 撃つ
    // ------------------------------------------
    /**
     * 撃つ準備と発射。予備動作（windup）の間は移動を止めるので true を返す。
     * 面に張り付いていないとき（糸・小ジャンプ・跳び移り・落下）は撃たず、タイマーは 0 で待つ
     */
    _updateFire() {
        if (this.mode === 'windup') {
            if (!hasSupport(this._isSolid(), this._body())) {
                this._startFall();
                return true;
            }
            if (--this.modeTimer > 0) return true;
            // 止まっている間に自機が動いたので、狙いは撃つ瞬間に計算し直す
            const aim = this._aim();
            if (aim) {
                this.game.enemyBullets.push(new EnemyBurstShell(this.game, aim.x, aim.y, aim.angle, aim.target));
                this.fireTimer = SPIDER_FIRE_INTERVAL;
            } else {
                this.fireTimer = SPIDER_FIRE_RETRY;
            }
            // 撃ったら横跳びで離れることがある（ドローンの「撃ったらすぐ離れる」）。乱数は毎回 2 つ引く
            const hopRoll = this.rng.next();
            const dirRoll = this.rng.next();
            if (aim && hopRoll < SPIDER_HOP_AFTER_FIRE_CHANCE) {
                if (dirRoll < 0.5) this._reverse();
                this._startHop();
            } else {
                this._startPause();
            }
            return true;
        }
        if (this.fireTimer > 0) {
            this.fireTimer--;
            return false;
        }
        if (!this.surface || (this.mode !== 'crawl' && this.mode !== 'pause')) return false;
        if (!this._aim()) {
            this.fireTimer = SPIDER_FIRE_RETRY;
            return false;
        }
        this.mode = 'windup';
        this.modeTimer = SPIDER_FIRE_WINDUP;
        return true;
    },

    /**
     * 自機の頭上の点を通る低い弧。撃てない（見えない・遠い・どの高さにも届かない・途中に岩）なら null
     * @returns {{x:number, y:number, angle:number, target:{x:number, y:number, frames:number}}|null}
     */
    _aim() {
        const seen = this._seenPlayer();
        if (!seen) return null;
        const { cx, cy, pcx, pcy } = seen;
        const map = this.game.map;
        const away = this._away();
        const mx = cx + away.x * SPIDER_MUZZLE_OFFSET;
        const my = cy + away.y * SPIDER_MUZZLE_OFFSET;
        const tx = pcx;
        const ty = pcy - SPIDER_SHELL_AIM_ABOVE;
        if (map.isSolidAtPixel(tx, ty)) return null;
        const sol = solveLaunch(tx - mx, ty - my, SPIDER_SHELL_SPEED, SPIDER_SHELL_GRAVITY);
        if (!sol) return null;
        // 弧が途中で岩に当たるなら撃たない（無駄撃ちを避ける。建物は見ない＝当たれば破裂する）
        const pts = simulateShell(mx, my, sol.angle, SPIDER_SHELL_SPEED, SPIDER_SHELL_GRAVITY, sol.frames);
        if (pts.some((q) => map.isSolidAtPixel(q.x, q.y))) return null;
        return { x: mx, y: my, angle: sol.angle, target: { x: tx, y: ty, frames: sol.frames } };
    },
};
