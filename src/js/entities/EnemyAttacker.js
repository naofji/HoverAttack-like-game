// ============================================
// EnemyAttacker - Humanoid enemy robot (3 types)
// ============================================

import {
    TILE_SIZE, GRAVITY, AIR_FRICTION,
    PLAYER_WIDTH, PLAYER_HEIGHT,
    PLAYER_MAX_FALLING_SPEED,
    HOVER_MAX_FUEL, HOVER_FUEL_CONSUMPTION, HOVER_FUEL_RECOVERY,
    MISSILE_SPEED, EXPLOSION_PARTICLE_COUNT
} from '../utils/Constants.js';
import { Missile } from './Missile.js';
import { Grenade } from './Grenade.js';

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
        this.maxSpeed = config.speed;
        this.jumpForce = config.jumpForce;
        this.score = config.score;

        // AI state
        this.facingRight = Math.random() < 0.5;
        this.patrolDir = this.facingRight ? 1 : -1;
        this.fireTimer = Math.floor(Math.random() * config.fireInterval);
        this.aiState = 'patrol'; // 'patrol' or 'chase'
        this.jumpCooldown = 0;

        // Animation & State
        this.walkFrame = 2;
        this.walkTimer = 0;
        this.hovering = false;

        // Hover fuel support (used if movementType allows hovering)
        this.hoverFuel = HOVER_MAX_FUEL;
    }

    update() {
        if (!this.alive) return;

        this.hovering = false; // Reset hover state each frame
        const target = this._getClosestTarget();
        const targetDist = target ? this._distToTarget(target) : Infinity;

        // --- AI Decision ---
        if (target && targetDist <= this.config.sightRange) {
            this.aiState = 'chase';
        } else {
            this.aiState = 'patrol';
        }

        // --- Movement ---
        if (this.aiState === 'chase') {
            this._chaseTarget(target);
        } else {
            this._patrol();
        }

        // --- Hover Fuel Recovery ---
        if (this.onGround) {
            this.hoverFuel = Math.min(HOVER_MAX_FUEL, this.hoverFuel + HOVER_FUEL_RECOVERY);
        }

        // --- Gravity ---
        this.vy += GRAVITY;
        if (this.vy > PLAYER_MAX_FALLING_SPEED) this.vy = PLAYER_MAX_FALLING_SPEED;

        // --- Air friction (when not on ground) ---
        if (!this.onGround) {
            // Only apply if not actively walking
            if (this.aiState !== 'chase') {
                this.vx *= AIR_FRICTION;
                if (Math.abs(this.vx) < 0.1) this.vx = 0;
            }
        }

        // --- Jump cooldown ---
        if (this.jumpCooldown > 0) this.jumpCooldown--;

        // --- Movement & Collision ---
        this._moveAndCollide();

        // --- Facing direction ---
        if (this.vx > 0.1) this.facingRight = true;
        else if (this.vx < -0.1) this.facingRight = false;

        // --- Face target when chasing ---
        if (this.aiState === 'chase' && target) {
            this.facingRight = (target.x + target.width / 2) > (this.x + this.width / 2);
        }

        // --- Walk animation ---
        if (this.onGround && Math.abs(this.vx) > 0.3) {
            this.walkTimer++;
            if (this.walkTimer >= 5) {
                this.walkTimer = 0;
                const isMovingForward = (this.facingRight && this.vx > 0) || (!this.facingRight && this.vx < 0);
                if (isMovingForward) {
                    this.walkFrame = (this.walkFrame + 1) % 4;
                } else {
                    this.walkFrame = (this.walkFrame - 1 + 4) % 4;
                }
            }
        } else {
            this.walkFrame = 2;
            this.walkTimer = 0;
        }

        // --- Shooting ---
        this._handleShooting();
    }

    // ------------------------------------------
    // AI
    // ------------------------------------------

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
            if (Math.abs(dx) > 4) {
                this.patrolDir = dx > 0 ? 1 : -1;
            }
            this.vx = this.patrolDir * this.maxSpeed;

            if (this.onGround) {
                if (this.jumpCooldown <= 0) {
                    // Jump frequently or if player is above
                    if (dy < -16 || Math.random() < 0.05) {
                        this._jump();
                    }
                }
            } else {
                // Airborne: hover if player is above or just to stay airborne longer
                if (this.hoverFuel > 0 && (dy < -8 || (this.vy > 0 && Math.random() < 0.1))) {
                    this.hovering = true;
                    this.vy -= 0.6; // Hover upward thrust
                    this.hoverFuel -= HOVER_FUEL_CONSUMPTION;
                    // Cap rising speed
                    if (this.vy < -4.0) this.vy = -4.0;
                }
            }
        }
    }

    _jump() {
        this.vy = this.jumpForce;
        this.onGround = false;
        this.jumpCooldown = 60; // ~1 second cooldown
    }

    _handleShooting() {
        this.fireTimer--;
        if (this.fireTimer > 0) return;
        if (this.aiState !== 'chase') {
            this.fireTimer = this.config.fireInterval;
            return;
        }

        const target = this._getClosestTarget();
        if (!target) return;

        const targetX = target.x + target.width / 2;
        const targetY = target.y + target.height / 2;
        const dx = targetX - (this.x + this.width / 2);
        const dy = targetY - (this.y + this.height / 2);
        let angle = Math.atan2(dy, dx);

        const accuracy = this.config.aimAccuracy !== undefined ? this.config.aimAccuracy : 1.0;

        if (Math.random() > accuracy) {
            // add random spread up to +/- ~30 degrees (0.5 radians)
            angle += (Math.random() - 0.5) * 1.0;
        }

        const muzzleX = this.x + this.width / 2 + Math.cos(angle) * 10;
        const muzzleY = this.y + this.height / 2 + Math.sin(angle) * 6;

        // Rival type: sometimes fire grenade
        if (this.config.usesGrenades && Math.random() < this.config.grenadeChance) {
            const grenade = new Grenade(this.game, muzzleX, muzzleY, angle);
            grenade.isPlayerOwned = false;
            this.game.projectiles.push(grenade);
        } else {
            // Fire enemy missile (with trail, red color)
            const missile = new Missile(this.game, muzzleX, muzzleY, angle, false);
            this.game.projectiles.push(missile);
        }

        this.fireTimer = this.config.fireInterval;
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
            const isPatrolling = (this.aiState === 'patrol');
            const mType = this.config.movementType;

            const frontX = this.patrolDir > 0
                ? this.x + this.width + 2
                : this.x - 2;
            const feetY = this.y + this.height + 4;

            if (!map.isSolidAtPixel(frontX, feetY)) {
                if (isPatrolling) {
                    this.patrolDir *= -1; // Reverse at edge when patrolling naturally
                } else {
                    if (mType === 'pace_and_jump' && this.jumpCooldown <= 0) {
                        this._jump(); // Jump over gap!
                    } else if (mType === 'pace_and_jump') {
                        this.patrolDir *= -1; // Turn back if can't jump
                    }
                    // For chase_and_jump or stop_and_shoot, just fall down
                }
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
        const entities = [...this.game.enemies];
        const player = this.game.player;
        if (player && player.alive && !player.docked) entities.push(player);

        for (const entity of entities) {
            if (entity === this || !entity.alive) continue;

            if (this.x < entity.x + entity.width &&
                this.x + this.width > entity.x &&
                this.y < entity.y + entity.height &&
                this.y + this.height > entity.y) {

                if (this.vx > 0) {
                    this.x = entity.x - this.width;
                    this.vx = 0;
                } else if (this.vx < 0) {
                    this.x = entity.x + entity.width;
                    this.vx = 0;
                }

                if (this.aiState === 'patrol') {
                    this.patrolDir *= -1;
                }
            }
        }
    }

    _checkVerticalEntities() {
        const entities = [...this.game.enemies];
        const player = this.game.player;
        if (player && player.alive && !player.docked) entities.push(player);

        for (const entity of entities) {
            if (entity === this || !entity.alive) continue;

            const myBottom = this.y + this.height;
            const myPrevBottom = myBottom - this.vy;
            const eTop = entity.y;

            if (this.x + this.width > entity.x && this.x < entity.x + entity.width) {
                if (myPrevBottom <= eTop + 4 && myBottom >= eTop) {
                    this.y = eTop - this.height;
                    this.onGround = true;
                    this.vy = 0;
                    this.x += entity.vx || 0;
                    break;
                }
            }
        }
    }

    _collidesWithMap() {
        const map = this.game.map;
        const points = [
            { x: this.x + 2, y: this.y + 2 },
            { x: this.x + this.width - 2, y: this.y + 2 },
            { x: this.x + 2, y: this.y + this.height - 1 },
            { x: this.x + this.width - 2, y: this.y + this.height - 1 },
            { x: this.x + this.width / 2, y: this.y + 2 },
            { x: this.x + this.width / 2, y: this.y + this.height - 1 },
            { x: this.x + 2, y: this.y + this.height / 2 },
            { x: this.x + this.width - 2, y: this.y + this.height / 2 },
        ];
        return points.some(p => map.isSolidAtPixel(p.x, p.y));
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
    }

    // ------------------------------------------
    // Drawing (Player-style, color-swapped)
    // ------------------------------------------

    draw(ctx) {
        if (!this.alive) return;

        const x = Math.round(this.x);
        const y = Math.round(this.y);
        const cfg = this.config;

        ctx.save();

        if (!this.facingRight) {
            ctx.translate(x + this.width, y);
            ctx.scale(-1, 1);
        } else {
            ctx.translate(x, y);
        }

        // --- Body ---
        ctx.fillStyle = cfg.bodyColor;
        ctx.fillRect(5, 4, 10, 12);

        // --- Head ---
        ctx.fillStyle = cfg.headColor;
        ctx.fillRect(6, 0, 8, 5);
        // Visor
        ctx.fillStyle = cfg.visorColor;
        ctx.fillRect(10, 1, 3, 3);

        // --- Backpack ---
        ctx.fillStyle = cfg.backpackColor;
        ctx.fillRect(2, 5, 4, 8);
        ctx.fillStyle = cfg.exhaustColor;
        ctx.fillRect(2, 12, 4, 2);

        // --- Legs ---
        this._drawLegs(ctx);

        // --- Hover Exhaust ---
        if (this.hovering) {
            for (let i = 0; i < 3; i++) {
                const px = 2 + Math.random() * 4;
                const py = 14 + Math.random() * 6;
                const size = 1 + Math.random() * 3;
                ctx.fillStyle = '#00FFFF'; // constant cyan color for hover
                ctx.globalAlpha = 0.3 + Math.random() * 0.4;
                ctx.fillRect(px, py, size, size);
            }
            ctx.globalAlpha = 1.0;
        }

        // --- Gun barrel (simple) ---
        ctx.fillStyle = '#777777';
        ctx.fillRect(13, 7, 5, 2);
        ctx.fillStyle = '#999999';
        ctx.fillRect(17, 7, 2, 2);

        ctx.restore();
    }

    _drawLegs(ctx) {
        if (!this.onGround) {
            // Hover/airborne legs - slightly spread
            this._drawLeg(ctx, 6, 16, -1);  // near leg
            this._drawLeg(ctx, 9, 16, 1);   // far leg
        } else {
            // Walk legs based on walkFrame
            const WALK_POSES = [
                { near: -2, far: 2 },   // frame 0
                { near: -1, far: 1 },   // frame 1
                { near: 0, far: 0 },    // frame 2 (standing)
                { near: 1, far: -1 },   // frame 3
            ];
            const pose = WALK_POSES[this.walkFrame] || WALK_POSES[2];
            this._drawLeg(ctx, 6, 16, pose.near);
            this._drawLeg(ctx, 9, 16, pose.far);
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
