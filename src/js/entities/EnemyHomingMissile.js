// ============================================
// EnemyHomingMissile - Homing projectile that avoids obstacles
// ============================================

import {
    ENEMY_HOMING_MISSILE_MAX_SPEED,
    ENEMY_HOMING_MISSILE_TURN_RATE,
    ENEMY_HOMING_MISSILE_LIFETIME,
    TILE_SIZE,
    EXPLOSION_PARTICLE_COUNT,
    PARTICLE_LIFETIME
} from '../utils/Constants.js';
import { TrailParticle } from './Particle.js';

export class EnemyHomingMissile {
    constructor(game, x, y, initialAngle) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.angle = initialAngle;
        this.speed = 0; // Starts from zero as requested
        this.maxSpeed = ENEMY_HOMING_MISSILE_MAX_SPEED;
        this.acceleration = 0.08; // Gradual startup
        this.alive = true;
        this.exploded = false;
        this.lifetime = ENEMY_HOMING_MISSILE_LIFETIME;
        this.frameCounter = 0;
        this.isPlayerOwned = false; // Never player owned

        // Drift / Obstacle avoidance timer
        this.driftAngle = 0;
        
        // Delay before homing seeker can turn on (minimum arming time)
        this.homingDelay = 40; // frames
        this.homingActive = false;
        this.engageDistance = 350; // pixels
    }

    update() {
        if (!this.alive || this.exploded) return;

        // Acceleration logic: start from zero and reach cruise speed
        if (this.speed < this.maxSpeed) {
            this.speed += this.acceleration;
        } else {
            this.speed = this.maxSpeed;
        }

        this.frameCounter++;

        // Homing Logic (Engages when within proximity AND after initial launch phase)
        const target = this._getTarget();
        if (target) {
            const tx = target.x + target.width / 2;
            const ty = target.y + target.height / 2;
            
            // Check delay and distance
            if (!this.homingActive && this.frameCounter > this.homingDelay) {
                const dx = tx - this.x;
                const dy = ty - this.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < this.engageDistance * this.engageDistance) {
                    this.homingActive = true; // Seeker engaged!
                }
            }

            if (this.homingActive) {
                let targetAngle = Math.atan2(ty - this.y, tx - this.x);

                // Normalize angles for smooth turning
                let diff = targetAngle - this.angle;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;

                // Apply turning with turn rate limit
                this.angle += Math.max(-ENEMY_HOMING_MISSILE_TURN_RATE, Math.min(ENEMY_HOMING_MISSILE_TURN_RATE, diff));
            }
        }

        // Obstacle Avoidance (Drifting)
        this._avoidObstacles();

        // Update Position
        this.x += Math.cos(this.angle + this.driftAngle) * this.speed;
        this.y += Math.sin(this.angle + this.driftAngle) * this.speed;
        
        // Decay drift
        this.driftAngle *= 0.85; // Slightly slower decay for longer drifts

        // Trail Particle (Intense Smoke + Fire when homing)
        if (this.frameCounter % 2 === 0) {
            for (let i = 0; i < 2; i++) {
                const tp = new TrailParticle(
                    this.x + (Math.random() - 0.5) * 4, 
                    this.y + (Math.random() - 0.5) * 4, 
                    PARTICLE_LIFETIME * 1.5
                );
                
                if (this.homingActive && Math.random() < 0.3) {
                    // Emit orange/red fire sparks when seeker is active
                    tp.color = `rgba(255, 100, 0, 0.9)`;
                    tp.vx = (Math.random() - 0.5) * 3.0;
                    tp.vy = (Math.random() - 0.5) * 3.0;
                } else {
                    tp.color = `rgba(220, 220, 220, 0.7)`;
                    tp.vx = (Math.random() - 0.5) * 1.5;
                    tp.vy = (Math.random() - 0.5) * 1.5;
                }
                this.game.particles.push(tp);
            }
        }

        this.lifetime--;
        if (this.lifetime <= 0) {
            this.alive = false;
            return;
        }

        // --- Map collision ---
        const map = this.game.map;
        const tile = map.pixelToTile(this.x, this.y);

        if (map.isSolid(tile.r, tile.c)) {
            // Damage the block and explode
            map.damageBlock(tile.r, tile.c, 1);
            this.game.spawnExplosion(this.x, this.y, EXPLOSION_PARTICLE_COUNT);
            this.exploded = true;
            this.alive = false;
            return;
        }

        // --- Out of bounds ---
        if (this.x < 0 || this.x > map.width || this.y < 0 || this.y > map.height) {
            this.alive = false;
        }
    }

    _getTarget() {
        const player = this.game.player;
        if (player && player.alive && !player.docked) {
            return player;
        }
        // If player is dead or docked, target carrier
        const carrier = this.game.carrier;
        if (carrier && carrier.alive) {
            return carrier;
        }
        return null;
    }

    _avoidObstacles() {
        // Cast a ray forward to check for upcoming tiles
        const map = this.game.map;
        // Longer lookahead when cruising to avoid hitting blocks
        const lookAheadDist = this.homingActive ? 25 : 45;
        
        const checkX = this.x + Math.cos(this.angle) * lookAheadDist;
        const checkY = this.y + Math.sin(this.angle) * lookAheadDist;
        
        if (map.isSolidAtPixel(checkX, checkY)) {
            // If there's an obstacle straight ahead, check left and right to see which is clearer
            const leftAngle = this.angle - Math.PI / 4;
            const rightAngle = this.angle + Math.PI / 4;
            
            const leftX = this.x + Math.cos(leftAngle) * lookAheadDist;
            const leftY = this.y + Math.sin(leftAngle) * lookAheadDist;
            
            const rightX = this.x + Math.cos(rightAngle) * lookAheadDist;
            const rightY = this.y + Math.sin(rightAngle) * lookAheadDist;
            
            const leftSolid = map.isSolidAtPixel(leftX, leftY);
            const rightSolid = map.isSolidAtPixel(rightX, rightY);
            
            if (leftSolid && !rightSolid) {
                this.driftAngle = 0.15; // Drift right
                // During cruise, permanently adjust angle to steer away
                if (!this.homingActive) this.angle += 0.05;
            } else if (!leftSolid && rightSolid) {
                this.driftAngle = -0.15; // Drift left
                if (!this.homingActive) this.angle -= 0.05;
            } else {
                // If both or neither, just sharply turn one way (pseudo-random based on position)
                const turn = (Math.floor(this.x) % 2 === 0) ? 0.2 : -0.2;
                this.driftAngle = turn;
                if (!this.homingActive) this.angle += turn * 0.5;
            }
        }
    }

    draw(ctx) {
        if (!this.alive || this.exploded) return;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle + this.driftAngle);

        // Draw Missile Body (Yellow/Orange base)
        ctx.fillStyle = '#FFAA00';
        ctx.fillRect(-5, -2, 10, 4);
        
        // Draw Fins (Darker orange)
        ctx.fillStyle = '#CC5500';
        ctx.fillRect(-5, -4, 3, 8);

        // Draw Tip (Red)
        ctx.fillStyle = '#FF0000';
        ctx.beginPath();
        ctx.moveTo(5, -2);
        ctx.lineTo(8, 0);
        ctx.lineTo(5, 2);
        ctx.fill();

        ctx.restore();
    }
}
