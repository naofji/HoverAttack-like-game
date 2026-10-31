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
    collidesWithTerrain, checkHorizontalEntityCollision, checkVerticalEntityCollision, wallSnapX,
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
            // STEP-UP: walk up a single tile instead of jumping (matches Player)
            let steppedUp = false;
            if (this.onGround && Math.abs(this.vx) > 0) {
                const originalY = this.y;
                this.y -= TILE_SIZE;
                if (!this._collidesWithMap()) {
                    steppedUp = true;
                } else {
                    this.y = originalY;
                }
            }

            if (!steppedUp) {
                hitHMap = true;
                // 壁の面へ吸着（動く前の位置から求めると、2px/フレームより速いと1タイル離れる。utils/Physics.js）
                if (this.vx !== 0) this.x = wallSnapX(this.x, this.width, this.vx);
                else this.x -= this.vx * this.motion.speed;
                this._undoSnapIntoRock('x', xBefore);
                this.vx = 0;

                const mType = this.config.movementType || 'stop_and_shoot';
                // Try to jump over the wall
                if (this.onGround && this.jumpCooldown <= 0) {
                    this._jump();
                } else if (this.aiState === 'patrol' || mType === 'pace_and_jump' || mType === 'chase_and_jump') {
                    this.patrolDir *= -1; // Reverse patrol direction
                }
            }
        }

        // --- Cliff check ---
        if (this.onGround && !hitHMap) {
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

        if (this._collidesWithMap()) {
            const yBefore = this.y - this.vy * this.motion.speed;
            if (this.vy > 0) {
                // Landing（坂なら斜辺へ。slopeBody.js）
                if (!this._landOnSlope()) {
                    this.y = Math.floor((this.y + this.height) / TILE_SIZE) * TILE_SIZE - this.height;
                    this._undoSnapIntoRock('y', yBefore);
                }
                this.onGround = true;
                this.onTerrain = true;
                this.walkFrame = 2;
            } else if (this.vy < 0) {
                // Hit ceiling（天井の斜面なら沿って流れる。slopeBody.js）
                if (!this._hitCeilingSlope()) {
                    this.y = Math.ceil(this.y / TILE_SIZE) * TILE_SIZE + 0.01;
                    this._undoSnapIntoRock('y', yBefore);
                }
            }
            this.vy = 0;
        }

        // Vertical Entity Collision
        if (!this.onGround && this.vy > 0) {
            this._checkVerticalEntities();
        }

        // --- Ground probe ---
        // 坂を下るときは落下を待たずに斜辺へ下ろす（slopeBody.js）
        if (this._glueDownSlope(this._prevOnTerrain)) return;
        if (!this.onGround && this.vy >= 0 && this.vy < 0.5) {
            const probeY = this.y + this.height + 1;
            const leftFoot = map.isSolidPoint(this.x + 4, probeY);
            const rightFoot = map.isSolidPoint(this.x + this.width - 4, probeY);
            if (leftFoot || rightFoot) {
                this.onGround = true;
                this.onTerrain = true;
                this.vy = 0;
                if (!this._settleOnSlope()) {
                    this.y = Math.floor(probeY / TILE_SIZE) * TILE_SIZE - this.height;
                }
            }
        }
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

    _collidesWithMap() {
        return collidesWithTerrain(this, this.game.map);
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
