// ============================================
// EnemyAttacker - 衝突と移動の解決
// ============================================
//
// 速度を位置へ反映し、マップと他の機体にぶつけて押し戻す。
// 自機（Player）と同じ手順で、横→縦の順に解決する。
//
// **EnemyAttacker.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` はインスタンスを指す（理由は attacker/legs.js の冒頭）。

import { TILE_SIZE, SLOPE_UPHILL_SCALE } from '../../utils/Constants.js';
import {
    checkHorizontalEntityCollision, checkVerticalEntityCollision,
} from '../../utils/Physics.js';

export const AttackerCollision = {
    // ------------------------------------------
    // Physics (Player-style)
    // ------------------------------------------

    _moveAndCollide() {
        const map = this.game.map;
        this._frameStartX = this.x; // 坂の吸着の届く距離（slopeBody.js の _glueDownSlope）

        // --- Horizontal ---
        const xBefore = this.x;
        this.x += this.vx * this.motion.speed;
        // Horizontal Map Collision
        let hitHMap = false;
        if (this._collidesWithMap() && !this._slideAlongSlopeHorizontally()) {
            // 坂（形のあるタイル）なら斜辺の外へ上下に押し出して進む（自機と同じ。slopeBody.js）。
            // 1段なら跳ばずに歩いて乗り上げ、駄目なら壁の面へ吸着して止まる（walkerBody.js、自機と共通）
            if (!this._tryStepUp()) {
                hitHMap = true;
                this._snapToWall(xBefore);
                this._reactToWall();
            }
        }

        // --- Cliff check ---
        // Orb の上に乗っているとき（前のフレームの orbInteractions の standOnOrb が立てる）は見ない。地形しか見ないので
        // Orb の上では前も後ろも崖と読み、毎フレーム向きを変えて降りられなかった。見なければ歩いて前へ降りる
        const onOrb = this.onOrb;
        this.onOrb = false;
        if (this.onGround && !hitHMap && !onOrb) {
            const mType = this.config.movementType;
            const moveDir = this.vx !== 0 ? Math.sign(this.vx) : this.patrolDir;

            const frontX = moveDir > 0
                ? this.x + this.width + 2
                : this.x - 2;
            const feetY = this.y + this.height + 4;
            // 坂を下るときは前の床が足より下がっている（45度なら前までの横の距離ぶん）ので、
            // 4px 下だけを見ると崖と見なして引き返す。形のあるタイルの近くでは体の幅＋余裕まで探す
            const isCliff = this._touchesShapedTile(this.width + 2, this.width + 6)
                ? map.terrainTopY(frontX, this.y + this.height, this.y + this.height + this.width + 6) === null
                : !map.isSolidPoint(frontX, feetY);

            if (isCliff) {
                if (this.aiState === 'patrol') {
                    this.patrolDir *= -1; // Reverse at edge when patrolling naturally
                } else if (this.aiState === 'chase') {
                    const t = this.currentTarget;
                    const targetBelow = t && (t.y > this.y + TILE_SIZE);
                    if (!targetBelow) {
                        // Don't ratchet downhill: hold the ledge unless the target is below
                        this.x -= this.vx * this.motion.speed;
                        this.vx = 0;
                        this.patrolDir *= -1;
                    } else if (mType === 'pace_and_jump') {
                        if (this.jumpCooldown <= 0) this._jump(); // Jump over gap!
                        else this.patrolDir *= -1;
                    }
                    // Other movement types: drop down toward the target below
                }
                // 'return': allow the drop — _climbToward recovers altitude afterwards
            }
        }

        // Horizontal Entity Collision
        if (!hitHMap) {
            this._checkHorizontalEntities();
        }

        // --- Vertical ---
        this.y += this.vy * this.motion.speed;
        this.onGround = false;
        this._prevOnTerrain = this.onTerrain;
        // 接地面が地形か。滑りと雪煙がこれを見る（utils/surface.js）。
        // 他機の頭の上（_checkVerticalEntities）では立てない
        this.onTerrain = false;

        // 着地と天井（坂なら斜辺へ）。walkerBody.js、自機と共通
        this._resolveVerticalMapHit();

        // Vertical Entity Collision
        if (!this.onGround && this.vy > 0) {
            this._checkVerticalEntities();
        }

        // --- Ground probe ---（足元 1px 下。walkerBody.js、自機と共通）
        this._probeFeet();
    },

    /** 壁に当たって止まった。跳べるなら跳び越えにかかり、跳べなければ（巡回・行き来する型は）折り返す */
    _reactToWall() {
        this.vx = 0;
        const mType = this.config.movementType || 'stop_and_shoot';
        // Try to jump over the wall
        if (this.onGround && this.jumpCooldown <= 0) {
            this._jump();
        } else if (this.aiState === 'patrol' || mType === 'pace_and_jump' || mType === 'chase_and_jump') {
            this.patrolDir *= -1; // Reverse patrol direction
        }
    },

    /** 押しても Orb が動かない（orbInteractions が呼ぶ）。壁に当たったときと同じ反応をする（2026-11-03 ユーザー指定） */
    onBlockedByOrb() {
        this._reactToWall();
    },

    _checkHorizontalEntities() {
        checkHorizontalEntityCollision(this, this._buildEntityList(), () => {
            if (this.aiState === 'patrol') this.patrolDir *= -1;
        }, () => this._collidesWithMap());
    },

    _checkVerticalEntities() {
        if (checkVerticalEntityCollision(this, this._buildEntityList(), () => this._collidesWithMap())) {
            this.onGround = true;
        }
    },

    /** Build a list of collideable entities (enemies + active player). */
    _buildEntityList() {
        const list = [...this.game.enemies];
        const player = this.game.player;
        if (player && player.alive && !player.docked) list.push(player);
        return list;
    },

    /**
     * 坂の上の加速（自機の _applySnowSlope と同じ規則。slopeBody.js の _applySlope）。
     *
     * 自機と違い、AI は毎フレーム vx を「こう動きたい」値で上書きするので、坂で足した下りの
     * 速さをそのままにすると次のフレームで消えて積み上がらない（止まった AI が坂で滑り落ちない）。
     * 坂が足した分だけを slopeVx に持ち越して、AI の値に足し直す。上りへ向かう AI は自機の
     * 上り入力と同じく持ち越しを捨て、最高速を SLOPE_UPHILL_SCALE 倍に落とす。
     * 坂の外では持ち越しは 0（平らな雪の上の滑りは _applyGroundSlide の担当）。
     */
    _applyAttackerSlope() {
        const desired = this.vx;
        const held = Math.sign(desired);
        this.vx = desired + this.slopeVx;
        this._applySlope(held, Math.min(Math.abs(desired), this.maxSpeed * SLOPE_UPHILL_SCALE));
        this.slopeVx = (this.slopeDir === 0 || held === this.slopeDir) ? 0 : this.vx - desired;
    },
};
