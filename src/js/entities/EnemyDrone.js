// ============================================
// EnemyDrone - Flying aerial enemy unit (Quadcopter)
// ============================================

import {
    TILE_SIZE,
    ENEMY_DRONE_HP, ENEMY_DRONE_SPEED, ENEMY_DRONE_SPEED_Y_MAX,
    ENEMY_DRONE_SIGHT_RANGE, ENEMY_DRONE_FIRE_INTERVAL, ENEMY_DRONE_SCORE,
    ENEMY_DRONE_WIDTH, ENEMY_DRONE_HEIGHT,
    ENEMY_DRONE_HOVER_DIST_Y, ENEMY_DRONE_HOVER_DIST_X,
    ENEMY_DRONE_GRENADE_CHANCE,
    ENEMY_BULLET_SPEED
} from '../utils/Constants.js';
import { collidesWithMap, hasLineOfSight } from '../utils/Physics.js';
import { EnemyBullet } from './EnemyBullet.js';
import { Grenade } from './Grenade.js';

export class EnemyDrone {
    constructor(game, x, y) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = ENEMY_DRONE_WIDTH;
        this.height = ENEMY_DRONE_HEIGHT;
        this.vx = 0;
        this.vy = 0;
        this.hp = ENEMY_DRONE_HP;
        this.maxHp = this.hp;
        this.alive = true;

        this.fireTimer = Math.floor(Math.random() * ENEMY_DRONE_FIRE_INTERVAL);

        // Erratic movement states: 'patrol', 'dash', 'hover', 'attack'
        this.state = 'patrol';
        this.patrolDir = Math.random() < 0.5 ? 1 : -1;

        this.stateTimer = 0;
        this.targetAngle = 0;

        // Visuals
        this.propellerAngle = 0;
        this.tiltAngle = 0; // Tilts when dashing
        this.blinkTimer = 0;
        this.dashTargetX = 0;
        this.dashTargetY = 0;
    }

    update() {
        if (!this.alive) return;

        this.blinkTimer++;

        // Spin propellers fast
        this.propellerAngle += (this.state === 'dash' || this.state === 'patrol') ? 1.0 : 0.4;

        // State Machine
        if (this.state === 'attack') {
            this._updateAttackState();
        } else if (this.state === 'hover') {
            this._updateHoverState();
        } else if (this.state === 'dash') {
            this._updateDashState();
        } else {
            this._updatePatrolState();
        }

        // --- Move & Collide ---
        this._moveAndCollide();
    }

    _updatePatrolState() {
        this.vx = this.patrolDir * ENEMY_DRONE_SPEED * 0.3; // Slower patrol
        this.vy = Math.sin(Date.now() / 500) * 0.3; // Bobbing
        this.tiltAngle = this.patrolDir * 0.1;

        const target = this._findTarget();
        if (target) {
            this._startDash(target);
        }
    }

    _updateDashState() {
        this.stateTimer--;

        // Move aggressively towards dash target
        const dx = this.dashTargetX - this.x;
        const dy = this.dashTargetY - this.y;

        if (Math.abs(dx) > 10) {
            this.vx = Math.sign(dx) * ENEMY_DRONE_SPEED;
            this.tiltAngle = Math.sign(dx) * 0.3; // Tilt in direction of movement
            this.patrolDir = dx >= 0 ? 1 : -1;
        } else {
            this.vx *= 0.8; // Dampen
        }

        if (Math.abs(dy) > 10) {
            this.vy = Math.sign(dy) * ENEMY_DRONE_SPEED_Y_MAX;
        } else {
            this.vy *= 0.8;
        }

        if (this.stateTimer <= 0 || (Math.abs(dx) < 20 && Math.abs(dy) < 20)) {
            this._startHover();
        }
    }

    _updateHoverState() {
        this.stateTimer--;

        // Stabilize
        this.vx *= 0.8;
        this.vy = Math.sin(Date.now() / 200) * 0.5; // Fast jitter
        this.tiltAngle *= 0.8; // Return to level

        // Check weapon cooldown
        this.fireTimer--;

        if (this.stateTimer <= 0) {
            const target = this._findTarget();
            if (target && this.fireTimer <= 0) {
                this._prepareAttack(target);
            } else if (target) {
                // Dash to a new position around the target
                this._startDash(target);
            } else {
                this.state = 'patrol';
            }
        }
    }

    _updateAttackState() {
        this.stateTimer--;
        this.vx *= 0.8;
        this.vy *= 0.8;
        this.tiltAngle = 0; // Perfectly level to shoot

        if (this.stateTimer <= 0) {
            this._executeAttack();
            this._startDash(this._findTarget()); // Immediately dash away
            this.fireTimer = ENEMY_DRONE_FIRE_INTERVAL;
        }
    }

    _findTarget() {
        const player = this.game.player;
        const target = (player && player.alive && !player.docked) ? player : this.game.carrier;

        if (target && target.alive) {
            const dx = (target.x + target.width / 2) - (this.x + this.width / 2);
            const dy = (target.y + target.height / 2) - (this.y + this.height / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < ENEMY_DRONE_SIGHT_RANGE && this._hasLineOfSight(target)) {
                return target;
            }
        }
        return null;
    }

    _startDash(target) {
        if (!target) {
            this.state = 'patrol';
            return;
        }
        this.state = 'dash';
        this.stateTimer = 30 + Math.random() * 30; // Dash for 0.5s - 1s

        // Pick a random spot near the optimal hover distance
        const dx = (target.x + target.width / 2) - (this.x + this.width / 2);

        const desiredX = target.x + target.width / 2 - Math.sign(dx) * ENEMY_DRONE_HOVER_DIST_X - this.width / 2 + (Math.random() - 0.5) * 100;
        const desiredY = target.y + target.height / 2 - ENEMY_DRONE_HOVER_DIST_Y - this.height / 2 + (Math.random() - 0.5) * 50;

        this.dashTargetX = desiredX;
        this.dashTargetY = desiredY;
    }

    _startHover() {
        this.state = 'hover';
        this.stateTimer = 20 + Math.random() * 40; // Hover for 0.3s - 1s
    }

    _prepareAttack(target) {
        this.state = 'attack';
        this.stateTimer = 25; // Stop for ~0.4s to aim

        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const tx = target.x + target.width / 2;
        const ty = target.y + target.height / 2;

        let inaccuracy = (Math.random() - 0.5) * 0.15;
        this.targetAngle = Math.atan2(ty - cy, tx - cx) + inaccuracy;
        this.patrolDir = (tx - cx) >= 0 ? 1 : -1; // Face target
    }

    _executeAttack() {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;

        if (Math.random() < ENEMY_DRONE_GRENADE_CHANCE) {
            // Drop grenade
            const grenade = new Grenade(this.game, cx, cy, Math.PI / 2);
            grenade.isPlayerOwned = false;
            this.game.projectiles.push(grenade);
        } else {
            // Shoot bullet
            const bullet = new EnemyBullet(this.game, cx, cy, this.targetAngle);
            this.game.enemyBullets.push(bullet);
        }
    }

    _moveAndCollide() {
        const map = this.game.map;

        // Horizonal
        this.x += this.vx;
        if (this._collidesWithMap()) {
            this.x -= this.vx;
            this.vx = 0;
            if (this.state === 'dash') {
                this._startHover(); // Stop dashing if hit wall
            } else if (this.state === 'patrol') {
                this.patrolDir *= -1;
            }
        }

        // Vertical
        this.y += this.vy;
        if (this._collidesWithMap()) {
            this.y -= this.vy;
            this.vy = 0;
            if (this.state === 'dash') this._startHover();
        }
    }

    _collidesWithMap() {
        const points = [
            { x: this.x + 2, y: this.y + 2 },
            { x: this.x + this.width - 2, y: this.y + 2 },
            { x: this.x + 2, y: this.y + this.height - 2 },
            { x: this.x + this.width - 2, y: this.y + this.height - 2 },
        ];
        return collidesWithMap(this, this.game.map, points);
    }

    _hasLineOfSight(target) {
        return hasLineOfSight(
            this.x + this.width / 2, this.y + this.height / 2,
            target.x + target.width / 2, target.y + target.height / 2,
            this.game.map
        );
    }

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
        this.game.spawnExplosion(this.x + this.width / 2, this.y + this.height / 2, 20);
        this.game.addScore(ENEMY_DRONE_SCORE);
    }

    draw(ctx) {
        if (!this.alive) return;

        const drawX = Math.round(this.x);
        const drawY = Math.round(this.y);

        ctx.save();
        ctx.translate(drawX + this.width / 2, drawY + this.height / 2);

        ctx.rotate(this.tiltAngle);

        if (this.patrolDir < 0) {
            ctx.scale(-1, 1);
        }

        // --- Quadcopter Side-View ---

        // 1. Central Core
        ctx.fillStyle = '#445566'; // Dark blue-gray core
        ctx.fillRect(-6, -4, 12, 8);
        ctx.strokeStyle = '#223344';
        ctx.lineWidth = 1;
        ctx.strokeRect(-6, -4, 12, 8);

        // 2. Front and Back Arms (extending outwards)
        ctx.fillStyle = '#8899AA';
        // Front arm
        ctx.fillRect(6, -2, 8, 3);
        // Back arm
        ctx.fillRect(-14, -2, 8, 3);

        // 3. Motor Pods at end of arms
        ctx.fillStyle = '#334455';
        ctx.fillRect(12, -4, 4, 6); // Front pod
        ctx.fillRect(-16, -4, 4, 6); // Back pod

        // 4. Attack Indicator / Eye
        // Blinks red when attacking, yellow otherwise
        ctx.fillStyle = (this.state === 'attack' && this.blinkTimer % 8 < 4) ? '#FF2222' : '#FFCC00';
        ctx.beginPath();
        // Positioned on the lower front side of the core
        ctx.arc(4, 2, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // 5. Underside Gun/Payload bay
        ctx.fillStyle = '#222222';
        ctx.fillRect(-2, 4, 6, 3);
        ctx.fillStyle = '#555555';
        ctx.fillRect(4, 5, 3, 1); // Barrel pointing forward

        // 6. Spinning Propellers (Above pods)
        ctx.save();
        ctx.fillStyle = 'rgba(200, 220, 255, 0.6)'; // Semi-transparent bright blue/white

        // Front prop
        // Simulate flat spinning disk from side
        ctx.translate(14, -5);
        ctx.scale(Math.cos(this.propellerAngle), 1);
        ctx.fillRect(-8, 0, 16, 1);
        ctx.restore();

        ctx.save();
        ctx.fillStyle = 'rgba(200, 220, 255, 0.6)';
        // Back prop (spins slightly offset or opposite for visual variety)
        ctx.translate(-14, -5);
        ctx.scale(Math.cos(this.propellerAngle + Math.PI / 2), 1);
        ctx.fillRect(-8, 0, 16, 1);
        ctx.restore();

        ctx.restore();
    }
}
