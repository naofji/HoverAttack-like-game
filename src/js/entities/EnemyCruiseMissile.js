// ============================================
// EnemyCruiseMissile - Heavy, long-range homing missile
// ============================================

import {
    CRUISE_MISSILE_MAX_SPEED,
    CRUISE_MISSILE_TURN_RATE,
    CRUISE_MISSILE_LIFETIME,
    CRUISE_MISSILE_HP,
    EXPLOSION_PARTICLE_COUNT,
    PARTICLE_LIFETIME,
    TILE_SIZE
} from '../utils/Constants.js';
import { TrailParticle } from './Particle.js';

export class EnemyCruiseMissile {
    constructor(game, x, y, initialAngle, path = null) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = 24; // Visual size from exhaust (-10) to tip (+14)
        this.height = 16; // Visual size from top wing (-8) to bottom wing (+8)
        this.angle = initialAngle;
        this.speed = 0; // Starts from zero
        this.maxSpeed = CRUISE_MISSILE_MAX_SPEED;
        this.acceleration = 0.05; // Slower acceleration than homing missile
        this.alive = true;
        this.exploded = false;
        this.lifetime = CRUISE_MISSILE_LIFETIME;
        this.frameCounter = 0;
        this.isPlayerOwned = false; // Never player owned

        this.hp = CRUISE_MISSILE_HP; // Can be shot down

        // Path following
        this.path = path;
        this.currentPathIndex = 1; // Start at 1 because 0 is the origin

        // Arming delay: ignore map collision for the first N frames to escape the launch area
        this.armingTimer = 45; // 45 frames (~0.75 sec) before collision detection activates

        // Drift / Obstacle avoidance timer
        this.driftAngle = 0;

        // Delay before homing seeker can turn on (minimum arming time)
        this.homingDelay = 60; // frames (1 second before it can engage tracking)
        this.homingActive = false;
        this.engageDistance = 100; // pixels (Switches to terminal homing when close)
    }

    update() {
        if (!this.alive || this.exploded) return;

        // Acceleration logic
        if (this.speed < this.maxSpeed) {
            this.speed += this.acceleration;
        } else {
            this.speed = this.maxSpeed;
        }

        this.frameCounter++;

        // --- Mode Control ---
        const target = this._getTarget();
        if (target) {
            const dx = (target.x + target.width / 2) - this.x;
            const dy = (target.y + target.height / 2) - this.y;
            const distSq = dx * dx + dy * dy;

            // Switch to Terminal Homing if close enough
            if (!this.homingActive && this.frameCounter > this.homingDelay) {
                if (distSq < this.engageDistance * this.engageDistance) {
                    this.homingActive = true;
                    this.path = null; // Drop A* path when homing starts
                }
            }

            if (this.homingActive) {
                // Terminal Homing (Direct tracking)
                let targetAngle = Math.atan2(dy, dx);
                let diff = targetAngle - this.angle;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                this.angle += Math.max(-CRUISE_MISSILE_TURN_RATE, Math.min(CRUISE_MISSILE_TURN_RATE, diff));
            } else if (this.path) {
                // Cruise Phase: Follow A* Path
                this._followPath();
            }
        }

        // Obstacle Avoidance (Drifting)
        // Now integrated: always runs to provide smooth nudges away from walls
        this._avoidObstacles();

        // Update Position
        this.x += Math.cos(this.angle + this.driftAngle) * this.speed;
        this.y += Math.sin(this.angle + this.driftAngle) * this.speed;

        // Decay drift
        this.driftAngle *= 0.85;

        // Trail Particle (Intense Smoke + Fire when homing)
        if (this.frameCounter % 2 === 0) {
            // Cruise missile emits larger, thicker smoke
            for (let i = 0; i < 3; i++) {
                const tp = new TrailParticle(
                    this.x + (Math.random() - 0.5) * 8,
                    this.y + (Math.random() - 0.5) * 8,
                    PARTICLE_LIFETIME * 2.0
                );

                if (this.homingActive && Math.random() < 0.4) {
                    // Emit orange/red fire sparks when seeker is active
                    tp.color = `rgba(255, 60, 0, 0.9)`;
                    tp.vx = (Math.random() - 0.5) * 4.0;
                    tp.vy = (Math.random() - 0.5) * 4.0;
                } else {
                    tp.color = `rgba(180, 180, 180, 0.8)`;
                    tp.vx = (Math.random() - 0.5) * 2.0;
                    tp.vy = (Math.random() - 0.5) * 2.0;
                }
                this.game.particles.push(tp);
            }
        }

        this.lifetime--;
        if (this.lifetime <= 0) {
            this.alive = false;
            return;
        }

        // Decrement arming timer
        if (this.armingTimer > 0) {
            this.armingTimer--;
            return; // Skip collision detection until armed
        }

        // --- Map collision (Rotated Block unit overlap check) ---
        const map = this.game.map;
        const TS = TILE_SIZE; // 16px

        // Calculate the bounding box of the ROTATED missile
        const cos = Math.cos(this.angle + this.driftAngle);
        const sin = Math.sin(this.angle + this.driftAngle);

        // Visual corners relative to center (width goes -10 to 14, height -8 to 8)
        const corners = [
            { x: -10, y: -8 },
            { x: 14, y: -8 },
            { x: 14, y: 8 },
            { x: -10, y: 8 }
        ];

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        for (const pt of corners) {
            const rx = pt.x * cos - pt.y * sin;
            const ry = pt.x * sin + pt.y * cos;
            if (rx < minX) minX = rx;
            if (rx > maxX) maxX = rx;
            if (ry < minY) minY = ry;
            if (ry > maxY) maxY = ry;
        }

        // Calculate the range of blocks (tiles) the rotated AABB overlaps
        // Adding a small 2px leeway to prevent scraping on perfectly parallel walls
        const startC = Math.floor((this.x + minX + 2) / TS);
        const endC = Math.floor((this.x + maxX - 2) / TS);
        const startR = Math.floor((this.y + minY + 2) / TS);
        const endR = Math.floor((this.y + maxY - 2) / TS);

        let hitR = -1;
        let hitC = -1;

        // Check all overlapping blocks
        for (let r = startR; r <= endR; r++) {
            for (let c = startC; c <= endC; c++) {
                if (map.isSolid(r, c)) {
                    hitR = r;
                    hitC = c;
                    break;
                }
            }
            if (hitR !== -1) break;
        }

        if (hitR !== -1) {
            // Damage the block and explode
            console.warn(`[CruiseMissile] HIT BLOCK at tile(r=${hitR}, c=${hitC}) | missile pos=(${Math.round(this.x)}, ${Math.round(this.y)}) | angle=${this.angle.toFixed(2)} | drift=${this.driftAngle.toFixed(3)}`);
            map.damageBlock(hitR, hitC, 3);
            this.game.spawnExplosion(this.x, this.y, EXPLOSION_PARTICLE_COUNT * 2);
            this.exploded = true;
            this.alive = false;
            return;
        }

        // --- Out of bounds ---
        if (this.x < 0 || this.x > map.width || this.y < 0 || this.y > map.height) {
            this.alive = false;
        }
    }

    _followPath() {
        if (!this.path || this.currentPathIndex >= this.path.length) {
            this.path = null;
            return;
        }

        const targetPt = this.path[this.currentPathIndex];
        const tx = targetPt.x;
        const ty = targetPt.y;

        const dx = tx - this.x;
        const dy = ty - this.y;
        const distSq = dx * dx + dy * dy;

        // If reached waypoint, move to next
        // Threshold: waypoint radius = TILE_SIZE (16px). distSq < 16*16 = 256
        if (distSq < TILE_SIZE * TILE_SIZE) {
            this.currentPathIndex++;
            return;
        }

        // Steer towards waypoint
        let targetAngle = Math.atan2(dy, dx);
        let diff = targetAngle - this.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        // Turn faster during path following to stay on course
        this.angle += Math.max(-CRUISE_MISSILE_TURN_RATE * 2, Math.min(CRUISE_MISSILE_TURN_RATE * 2, diff));
    }

    _getTarget() {
        // Cruise missile prioritizes the Carrier. If dead, targets Player.
        const carrier = this.game.carrier;
        if (carrier && carrier.alive) {
            return carrier;
        }
        const player = this.game.player;
        if (player && player.alive && !player.docked) {
            return player;
        }
        return null;
    }

    _avoidObstacles() {
        const map = this.game.map;
        // Shorter lookahead when following a path to avoid overreacting to corners
        const lookAheadDist = this.homingActive ? 40 : (this.path ? 50 : 80);

        const checkX = this.x + Math.cos(this.angle) * lookAheadDist;
        const checkY = this.y + Math.sin(this.angle) * lookAheadDist;

        if (map.isSolidAtPixel(checkX, checkY)) {
            const leftAngle = this.angle - Math.PI / 4;
            const rightAngle = this.angle + Math.PI / 4;

            const leftX = this.x + Math.cos(leftAngle) * lookAheadDist;
            const leftY = this.y + Math.sin(leftAngle) * lookAheadDist;

            const rightX = this.x + Math.cos(rightAngle) * lookAheadDist;
            const rightY = this.y + Math.sin(rightAngle) * lookAheadDist;

            const leftSolid = map.isSolidAtPixel(leftX, leftY);
            const rightSolid = map.isSolidAtPixel(rightX, rightY);

            if (leftSolid && !rightSolid) {
                this.driftAngle = 0.12; // Stronger nudge for safety
                // Only change permanent angle if we don't have a path to follow
                if (!this.homingActive && !this.path) this.angle += 0.03;
            } else if (!leftSolid && rightSolid) {
                this.driftAngle = -0.12;
                if (!this.homingActive && !this.path) this.angle -= 0.03;
            } else {
                // Dead end or narrow passage: jitter slightly to find a gap
                const turn = (Math.floor(this.x) % 2 === 0) ? 0.1 : -0.1;
                this.driftAngle = turn;
                if (!this.homingActive && !this.path) this.angle += turn * 0.5;
            }
        }
    }

    draw(ctx) {
        if (!this.alive || this.exploded) return;

        // --- Debug: Draw A* Path ---
        if (this.path && this.path.length > 0) {
            ctx.save();
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)'; // Cyan translucent line
            ctx.setLineDash([5, 5]); // Dashed line for a "scanning" look
            ctx.lineWidth = 1;
            ctx.beginPath();

            // Start from the missile's position
            ctx.moveTo(this.x, this.y);

            // Draw lines through remaining waypoints
            for (let i = this.currentPathIndex; i < this.path.length; i++) {
                const pt = this.path[i];
                ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
            ctx.restore();
        }

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle + this.driftAngle);

        // Draw Cruise Missile Body (Dark Gray/Red)
        // Much larger: 16x8
        ctx.fillStyle = '#444444';
        ctx.fillRect(-8, -4, 16, 8);

        // Draw Wings (Red)
        ctx.fillStyle = '#FF2222';
        ctx.fillRect(-4, -8, 6, 16); // Top & bottom wings

        // Draw Engine Exhaust (Orange)
        ctx.fillStyle = '#FF8800';
        ctx.fillRect(-10, -2, 2, 4);

        // Draw Tip (Yellow)
        ctx.fillStyle = '#FFFF00';
        ctx.beginPath();
        ctx.moveTo(8, -4);
        ctx.lineTo(14, 0);
        ctx.lineTo(8, 4);
        ctx.fill();

        // Draw HP indicator if damaged
        if (this.hp < CRUISE_MISSILE_HP) {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.5)'; // Flash red
            ctx.fillRect(-8, -4, 16, 8);
        }

        ctx.restore();
    }
}
