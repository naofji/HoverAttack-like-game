// ============================================
// EnemyAttacker - 衝突と移動の解決
// ============================================
//
// 速度を位置へ反映し、マップと他の機体にぶつけて押し戻す。
// 自機（Player）と同じ手順で、横→縦の順に解決する。
//
// **EnemyAttacker.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` はインスタンスを指す（理由は attacker/legs.js の冒頭）。

import { TILE_SIZE } from '../../utils/Constants.js';
import {
    collidesWithMap, checkHorizontalEntityCollision, checkVerticalEntityCollision,
} from '../../utils/Physics.js';

export const AttackerCollision = {
    // ------------------------------------------
    // Physics (Player-style)
    // ------------------------------------------

    _moveAndCollide() {
        const map = this.game.map;

        // --- Horizontal ---
        this.x += this.vx;
        // Horizontal Map Collision
        let hitHMap = false;
        if (this._collidesWithMap()) {
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
                this.x -= this.vx;
                if (this.vx > 0) {
                    this.x = Math.floor((this.x + this.width) / TILE_SIZE) * TILE_SIZE - this.width - 0.02;
                } else if (this.vx < 0) {
                    this.x = Math.ceil(this.x / TILE_SIZE) * TILE_SIZE + 0.02;
                }
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

            if (!map.isSolidAtPixel(frontX, feetY)) {
                if (this.aiState === 'patrol') {
                    this.patrolDir *= -1; // Reverse at edge when patrolling naturally
                } else if (this.aiState === 'chase') {
                    const t = this.currentTarget;
                    const targetBelow = t && (t.y > this.y + TILE_SIZE);
                    if (!targetBelow) {
                        // Don't ratchet downhill: hold the ledge unless the target is below
                        this.x -= this.vx;
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
        this.y += this.vy;
        this.onGround = false;

        if (this._collidesWithMap()) {
            if (this.vy > 0) {
                // Landing
                this.y = Math.floor((this.y + this.height) / TILE_SIZE) * TILE_SIZE - this.height;
                this.onGround = true;
                this.walkFrame = 2;
            } else if (this.vy < 0) {
                // Hit ceiling
                this.y = Math.ceil(this.y / TILE_SIZE) * TILE_SIZE + 0.01;
            }
            this.vy = 0;
        }

        // Vertical Entity Collision
        if (!this.onGround && this.vy > 0) {
            this._checkVerticalEntities();
        }

        // --- Ground probe ---
        if (!this.onGround && this.vy >= 0 && this.vy < 0.5) {
            const probeY = this.y + this.height + 1;
            const leftFoot = map.isSolidAtPixel(this.x + 4, probeY);
            const rightFoot = map.isSolidAtPixel(this.x + this.width - 4, probeY);
            if (leftFoot || rightFoot) {
                this.onGround = true;
                this.vy = 0;
                this.y = Math.floor(probeY / TILE_SIZE) * TILE_SIZE - this.height;
            }
        }
    },

    _checkHorizontalEntities() {
        checkHorizontalEntityCollision(this, this._buildEntityList(), () => {
            if (this.aiState === 'patrol') this.patrolDir *= -1;
        });
    },

    _checkVerticalEntities() {
        if (checkVerticalEntityCollision(this, this._buildEntityList())) {
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
        return collidesWithMap(this, this.game.map);
    },
};
