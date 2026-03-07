// ============================================
// Player (Attacker Robot)
// ============================================

import {
    TILE_SIZE,
    GRAVITY, AIR_FRICTION,
    PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_MAX_SPEED,
    PLAYER_MAX_FALLING_SPEED, PLAYER_STUN_FALL_SPEED, PLAYER_STUN_DURATION, PLAYER_MAX_HOVER_SPEED,
    PLAYER_BURST_FORCE,
    HOVER_THRUST, HOVER_THRUST_MIN, HOVER_MAX_FUEL, HOVER_FUEL_CONSUMPTION,
    BURST_FUEL_CONSUMPTION, BURST_MIN_FUEL, HOVER_FUEL_RECOVERY, HOVER_FUEL_RECOVERY_BOOST,
    HOVER_COOLDOWN_AFTER_BURST,
    PLAYER_MAX_HP, PLAYER_INITIAL_LIVES, PLAYER_RESPAWN_INVINCIBLE_FRAMES,
    MISSILE_INITIAL_COUNT, GRENADE_INITIAL_COUNT,
    COLOR_HOVER_EXHAUST
} from '../utils/Constants.js';

export class Player {
    constructor(game, x, y) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = PLAYER_WIDTH;
        this.height = PLAYER_HEIGHT;
        this.vx = 0;
        this.vy = 0;
        this.onGround = false;
        this.facingRight = true;
        this.alive = true;

        // Resources
        this.hp = PLAYER_MAX_HP;
        this.lives = PLAYER_INITIAL_LIVES;
        this.missiles = MISSILE_INITIAL_COUNT;
        this.grenades = GRENADE_INITIAL_COUNT;
        this.hoverFuel = HOVER_MAX_FUEL;
        this.hovering = false;

        // Docking
        this.docked = false;

        // Crouching & Stun
        this.crouching = false;
        this.stunTimer = 0;

        // Animation
        this.walkFrame = 2;
        this.walkTimer = 0;
        this.invincibleTimer = 0; // frames of invincibility after respawn
        this.hoverCooldown = 0;   // frames before hover can activate after jump
        this.missileCooldown = 0; // frames before next missile can be fired
    }

    update() {
        if (!this.alive) return;
        if (this.docked) return; // Handled by carrier

        const input = this.game.input;

        // --- Crouching & Stun ---
        if (this.stunTimer > 0) {
            this.stunTimer--;
            this.crouching = true; // Force crouch while stunned
        } else {
            // Manual crouch with 'S' key when on ground
            this.crouching = this.onGround && input.isKeyDown('KeyS');
        }

        // --- Horizontal movement ---
        if (this.crouching) {
            // Prevent walking while crouching
            if (this.onGround) this.vx = 0;
        } else {
            // Normal walking
            if (input.isKeyDown('KeyA') || input.isKeyDown('ArrowLeft')) {
                this.vx = -PLAYER_MAX_SPEED;
            } else if (input.isKeyDown('KeyD') || input.isKeyDown('ArrowRight')) {
                this.vx = PLAYER_MAX_SPEED;
            } else {
                // On ground: stop immediately (no drift). In air: slight air friction
                if (this.onGround) {
                    this.vx = 0;
                } else {
                    this.vx *= AIR_FRICTION;
                    if (Math.abs(this.vx) < 0.1) this.vx = 0;
                }
            }
        }

        // --- Gravity ---
        this.vy += GRAVITY;

        // --- Burst & Hover (W or Shift key) ---
        this.hovering = false;
        if (this.hoverCooldown > 0) this.hoverCooldown--;
        const burstHoverHeld = input.isKeyDown('KeyW') || input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight');
        // Cannot burst/hover if stunned or manually crouching
        if (burstHoverHeld && !this.crouching) {
            if (this.onGround && this.hoverFuel >= BURST_MIN_FUEL) {
                // On ground + >= 80% fuel: Burst
                this.vy = PLAYER_BURST_FORCE;
                this.onGround = false;
                this.hoverFuel -= BURST_FUEL_CONSUMPTION;
                this.hoverCooldown = HOVER_COOLDOWN_AFTER_BURST;
            } else if (this.hoverCooldown <= 0 && this.hoverFuel > 0) {
                // In air after cooldown: hover (consumes fuel)
                const fuelRatio = this.hoverFuel / HOVER_MAX_FUEL;
                const currentThrust = HOVER_THRUST_MIN + (HOVER_THRUST - HOVER_THRUST_MIN) * fuelRatio;
                this.vy += currentThrust;
                this.hoverFuel -= HOVER_FUEL_CONSUMPTION;
                if (this.hoverFuel < 0) this.hoverFuel = 0;
                this.hovering = true;
            }
        }

        // --- Hover fuel auto-recovery when not hovering ---
        if (!this.hovering && this.hoverFuel < HOVER_MAX_FUEL) {
            const carrier = this.game.carrier;
            const nearCarrier = carrier && carrier.alive &&
                Math.abs(this.x - carrier.x) < carrier.width * 2 &&
                Math.abs(this.y - carrier.y) < carrier.height * 2;
            const sKeyDown = input.isKeyDown('KeyS') && !nearCarrier;
            const recoveryRate = sKeyDown ? HOVER_FUEL_RECOVERY_BOOST : HOVER_FUEL_RECOVERY;
            this.hoverFuel = Math.min(HOVER_MAX_FUEL, this.hoverFuel + recoveryRate);
        }

        // Cap falling speed
        if (this.vy > PLAYER_MAX_FALLING_SPEED) this.vy = PLAYER_MAX_FALLING_SPEED;
        // Cap rising speed only when hovering
        if (this.hovering && this.vy < PLAYER_MAX_HOVER_SPEED) this.vy = PLAYER_MAX_HOVER_SPEED;

        // --- Facing direction (based on mouse aim) ---
        const mouseWorld = input.getMouseWorld(this.game.camera);
        const centerX = this.x + this.width / 2;
        this.facingRight = mouseWorld.x >= centerX;

        // --- Movement & Collision ---
        this._moveAndCollide();

        // --- Walk animation ---
        if (this.onGround && Math.abs(this.vx) > 0.5) {
            this.walkTimer++;
            if (this.walkTimer >= 4) {
                this.walkTimer = 0;
                // Determine if moving forwards relative to facing direction
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

        // --- Timers ---
        if (this.invincibleTimer > 0) this.invincibleTimer--;
        if (this.missileCooldown > 0) this.missileCooldown--;
    }

    _moveAndCollide() {
        const map = this.game.map;

        // Horizontal collision
        this.x += this.vx;

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
        }

        // Horizontal Carrier Collision
        if (!hitHMap) {
            const carrier = this.game.carrier;
            if (carrier && carrier.alive) {
                // If the player overlaps the carrier horizontally AND vertically
                if (this.x < carrier.x + carrier.width &&
                    this.x + this.width > carrier.x &&
                    this.y < carrier.y + carrier.height &&
                    this.y + this.height > carrier.y) {

                    // We hit the side of the carrier
                    // Push out appropriately
                    if (this.vx > 0 || carrier.vx < 0) {
                        // Moving right into carrier OR carrier moving left into us
                        if (this.x + this.width - this.vx <= carrier.x + 4) { // 4px leeway
                            this.x = carrier.x - this.width;
                            this.vx = 0;
                        }
                    } else if (this.vx < 0 || carrier.vx > 0) {
                        // Moving left into carrier OR carrier moving right into us
                        if (this.x - this.vx >= carrier.x + carrier.width - 4) {
                            this.x = carrier.x + carrier.width;
                            this.vx = 0;
                        }
                    }
                }
            }
        }

        // Horizontal Enemy Collision
        for (const enemy of this.game.enemies) {
            if (!enemy.alive) continue;
            // Check horizontal overlap (assuming vertical is overlapping)
            if (this.x < enemy.x + enemy.width &&
                this.x + this.width > enemy.x &&
                this.y < enemy.y + enemy.height &&
                this.y + this.height > enemy.y) {

                if (this.vx > 0) { // Moving right into enemy
                    this.x = enemy.x - this.width;
                    this.vx = 0;
                } else if (this.vx < 0) { // Moving left into enemy
                    this.x = enemy.x + enemy.width;
                    this.vx = 0;
                }
            }
        }

        // Vertical collision
        this.y += this.vy;
        this.onGround = false;

        // 1. Check Map Collision
        let hitVMap = false;
        if (this._collidesWithMap()) {
            hitVMap = true;
            if (this.vy > 0) {
                // Landing on map
                if (this.vy > PLAYER_STUN_FALL_SPEED) { // Hard landing threshold
                    this.stunTimer = PLAYER_STUN_DURATION;
                }
                this.y = Math.floor((this.y + this.height) / TILE_SIZE) * TILE_SIZE - this.height;
                this.onGround = true;
                this.walkFrame = 2; // Reset to standing straight
            } else if (this.vy < 0) {
                // Hit ceiling
                this.y = Math.ceil(this.y / TILE_SIZE) * TILE_SIZE + 0.01;
            }
            this.vy = 0;
        }

        // 2. Check Carrier Collision (only when falling and not already grounded on map)
        if (!this.onGround && this.vy > 0) {
            const carrier = this.game.carrier;
            if (carrier && carrier.alive) {
                // Check if player's bottom edge crosses the carrier's platform
                const pBottom = this.y + this.height;
                const pPrevBottom = pBottom - this.vy; // Where were we last frame?
                const cPlatformY = carrier.y; // Carrier logical top is roughly its y

                const pLeft = this.x;
                const pRight = this.x + this.width;
                const cPlatformLeft = carrier.x + carrier.platformLeft - 4; // slight leeway
                const cPlatformRight = carrier.x + carrier.platformRight + 4; // slight leeway

                // If player is horizontally within platform, and vertically falling *onto* it
                if (pRight > cPlatformLeft && pLeft < cPlatformRight) {
                    // Check if we just crossed the platform boundary, or if we are embedded in it while falling
                    if (pPrevBottom <= cPlatformY + 4 && pBottom >= cPlatformY) {
                        // Land on carrier
                        if (this.vy > PLAYER_STUN_FALL_SPEED) { // Hard landing threshold
                            this.stunTimer = PLAYER_STUN_DURATION;
                        }
                        this.y = cPlatformY - this.height;
                        this.onGround = true;
                        this.walkFrame = 2; // Reset to standing straight
                        this.vy = 0;

                        // Move with carrier horizontally if standing on it
                        this.x += carrier.vx;
                    }
                }
            }
        }

        // 3. Check Enemy Vertical Collision
        if (!this.onGround && this.vy > 0) {
            for (const enemy of this.game.enemies) {
                if (!enemy.alive) continue;

                const pBottom = this.y + this.height;
                const pPrevBottom = pBottom - this.vy;
                const eTop = enemy.y;

                if (this.x + this.width > enemy.x && this.x < enemy.x + enemy.width) {
                    // Falling onto the enemy
                    if (pPrevBottom <= eTop + 4 && pBottom >= eTop) {
                        this.y = eTop - this.height;
                        this.onGround = true;
                        this.walkFrame = 2;
                        this.vy = 0;
                        // Move with enemy horizontally if standing on it
                        this.x += enemy.vx || 0;
                        break; // Landed on one enemy, no need to check others
                    }
                }
            }
        }

        // Extra ground probe: check 1px below feet if vy is ~0 (standing still or falling slightly)
        // This prevents the "not grounded" flicker when standing on a surface,
        // but it must NOT trigger when moving upward (vy < 0) otherwise slow hover gets stuck to the ground.
        if (!this.onGround && this.vy >= 0 && this.vy < 0.5) {
            const probeY = this.y + this.height + 1;
            const leftFoot = map.isSolidAtPixel(this.x + 4, probeY);
            const rightFoot = map.isSolidAtPixel(this.x + this.width - 4, probeY);
            if (leftFoot || rightFoot) {
                this.onGround = true;
                this.vy = 0;
                // Snap to surface
                this.y = Math.floor(probeY / TILE_SIZE) * TILE_SIZE - this.height;
            } else {
                // Also check if standing on an enemy directly below
                for (const enemy of this.game.enemies) {
                    if (!enemy.alive) continue;
                    if (this.x + this.width > enemy.x && this.x < enemy.x + enemy.width) {
                        if (Math.abs(probeY - enemy.y) < 2) {
                            this.onGround = true;
                            this.vy = 0;
                            this.y = enemy.y - this.height;
                            break;
                        }
                    }
                }
            }
        }
    }

    _collidesWithMap() {
        const map = this.game.map;
        // Check corners and midpoints of bounding box
        const points = [
            { x: this.x + 2, y: this.y + 2 },             // top-left
            { x: this.x + this.width - 2, y: this.y + 2 }, // top-right
            { x: this.x + 2, y: this.y + this.height - 1 }, // bottom-left
            { x: this.x + this.width - 2, y: this.y + this.height - 1 }, // bottom-right
            { x: this.x + this.width / 2, y: this.y + 2 },  // mid-top
            { x: this.x + this.width / 2, y: this.y + this.height - 1 }, // mid-bottom
            { x: this.x + 2, y: this.y + this.height / 2 },  // mid-left
            { x: this.x + this.width - 2, y: this.y + this.height / 2 }, // mid-right
        ];
        for (const p of points) {
            if (map.isSolidAtPixel(p.x, p.y)) return true;
        }
        return false;
    }

    takeDamage(amount) {
        if (!this.alive || this.invincibleTimer > 0) return;

        this.hp -= amount;
        this.game.spawnSparks(this.x + this.width / 2, this.y + this.height / 2);
        if (this.hp <= 0) {
            this.die();
        }
    }

    die() {
        this.alive = false;
        // Spawn explosion particles
        this.game.spawnExplosion(this.x + this.width / 2, this.y + this.height / 2, 15);
        this.lives--;
    }

    respawn(x, y) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.hp = PLAYER_MAX_HP;
        this.missiles = MISSILE_INITIAL_COUNT;
        this.grenades = GRENADE_INITIAL_COUNT;
        this.hoverFuel = HOVER_MAX_FUEL;
        this.alive = true;
        this.docked = true;
        this.invincibleTimer = PLAYER_RESPAWN_INVINCIBLE_FRAMES;
    }

    /** Resupply all resources (when docking) */
    resupply() {
        this.missiles = MISSILE_INITIAL_COUNT;
        this.grenades = GRENADE_INITIAL_COUNT;
        this.hoverFuel = HOVER_MAX_FUEL;
        this.hp = PLAYER_MAX_HP;
    }

    draw(ctx) {
        if (!this.alive) return;

        // Blinking during invincibility
        if (this.invincibleTimer > 0 && Math.floor(this.invincibleTimer / 3) % 2 === 0) {
            return;
        }

        const x = Math.round(this.x);
        const y = Math.round(this.y);
        const isCrouched = this.crouching || this.docked;
        const crouchOffset = isCrouched ? 8 : 0;

        this._drawBody(ctx, x, y, isCrouched, crouchOffset);
        if (!isCrouched) {
            this._drawBazooka(ctx, x, y, crouchOffset);
        }
        this._drawHoverExhaust(ctx);
    }

    _drawBody(ctx, x, y, isCrouched, crouchOffset) {
        ctx.save();

        if (!this.facingRight) {
            ctx.translate(x + this.width, y);
            ctx.scale(-1, 1);
        } else {
            ctx.translate(x, y);
        }

        // Body
        ctx.fillStyle = '#E8E8E8';
        ctx.fillRect(5, 4 + crouchOffset, 10, isCrouched ? 8 : 12);

        // Head
        ctx.fillStyle = '#CCCCCC';
        ctx.fillRect(6, crouchOffset, 8, 5);
        // Visor
        ctx.fillStyle = '#00AAFF';
        ctx.fillRect(10, 1 + crouchOffset, 3, 3);

        // Backpack (hover unit)
        ctx.fillStyle = '#AAAAAA';
        ctx.fillRect(2, 5 + crouchOffset, 4, isCrouched ? 6 : 8);
        ctx.fillStyle = '#FF6600';
        ctx.fillRect(2, (isCrouched ? 10 : 12) + crouchOffset, 4, 2);

        // Legs
        this._drawLegs(ctx, isCrouched);

        ctx.restore();
    }

    _drawLegs(ctx, isCrouched) {
        if (isCrouched) {
            this._drawCrouchedLegs(ctx);
        } else if (!this.onGround) {
            this._drawHoverLegs(ctx);
        } else {
            this._drawWalkLegs(ctx);
        }
    }

    _drawCrouchedLegs(ctx) {
        ctx.strokeStyle = '#DDDDDD';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Left leg (bent outward)
        ctx.beginPath();
        ctx.moveTo(7, 16);
        ctx.lineTo(2, 20);
        ctx.lineTo(6, 22);
        ctx.stroke();

        // Right leg (bent outward)
        ctx.beginPath();
        ctx.moveTo(10, 16);
        ctx.lineTo(15, 20);
        ctx.lineTo(11, 22);
        ctx.stroke();

        // Feet
        ctx.fillStyle = '#888888';
        ctx.fillRect(4, 21, 5, 3);
        ctx.fillRect(9, 21, 5, 3);
    }

    _drawSingleLeg(ctx, isNear, walkPose, hoverSwing) {
        const hipX = isNear ? 10 : 7;
        const hipY = 16;
        let kx, ky, fx, fy;

        if (hoverSwing !== null) {
            const maxAngle = Math.PI / 4;
            const angle = hoverSwing * maxAngle;
            const baseKx = isNear ? 1 : -1;
            const baseKy = 3;
            const baseFx = isNear ? 0 : -2;
            const baseFy = 6;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);

            kx = hipX + (baseKx * cosA - baseKy * sinA);
            ky = hipY + (baseKx * sinA + baseKy * cosA);
            fx = hipX + (baseFx * cosA - baseFy * sinA);
            fy = hipY + (baseFx * sinA + baseFy * cosA);
        } else {
            switch (walkPose) {
                case 0: kx = hipX + 2; ky = hipY + 3; fx = kx + 2; fy = 22; break;
                case 1: kx = hipX - 3; ky = hipY + 3; fx = kx - 2; fy = 20; break;
                case 2: kx = hipX; ky = hipY + 3; fx = kx; fy = 22; break;
                case 3: kx = hipX + 4; ky = hipY + 1; fx = kx - 1; fy = 19; break;
            }
        }

        // Leg stroke
        ctx.strokeStyle = isNear ? '#DDDDDD' : '#AAAAAA';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.lineTo(kx, ky);
        ctx.lineTo(fx, fy);
        ctx.stroke();

        // Foot
        ctx.fillStyle = isNear ? '#888888' : '#666666';
        ctx.save();
        ctx.translate(fx, fy);
        if (hoverSwing !== null) {
            ctx.rotate(hoverSwing * Math.PI / 6);
        }
        ctx.fillRect(-2, 0, 5, 2);
        ctx.restore();
    }

    _drawHoverLegs(ctx) {
        let localVx = this.facingRight ? this.vx : -this.vx;
        localVx = Math.max(-PLAYER_MAX_SPEED, Math.min(PLAYER_MAX_SPEED, localVx));
        const hoverSwing = localVx / PLAYER_MAX_SPEED;

        this._drawSingleLeg(ctx, false, null, hoverSwing * 0.8 - 0.2);
        this._drawSingleLeg(ctx, true, null, hoverSwing);
    }

    _drawWalkLegs(ctx) {
        // Walk cycle: 4 frames mapping near/far leg poses
        const WALK_POSES = [
            { near: 0, far: 1 },
            { near: 2, far: 3 },
            { near: 2, far: 2 }, // Standing straight/idle pose
            { near: 3, far: 2 },
        ];
        const pose = WALK_POSES[this.walkFrame];
        this._drawSingleLeg(ctx, false, pose.far, null);
        this._drawSingleLeg(ctx, true, pose.near, null);
    }

    _drawBazooka(ctx, x, y, crouchOffset) {
        const mouseWorld = this.game.input.getMouseWorld(this.game.camera);
        const cx = x + this.width / 2;
        const cy = y + 6 + crouchOffset;

        let rawAngle = Math.atan2(mouseWorld.y - cy, mouseWorld.x - cx);
        if (!this.facingRight) {
            rawAngle = Math.PI - rawAngle;
        }

        ctx.save();
        if (this.facingRight) {
            ctx.translate(cx + 2, cy);
        } else {
            ctx.translate(cx - 2, cy);
            ctx.scale(-1, 1);
        }
        ctx.rotate(rawAngle);

        // Tube
        ctx.fillStyle = '#666666';
        ctx.fillRect(0, -2, 14, 4);
        // Muzzle
        ctx.fillStyle = '#444444';
        ctx.fillRect(11, -3, 4, 6);
        // Shoulder mount
        ctx.fillStyle = '#999999';
        ctx.fillRect(-3, -3, 6, 6);
        // Detail stripe
        ctx.fillStyle = '#808080';
        ctx.fillRect(4, -1, 5, 2);

        ctx.restore();
    }

    _drawHoverExhaust(ctx) {
        if (!this.hovering) return;

        for (let i = 0; i < 3; i++) {
            const px = this.x + 4 + Math.random() * 4;
            const py = this.y + this.height + Math.random() * 6;
            const size = 1 + Math.random() * 3;
            ctx.fillStyle = COLOR_HOVER_EXHAUST;
            ctx.globalAlpha = 0.3 + Math.random() * 0.4;
            ctx.fillRect(px, py, size, size);
        }
        ctx.globalAlpha = 1.0;
    }
}
