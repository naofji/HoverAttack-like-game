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
    ATTACKER_RETURN_DONE, ATTACKER_CLIMB_MIN_FUEL, ATTACKER_CLIMB_MAX_RISE
} from '../utils/Constants.js';
import { collidesWithMap, checkHorizontalEntityCollision, checkVerticalEntityCollision } from '../utils/Physics.js';
import { Missile } from './Missile.js';
import { Grenade } from './Grenade.js';
import { EnemyHomingMissile } from './EnemyHomingMissile.js';
import { RepairKit } from './RepairKit.js';
import { AutoAimUnit } from './AutoAimUnit.js';
import { MissileKit } from './MissileKit.js';

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

    update() {
        if (!this.alive) return;

        this.frameCounter++;
        this.hovering = false;
        const target = this._getClosestTarget();
        const targetDist = target ? this._distToTarget(target) : Infinity;

        // --- AI state decision ---
        this.currentTarget = target;
        if (target && targetDist <= this.config.sightRange) {
            this.aiState = 'chase';
            this.returning = false;
        } else {
            this._updateReturnState();
            this.aiState = this.returning ? 'return' : 'patrol';
        }

        // --- Movement ---
        this._updateMovement(target);

        // --- Hover Fuel Recovery ---
        if (this.onGround) {
            this.hoverFuel = Math.min(HOVER_MAX_FUEL, this.hoverFuel + HOVER_FUEL_RECOVERY);
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
     * Move toward (targetX, targetY) using walk + jump + hover thrust.
     * Climbs in legs: waits on the ground for fuel, ascends, falls to recover, repeats.
     */
    _climbToward(targetX, targetY) {
        const dx = targetX - this.x;
        // Overshoot 8px so ledge lips can be cleared before thrust cuts out
        const below = this.y > targetY - 8;

        if (Math.abs(dx) > 8) {
            this.vx = dx > 0 ? this.maxSpeed : -this.maxSpeed;
        } else {
            this.vx = 0;
        }

        if (this.onGround) {
            // Wait on the ground until there is enough fuel for a climb leg
            if (below && this.hoverFuel >= ATTACKER_CLIMB_MIN_FUEL && this.jumpCooldown <= 0) {
                this._jump();
            }
        } else if (below && this.hoverFuel > 0 && this.vy > ATTACKER_CLIMB_MAX_RISE) {
            this.hovering = true;
            this.vy -= this.config.climbThrust;
            this.hoverFuel -= HOVER_FUEL_CONSUMPTION;
            if (this.vy < ATTACKER_CLIMB_MAX_RISE) this.vy = ATTACKER_CLIMB_MAX_RISE;
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

    _chaseTarget(target) {
        if (!target) return;
        // Aim for the center of the target
        const targetX = target.x + target.width / 2;
        const targetY = target.y + target.height / 2;
        const dx = targetX - (this.x + this.width / 2);
        const dy = targetY - (this.y + this.height / 2);

        const mType = this.config.movementType || 'stop_and_shoot';

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
                if (this.hoverFuel > 0 && (dy < -8 || (this.vy > 0 && Math.random() * 1.5 < 0.1))) {
                    this.hovering = true;
                    this.vy -= this.config.climbThrust; // Hover upward thrust
                    this.hoverFuel -= HOVER_FUEL_CONSUMPTION;
                    if (this.vy < -4.0) this.vy = -4.0;
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
                if (this.onGround && Math.random() < 0.01) {
                    this._jump();
                }
            }

            // Vertical movement support
            if (this.onGround) {
                if (this.jumpCooldown <= 0 && dy < -32) {
                    this._jump();
                }
            } else {
                // Use hover to stay at a certain height or prolong jumps
                if (this.hoverFuel > 0 && (dy < -16 || (this.vy > 0 && Math.random() < 0.05))) {
                    this.hovering = true;
                    this.vy -= this.config.climbThrust;
                    this.hoverFuel -= HOVER_FUEL_CONSUMPTION;
                    if (this.vy < -3.0) this.vy = -3.0;
                }
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
                if (this.hoverFuel > 0 && (dy < -8 || Math.random() < 0.1)) {
                    this.hovering = true;
                    this.vy -= this.config.climbThrust;
                    this.hoverFuel -= HOVER_FUEL_CONSUMPTION;
                    if (this.vy < -4.0) this.vy = -4.0;
                }
            }
        }

        // --- Vertical pursuit for types without their own hover logic ---
        if ((mType === 'stop_and_shoot' || mType === 'pace_and_jump') && dy < -32) {
            if (this.onGround) {
                if (this.jumpCooldown <= 0 && this.hoverFuel >= ATTACKER_CLIMB_MIN_FUEL) {
                    this._jump();
                }
            } else if (this.hoverFuel > 0 && this.vy > ATTACKER_CLIMB_MAX_RISE) {
                this.hovering = true;
                this.vy -= this.config.climbThrust;
                this.hoverFuel -= HOVER_FUEL_CONSUMPTION;
                if (this.vy < ATTACKER_CLIMB_MAX_RISE) this.vy = ATTACKER_CLIMB_MAX_RISE;
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
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        this.game.spawnExplosion(cx, cy, EXPLOSION_PARTICLE_COUNT);
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
            ctx.fillStyle = cfg.backpackColorColor;
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

    _drawArtilleryLegs(ctx, crouchOffset = 0) {
        const legColor1 = this.config.bodyColor;
        const legColor2 = this.config.headColor;

        if (crouchOffset > 0) {
            // Low profile quad legs (crouching)
            ctx.fillStyle = legColor1;
            ctx.fillRect(2, 15, 4, 4);
            ctx.fillRect(12, 15, 4, 4);
            ctx.fillStyle = legColor2;
            ctx.fillRect(0, 18, 4, 2);
            ctx.fillRect(14, 18, 4, 2);
        } else if (!this.onGround) {
            // 空中: vxの反対方向に足が流れる
            const swing = Math.round(Math.max(-3, Math.min(3, -this.vx * 0.8)));
            ctx.fillStyle = legColor1;
            ctx.fillRect(4 + swing, 16, 3, 6);
            ctx.fillRect(11 + swing, 16, 3, 6);
            ctx.fillStyle = legColor2;
            ctx.fillRect(2 + swing, 20, 4, 3);
            ctx.fillRect(12 + swing, 20, 4, 3);
        } else {
            const WALK_POSES = [
                { l: -2, r: 2 },
                { l: -1, r: 1 },
                { l: 0, r: 0 },
                { l: 1, r: -1 },
            ];
            const isWalking = Math.abs(this.vx) > 0.3;
            const pose = isWalking ? (WALK_POSES[this.walkFrame] || WALK_POSES[2]) : WALK_POSES[2];
            const tl = Math.round(pose.l / 2);
            const tr = Math.round(pose.r / 2);

            ctx.fillStyle = legColor1;
            ctx.fillRect(4 + tl, 16, 3, 6);
            ctx.fillRect(11 + tr, 16, 3, 6);
            ctx.fillStyle = legColor2;
            ctx.fillRect(2 + pose.l, 20, 4, 3);
            ctx.fillRect(12 + pose.r, 20, 4, 3);
        }
    }

    _drawLegs(ctx, crouchOffset = 0) {
        if (!this.onGround) {
            // 空中: vxの反対方向に足が流れる（慣性で後ろに引っ張られる感じ）
            const swing = Math.round(Math.max(-3, Math.min(3, -this.vx * 0.8)));
            this._drawLeg(ctx, 6 + swing, 16 - crouchOffset, swing);
            this._drawLeg(ctx, 9 + swing, 16 - crouchOffset, swing);
        } else {
            // Walk legs based on walkFrame
            const WALK_POSES = [
                { near: -2, far: 2 },   // frame 0
                { near: -1, far: 1 },   // frame 1
                { near: 0, far: 0 },    // frame 2 (standing)
                { near: 1, far: -1 },   // frame 3
            ];
            const pose = WALK_POSES[this.walkFrame] || WALK_POSES[2];

            if (crouchOffset > 0) {
                // Crouching pose (knees bent, feet spread)
                const spread = this.config.name === 'heavy' ? 4 : 2;
                this._drawLeg(ctx, 6 - spread, 16 - crouchOffset, -2);
                this._drawLeg(ctx, 9 + spread, 16 - crouchOffset, 2);
            } else {
                this._drawLeg(ctx, 6, 16, pose.near);
                this._drawLeg(ctx, 9, 16, pose.far);
            }
        }
    }

    _drawLeg(ctx, legX, legY, offset) {
        const cfg = this.config;
        // Upper leg
        ctx.fillStyle = cfg.bodyColor;
        ctx.fillRect(legX, legY, 3, 4);
        // Lower leg
        ctx.fillStyle = cfg.headColor;
        ctx.fillRect(legX + offset, legY + 4, 3, 4);
    }
}
