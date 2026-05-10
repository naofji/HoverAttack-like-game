// ============================================
// EnemyCruiseMissile - Heavy, long-range homing missile
// ============================================

import {
    CRUISE_MISSILE_MAX_SPEED,
    CRUISE_MISSILE_TURN_RATE,
    CRUISE_MISSILE_ENGAGE_DISTANCE,
    CRUISE_MISSILE_LIFETIME,
    CRUISE_MISSILE_HP,
    EXPLOSION_PARTICLE_COUNT,
    PARTICLE_LIFETIME,
    TILE_SIZE,
    GRENADE_BLAST_RADIUS,
    GRENADE_EXPLOSION_COUNT
} from '../utils/Constants.js';
import { TrailParticle } from './Particle.js';
import { audioManager } from '../audio/AudioManager.js';

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
        this.engageDistance = CRUISE_MISSILE_ENGAGE_DISTANCE; // pixels (Switches to terminal homing when close)
    }

    update() {
        if (!this.alive || this.exploded) return;

        this._updateAcceleration();
        this.frameCounter++;
        this._updateGuidance();
        this._avoidObstacles();

        this.x += Math.cos(this.angle + this.driftAngle) * this.speed;
        this.y += Math.sin(this.angle + this.driftAngle) * this.speed;
        this.driftAngle *= 0.85;

        this._updateTrail();

        this.lifetime--;
        if (this.lifetime <= 0) { this.alive = false; return; }

        if (this.armingTimer > 0) { this.armingTimer--; return; }

        this._checkMapCollision();
    }

    /** Gradually accelerate from rest to cruise speed. */
    _updateAcceleration() {
        this.speed = Math.min(this.speed + this.acceleration, this.maxSpeed);
    }

    /** Manage path-following vs. terminal-homing guidance. */
    _updateGuidance() {
        const target = this._getTarget();
        if (!target) return;

        const dx = (target.x + target.width / 2) - this.x;
        const dy = (target.y + target.height / 2) - this.y;

        if (!this.homingActive && this.frameCounter > this.homingDelay) {
            if (dx * dx + dy * dy < this.engageDistance * this.engageDistance) {
                this.homingActive = true;
                this.path = null;
            }
        }

        if (this.homingActive) {
            const diff = this._normalizeAngle(Math.atan2(dy, dx) - this.angle);
            this.angle += Math.max(-CRUISE_MISSILE_TURN_RATE,
                Math.min(CRUISE_MISSILE_TURN_RATE, diff));
        } else if (this.path) {
            this._followPath();
        }
    }

    /** Spawn heavy smoke/fire trail particles. */
    _updateTrail() {
        if (this.frameCounter % 2 !== 0) return;
        for (let i = 0; i < 3; i++) {
            const tp = new TrailParticle(
                this.x + (Math.random() - 0.5) * 8,
                this.y + (Math.random() - 0.5) * 8,
                PARTICLE_LIFETIME * 2.0
            );
            if (this.homingActive && Math.random() < 0.4) {
                tp.color = 'rgba(255, 60, 0, 0.9)';
                tp.vx = (Math.random() - 0.5) * 4.0;
                tp.vy = (Math.random() - 0.5) * 4.0;
            } else {
                tp.color = 'rgba(180, 180, 180, 0.8)';
                tp.vx = (Math.random() - 0.5) * 2.0;
                tp.vy = (Math.random() - 0.5) * 2.0;
            }
            this.game.particles.push(tp);
        }
    }

    /** OBB map collision check using rotated AABB of the missile hull. */
    _checkMapCollision() {
        const map = this.game.map;
        const TS = TILE_SIZE;
        const cos = Math.cos(this.angle + this.driftAngle);
        const sin = Math.sin(this.angle + this.driftAngle);

        const corners = [
            { x: -10, y: -3 }, { x: 8, y: -3 },
            { x: 10, y: 3 }, { x: -8, y: 3 }
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

        const startC = Math.floor((this.x + minX + 2) / TS);
        const endC = Math.floor((this.x + maxX - 2) / TS);
        const startR = Math.floor((this.y + minY + 2) / TS);
        const endR = Math.floor((this.y + maxY - 2) / TS);

        let hitR = -1, hitC = -1;
        outer: for (let r = startR; r <= endR; r++) {
            for (let c = startC; c <= endC; c++) {
                if (map.isSolid(r, c)) { hitR = r; hitC = c; break outer; }
            }
        }

        if (hitR !== -1) {
            this._explode();
            return;
        }

        if (this.x < 0 || this.x > map.width || this.y < 0 || this.y > map.height) {
            this.alive = false;
        }
    }

    _followPath() {
        if (!this.path || this.currentPathIndex >= this.path.length) {
            this.path = null;
            return;
        }

        const pt = this.path[this.currentPathIndex];
        const dx = pt.x - this.x;
        const dy = pt.y - this.y;

        if (dx * dx + dy * dy < TILE_SIZE * TILE_SIZE) {
            this.currentPathIndex++;
            return;
        }

        const diff = this._normalizeAngle(Math.atan2(dy, dx) - this.angle);
        const rate = CRUISE_MISSILE_TURN_RATE * 2;
        this.angle += Math.max(-rate, Math.min(rate, diff));
    }

    /** Wrap an angle to the range (-π, π]. */
    _normalizeAngle(a) {
        while (a < -Math.PI) a += Math.PI * 2;
        while (a > Math.PI) a -= Math.PI * 2;
        return a;
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

    _explode() {
        if (this.exploded) return;
        this.exploded = true;
        this.alive = false;

        const map = this.game.map;
        const tile = map.pixelToTile(this.x, this.y);

        // AOE Map destruction (large blast like a grenade)
        map.destroyArea(tile.r, tile.c, GRENADE_BLAST_RADIUS);

        // Visual and Audio feedback
        this.game.spawnExplosion(this.x, this.y, GRENADE_EXPLOSION_COUNT);
        audioManager.playExplosion(true);
        if (this.game.camera) this.game.camera.shake(8, 15);
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
        ctx.fillRect(-8, -3, 16, 6);

        // Draw Wings (Red)
        ctx.fillStyle = '#FF2222';
        ctx.fillRect(-4, -6, 6, 12); // Top & bottom wings

        // Draw Engine Exhaust (Orange)
        ctx.fillStyle = '#FF8800';
        ctx.fillRect(-10, -2, 2, 4);

        // Draw Tip (Yellow)
        ctx.fillStyle = '#FFFF00';
        ctx.beginPath();
        ctx.moveTo(8, -3);
        ctx.lineTo(14, 0);
        ctx.lineTo(8, 3);
        ctx.fill();

        // Draw HP indicator if damaged
        if (this.hp < CRUISE_MISSILE_HP) {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.5)'; // Flash red
            ctx.fillRect(-8, -4, 16, 8);
        }

        ctx.restore();
    }
}
