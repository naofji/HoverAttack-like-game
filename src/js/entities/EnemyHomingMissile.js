// ============================================
// EnemyHomingMissile - Homing projectile that avoids obstacles
// ============================================

import {
    ENEMY_HOMING_MISSILE_MAX_SPEED,
    ENEMY_HOMING_MISSILE_TURN_RATE,
    ENEMY_HOMING_MISSILE_LIFETIME,
    ENEMY_HOMING_MISSILE_DELAY,
    ENEMY_HOMING_MISSILE_ENGAGE_DISTANCE,
    PARTICLE_LIFETIME
} from '../utils/Constants.js';
import { TrailParticle } from './Particle.js';
import { playBlast } from './destruction.js';
import { avoidObstacle } from '../utils/obstacleAvoidance.js';

export class EnemyHomingMissile {
    constructor(game, x, y, initialAngle) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.angle = initialAngle;
        this.speed = 0; // Starts from zero as requested
        this.maxSpeed     = ENEMY_HOMING_MISSILE_MAX_SPEED;
        this.turnRate     = ENEMY_HOMING_MISSILE_TURN_RATE;
        this.lifetime     = ENEMY_HOMING_MISSILE_LIFETIME;
        this.homingDelay  = ENEMY_HOMING_MISSILE_DELAY;
        this.acceleration = 0.08; // Gradual startup
        this.alive = true;
        this.exploded = false;
        this.frameCounter = 0;
        this.isPlayerOwned = false; // Never player owned

        // Drift / Obstacle avoidance timer
        this.driftAngle = 0;
        
        // Delay before homing seeker can turn on (minimum arming time)
        this.homingActive = false;
        this.engageDistance = ENEMY_HOMING_MISSILE_ENGAGE_DISTANCE;
    }

    update() {
        if (!this.alive || this.exploded) return;

        this._updateAcceleration();
        this.frameCounter++;
        this._updateHoming();
        this._avoidObstacles();

        this.x += Math.cos(this.angle + this.driftAngle) * this.speed;
        this.y += Math.sin(this.angle + this.driftAngle) * this.speed;
        this.driftAngle *= 0.85;

        this._updateTrail();

        this.lifetime--;
        if (this.lifetime <= 0) { this.alive = false; return; }

        const map  = this.game.map;
        const tile = map.pixelToTile(this.x, this.y);
        if (map.isSolid(tile.r, tile.c)) {
            map.damageBlock(tile.r, tile.c, 1);
            playBlast(this.game, this.x, this.y, 'missileTerrain');
            this.exploded = true;
            this.alive    = false;
            return;
        }
        if (this.x < 0 || this.x > map.width || this.y < 0 || this.y > map.height) {
            this.alive = false;
        }
    }

    /** Gradually accelerate from rest to cruise speed. */
    _updateAcceleration() {
        this.speed = Math.min(this.speed + this.acceleration, this.maxSpeed);
    }

    /** Engage seeker when arming conditions are met, then steer toward target. */
    _updateHoming() {
        const target = this._getTarget();
        if (!target) return;

        const tx = target.x + target.width  / 2;
        const ty = target.y + target.height / 2;

        if (!this.homingActive && this.frameCounter > this.homingDelay) {
            const dx = tx - this.x;
            const dy = ty - this.y;
            if (dx * dx + dy * dy < this.engageDistance * this.engageDistance) {
                this.homingActive = true;
            }
        }

        if (this.homingActive) {
            const targetAngle = Math.atan2(ty - this.y, tx - this.x);
            const diff = this._normalizeAngle(targetAngle - this.angle);
            this.angle += Math.max(-ENEMY_HOMING_MISSILE_TURN_RATE,
                           Math.min( ENEMY_HOMING_MISSILE_TURN_RATE, diff));
        }
    }

    /** Wrap an angle to the range (-π, π]. */
    _normalizeAngle(a) {
        while (a < -Math.PI) a += Math.PI * 2;
        while (a >  Math.PI) a -= Math.PI * 2;
        return a;
    }

    /** Spawn smoke/fire trail particles. */
    _updateTrail() {
        if (this.frameCounter % 2 !== 0) return;
        for (let i = 0; i < 2; i++) {
            const tp = new TrailParticle(
                this.x + (Math.random() - 0.5) * 4,
                this.y + (Math.random() - 0.5) * 4,
                PARTICLE_LIFETIME * 1.5
            );
            if (this.homingActive && Math.random() < 0.3) {
                tp.color = 'rgba(255, 100, 0, 0.9)';
                tp.vx = (Math.random() - 0.5) * 3.0;
                tp.vy = (Math.random() - 0.5) * 3.0;
            } else {
                tp.color = 'rgba(220, 220, 220, 0.7)';
                tp.vx = (Math.random() - 0.5) * 1.5;
                tp.vy = (Math.random() - 0.5) * 1.5;
            }
            this.game.particles.push(tp);
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
        const { driftAngle, turn } = avoidObstacle({
            x: this.x, y: this.y, angle: this.angle, map: this.game.map,
            // 巡航中は遠くまで見る（終末誘導に入ったら目標を優先して見通しを詰める）
            lookAhead: this.homingActive ? 25 : 45,
            sideDrift: 0.15, sideTurn: 0.05,
            deadEndDrift: 0.2,
        });
        if (driftAngle === 0 && turn === 0) return;

        this.driftAngle = driftAngle;
        // 終末誘導に入ったら進路は目標が決める。傾けるだけにする
        if (!this.homingActive) this.angle += turn;
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
