// ============================================
// Carrier (Supply Mothership)
// ============================================

import {
    TILE_SIZE,
    CARRIER_WIDTH, CARRIER_HEIGHT, CARRIER_SPEED,
    CARRIER_MAX_HP, CARRIER_INITIAL_LIVES,
    CARRIER_MAX_FALLING_SPEED,
    GRAVITY, FRICTION
} from '../utils/Constants.js';
import { collidesWithMap } from '../utils/Physics.js';

export class Carrier {
    constructor(game, x, y) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.spawnX = x;
        this.spawnY = y;
        this.width = CARRIER_WIDTH;
        this.height = CARRIER_HEIGHT;
        this.vx = 0;
        this.vy = 0;
        this.alive = true;

        this.hp = CARRIER_MAX_HP;
        this.maxHp = this.hp;
        this.lives = CARRIER_INITIAL_LIVES;

        // Platform area for docking (relative to carrier x)
        this.platformLeft = 16;
        this.platformRight = 48;
    }

    update() {
        if (!this.alive) return;

        const input = this.game.input;
        const player = this.game.player;

        // Carrier moves with A/D when player is docked
        if (player && player.docked) {
            if (input.isKeyDown('KeyA') || input.isKeyDown('ArrowLeft')) {
                this.vx -= CARRIER_SPEED;
            }
            if (input.isKeyDown('KeyD') || input.isKeyDown('ArrowRight')) {
                this.vx += CARRIER_SPEED;
            }
        }

        // Friction & Gravity
        this.vx *= FRICTION;
        if (Math.abs(this.vx) < 0.05) this.vx = 0;
        this.vy += GRAVITY;
        if (this.vy > CARRIER_MAX_FALLING_SPEED) this.vy = CARRIER_MAX_FALLING_SPEED;

        // Movement with collision
        this._moveAndCollide();

        // Keep docked player on top
        if (player && player.docked) {
            player.x = this.x + this.width / 2 - player.width / 2;
            player.y = this.y - player.height;
        }
    }

    // ------------------------------------------
    // Physics
    // ------------------------------------------

    _moveAndCollide() {
        // --- Horizontal ---
        this.x += this.vx;
        if (this._collidesWithMap()) {
            // Check if it's a 1-tile step
            this.y -= TILE_SIZE;
            const canClimb = !this._collidesWithMap();
            this.y += TILE_SIZE;

            if (canClimb) {
                this.x -= this.vx;
                this.y -= 3;
                this.vy = 0;
            } else {
                this.x -= this.vx;
                this.vx = 0;
            }
        }

        // Push non-docked player out of the way
        this._pushPlayer();

        // --- Vertical ---
        this.y += this.vy;
        if (this._collidesWithMap()) {
            if (this.vy > 0) {
                this.y = Math.floor((this.y + this.height) / TILE_SIZE) * TILE_SIZE - this.height - 0.01;
            } else if (this.vy < 0) {
                this.y = Math.ceil(this.y / TILE_SIZE) * TILE_SIZE + 0.01;
            }
            this.vy = 0;
        }
    }

    _pushPlayer() {
        const player = this.game.player;
        if (!player || !player.alive || player.docked || this.vx === 0) return;

        // Simple AABB overlap check
        if (player.x < this.x + this.width &&
            player.x + player.width > this.x &&
            player.y < this.y + this.height &&
            player.y + player.height > this.y) {

            if (this.vx > 0 && player.x + player.width / 2 >= this.x + this.width / 2) {
                player.x = this.x + this.width;
            } else if (this.vx < 0 && player.x + player.width / 2 <= this.x + this.width / 2) {
                player.x = this.x - player.width;
            }
        }
    }

    _collidesWithMap() {
        // Carrier uses extra bottom check points for its wider hull
        const points = [
            { x: this.x + 2, y: this.y + 2 },
            { x: this.x + this.width - 2, y: this.y + 2 },
            { x: this.x + 2, y: this.y + this.height - 1 },
            { x: this.x + this.width - 2, y: this.y + this.height - 1 },
            { x: this.x + this.width / 2, y: this.y + 2 },
            { x: this.x + this.width / 2, y: this.y + this.height - 1 },
            { x: this.x + this.width / 4, y: this.y + this.height - 1 },
            { x: this.x + this.width * 3 / 4, y: this.y + this.height - 1 },
        ];
        return collidesWithMap(this, this.game.map, points);
    }

    // ------------------------------------------
    // Docking
    // ------------------------------------------

    canDock(player) {
        if (player.docked) return false;
        const px = player.x + player.width / 2;
        const py = player.y + player.height;

        const onPlatform =
            px >= this.x + this.platformLeft &&
            px <= this.x + this.platformRight &&
            py >= this.y - 5 &&
            py <= this.y + 5 &&
            player.onGround === false;

        const onTop =
            px >= this.x + this.platformLeft &&
            px <= this.x + this.platformRight &&
            Math.abs((player.y + player.height) - this.y) < 8;

        return onPlatform || onTop;
    }

    // ------------------------------------------
    // Damage & Respawn
    // ------------------------------------------

    takeDamage(amount) {
        if (!this.alive) return;
        this.hp -= amount;
        this.game.spawnHeavyDamage(this.x + this.width / 2, this.y + this.height / 2);
        if (this.hp <= 0) {
            this.die();
        }
    }

    die() {
        this.alive = false;
        this.game.spawnExplosion(this.x + this.width / 2, this.y + this.height / 2, 25);
        this.lives--;

        // Force undock player if docked
        const player = this.game.player;
        if (player && player.alive && player.docked) {
            player.docked = false;
            player.vy = -3; // Throw player slightly up into the air
            player.walkFrame = 2; // Standing straight
        }
    }

    respawn() {
        this.x = (this.spawnX !== undefined) ? this.spawnX : (5 * 16);
        this.y = (this.spawnY !== undefined) ? this.spawnY : (5 * 16);
        this.vx = 0;
        this.vy = 0;
        this.hp = CARRIER_MAX_HP;
        this.alive = true;
    }

    // ------------------------------------------
    // Draw
    // ------------------------------------------

    draw(ctx) {
        if (!this.alive) return;

        const x = Math.round(this.x);
        const y = Math.round(this.y);
        const drawY = y - 8; // Shifted up to simulate float

        this._drawHull(ctx, x, drawY);
        this._drawEngines(ctx, x, drawY);
        this._drawDockingIndicator(ctx, x, drawY);
    }

    _drawHull(ctx, x, drawY) {
        // Bottom hull
        ctx.fillStyle = '#1a3a6a';
        ctx.fillRect(x + 4, drawY + 14, 56, 16);

        // Top hull (red accent)
        ctx.fillStyle = '#AA2222';
        ctx.fillRect(x + 8, drawY + 8, 48, 8);

        // Platform deck
        ctx.fillStyle = '#CC9900';
        ctx.fillRect(x + this.platformLeft, drawY + 4, this.platformRight - this.platformLeft, 5);

        // Platform surface line
        ctx.fillStyle = '#FFCC00';
        ctx.fillRect(x + this.platformLeft, drawY + 4, this.platformRight - this.platformLeft, 2);

        // Cockpit window
        ctx.fillStyle = '#00AAFF';
        ctx.fillRect(x + 28, drawY + 10, 8, 4);

        // Hull border
        // ctx.strokeStyle = '#0a1a3a';
        // ctx.strokeRect(x + 4, drawY + 4, 56, 26);
    }

    _drawEngines(ctx, x, drawY) {
        // Engine pods
        ctx.fillStyle = '#2255AA';
        ctx.fillRect(x, drawY + 18, 8, 10);
        ctx.fillRect(x + 56, drawY + 18, 8, 10);

        // Thruster glow (animated)
        const time = Date.now() / 150;
        const glowOffset = Math.sin(time) * 2;
        ctx.fillStyle = '#00CCFF';
        ctx.fillRect(x + 1, drawY + 28, 6, 4 + glowOffset);
        ctx.fillRect(x + 57, drawY + 28, 6, 4 + glowOffset);
        ctx.fillRect(x + 20, drawY + 30, 6, 5 + glowOffset);
        ctx.fillRect(x + 38, drawY + 30, 6, 5 + glowOffset);
    }

    _drawDockingIndicator(ctx, x, drawY) {
        const player = this.game.player;
        if (player && !player.docked && this.canDock(player)) {
            ctx.fillStyle = Math.floor(Date.now() / 300) % 2 === 0 ? '#00FF00' : '#005500';
            ctx.fillRect(x + 30, drawY + 2, 4, 2);
        }
    }
}
