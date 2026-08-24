// ============================================
// EnemyAttacker - 移動と戦術判断
// ============================================
//
// 歩行・向き・帰投・上昇（ホバー燃料の使い方）と、索敵・射線の見立て・
// 遮蔽への回り込み・追跡・経路探索。update() から呼ばれる側。
//
// 「動き方」と「どこへ動くか」が交互に並んでいるが、両者は同じフレームで
// 行き来する（例: _chaseTarget が _climbToward を呼ぶ）ので分けていない。
//
// **EnemyAttacker.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` はインスタンスを指す（理由は attacker/legs.js の冒頭）。

import {
    TILE_SIZE, HOVER_FUEL_CONSUMPTION,
    ATTACKER_RETURN_TRIGGER_Y, ATTACKER_RETURN_TRIGGER_X, ATTACKER_RETURN_DONE,
    ATTACKER_CLIMB_MIN_FUEL, ATTACKER_CLIMB_MAX_RISE,
    ATTACKER_SLOW_RISE_CAP, ATTACKER_BOOST_MAX_FRAMES,
    RIVAL_ALIGN_THRESHOLD, RIVAL_ALIGN_TRIGGER_FRAMES,
    RIVAL_EVADE_OFFSET_MIN, RIVAL_EVADE_OFFSET_MAX, RIVAL_EVADE_DURATION,
    ATTACKER_COVER_CHECK_INTERVAL, ATTACKER_COVER_SCAN_TILES, ATTACKER_COVER_MIN_DIST,
    EMERGENCY_DEFENSE_SPEED_MULT,
    SMOKE_COOLDOWN,
} from '../../utils/Constants.js';
import { hasLineOfSight } from '../../utils/Physics.js';
import { audioManager } from '../../audio/AudioManager.js';

export const AttackerMovement = {
    /** Apply movement velocity for the current frame. */
    _updateMovement(target) {
        if (this.crouching || this.burstCount > 0) {
            this.vx = 0;
        } else if (this.aiState === 'chase') {
            this._chaseTarget(target);
        } else if (this.aiState === 'return') {
            this._climbToward(this.homeX, this.homeY);
        } else {
            this._patrol();
        }
    },

    /** Update facing direction based on velocity and AI target. */
    _updateFacing(target) {
        if (this.vx > 0.1) this.facingRight = true;
        else if (this.vx < -0.1) this.facingRight = false;

        // Face the target when chasing (overrides velocity-based facing)
        if (this.aiState === 'chase' && target) {
            this.facingRight = (target.x + target.width / 2) > (this.x + this.width / 2);
        }
    },

    /** Advance the walk animation frame. */
    _updateWalkAnimation() {
        if (this.onGround && Math.abs(this.vx) > 0.3) {
            this.walkTimer++;
            if (this.walkTimer >= 5) {
                this.walkTimer = 0;
                const forward = (this.facingRight && this.vx > 0) || (!this.facingRight && this.vx < 0);
                this.walkFrame = forward
                    ? (this.walkFrame + 1) % 4
                    : (this.walkFrame - 1 + 4) % 4;
            }
        } else {
            this.walkFrame = 2;
            this.walkTimer = 0;
        }
    },

    // ------------------------------------------
    // AI
    // ------------------------------------------

    /** Hysteresis: start returning when far below/away from home, stop when back. */
    _updateReturnState() {
        const dxHome = this.homeX - this.x;
        const dyHome = this.homeY - this.y;
        if (!this.returning) {
            if (dyHome < -ATTACKER_RETURN_TRIGGER_Y || Math.abs(dxHome) > ATTACKER_RETURN_TRIGGER_X) {
                this.returning = true;
            }
        } else if (Math.abs(dxHome) <= ATTACKER_RETURN_DONE && Math.abs(dyHome) <= ATTACKER_RETURN_DONE) {
            this.returning = false;
        }
    },

    /**
     * Apply one frame of aerial thrust according to this type's climbStyle.
     * 'jump'  — only extends an ascent (vy < 0), capped at ATTACKER_SLOW_RISE_CAP: never floats.
     * 'boost' — only during ascent, at most ATTACKER_BOOST_MAX_FRAMES per airborne leg.
     * 'hover' — free thrust (may reverse a fall). Call only while airborne.
     * @returns {boolean} true if thrust was applied this frame
     */
    _applyAerialThrust(riseCap) {
        if (this.hoverFuel <= 0) return false;

        const style = this.config.climbStyle || 'hover';
        let cap = riseCap;
        if (style === 'jump') {
            if (this.vy >= 0) return false;
            cap = Math.max(cap, ATTACKER_SLOW_RISE_CAP);
        } else if (style === 'boost') {
            if (this.vy >= 0 || this.boostFrames <= 0) return false;
        }
        if (this.vy <= cap) return false; // preserve jump impulse / already at cap

        if (style === 'boost') this.boostFrames--;
        this.hovering = true;
        this.vy -= this.config.climbThrust;
        this.hoverFuel -= HOVER_FUEL_CONSUMPTION;
        if (this.vy < cap) this.vy = cap;
        return true;
    },

    /**
     * Move toward (targetX, targetY) using walk + jump + hover thrust.
     * Climbs in legs: waits on the ground for fuel, ascends, falls to recover, repeats.
     */
    _climbToward(targetX, targetY) {
        const dx = targetX - this.x;
        // Overshoot 8px so ledge lips can be cleared before thrust cuts out
        const below = this.y > targetY - 8;
        // Only jump-climb for gaps taller than a single walkable step; 1-tile
        // gaps are now handled by _moveAndCollide's step-up (walk, don't jump).
        const needsJumpClimb = this.y > targetY + TILE_SIZE;

        // Defenders rush to the base with urgency. When emergency defense is active
        // every _climbToward call targets the base, so the boost never leaks into the
        // normal return-to-spawn path (which only runs while defense is inactive).
        const speed = this.emergencyDefense
            ? this.maxSpeed * EMERGENCY_DEFENSE_SPEED_MULT
            : this.maxSpeed;
        if (Math.abs(dx) > 8) {
            this.vx = dx > 0 ? speed : -speed;
        } else {
            this.vx = 0;
        }

        if (this.onGround) {
            // Wait on the ground until there is enough fuel for a climb leg
            if (needsJumpClimb && this.hoverFuel >= ATTACKER_CLIMB_MIN_FUEL && this.jumpCooldown <= 0) {
                this._jump();
            }
        } else if (below) {
            this._applyAerialThrust(ATTACKER_CLIMB_MAX_RISE);
        }
    },

    _getClosestTarget() {
        // Evaluate player and carrier to find the primary target
        const player = this.game.player;
        const carrier = this.game.carrier;

        // If player is docked, target the carrier instead
        if (player && player.alive && player.docked && carrier && carrier.alive) {
            return carrier;
        }

        let target = null;
        let minDist = Infinity;

        // Check player
        if (player && player.alive && !player.docked) {
            const d = this._distToTarget(player);
            if (d < minDist) {
                minDist = d;
                target = player;
            }
        }

        // Check carrier
        if (carrier && carrier.alive) {
            const d = this._distToTarget(carrier);
            if (d < minDist) {
                target = carrier;
            }
        }

        return target;
    },

    _distToTarget(target) {
        if (!target) return Infinity;
        const dx = (target.x + target.width / 2) - (this.x + this.width / 2);
        const dy = (target.y + target.height / 2) - (this.y + this.height / 2);
        return Math.sqrt(dx * dx + dy * dy);
    },

    _patrol() {
        this.vx = this.patrolDir * this.maxSpeed * 0.5; // Walk slowly when patrolling
    },

    /**
     * Alignment avoidance: never share the target's X or Y axis for long.
     * Returns true while an evade maneuver is driving the movement.
     */
    _updateAlignmentAvoidance(dx, dy, targetX) {
        if (Math.abs(dx) < RIVAL_ALIGN_THRESHOLD) this.alignXFrames++; else this.alignXFrames = 0;
        if (Math.abs(dy) < RIVAL_ALIGN_THRESHOLD) this.alignYFrames++; else this.alignYFrames = 0;

        if (this.evadeTimer <= 0 &&
            (this.alignXFrames > RIVAL_ALIGN_TRIGGER_FRAMES || this.alignYFrames > RIVAL_ALIGN_TRIGGER_FRAMES)) {
            const range = RIVAL_EVADE_OFFSET_MAX - RIVAL_EVADE_OFFSET_MIN;
            const offset = RIVAL_EVADE_OFFSET_MIN + Math.random() * range;
            // 退避先は「いま自分が居る側」に取る。左右を乱数で決めていたころは、
            // 反対側が当たると目標へ向かう経路が自機を突っ切り、evadeDuration
            // （heavy は90フレーム）のあいだ張り付いてしまっていた。
            // 実測では 900フレーム中 163〜340フレームを 60px 以内で過ごし、
            // 最接近 12.7px と自機にめり込んでいた（heavy の
            // 'keeps its standoff distance' テストが 0.65% の確率で落ちる原因）。
            // 同じ側でも targetX から 60〜120px 離れるので、軸をずらすという
            // 退避の目的は変わらず果たせる。
            // dx = targetX - 自分の中心 なので、-dx が「自分が居る側」。
            // 完全に重なっているときだけ決められないので、そこは乱数に落とす。
            const side = Math.sign(-dx) || (Math.random() < 0.5 ? -1 : 1);
            this.evadeGoalX = targetX + side * offset;
            if (this.alignYFrames > RIVAL_ALIGN_TRIGGER_FRAMES) {
                // Break Y alignment: climb, or drop if airborne and the coin says so
                this.evadeVertical = (!this.onGround && Math.random() < 0.5) ? 1 : -1;
            } else {
                this.evadeVertical = 0;
            }
            this.evadeTimer = this.config.evadeDuration || RIVAL_EVADE_DURATION;
            this.alignXFrames = 0;
            this.alignYFrames = 0;
        }

        if (this.evadeTimer > 0) {
            this.evadeTimer--;
            const cx = this.x + this.width / 2;
            this.vx = this.evadeGoalX > cx ? this.maxSpeed : -this.maxSpeed;
            if (this.evadeVertical === -1) {
                if (this.onGround && this.jumpCooldown <= 0) this._jump();
                else if (!this.onGround) this._applyAerialThrust(-4.0);
            }
            // evadeVertical === +1: no thrust — gravity drops us out of alignment
            return true;
        }
        return false;
    },

    /** Artillery: hold a position where terrain blocks the target's line of sight. */
    _updateCoverSeek(targetX, targetY) {
        const map = this.game.map;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;

        if (Math.abs(targetX - cx) < ATTACKER_COVER_MIN_DIST) {
            // Too close: let skirmish's retreat drive the movement
            this.coverGoalX = null;
            this.inCover = false;
            return;
        }

        this.coverCheckTimer--;
        if (this.coverCheckTimer <= 0) {
            this.coverCheckTimer = ATTACKER_COVER_CHECK_INTERVAL;
            if (!hasLineOfSight(cx, cy, targetX, targetY, map)) {
                this.inCover = true;
                this.coverGoalX = null;
            } else {
                // ここが「自機に見つかった瞬間」。遮蔽を探し直す前に煙を張り、
                // 移動そのものを隠す。新しい状態を足さずに済むのは、この後の
                // coverGoalX へ歩く経路がそのまま「煙に隠れての移動」になるため。
                //
                // ガードなしで毎回呼ぶ。this.inCover はこの時点ではまだ「前回の」
                // 判定値なので、「隠れていた→露出した」の遷移を検出しようとすると
                // 1回（ATTACKER_COVER_CHECK_INTERVAL ぶん）遅れてしまい、しかも
                // 「露出しっぱなし」のケースの方が毎回発煙してしまう（意図と逆）。
                // 連発防止は smokeCooldown（480 tick）が担うので、ここでは
                // 「露出と判定した回」に単純に撒けばよい。
                this._popSmoke();
                this.inCover = false;
                this.coverGoalX = this._findCoverX(targetX, targetY);
            }
        }

        if (this.inCover) {
            this.vx = 0; // hold the sniping spot
        } else if (this.coverGoalX !== null) {
            if (Math.abs(this.coverGoalX - cx) <= 4) {
                this.coverGoalX = null; // arrived — next check confirms cover
            } else {
                this.vx = this.coverGoalX > cx ? this.maxSpeed : -this.maxSpeed;
            }
        }
        // No cover found: leave skirmish pacing untouched
    },

    /** 煙幕を張る。usesSmoke を持つ型（artillery）だけ。 */
    _popSmoke() {
        if (!this.config.usesSmoke) return;
        if (this.smokeCooldown > 0) return;

        this.game.spawnSmokeScreen(this.x + this.width / 2, this.y + this.height / 2);
        this.smokeCooldown = SMOKE_COOLDOWN;
    },

    /** Scan +/-ATTACKER_COVER_SCAN_TILES for the nearest LOS-breaking spot with ground and range. */
    _findCoverX(targetX, targetY) {
        const map = this.game.map;
        const cy = this.y + this.height / 2;
        const feetY = this.y + this.height + 4;
        const cx = this.x + this.width / 2;

        for (let t = 1; t <= ATTACKER_COVER_SCAN_TILES; t++) {
            for (const dir of [-1, 1]) {
                const candX = cx + dir * t * TILE_SIZE;
                if (candX < 0 || candX >= map.cols * TILE_SIZE) continue;          // stay in bounds (map edges read as solid)
                if (!map.isSolidAtPixel(candX, feetY)) continue;                    // needs ground
                if (Math.abs(targetX - candX) < ATTACKER_COVER_MIN_DIST) continue;  // keep range
                if (hasLineOfSight(candX, cy, targetX, targetY, map)) continue;     // must break LOS
                return candX;
            }
        }
        return null;
    },

    _chaseTarget(target) {
        if (!target) return;
        // Aim for the center of the target
        const targetX = target.x + target.width / 2;
        const targetY = target.y + target.height / 2;
        const dx = targetX - (this.x + this.width / 2);
        const dy = targetY - (this.y + this.height / 2);

        const mType = this.config.movementType || 'stop_and_shoot';

        // Alignment avoidance (rival, heavy): overrides normal movement while evading
        if (this.config.avoidsAlignment && this._updateAlignmentAvoidance(dx, dy, targetX)) {
            return;
        }

        if (mType === 'stop_and_shoot') {
            if (Math.abs(dx) > 16) {
                this.vx = dx > 0 ? this.maxSpeed : -this.maxSpeed;
            } else {
                this.vx = 0;
            }
            if (this.onGround && this.jumpCooldown <= 0 && dy < -16) {
                this._jump();
            }
        }
        else if (mType === 'pace_and_jump') {
            this.vx = this.patrolDir * this.maxSpeed;
            if (Math.random() < 0.02) { // 2% chance to turn toward player each frame
                this.patrolDir = dx > 0 ? 1 : -1;
            }
        }
        else if (mType === 'chase_and_jump') {
            const preferredDist = 140; // Maintain this horizontal distance
            const distTolerance = 30;  // Range: 110 - 170
            const absDx = Math.abs(dx);

            if (absDx > preferredDist + distTolerance) {
                // Too far: approach aggressively
                this.patrolDir = dx > 0 ? 1 : -1;
                this.vx = this.patrolDir * this.maxSpeed;
            } else if (absDx < preferredDist - distTolerance) {
                // Too close: retreat to safety
                this.patrolDir = dx > 0 ? -1 : 1;
                this.vx = this.patrolDir * this.maxSpeed;
            } else {
                // Within optimal skirmish range: pace and circle
                if (Math.random() < 0.02) { // 2% chance to switch pacing direction
                    this.patrolDir *= -1;
                }
                this.vx = this.patrolDir * this.maxSpeed * 0.8; // Pace slightly slower
            }

            if (this.onGround) {
                if (this.jumpCooldown <= 0) {
                    // Jump if target is high, or occasionally to stay unpredictable
                    if (dy < -16 || Math.random() < 0.03) {
                        this._jump();
                    }
                }
            } else {
                // Airborne: hover if player is above or to stay in the air while skirmishing
                if (dy < -8 || (this.vy > 0 && Math.random() * 1.5 < 0.1)) {
                    this._applyAerialThrust(-4.0);
                }
            }
        }
        else if (mType === 'skirmish') {
            const preferredDist = 200; // Farther preferred distance for artillery
            const distTolerance = 40;
            const absDx = Math.abs(dx);

            if (absDx > preferredDist + distTolerance) {
                // Too far: approach cautiously
                this.patrolDir = dx > 0 ? 1 : -1;
                this.vx = this.patrolDir * this.maxSpeed;
            } else if (absDx < preferredDist - distTolerance) {
                // Too close: retreat quickly
                this.patrolDir = dx > 0 ? -1 : 1;
                this.vx = this.patrolDir * this.maxSpeed * 1.2;
            } else {
                // Within optimal range: pace and "circle"
                if (Math.random() < 0.01) { // Occasionally switch pacing
                    this.patrolDir *= -1;
                }
                this.vx = this.patrolDir * this.maxSpeed * 0.7;

                // "Circling" effect: occasionally jump or hover even if target isn't high
                // (suppressed while in cover — a stray hop would pop it back into sight)
                if (this.onGround && !this.inCover && Math.random() < 0.01) {
                    this._jump();
                }
            }

            // Vertical movement support (suppressed while holding a sniping spot —
            // climbing toward the target's height would lift it back into their line of sight)
            if (!this.inCover) {
                if (this.onGround) {
                    if (this.jumpCooldown <= 0 && dy < -32) {
                        this._jump();
                    }
                } else {
                    // Use hover to stay at a certain height or prolong jumps
                    if (dy < -16 || (this.vy > 0 && Math.random() < 0.05)) {
                        this._applyAerialThrust(-3.0);
                    }
                }
            }

            if (this.config.seeksCover) {
                this._updateCoverSeek(targetX, targetY);
            }
        }
        else if (mType === 'zigzag_chase') {
            const absDx = Math.abs(dx);
            const preferredDist = 80; // Try to get closer than artillery

            // Primary direction bias
            let moveDir = dx > 0 ? 1 : -1;

            // Zigzag oscillation (switch direction bias using sine wave)
            const zigzagPhase = Math.sin(this.frameCounter * 0.15);

            if (absDx > preferredDist + 20) {
                // Approaching: combine bias with oscillation
                this.vx = (moveDir * 0.7 + zigzagPhase * 0.5) * this.maxSpeed;
            } else if (absDx < preferredDist - 20) {
                // Too close: retreat with zigzag
                this.vx = (-moveDir * 0.8 + zigzagPhase * 0.4) * this.maxSpeed;
            } else {
                // In range: focus more on zigzagging to dodge
                this.vx = zigzagPhase * this.maxSpeed;
            }

            // High frequency jumping/hovering for rivals
            if (this.onGround) {
                if (this.jumpCooldown <= 0 && (dy < -16 || Math.random() < 0.02)) {
                    this._jump();
                }
            } else {
                if (dy < -8 || Math.random() < 0.1) {
                    this._applyAerialThrust(-4.0);
                }
            }
        }

        // --- Vertical pursuit for types without their own hover logic ---
        if ((mType === 'stop_and_shoot' || mType === 'pace_and_jump') && dy < -32) {
            if (this.onGround) {
                if (this.jumpCooldown <= 0 && this.hoverFuel >= ATTACKER_CLIMB_MIN_FUEL) {
                    this._jump();
                }
            } else {
                this._applyAerialThrust(ATTACKER_CLIMB_MAX_RISE);
            }
        }
    },

    _jump() {
        this.vy = this.jumpForce;
        this.onGround = false;
        this.jumpCooldown = 60; // ~1 second cooldown
        audioManager.playEnemyBurst(this.x + this.width / 2, this.y + this.height / 2);
    },

    _findPathToTarget(target) {
        if (!target) return null;
        const map = this.game.map;
        const start = map.pixelToTile(this.x + this.width / 2, this.y + this.height / 2);
        const end = map.pixelToTile(target.x + target.width / 2, target.y + target.height / 2);

        if (start.r === end.r && start.c === end.c) return null;

        const queue = [[start]];
        const visited = new Set([`${start.r},${start.c}`]);

        let iterations = 0;
        const maxIterations = 300;

        while (queue.length > 0 && iterations < maxIterations) {
            iterations++;
            const path = queue.shift();
            const curr = path[path.length - 1];

            if (curr.r === end.r && curr.c === end.c) {
                return path;
            }

            // Neighbor directions
            const dirs = [
                { r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 },
                { r: -1, c: -1 }, { r: -1, c: 1 }, { r: 1, c: -1 }, { r: 1, c: 1 }
            ];

            for (const d of dirs) {
                const nr = curr.r + d.r;
                const nc = curr.c + d.c;
                const key = `${nr},${nc}`;

                if (nr >= 0 && nr < map.rows && nc >= 0 && nc < map.cols &&
                    !map.isSolid(nr, nc) && !visited.has(key)) {
                    visited.add(key);
                    queue.push([...path, { r: nr, c: nc }]);
                }
            }
        }
        return null;
    },
};
