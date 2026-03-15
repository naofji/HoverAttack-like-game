import {
    ENEMY_BASE_WIDTH,
    ENEMY_BASE_HEIGHT,
    ENEMY_BASE_SCORE,
    ENEMY_BASE_SHIELDS,
    ENEMY_BASE_HP,
    TILE_SIZE,
    BASE_LASER_RANGE,
    BASE_LASER_CHARGE_TIME,
    BASE_LASER_COOLDOWN
} from '../utils/Constants.js';
import { BaseLaser } from './BaseLaser.js';
import { audioManager } from '../audio/AudioManager.js';

export class EnemyBase {
    constructor(game, x, y) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = ENEMY_BASE_WIDTH;
        this.height = ENEMY_BASE_HEIGHT;

        this.scoreValue = ENEMY_BASE_SCORE;
        this.shields = ENEMY_BASE_SHIELDS;
        this.hp = ENEMY_BASE_HP;
        this.alive = true;
        this.name = 'base';
        this.isBase = true; // Flag for win condition check

        // Bounding box for collision
        this.bounds = {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height
        };

        // Animation state
        this.coreAnimTimer = 0;

        // Laser Attack State
        this.attackState = 'idle'; // 'idle', 'charging', 'cooldown'
        this.chargeTimer = 0;
        this.cooldownTimer = 0;
        this.chargeParticles = [];
    }

    update() {
        if (!this.alive) return;

        // Animate the core
        this.coreAnimTimer += 1;

        // Update Laser State
        this._updateLaser();

        // Keep bounds updated
        this.bounds.x = this.x;
        this.bounds.y = this.y;
    }

    _updateLaser() {
        const target = this._findTarget();

        if (this.attackState === 'idle') {
            if (target) {
                this.attackState = 'charging';
                this.chargeTimer = 0;
                audioManager.playLaserCharge();
            }
        } else if (this.attackState === 'charging') {
            this.chargeTimer++;

            // Spawn random intake particles
            if (this.chargeTimer % 2 === 0) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 60 + Math.random() * 40;
                this.chargeParticles.push({
                    x: Math.cos(angle) * dist,
                    y: Math.sin(angle) * dist,
                    life: 30
                });
            }

            // Update charge particles
            for (let i = this.chargeParticles.length - 1; i >= 0; i--) {
                const p = this.chargeParticles[i];
                p.x *= 0.9; // move towards center (0,0 relative to core)
                p.y *= 0.9;
                p.life--;
                if (p.life <= 0) this.chargeParticles.splice(i, 1);
            }

            if (this.chargeTimer >= BASE_LASER_CHARGE_TIME) {
                this._fireLaser(target);
                this.attackState = 'cooldown';
                this.cooldownTimer = 0;
                this.chargeParticles = [];
            }
        } else if (this.attackState === 'cooldown') {
            this.cooldownTimer++;
            if (this.cooldownTimer >= BASE_LASER_COOLDOWN) {
                this.attackState = 'idle';
            }
        }
    }

    _findTarget() {
        // Find closest between player and carrier
        const candidates = [];
        if (this.game.player && this.game.player.alive && !this.game.player.docked) candidates.push(this.game.player);
        if (this.game.carrier && this.game.carrier.alive) candidates.push(this.game.carrier);

        let bestTarget = null;
        let minDist = BASE_LASER_RANGE;

        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;

        for (const c of candidates) {
            const dx = c.x + c.width / 2 - centerX;
            const dy = c.y + c.height / 2 - centerY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) {
                minDist = dist;
                bestTarget = c;
            }
        }
        return bestTarget;
    }

    _fireLaser(target) {
        if (!target) return;
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const angle = Math.atan2(target.y + target.height / 2 - centerY, target.x + target.width / 2 - centerX);

        const laser = new BaseLaser(this.game, centerX, centerY, angle);
        this.game.enemyBullets.push(laser); // Put in enemyBullets so it gets updated and drawn
        audioManager.playLaserFire();
        console.log("ENEMY BASE FIRED LASER!");
    }

    takeDamage(amount) {
        if (!this.alive) return;

        // Damage the shield first
        if (this.shields > 0) {
            this.shields--;
            this.game.score += 50; // Small score for breaking a shield
            this._spawnSparks();
        } else {
            // If shields are gone, damage the core
            this.hp--;
            if (this.hp <= 0) {
                this._die();
            } else {
                this._spawnSparks();
            }
        }
    }

    _spawnSparks() {
        this.game.spawnSparks(this.x + this.width / 2, this.y + this.height / 2);
    }

    _die() {
        this.alive = false;
        this.game.score += this.scoreValue;

        // Massive explosion
        this.game.spawnExplosion(this.x + this.width / 2, this.y + this.height / 2, 70);
        audioManager.playBaseDestroyed();
    }

    draw(ctx) {
        if (!this.alive) return;

        const drawX = Math.round(this.x);
        const drawY = Math.round(this.y);

        ctx.save();
        ctx.translate(drawX, drawY);

        // 1. Draw base structure (dark gray frame)
        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 0, this.width, this.height);

        const coreX = this.width / 2;
        const coreY = this.height / 2;

        let safeCoreX = coreX || 16;
        let safeCoreY = coreY || 24;
        let safeTimer = this.coreAnimTimer || 0;

        // --- Structural Pillars (Top and Bottom clamping the core) ---
        ctx.fillStyle = '#CCCCCC'; // Light gray / white-ish
        ctx.fillRect(safeCoreX - 20, 0, 40, safeCoreY - 25); // Top pillar
        ctx.fillRect(safeCoreX - 20, safeCoreY + 25, 40, this.height - (safeCoreY + 25)); // Bottom pillar

        // Pillar details (metallic shading lines)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(safeCoreX - 16, 0, 4, safeCoreY - 25);
        ctx.fillRect(safeCoreX - 16, safeCoreY + 25, 4, this.height - (safeCoreY + 25));
        ctx.fillStyle = '#888888';
        ctx.fillRect(safeCoreX + 12, 0, 4, safeCoreY - 25);
        ctx.fillRect(safeCoreX + 12, safeCoreY + 25, 4, this.height - (safeCoreY + 25));

        // Horizontal clamps holding the core
        ctx.fillStyle = '#AAAAAA';
        ctx.fillRect(safeCoreX - 25, safeCoreY - 28, 50, 6);
        ctx.fillRect(safeCoreX - 25, safeCoreY + 22, 50, 6);
        ctx.fillStyle = '#DDDDDD';
        ctx.fillRect(safeCoreX - 23, safeCoreY - 27, 46, 2);
        ctx.fillRect(safeCoreX - 23, safeCoreY + 23, 46, 2);

        // 2. Draw Shields (from outside in, complex metallic structures)
        ctx.lineWidth = 3;

        // Helper function to draw metallic segmented arcs
        const drawSegmentedShield = (radius, color, rotationOffset, segments = 8) => {
            ctx.strokeStyle = color;
            ctx.beginPath();
            const step = (Math.PI * 2) / segments;
            const gap = 0.15; // angular gap between segments
            for (let i = 0; i < segments; i++) {
                const angle = i * step + rotationOffset;
                ctx.arc(safeCoreX, safeCoreY, radius, angle + gap, angle + step - gap);
            }
            ctx.stroke();

            // Draw connecting nodes
            ctx.fillStyle = '#FFFFFF';
            for (let i = 0; i < segments; i++) {
                const angle = i * step + rotationOffset;
                const nx = safeCoreX + Math.cos(angle) * radius;
                const ny = safeCoreY + Math.sin(angle) * radius;
                ctx.fillRect(nx - 2, ny - 2, 4, 4);
            }
        };

        const rotSpeed1 = safeTimer * 0.02;
        const rotSpeed2 = -safeTimer * 0.03;
        const rotSpeed3 = safeTimer * 0.015;

        // Shield 3 (Outer)
        if (this.shields >= 3) {
            drawSegmentedShield(45, '#DDDDDD', rotSpeed3, 8); // White-gray metallic
            ctx.strokeStyle = '#888888';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(safeCoreX, safeCoreY, 48, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Shield 2 (Middle)
        ctx.lineWidth = 4;
        if (this.shields >= 2) {
            drawSegmentedShield(35, '#AAAAAA', rotSpeed2, 6); // Gray metallic
        }

        // Shield 1 (Inner)
        ctx.lineWidth = 5;
        if (this.shields >= 1) {
            drawSegmentedShield(25, '#FFFFFF', rotSpeed1, 4); // Bright white metallic
            // Inner protective hex
            ctx.strokeStyle = 'rgba(200, 255, 255, 0.4)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i <= 6; i++) {
                const a = i * (Math.PI / 3) + rotSpeed1;
                const hx = safeCoreX + Math.cos(a) * 20;
                const hy = safeCoreY + Math.sin(a) * 20;
                if (i === 0) ctx.moveTo(hx, hy);
                else ctx.lineTo(hx, hy);
            }
            ctx.stroke();
        }

        // 3. Draw Core (Emerald Green and Sparkling)
        // Pulsating effect using sine wave
        const pulse = (Math.sin(safeTimer / 8) + 1) / 2; // 0 to 1
        const coreRadius = Math.max(1, 8 + pulse * 3);

        // Fallback for extreme paranoia, createRadialGradient requires finite numbers > 0
        if (!isFinite(safeCoreX)) safeCoreX = 16;
        if (!isFinite(safeCoreY)) safeCoreY = 24;

        try {
            // Emerald green glowing gradient
            const gradient = ctx.createRadialGradient(safeCoreX, safeCoreY, 0, safeCoreX, safeCoreY, coreRadius * 2);
            gradient.addColorStop(0, '#FFFFFF'); // Bright center
            gradient.addColorStop(0.3 + pulse * 0.2, '#00FFAA'); // Emerald Green
            gradient.addColorStop(1, 'rgba(0, 255, 170, 0)'); // Fade out

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(safeCoreX, safeCoreY, coreRadius * 2, 0, Math.PI * 2);
            ctx.fill();

            // Sparkles on the core
            ctx.fillStyle = '#FFFFFF';
            const sparkleCount = 4;
            for (let i = 0; i < sparkleCount; i++) {
                // Pseudo-random offset based on timer to make sparks jitter
                const spAngle = (safeTimer * 0.1 + i * (Math.PI * 2 / sparkleCount));
                const spDist = (Math.sin(safeTimer * 0.2 + i) + 1) / 2 * coreRadius;
                const sx = safeCoreX + Math.cos(spAngle) * spDist;
                const sy = safeCoreY + Math.sin(spAngle) * spDist;

                // Draw tiny cross spark
                const spSize = Math.random() * 2 + 1;
                ctx.fillRect(sx - spSize / 2, sy - 0.5, spSize, 1);
                ctx.fillRect(sx - 0.5, sy - spSize / 2, 1, spSize);
            }

            // Solid inner core
            ctx.fillStyle = '#E0FFFF'; // Light cyan/white glow
            ctx.beginPath();
            ctx.arc(safeCoreX, safeCoreY, coreRadius * 0.5, 0, Math.PI * 2);
            ctx.fill();

            // Draw Charge Particles
            if (this.attackState === 'charging') {
                ctx.fillStyle = '#00FFAA';
                for (const p of this.chargeParticles) {
                    const size = 1 + (p.life / 30) * 2;
                    ctx.fillRect(safeCoreX + p.x - size / 2, safeCoreY + p.y - size / 2, size, size);
                }
            }
        } catch (e) {
            console.error("Gradient error in base:", e);
        }

        ctx.restore();
    }
}
