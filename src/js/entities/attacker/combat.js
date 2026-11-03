// ============================================
// EnemyAttacker - 射撃
// ============================================
//
// 撃つかどうかの判断（_handleShooting）と、実際に弾を出す2経路。
// 通常は狙って撃つ（_fire）、基地の緊急防衛中は狙わず widely 撒く（_fireWild）。
//
// **EnemyAttacker.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` はインスタンスを指す（理由は attacker/legs.js の冒頭）。

import {
    TILE_SIZE,
    EMERGENCY_WILD_FIRE_SPREAD, EMERGENCY_WILD_FIRE_INTERVAL_MULT,
    ATTACKER_MG_BURST_COUNT, ATTACKER_MG_BURST_DELAY, ATTACKER_MG_SPREAD,
} from '../../utils/Constants.js';
import { EnemyBullet } from '../EnemyBullet.js';
import { isCrouched } from './stance.js';
import { Missile } from '../Missile.js';
import { Grenade } from '../Grenade.js';
import { EnemyHomingMissile } from '../EnemyHomingMissile.js';
import { audioManager } from '../../audio/AudioManager.js';

export const AttackerCombat = {
    _handleShooting() {
        const target = this._getClosestTarget();

        // Handle crouching and bursting sequence for artillery
        if (this.crouching) {
            this.crouchTimer--;
            if (this.crouchTimer <= 0) {
                this.crouching = false;
                this.burstCount = 4;
                this.burstTimer = 0;
            }
            return;
        }

        if (this.burstCount > 0) {
            this.burstTimer--;
            if (this.burstTimer <= 0) {
                this._fire(target);
                this.burstCount--;
                // artillery は 15 フレームおき、MG 持ちは ATTACKER_MG_BURST_DELAY おき
                this.burstTimer = this.weapon === 'mg' ? ATTACKER_MG_BURST_DELAY : 15;
                if (this.burstCount <= 0) {
                    this.fireTimer = this.config.fireInterval;
                }
            }
            return;
        }

        this.fireTimer--;
        if (this.fireTimer > 0) return;
        if (this.aiState !== 'chase' || !target) {
            // 総攻撃（緊急防衛）中は、自機を見つけていなくても基地の方向へ撃つ。
            // ここを足す前は、通路が無くて基地に辿り着けない敵が壁の前で足踏み
            // したまま一発も撃たない置物になっていた（実機で頻発するとの報告）。
            // 詳しくは _fireWild() のコメント
            if (this.emergencyDefense && this.emergencyTargetBase) {
                this._fireWild();
                this.fireTimer = Math.round(this.config.fireInterval * EMERGENCY_WILD_FIRE_INTERVAL_MULT);
                return;
            }
            this.fireTimer = this.config.fireInterval;
            return;
        }

        // Ready to fire. If artillery, start crouch sequence
        if (this.config.name === 'artillery') {
            this.crouching = true;
            this.crouchTimer = 30; // crouch for half a second before bursting
            return;
        }

        // MG 持ちは連射を始める。弾を出すのは上の burstCount の枝（artillery の
        // 連射と同じ仕組み）。狙いの外れは5発で共有するので、ここで1回だけ引く
        if (this.weapon === 'mg') {
            const accuracy = this.config.aimAccuracy ?? 1.0;
            this.mgAimError = Math.random() > accuracy ? (Math.random() - 0.5) * 1.0 : 0;
            this.burstCount = ATTACKER_MG_BURST_COUNT;
            this.burstTimer = 0;
            return;
        }

        // Normal firing
        this._fire(target);
        this.fireTimer = this.config.fireInterval;
    },

    /**
     * 総攻撃中の「見境なしの発砲」。自機ではなく**基地の方向**へ、
     * EMERGENCY_WILD_FIRE_SPREAD のばらつきを付けて素のミサイルを1発撃つ。
     *
     * **_fire() を使い回さないのは意図的。** あちらの型ごとの分岐のうち、
     * グレネードはここでは逆効果になる（放物線は遠距離へ投げても手前に落ちる
     * だけ）。artillery のホーミングだけは残す（下記）。
     *
     * 基地の方向へ撃つのは絵のためだけではない。**敵の素のミサイルは地形を壊す**
     * （Missile の damageBlock() は自機の弾かどうかを見ていない）ので、
     * 足止めされた敵が自分で壁を掘って基地へ近づけるようになる。
     * ばらつきを付けているのは、同じ線に乗ると掘れる穴が1本の線にしかならず
     * 壁が崩れないため。
     *
     * **artillery だけはホーミングを撃つ**（ユーザー判断。元々ホーミングを撃つ
     * 攻城型なので、総攻撃中も型の個性を残す）。ただし**ホーミングは
     * _avoidObstacles() で壁を迂回するのでほとんど地形を壊さない**＝道を開く役には
     * ならない。artillery 以外が素のミサイルで掘るので、全体としては成立する。
     * **全タイプをホーミングにすると壁が掘れなくなり、この変更の本来の狙い
     * （通路が無くて近寄れない状況の解消）が失われる。**
     *
     * なお、ホーミングでも「自機を狙う」ことにはならない。追尾が始まるのは
     * 発射から 30 フレーム後かつ**自機が 240px 以内にいるとき**だけで
     * （ENEMY_HOMING_MISSILE_DELAY / _ENGAGE_DISTANCE）、それまでは初期角度＝
     * 基地の方向へ直進する。
     */
    _fireWild() {
        const base = this.emergencyTargetBase;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const angle = Math.atan2(
            (base.y + base.height / 2) - cy,
            (base.x + base.width / 2) - cx,
        ) + (Math.random() - 0.5) * 2 * EMERGENCY_WILD_FIRE_SPREAD;

        // 撃つ方を向く。足止めされて vx がほぼ 0 のときは _updateFacing() が
        // 向きを決められず、背中側へ撃っているように見えるため
        this.facingRight = Math.cos(angle) >= 0;

        const muzzleX = cx + Math.cos(angle) * 10;
        const muzzleY = cy + Math.sin(angle) * 6;

        if (this.config.name === 'artillery') {
            this.game.enemyBullets.push(new EnemyHomingMissile(this.game, muzzleX, muzzleY, angle));
            audioManager.playWeapon('homing', muzzleX, muzzleY);
            return;
        }
        const missile = new Missile(this.game, muzzleX, muzzleY, angle, false, this.config.name === 'rival');
        this.game.projectiles.push(missile);
        audioManager.playWeapon('enemyMissile', muzzleX, muzzleY);
    },

    _fire(target) {
        if (!target) return;
        const targetX = target.x + target.width / 2;
        const targetY = target.y + target.height / 2;
        const dx = targetX - (this.x + this.width / 2);
        const dy = targetY - (this.y + this.height / 2);
        let angle = Math.atan2(dy, dx);

        // MG 持ち: 1発ごとに狙い直し（連射中も相手を追う）、外れは連射の頭で引いた
        // ものを使う。総攻撃中の _fireWild() はミサイルのまま ── 地形を壊して
        // 基地へ近づく役は素のミサイルにしか無い（EnemyBullet は地形を掘らない）
        if (this.weapon === 'mg') {
            angle += this.mgAimError + (Math.random() - 0.5) * ATTACKER_MG_SPREAD;
            const mx = this.x + this.width / 2 + Math.cos(angle) * 10;
            const my = this.y + this.height / 2 + Math.sin(angle) * 6;
            // 音は EnemyBullet 自身が鳴らす（Bullet の sound: 'enemyMg'）
            this.game.enemyBullets.push(new EnemyBullet(this.game, mx, my, angle));
            return;
        }

        const accuracy = this.config.aimAccuracy !== undefined ? this.config.aimAccuracy : 1.0;

        if (Math.random() > accuracy) {
            angle += (Math.random() - 0.5) * 1.0;
        }

        const crouchOffset = isCrouched(this) ? 6 : 0;
        const muzzleX = this.x + this.width / 2 + Math.cos(angle) * 10;
        const muzzleY = this.y + this.height / 2 + Math.sin(angle) * 6 + crouchOffset;

        if (this.config.name === 'artillery') {
            // Pathfinding-based initial firing direction
            const path = this._findPathToTarget(target);
            if (path && path.length > 1) {
                // Aim for the first step in the path through the cave
                const nextTile = path[Math.min(path.length - 1, 3)]; // Look ahead slightly
                const dxp = (nextTile.c + 0.5) * TILE_SIZE - muzzleX;
                const dyp = (nextTile.r + 0.5) * TILE_SIZE - muzzleY;
                angle = Math.atan2(dyp, dxp);
            }
            const missile = new EnemyHomingMissile(this.game, muzzleX, muzzleY, angle);
            this.game.enemyBullets.push(missile);
            audioManager.playWeapon('homing', muzzleX, muzzleY);
        } else if (this.config.usesGrenades && Math.random() < this.config.grenadeChance) {
            const grenade = new Grenade(this.game, muzzleX, muzzleY, angle);
            grenade.isPlayerOwned = false;
            this.game.projectiles.push(grenade);
            audioManager.playWeapon('grenade', muzzleX, muzzleY);
        } else {
            const missile = new Missile(this.game, muzzleX, muzzleY, angle, false, this.config.name === 'rival');
            this.game.projectiles.push(missile);
            audioManager.playWeapon('enemyMissile', muzzleX, muzzleY);
        }
    },
};
