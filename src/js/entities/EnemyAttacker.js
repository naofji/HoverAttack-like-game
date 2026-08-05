// ============================================
// EnemyAttacker - Humanoid enemy robot (3 types)
// ============================================

import {
    TILE_SIZE, GRAVITY, AIR_FRICTION,
    PLAYER_WIDTH, PLAYER_HEIGHT,
    PLAYER_MAX_FALLING_SPEED,
    HOVER_MAX_FUEL, HOVER_FUEL_CONSUMPTION, HOVER_FUEL_RECOVERY,
    MISSILE_SPEED, EXPLOSION_PARTICLE_COUNT,
    ATTACKER_RETURN_TRIGGER_Y, ATTACKER_RETURN_TRIGGER_X,
    ATTACKER_RETURN_DONE, ATTACKER_CLIMB_MIN_FUEL, ATTACKER_CLIMB_MAX_RISE,
    ATTACKER_SLOW_RISE_CAP, ATTACKER_BOOST_MAX_FRAMES,
    RIVAL_ALIGN_THRESHOLD, RIVAL_ALIGN_TRIGGER_FRAMES,
    RIVAL_EVADE_OFFSET_MIN, RIVAL_EVADE_OFFSET_MAX, RIVAL_EVADE_DURATION,
    ATTACKER_COVER_CHECK_INTERVAL, ATTACKER_COVER_SCAN_TILES, ATTACKER_COVER_MIN_DIST,
    EMERGENCY_DEFENSE_BASE_RADIUS, EMERGENCY_DEFENSE_SPEED_MULT, EMERGENCY_DEFENSE_SIGHT_RANGE
} from '../utils/Constants.js';
import { collidesWithMap, checkHorizontalEntityCollision, checkVerticalEntityCollision, hasLineOfSight } from '../utils/Physics.js';
import { Missile } from './Missile.js';
import { Grenade } from './Grenade.js';
import { EnemyHomingMissile } from './EnemyHomingMissile.js';
import { RepairKit } from './RepairKit.js';
import { AutoAimUnit } from './AutoAimUnit.js';
import { MissileKit } from './MissileKit.js';
import { attackerBodyParts, attackerLegParts } from './debris/attackerParts.js';
import { MACHINE_EXPLOSION_OPTS } from './Particle.js';

/**
 * 型別の脚描画パラメータ（描画専用なので Constants.js には置かない）。
 * rival は「プレイヤーと対等な好敵手」なので standard = プレイヤーと同じ値を共有する。
 */
const LEG_STYLES = {
    standard: {
        hipFar: 7, hipNear: 10, lineWidth: 3,
        footW: 5, footH: 2, strideScale: 1,
        maxSwing: Math.PI / 4, phaseOffset: 0.2,
        crouchSpread: 3, thighPlate: false,
    },
    rival: {
        hipFar: 7, hipNear: 10, lineWidth: 3,
        footW: 5, footH: 2, strideScale: 1,
        maxSwing: Math.PI / 4, phaseOffset: 0.2,
        crouchSpread: 3, thighPlate: false,
    },
    heavy: {
        hipFar: 6, hipNear: 11, lineWidth: 4,
        footW: 6, footH: 3, strideScale: 0.7,
        maxSwing: Math.PI / 6, phaseOffset: 0.15,
        crouchSpread: 5, thighPlate: true,
    },
    artillery: {
        hipFar: 7, hipNear: 10, lineWidth: 3,
        footW: 4, footH: 2, strideScale: 1,
        maxSwing: (25 * Math.PI) / 180, phaseOffset: 0.2,
        crouchSpread: 3, thighPlate: false,
        // 腿は赤、下腿は腿より太く（手前脚/奥脚で明度を変えて奥行きを出す）
        shinWidth: 4,
        thighNear: '#DD3322', thighFar: '#992222',
    },
};

/** 歩行4フレーム → 手前脚/奥脚のポーズ番号（Player の WALK_POSES と同じ割り当て）。 */
const WALK_FRAME_POSES = [
    { near: 0, far: 1 },
    { near: 2, far: 3 },
    { near: 2, far: 2 }, // 直立・停止時
    { near: 3, far: 2 },
];

/**
 * ポーズ番号 → 股関節からの相対座標（膝 kdx/kdy、足首 fdx/fdy）。
 * Player._drawSingleLeg の switch から移植したもの。
 */
const LEG_POSES = [
    { kdx: 2, kdy: 3, fdx: 4, fdy: 6 },
    { kdx: -3, kdy: 3, fdx: -5, fdy: 4 },
    { kdx: 0, kdy: 3, fdx: 0, fdy: 6 },
    { kdx: 4, kdy: 1, fdx: 3, fdy: 3 },
];

/** 空中で股関節を中心に回転させる基準ポーズ（Player._drawSingleLeg 準拠）。 */
const AIR_BASE_POSE = {
    near: { kdx: 1, kdy: 3, fdx: 0, fdy: 6 },
    far: { kdx: -1, kdy: 3, fdx: -2, fdy: 6 },
};

/**
 * artillery の4脚。並びは [手前前脚, 奥前脚, 手前後脚, 奥後脚]。
 * group A = 手前前脚 + 奥後脚 / group B = 奥前脚 + 手前後脚 の対角トロット。
 * reach は股関節からの足先の水平到達距離（前脚が正、後脚が負）。
 */
const SPIDER_LEGS = [
    { hipX: 14, reach: 5, isNear: true, group: 0 },
    { hipX: 11, reach: 4, isNear: false, group: 1 },
    { hipX: 7, reach: -4, isNear: true, group: 1 },
    { hipX: 4, reach: -5, isNear: false, group: 0 },
];

/**
 * 参照フレーム → 足先の前後スイープ量。
 * 半周期ずらすと符号が反転する（sweep[(p+2)%4] === -sweep[p]）ので、
 * group A / B が常に逆位相になる。frame 2 は両グループとも 0 = 停止時の中立ポーズ。
 */
const SPIDER_SWEEP = [0, 2, 0, -2];

/**
 * 参照フレーム → 遊脚相の足上げ量。
 * group A は walkFrame 3、group B は walkFrame 1 で持ち上がり、同時には浮かない
 * （＝常に2本以上が接地する）。
 */
const SPIDER_LIFT = [0, 0, 0, 2];

/** 膝の跳ね上げ量（股関節より上）と足首の下がり量。 */
const SPIDER_KNEE_RISE = 4;
const SPIDER_FOOT_DROP = 6;

export class EnemyAttacker {
    constructor(game, x, y, config) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = PLAYER_WIDTH;   // Same size as player (16px)
        this.height = PLAYER_HEIGHT; // Same size as player (24px)
        this.vx = 0;
        this.vy = 0;
        this.alive = true;
        this.onGround = false;

        // Config-driven stats
        this.config = config;
        this.hp = config.hp;
        this.maxHp = this.hp;
        this.maxSpeed = config.speed;
        this.jumpForce = config.jumpForce;
        this.score = config.score;

        // AI state
        this.facingRight = Math.random() < 0.5;
        this.patrolDir = this.facingRight ? 1 : -1;
        this.fireTimer = Math.floor(Math.random() * config.fireInterval);
        this.aiState = 'patrol'; // 'patrol', 'chase' or 'return'
        this.jumpCooldown = 0;

        // Home position (spawn point) — the attacker returns here when displaced
        this.homeX = x;
        this.homeY = y;
        this.returning = false;
        this.currentTarget = null;
        this.boostFrames = ATTACKER_BOOST_MAX_FRAMES;

        // Emergency base-defense state: when the boss base is attacked (mission 2+),
        // attackers rush to and guard the base. The redirected home reuses the
        // return/patrol/chase machine (see setEmergencyDefense).
        this.emergencyDefense = false;
        this.emergencyTargetBase = null;
        this._spawnHomeX = x; // real spawn home, restored when defense ends
        this._spawnHomeY = y;

        // Rival alignment-avoidance state
        this.alignXFrames = 0;
        this.alignYFrames = 0;
        this.evadeTimer = 0;
        this.evadeGoalX = 0;
        this.evadeVertical = 0; // -1 = go up, +1 = drop, 0 = horizontal only

        // Artillery cover-seeking state
        this.coverCheckTimer = 0;
        this.coverGoalX = null;
        this.inCover = false;

        // Animation & State
        this.walkFrame = 2;
        this.walkTimer = 0;
        this.hovering = false;
        this.crouching = false;
        this.crouchTimer = 0;
        this.burstCount = 0;
        this.burstTimer = 0;

        // Hover fuel support (used if movementType allows hovering)
        this.hoverFuel = HOVER_MAX_FUEL;
        this.frameCounter = Math.floor(Math.random() * 100);
    }

    /**
     * Toggle emergency base-defense mode (called by EnemyBase/Game when the boss
     * base is attacked on mission 2+). Rather than a new aiState, this redirects the
     * unit's "home" to a spread-out point around the base: the existing
     * return -> patrol -> chase machine then makes it rush in, guard the perimeter,
     * and engage any player that comes within the (widened) sight range.
     * @param {boolean} active
     * @param {{x:number,y:number,width:number,height:number}} [targetBase]
     */
    setEmergencyDefense(active, targetBase = null) {
        if (active) {
            if (!targetBase) return;
            if (!this.emergencyDefense) {
                // Capture the real spawn home once, on first activation.
                this._spawnHomeX = this.homeX;
                this._spawnHomeY = this.homeY;
            }
            this.emergencyDefense = true;
            this.emergencyTargetBase = targetBase;

            // Per-unit angle so multiple defenders spread around the base instead of
            // stacking on one pixel. Derived once here from Math.random().
            const angle = Math.random() * Math.PI * 2;
            const cx = targetBase.x + targetBase.width / 2;
            const cy = targetBase.y + targetBase.height / 2;
            this.homeX = cx + Math.cos(angle) * EMERGENCY_DEFENSE_BASE_RADIUS;
            this.homeY = cy + Math.sin(angle) * EMERGENCY_DEFENSE_BASE_RADIUS;

            // Force the return branch so the unit heads for the base next update().
            this.returning = true;
        } else {
            if (this.emergencyDefense) {
                this.homeX = this._spawnHomeX;
                this.homeY = this._spawnHomeY;
            }
            this.emergencyDefense = false;
            this.emergencyTargetBase = null;
        }
    }

    update() {
        if (!this.alive) return;

        this.frameCounter++;
        this.hovering = false;
        const target = this._getClosestTarget();
        const targetDist = target ? this._distToTarget(target) : Infinity;

        // --- AI state decision ---
        this.currentTarget = target;
        // While defending the base, notice approaching players from farther away.
        const sightRange = this.emergencyDefense
            ? Math.max(this.config.sightRange, EMERGENCY_DEFENSE_SIGHT_RANGE)
            : this.config.sightRange;
        if (target && targetDist <= sightRange) {
            this.aiState = 'chase';
            this.returning = false;
        } else {
            this._updateReturnState();
            this.aiState = this.returning ? 'return' : 'patrol';
            // Cover state is chase-scoped: reset so re-engagement re-checks LOS immediately
            this.inCover = false;
            this.coverGoalX = null;
            this.coverCheckTimer = 0;
        }

        // --- Movement ---
        this._updateMovement(target);

        // --- Hover Fuel Recovery ---
        if (this.onGround) {
            this.hoverFuel = Math.min(HOVER_MAX_FUEL, this.hoverFuel + HOVER_FUEL_RECOVERY);
            this.boostFrames = ATTACKER_BOOST_MAX_FRAMES;
        }

        // --- Physics ---
        this.vy += GRAVITY;
        if (this.vy > PLAYER_MAX_FALLING_SPEED) this.vy = PLAYER_MAX_FALLING_SPEED;

        if (!this.onGround && this.aiState === 'patrol') {
            this.vx *= AIR_FRICTION;
            if (Math.abs(this.vx) < 0.1) this.vx = 0;
        }

        if (this.jumpCooldown > 0) this.jumpCooldown--;

        this._moveAndCollide();
        this._updateFacing(target);
        this._updateWalkAnimation();
        this._handleShooting();
    }

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
    }

    /** Update facing direction based on velocity and AI target. */
    _updateFacing(target) {
        if (this.vx > 0.1) this.facingRight = true;
        else if (this.vx < -0.1) this.facingRight = false;

        // Face the target when chasing (overrides velocity-based facing)
        if (this.aiState === 'chase' && target) {
            this.facingRight = (target.x + target.width / 2) > (this.x + this.width / 2);
        }
    }

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
    }

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
    }

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
    }

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
    }

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
    }

    _distToTarget(target) {
        if (!target) return Infinity;
        const dx = (target.x + target.width / 2) - (this.x + this.width / 2);
        const dy = (target.y + target.height / 2) - (this.y + this.height / 2);
        return Math.sqrt(dx * dx + dy * dy);
    }

    _patrol() {
        this.vx = this.patrolDir * this.maxSpeed * 0.5; // Walk slowly when patrolling
    }

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
            const dir = Math.random() < 0.5 ? -1 : 1;
            this.evadeGoalX = targetX + dir * offset;
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
    }

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
    }

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
    }

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
    }

    _jump() {
        this.vy = this.jumpForce;
        this.onGround = false;
        this.jumpCooldown = 60; // ~1 second cooldown
    }

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
    }

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
                this.burstTimer = 15; // 15 frames between burst shots
                if (this.burstCount <= 0) {
                    this.fireTimer = this.config.fireInterval;
                }
            }
            return;
        }

        this.fireTimer--;
        if (this.fireTimer > 0) return;
        if (this.aiState !== 'chase' || !target) {
            this.fireTimer = this.config.fireInterval;
            return;
        }

        // Ready to fire. If artillery, start crouch sequence
        if (this.config.name === 'artillery') {
            this.crouching = true;
            this.crouchTimer = 30; // crouch for half a second before bursting
            return;
        }

        // Normal firing
        this._fire(target);
        this.fireTimer = this.config.fireInterval;
    }

    _fire(target) {
        if (!target) return;
        const targetX = target.x + target.width / 2;
        const targetY = target.y + target.height / 2;
        const dx = targetX - (this.x + this.width / 2);
        const dy = targetY - (this.y + this.height / 2);
        let angle = Math.atan2(dy, dx);

        const accuracy = this.config.aimAccuracy !== undefined ? this.config.aimAccuracy : 1.0;

        if (Math.random() > accuracy) {
            angle += (Math.random() - 0.5) * 1.0;
        }

        const crouchOffset = (this.crouching || this.burstCount > 0) ? 6 : 0;
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
        } else if (this.config.usesGrenades && Math.random() < this.config.grenadeChance) {
            const grenade = new Grenade(this.game, muzzleX, muzzleY, angle);
            grenade.isPlayerOwned = false;
            this.game.projectiles.push(grenade);
        } else {
            const missile = new Missile(this.game, muzzleX, muzzleY, angle, false, this.config.name === 'rival');
            this.game.projectiles.push(missile);
        }
    }

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
    }

    _checkHorizontalEntities() {
        checkHorizontalEntityCollision(this, this._buildEntityList(), () => {
            if (this.aiState === 'patrol') this.patrolDir *= -1;
        });
    }

    _checkVerticalEntities() {
        if (checkVerticalEntityCollision(this, this._buildEntityList())) {
            this.onGround = true;
        }
    }

    /** Build a list of collideable entities (enemies + active player). */
    _buildEntityList() {
        const list = [...this.game.enemies];
        const player = this.game.player;
        if (player && player.alive && !player.docked) list.push(player);
        return list;
    }

    _collidesWithMap() {
        return collidesWithMap(this, this.game.map);
    }

    // ------------------------------------------
    // Damage
    // ------------------------------------------

    takeDamage(amount) {
        if (!this.alive) return;
        this.hp -= amount;
        this.game.spawnSparks(this.x + this.width / 2, this.y + this.height / 2);
        if (this.hp <= 0) {
            this.die();
        }
    }

    die() {
        this.alive = false;
        this.game.spawnDebris(this, 'attacker');
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        this.game.spawnExplosion(cx, cy, EXPLOSION_PARTICLE_COUNT, MACHINE_EXPLOSION_OPTS);
        this.game.addScore(this.score);

        // heavy は30%の確率でミサイル・サプライ・キットをドロップ
        if (this.config.name === 'heavy' && Math.random() < 0.3) {
            this.game.missileKits.push(new MissileKit(this.game, cx, this.y));
        }
        // rival は30%の確率でリペアキットをドロップ
        if (this.config.name === 'rival' && Math.random() < 0.3) {
            this.game.repairKits.push(new RepairKit(this.game, cx, this.y));
        }
        // artillery は50%の確率でオートエイムユニットをドロップ
        if (this.config.name === 'artillery' && Math.random() < 0.5) {
            this.game.autoAimUnits.push(new AutoAimUnit(this.game, cx, this.y));
        }
    }

    // ------------------------------------------
    // Drawing (Player-style, color-swapped)
    // ------------------------------------------

    /** 破壊時の破片パーツ。型別の胴体に、死亡時のポーズの脚を足す。 */
    getDebrisParts() {
        return [...attackerBodyParts(this), ...attackerLegParts(this)];
    }

    draw(ctx) {
        if (!this.alive) return;

        const x = Math.round(this.x);
        const y = Math.round(this.y);
        const cfg = this.config;
        const type = cfg.name;

        ctx.save();

        if (!this.facingRight) {
            ctx.translate(x + this.width, y);
            ctx.scale(-1, 1);
        } else {
            ctx.translate(x, y);
        }

        const isCrouching = this.crouching || this.burstCount > 0;
        const crouchOffset = isCrouching ? 4 : 0;
        ctx.translate(0, crouchOffset);

        // --- Design by Type ---
        if (type === 'heavy') {
            // BULKY / ARMORED DESIGN
            // Shoulder Pad (Back)
            ctx.fillStyle = cfg.backpackColor;
            ctx.fillRect(3, 2, 6, 4);
            // Bulky Body
            ctx.fillStyle = cfg.bodyColor;
            ctx.fillRect(4, 4, 12, 13);
            // Thick Legs
            this._drawLegs(ctx, crouchOffset);
            // Bigger Head
            ctx.fillStyle = cfg.headColor;
            ctx.fillRect(6, -1, 9, 6);
            // Visor (Slit)
            ctx.fillStyle = cfg.visorColor;
            ctx.fillRect(10, 1, 4, 2);
            // Heavy Gun
            ctx.fillStyle = '#666666';
            ctx.fillRect(14, 8, 6, 4);
            ctx.fillStyle = '#999999';
            ctx.fillRect(18, 8, 3, 4);
        }
        else if (type === 'rival') {
            // SLEEK / SPEED DESIGN
            // Sleek Body
            ctx.fillStyle = cfg.bodyColor;
            ctx.fillRect(6, 4, 8, 12);
            // Sleek Head with horns
            ctx.fillStyle = cfg.headColor;
            ctx.fillRect(7, 0, 6, 5);
            ctx.fillRect(10, -3, 2, 2); // Bottom horn
            ctx.fillRect(11, -2, 2, 3); // Top horn
            // Visor (Glowing Eye)
            ctx.fillStyle = '#000000';
            ctx.fillRect(10, 1, 5, 2);
            ctx.fillStyle = cfg.visorColor;
            ctx.fillRect(10, 1, 3, 2);
            // Dual Barrels
            ctx.fillStyle = '#777777';
            ctx.fillRect(13, 6, 8, 2);
            ctx.fillRect(16, 7, -6, 3);
            this._drawLegs(ctx, crouchOffset);
            // Backpack
            ctx.fillStyle = cfg.backpackColor;
            ctx.fillRect(1, 6, 5, 5);
            ctx.fillRect(5, 4, -3, 9);
        }
        else if (type === 'artillery') {
            // SNIPER / RADAR DESIGN
            // Radar / Antenna on back
            ctx.strokeStyle = cfg.exhaustColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(3, 4); ctx.lineTo(3, -2);
            ctx.lineTo(6, -4); ctx.stroke();
            // Body
            ctx.fillStyle = cfg.bodyColor;
            ctx.fillRect(5, 5, 11, 11);
            // Head
            ctx.fillStyle = cfg.headColor;
            ctx.fillRect(7, 1, 7, 5);
            // Visor
            ctx.fillStyle = cfg.visorColor;
            ctx.fillRect(11, 2, 3, 2);
            // LONG SNIPER BARREL
            ctx.fillStyle = '#555555';
            ctx.fillRect(14, 8, 12, 2);
            ctx.fillStyle = '#888888';
            ctx.fillRect(24, 7, 2, 4);
            this._drawArtilleryLegs(ctx, crouchOffset);
        }
        else {
            // STANDARD HUMANOID DESIGN
            // Body
            ctx.fillStyle = cfg.bodyColor;
            ctx.fillRect(5, 4, 10, 12);
            // Head
            ctx.fillStyle = cfg.headColor;
            ctx.fillRect(6, 0, 8, 5);
            // Visor
            ctx.fillStyle = cfg.visorColor;
            ctx.fillRect(10, 1, 3, 3);
            // Backpack
            ctx.fillStyle = cfg.backpackColor;
            ctx.fillRect(2, 5, 4, 8);
            ctx.fillStyle = cfg.exhaustColor;
            ctx.fillRect(2, 12, 4, 2);
            // Legs
            this._drawLegs(ctx, crouchOffset);
            // Gun
            ctx.fillStyle = '#777777';
            ctx.fillRect(13, 7, 5, 2);
            ctx.fillStyle = '#999999';
            ctx.fillRect(17, 7, 2, 2);
        }

        // --- Hover Exhaust (Common) ---
        if (this.hovering) {
            for (let i = 0; i < 3; i++) {
                const px = 2 + Math.random() * 4;
                const py = 14 + Math.random() * 6 - crouchOffset;
                const size = 1 + Math.random() * 3;
                ctx.fillStyle = '#00FFFF';
                ctx.globalAlpha = 0.3 + Math.random() * 0.4;
                ctx.fillRect(px, py, size, size);
            }
            ctx.globalAlpha = 1.0;
        }

        ctx.restore();
    }

    /**
     * artillery の4脚クモ歩行。
     * 膝を胴体より上へ跳ね上げた逆へ字シルエットで、対角の2本ずつを
     * 半周期ずらして動かす（常に2本以上が接地する）。
     */
    _drawArtilleryLegs(ctx, crouchOffset = 0) {
        const style = this._legStyle();
        const hipY = 16 - crouchOffset;

        if (crouchOffset > 0) {
            this._drawSpiderCrouch(ctx, hipY, style);
        } else if (!this.onGround) {
            this._drawSpiderAir(ctx, hipY, style);
        } else {
            this._drawSpiderWalk(ctx, hipY, style);
        }
    }

    /** 脚1本ぶんの塗り設定（手前脚は bodyColor、奥脚は headColor）。 */
    _spiderPaint(leg, style) {
        return {
            legColor: leg.isNear ? this.config.bodyColor : this.config.headColor,
            footColor: leg.isNear ? this.config.headColor : this.config.bodyColor,
            lineWidth: style.lineWidth,
            footW: style.footW,
            footH: style.footH,
            shinWidth: style.shinWidth,
            thighColor: leg.isNear ? style.thighNear : style.thighFar,
        };
    }

    /** 接地時: 対角トロット。group 0 は walkFrame、group 1 は半周期ずれ。 */
    _drawSpiderWalk(ctx, hipY, style) {
        for (const leg of SPIDER_LEGS) {
            const phase = leg.group === 0
                ? this.walkFrame
                : (this.walkFrame + 2) % 4;
            const sweep = SPIDER_SWEEP[phase];
            const lift = SPIDER_LIFT[phase];

            const footX = leg.hipX + leg.reach + sweep;
            const footY = hipY + SPIDER_FOOT_DROP - lift;

            this._drawJointedLeg(ctx, {
                hipX: leg.hipX, hipY,
                kneeX: leg.hipX + (leg.reach + sweep) * 0.5,
                kneeY: hipY - SPIDER_KNEE_RISE,
                footX, footY,
                ...this._spiderPaint(leg, style),
            });
        }
    }

    /** 空中: 脚を丸めつつ、横速度に応じて股関節中心に振れる。 */
    _drawSpiderAir(ctx, hipY, style) {
        const swing = this._hoverSwing();

        for (const leg of SPIDER_LEGS) {
            // グループごとに縮み量を変えて非対称にする（クモが落下時に脚を縮める挙動）
            const curl = leg.group === 0 ? 0.6 : 0.8;
            const angle = swing * style.maxSwing;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const rot = (dx, dy) => ({
                x: leg.hipX + (dx * cos - dy * sin),
                y: hipY + (dx * sin + dy * cos),
            });

            const knee = rot(leg.reach * 0.5 * curl, -SPIDER_KNEE_RISE * curl);
            const foot = rot(leg.reach * curl, SPIDER_FOOT_DROP * curl);

            this._drawJointedLeg(ctx, {
                hipX: leg.hipX, hipY,
                kneeX: knee.x, kneeY: knee.y,
                footX: foot.x, footY: foot.y,
                footRotation: angle / 1.5,
                ...this._spiderPaint(leg, style),
            });
        }
    }

    /** しゃがみ（狙撃姿勢）: 膝を大きく跳ね上げ、足を広く張って車高を下げる。 */
    _drawSpiderCrouch(ctx, hipY, style) {
        const spread = style.crouchSpread;

        for (const leg of SPIDER_LEGS) {
            const dir = leg.reach >= 0 ? 1 : -1;
            this._drawJointedLeg(ctx, {
                hipX: leg.hipX, hipY,
                kneeX: leg.hipX + dir * spread * 0.5,
                kneeY: hipY - SPIDER_KNEE_RISE - 2,
                footX: leg.hipX + leg.reach + dir * spread,
                footY: hipY + SPIDER_FOOT_DROP,
                ...this._spiderPaint(leg, style),
            });
        }
    }

    /**
     * 死亡時の脚の関節座標を集める（描画はしない）。
     * 破片生成が「今どんなポーズだったか」を知るための唯一の入口。
     * @returns {Array<{isNear:boolean,hipX:number,hipY:number,kneeX:number,kneeY:number,footX:number,footY:number,lineWidth:number}>}
     */
    _collectLegPoses() {
        const style = this._legStyle();
        const isCrouching = this.crouching || this.burstCount > 0;
        const hipY = 16;   // draw() の平行移動込みで見た絶対位置に合わせる
        const out = [];
        const push = (isNear, hipX, kneeX, kneeY, footX, footY) => {
            out.push({
                isNear, hipX, hipY, kneeX, kneeY, footX, footY,
                lineWidth: style.lineWidth,
            });
        };

        if (this.config.name === 'artillery') {
            // 4脚クモ型。_drawSpiderWalk / _drawSpiderAir / _drawSpiderCrouch と
            // 同じ分岐・同じ式で関節座標を求める（描画とズレると破片だけ別ポーズになる）。
            if (isCrouching) {
                const spread = style.crouchSpread;
                for (const leg of SPIDER_LEGS) {
                    const dir = leg.reach >= 0 ? 1 : -1;
                    push(
                        leg.isNear, leg.hipX,
                        leg.hipX + dir * spread * 0.5, hipY - SPIDER_KNEE_RISE - 2,
                        leg.hipX + leg.reach + dir * spread, hipY + SPIDER_FOOT_DROP,
                    );
                }
                return out;
            }

            if (!this.onGround) {
                const swing = this._hoverSwing();
                const angle = swing * style.maxSwing;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                for (const leg of SPIDER_LEGS) {
                    const curl = leg.group === 0 ? 0.6 : 0.8;
                    const rot = (dx, dy) => ({
                        x: leg.hipX + (dx * cos - dy * sin),
                        y: hipY + (dx * sin + dy * cos),
                    });
                    const knee = rot(leg.reach * 0.5 * curl, -SPIDER_KNEE_RISE * curl);
                    const foot = rot(leg.reach * curl, SPIDER_FOOT_DROP * curl);
                    push(leg.isNear, leg.hipX, knee.x, knee.y, foot.x, foot.y);
                }
                return out;
            }

            for (const leg of SPIDER_LEGS) {
                const phase = leg.group === 0 ? this.walkFrame : (this.walkFrame + 2) % 4;
                const sweep = SPIDER_SWEEP[phase];
                const lift = SPIDER_LIFT[phase];
                push(
                    leg.isNear, leg.hipX,
                    leg.hipX + (leg.reach + sweep) * 0.5, hipY - SPIDER_KNEE_RISE,
                    leg.hipX + leg.reach + sweep, hipY + SPIDER_FOOT_DROP - lift,
                );
            }
            return out;
        }

        if (isCrouching) {
            const spread = style.crouchSpread;
            for (const [isNear, dir] of [[false, -1], [true, 1]]) {
                const hipX = isNear ? style.hipNear : style.hipFar;
                push(isNear, hipX, hipX + dir * (spread + 2), hipY + 4, hipX + dir * spread, hipY + 6);
            }
            return out;
        }

        if (!this.onGround) {
            const swing = this._hoverSwing();
            for (const [isNear, amount] of [[false, swing * 0.8 - style.phaseOffset], [true, swing]]) {
                const hipX = isNear ? style.hipNear : style.hipFar;
                const base = isNear ? AIR_BASE_POSE.near : AIR_BASE_POSE.far;
                const angle = amount * style.maxSwing;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const rot = (dx, dy) => ({ x: hipX + (dx * cos - dy * sin), y: hipY + (dx * sin + dy * cos) });
                const knee = rot(base.kdx, base.kdy);
                const foot = rot(base.fdx, base.fdy);
                push(isNear, hipX, knee.x, knee.y, foot.x, foot.y);
            }
            return out;
        }

        const frame = WALK_FRAME_POSES[this.walkFrame] || WALK_FRAME_POSES[2];
        for (const [isNear, poseIndex] of [[false, frame.far], [true, frame.near]]) {
            const hipX = isNear ? style.hipNear : style.hipFar;
            const p = LEG_POSES[poseIndex];
            const s = style.strideScale;
            push(isNear, hipX, hipX + p.kdx * s, hipY + p.kdy, hipX + p.fdx * s, hipY + p.fdy);
        }
        return out;
    }

    /** 2足型（standard / rival / heavy）の脚。しゃがみ／空中／歩行を振り分ける。 */
    _drawLegs(ctx, crouchOffset = 0) {
        const style = this._legStyle();
        // draw() が既に crouchOffset ぶん下へ平行移動しているので、
        // 股関節を同じだけ上げると足の接地位置が変わらない。
        const hipY = 16 - crouchOffset;

        if (crouchOffset > 0) {
            this._drawCrouchLegs(ctx, hipY, style);
        } else if (!this.onGround) {
            this._drawAirLegs(ctx, hipY, style);
        } else {
            this._drawWalkLegs(ctx, hipY, style);
        }
    }

    /** 脚1本ぶんの共通オプションを組み立てる。 */
    _legPaint(isNear, style) {
        return {
            legColor: isNear ? this.config.bodyColor : this.config.headColor,
            footColor: isNear ? this.config.headColor : this.config.bodyColor,
            lineWidth: style.lineWidth,
            footW: style.footW,
            footH: style.footH,
            thighPlate: style.thighPlate,
        };
    }

    /** 接地時: 4フレームの2足歩行サイクル。 */
    _drawWalkLegs(ctx, hipY, style) {
        const frame = WALK_FRAME_POSES[this.walkFrame] || WALK_FRAME_POSES[2];

        const drawOne = (isNear, poseIndex) => {
            const hipX = isNear ? style.hipNear : style.hipFar;
            const p = LEG_POSES[poseIndex];
            const s = style.strideScale;
            this._drawJointedLeg(ctx, {
                hipX, hipY,
                kneeX: hipX + p.kdx * s, kneeY: hipY + p.kdy,
                footX: hipX + p.fdx * s, footY: hipY + p.fdy,
                ...this._legPaint(isNear, style),
            });
        };

        drawOne(false, frame.far);  // 奥脚を先に（手前脚が上に重なる）
        drawOne(true, frame.near);
    }

    /** 空中: 横速度に比例して股関節を中心に脚が振れる。 */
    _drawAirLegs(ctx, hipY, style) {
        const swing = this._hoverSwing();

        const drawOne = (isNear, swingAmount) => {
            const hipX = isNear ? style.hipNear : style.hipFar;
            const base = isNear ? AIR_BASE_POSE.near : AIR_BASE_POSE.far;
            const angle = swingAmount * style.maxSwing;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const rot = (dx, dy) => ({
                x: hipX + (dx * cos - dy * sin),
                y: hipY + (dx * sin + dy * cos),
            });
            const knee = rot(base.kdx, base.kdy);
            const foot = rot(base.fdx, base.fdy);
            this._drawJointedLeg(ctx, {
                hipX, hipY,
                kneeX: knee.x, kneeY: knee.y,
                footX: foot.x, footY: foot.y,
                footRotation: angle / 1.5,
                ...this._legPaint(isNear, style),
            });
        };

        // 奥脚は位相をずらし、左右がぴったり揃わないようにする
        drawOne(false, swing * 0.8 - style.phaseOffset);
        drawOne(true, swing);
    }

    /** しゃがみ（バースト射撃時）: 膝を外に折って車高を下げる。 */
    _drawCrouchLegs(ctx, hipY, style) {
        const spread = style.crouchSpread;

        const drawOne = (isNear, dir) => {
            const hipX = isNear ? style.hipNear : style.hipFar;
            this._drawJointedLeg(ctx, {
                hipX, hipY,
                kneeX: hipX + dir * (spread + 2), kneeY: hipY + 4,
                footX: hipX + dir * spread, footY: hipY + 6,
                ...this._legPaint(isNear, style),
            });
        };

        drawOne(false, -1);
        drawOne(true, 1);
    }

    /** 型別の脚スタイルを引く。未知の型は standard にフォールバック。 */
    _legStyle() {
        return LEG_STYLES[this.config.name] || LEG_STYLES.standard;
    }

    /**
     * 空中の振り子量を -1..+1 で返す。
     * 進行方向ローカルの横速度を、その機体の最高速で正規化する。
     * 型ごとに最高速が 2.4 倍違う（heavy 0.5 / rival 1.20）ため、
     * プレイヤーのような固定定数ではなく this.maxSpeed を分母にする。
     */
    _hoverSwing() {
        const localVx = this.facingRight ? this.vx : -this.vx;
        const max = this.maxSpeed;
        const clamped = Math.max(-max, Math.min(max, localVx));
        return clamped / max;
    }

    /**
     * 脚1本を描く唯一のプリミティブ。
     * ポーズの決定（歩行フレーム→座標、振り子回転、脚上げ）は呼び出し側の責務で、
     * ここは渡された座標をそのまま描くだけの純粋な描画関数。
     */
    _drawJointedLeg(ctx, opts) {
        const {
            hipX, hipY, kneeX, kneeY, footX, footY,
            legColor, footColor, lineWidth, footW, footH,
            footRotation = 0, thighPlate = false,
            thighColor = null, shinWidth = null,
        } = opts;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (thighColor !== null || shinWidth !== null) {
            // 腿と下腿を別々に描く（artillery: 赤い腿＋太い下腿）。
            // 腿を先に描き、下腿を上に重ねて膝の関節を下腿側で締める。
            ctx.strokeStyle = thighColor !== null ? thighColor : legColor;
            ctx.lineWidth = lineWidth;
            ctx.beginPath();
            ctx.moveTo(hipX, hipY);
            ctx.lineTo(kneeX, kneeY);
            ctx.stroke();

            ctx.strokeStyle = legColor;
            ctx.lineWidth = shinWidth !== null ? shinWidth : lineWidth;
            ctx.beginPath();
            ctx.moveTo(kneeX, kneeY);
            ctx.lineTo(footX, footY);
            ctx.stroke();
        } else {
            // 股関節 → 膝 → 足首 を1本のポリラインで
            ctx.strokeStyle = legColor;
            ctx.lineWidth = lineWidth;
            ctx.beginPath();
            ctx.moveTo(hipX, hipY);
            ctx.lineTo(kneeX, kneeY);
            ctx.lineTo(footX, footY);
            ctx.stroke();
        }

        // 腿の装甲板（heavy のバルク感）
        if (thighPlate) {
            ctx.fillStyle = footColor;
            ctx.fillRect((hipX + kneeX) / 2 - 2, (hipY + kneeY) / 2 - 1, 4, 3);
        }

        // 足裏
        ctx.save();
        ctx.translate(footX, footY);
        if (footRotation !== 0) ctx.rotate(footRotation);
        ctx.fillStyle = footColor;
        ctx.fillRect(-Math.floor(footW / 2), 0, footW, footH);
        ctx.restore();
    }

}
