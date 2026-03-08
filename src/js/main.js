// ============================================
// Main Game Entry Point
// ============================================

window.onerror = function (msg, url, loc) {
    const div = document.createElement('div');
    div.style.position = 'absolute'; div.style.zIndex = '9999'; div.style.background = 'red';
    div.style.color = 'white'; div.style.padding = '10px'; div.style.fontSize = '20px';
    div.textContent = `ERROR: ${msg.toString()} at ${loc}`;
    document.body.appendChild(div);
};

import { Input } from './utils/Input.js';
import {
    CANVAS_WIDTH, CANVAS_HEIGHT, TILE_SIZE,
    MISSILE_MAX_ON_SCREEN, COLOR_CAVE_BG,
    HUD_TOP_HEIGHT, HUD_BOTTOM_HEIGHT,
    ENEMY_ATTACKER_TYPES,
    LANDMINE_BLAST_RADIUS
} from './utils/Constants.js';
import { Map } from './world/Map.js';
import { Camera } from './world/Camera.js';
import { Player } from './entities/Player.js';
import { Carrier } from './entities/Carrier.js';
import { Missile } from './entities/Missile.js';
import { Grenade } from './entities/Grenade.js';
import { Particle, createExplosion, createSparks } from './entities/Particle.js';
import { Landmine } from './entities/Landmine.js';
import { EnemyTank } from './entities/EnemyTank.js';
import { EnemyBullet } from './entities/EnemyBullet.js';
import { EnemyAttacker } from './entities/EnemyAttacker.js';
import { EnemyDrone } from './entities/EnemyDrone.js';
import { EnemyTurret } from './entities/EnemyTurret.js';
import { EnemyBase } from './entities/EnemyBase.js';
import { Flag } from './entities/Flag.js';
import { HUD } from './ui/HUD.js';
import { Crosshair } from './ui/Crosshair.js';
import { audioManager } from './audio/AudioManager.js';

// ============================================
// Game Object
// ============================================
const Game = {
    canvas: null,
    ctx: null,
    lastTime: 0,

    // Core systems
    input: null,
    map: null,
    camera: null,
    hud: null,
    crosshair: null,

    // Entities
    player: null,
    carrier: null,
    projectiles: [],  // missiles + grenades
    particles: [],
    landmines: [],
    enemies: [],
    enemyBullets: [],
    flag: null,

    // Game state
    score: 0,
    missionsCompleted: 0,
    gameState: 'title', // 'title', 'playing', 'gameover', 'paused', 'mission_clear'
    showMiniMap: false,

    // ==========================================
    init() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = CANVAS_WIDTH;
        this.canvas.height = CANVAS_HEIGHT;

        console.log('Hover Attack Initializing...');

        // Initialize systems
        this.input = new Input(this.canvas);
        this.map = new Map(this, this.missionsCompleted);
        this.camera = new Camera(this);
        this.hud = new HUD(this);
        this.crosshair = new Crosshair(this);

        // Find safe spawn position in the start area
        const spawnPos = this._findSpawnPosition(5, 5, 12, 10);

        // Create carrier first (player spawns on top)
        this.carrier = new Carrier(this, spawnPos.x, spawnPos.y);

        // Create player (docked on carrier)
        this.player = new Player(
            this,
            this.carrier.x + this.carrier.width / 2 - 10,
            this.carrier.y - 24
        );
        this.player.docked = true;

        // Create landmines from map spawn data
        this._spawnLandmines();

        // Create enemy tanks from map spawn data
        this._spawnEnemies();

        // Camera follows player
        this.camera.follow(this.player);
        this.camera.snapToTarget();

        console.log('Hover Attack Ready!');
        window.Game = this;

        // Start game loop
        requestAnimationFrame(this.loop.bind(this));
    },

    // ==========================================
    // Find empty spawn position within a tile region
    // ==========================================
    _findSpawnPosition(startC, startR, searchW, searchH) {
        for (let r = startR; r < startR + searchH; r++) {
            for (let c = startC; c < startC + searchW; c++) {
                // Need 3 wide x 2 tall empty space with floor below
                if (!this.map.isSolid(r, c) &&
                    !this.map.isSolid(r, c + 1) &&
                    !this.map.isSolid(r, c + 2) &&
                    !this.map.isSolid(r - 1, c) &&
                    !this.map.isSolid(r - 1, c + 1) &&
                    !this.map.isSolid(r - 1, c + 2) &&
                    this.map.isSolid(r + 1, c) &&
                    this.map.isSolid(r + 1, c + 1)) {
                    return {
                        x: c * TILE_SIZE,
                        y: (r - 1) * TILE_SIZE
                    };
                }
            }
        }
        // Fallback: just place in the carved start area
        return { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE };
    },

    // ==========================================
    // UPDATE
    // ==========================================
    update(deltaTime) {
        // --- Always update input state even if not playing ---
        // Toggle Lock-on with Shift key (moved from Input.js)
        if (this.input.isKeyPressed('ShiftLeft') || this.input.isKeyPressed('ShiftRight')) {
            this.input.crosshairLocked = !this.input.crosshairLocked;
            if (this.input.crosshairLocked) {
                const world = this.input.getMouseWorld(this.camera);
                this.input.lockedWorldX = world.x;
                this.input.lockedWorldY = world.y;
                console.log('Crosshair Locked at:', world.x, world.y);
            } else {
                console.log('Crosshair Unlocked');
            }
        }

        // --- Title Screen Input ---
        if (this.gameState === 'title') {
            if (this.input.isKeyPressed('KeyW') || this.input.isLeftClickPressed()) {
                this.gameState = 'playing';
            }
            return;
        }

        if (this.gameState !== 'playing') {
            return;
        }

        // --- MiniMap Toggle ---
        if (this.input.isKeyPressed('KeyM')) {
            this.showMiniMap = !this.showMiniMap;
        }

        // --- Docking / Undocking ---
        this._handleDocking();

        // --- Shooting ---
        this._handleShooting();

        // --- Update carrier ---
        if (this.carrier) {
            this.carrier.update();

            // Check carrier respawn
            if (!this.carrier.alive && this.carrier.lives > 0) {
                this._respawnCarrier();
            } else if (!this.carrier.alive && this.carrier.lives <= 0) {
                this.gameState = 'gameover';
            }
        }

        // --- Update player ---
        if (this.player) {
            if (!this.player.docked) {
                this.player.update();
            }
            // Check respawn
            if (!this.player.alive && this.player.lives > 0) {
                this._respawnPlayer();
            } else if (!this.player.alive && this.player.lives <= 0) {
                this.gameState = 'gameover';
            }
        }

        // --- Update camera target ---
        if (this.player && !this.player.docked && this.player.alive) {
            this.camera.follow(this.player);
        } else if (this.carrier && this.carrier.alive) {
            this.camera.follow(this.carrier);
        }
        this.camera.update();

        // --- Update projectiles ---
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            this.projectiles[i].update();
            if (!this.projectiles[i].alive) {
                this.projectiles.splice(i, 1);
            }
        }

        // --- Update particles ---
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update();
            if (!this.particles[i].alive) {
                this.particles.splice(i, 1);
            }
        }

        // --- Update landmines ---
        for (let i = this.landmines.length - 1; i >= 0; i--) {
            const mine = this.landmines[i];
            mine.update();

            // Player collision
            if (this.player && this.player.alive && !this.player.docked &&
                this.player.invincibleTimer <= 0 && mine.collidesWith(this.player)) {
                mine.detonate();
            }

            // Projectile collision (missiles/grenades can trigger mines)
            if (mine.alive) {
                for (const proj of this.projectiles) {
                    if (proj.alive && !proj.exploded && mine.collidesWithPoint(proj.x, proj.y)) {
                        mine.detonate();
                        proj.alive = false;
                        proj.exploded = true;
                        break;
                    }
                }
            }

            if (!mine.alive) {
                this.landmines.splice(i, 1);
            }
        }

        // --- Update map ---
        this.map.update();

        // --- Update enemies ---
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            this.enemies[i].update();
            if (!this.enemies[i].alive) {
                this.enemies.splice(i, 1);
            }
        }

        // --- Check Misson Clear Condition ---
        if (this.base && !this.base.alive && !this.flag && this.gameState === 'playing') {
            // Spawn flag at base position
            this.flag = new Flag(this, this.base.x + this.base.width / 2 - 6, this.base.y + this.base.height - 20);
            console.log('Base destroyed! Flag spawned.');
        }

        if (this.flag) {
            this.flag.update();
            // Check capture by player
            if (this.player && this.player.alive && !this.player.docked) {
                if (this.flag.collidesWith(this.player)) {
                    this.score += this.flag.scoreValue;
                    this.flag = null;
                    this.gameState = 'mission_clear';
                    this.missionsCompleted++;
                    console.log('FLAG CAPTURED! MISSION COMPLETE!');
                }
            }
        }

        // --- Update enemy bullets ---
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const bullet = this.enemyBullets[i];
            bullet.update();

            if (bullet.alive) {
                // Check collision with player
                if (this.player && this.player.alive && !this.player.docked && this.player.invincibleTimer <= 0) {
                    if (this._checkLaserHit(bullet, this.player)) {
                        const damage = bullet.isBaseLaser ? 50 : 10;
                        this.player.takeDamage(damage);
                        if (!bullet.isBaseLaser) bullet.alive = false;
                    }
                }
                // Check collision with carrier
                if (this.carrier && this.carrier.alive) {
                    if (this._checkLaserHit(bullet, this.carrier)) {
                        const damage = bullet.isBaseLaser ? 50 : 10;
                        this.carrier.takeDamage(damage);
                        if (!bullet.isBaseLaser) bullet.alive = false;
                    }
                }
            }

            if (!bullet.alive) {
                this.enemyBullets.splice(i, 1);
            }
        }

        // --- Projectile collision ---
        for (const proj of this.projectiles) {
            if (!proj.alive || proj.exploded) continue;

            if (proj instanceof Missile && proj.isPlayerOwned) {
                // Player missiles vs enemies (instant contact hit)
                for (const enemy of this.enemies) {
                    if (!enemy.alive) continue;
                    if (proj.x > enemy.x && proj.x < enemy.x + enemy.width &&
                        proj.y > enemy.y && proj.y < enemy.y + enemy.height) {
                        enemy.takeDamage(15);
                        this.spawnExplosion(proj.x, proj.y, 12);
                        proj.alive = false;
                        proj.exploded = true;
                        break;
                    }
                }
            } else if (proj instanceof Missile && !proj.isPlayerOwned) {
                // Enemy missiles vs player
                const player = this.player;
                if (player && player.alive && !player.docked && player.invincibleTimer <= 0) {
                    if (proj.x > player.x && proj.x < player.x + player.width &&
                        proj.y > player.y && proj.y < player.y + player.height) {
                        player.takeDamage(15);
                        this.spawnExplosion(proj.x, proj.y, 8);
                        proj.alive = false;
                        proj.exploded = true;
                        continue;
                    }
                }
                // Enemy missiles vs carrier
                const carrier = this.carrier;
                if (carrier && carrier.alive) {
                    if (proj.x > carrier.x && proj.x < carrier.x + carrier.width &&
                        proj.y > carrier.y && proj.y < carrier.y + carrier.height) {
                        carrier.takeDamage(10);
                        this.spawnExplosion(proj.x, proj.y, 8);
                        proj.alive = false;
                        proj.exploded = true;
                    }
                }
            }
        }

        // --- End of frame input cleanup ---
        this.input.endFrame();
    },
    // ==========================================
    // DOCKING LOGIC
    // ==========================================
    _handleDocking() {
        const player = this.player;
        const carrier = this.carrier;
        if (!player || !carrier || !player.alive || !carrier.alive) return;

        // Dock (S key)
        if (this.input.isKeyPressed('KeyS') && !player.docked) {
            if (carrier.canDock(player)) {
                player.docked = true;
                player.vx = 0;
                player.vy = 0;
                player.resupply();
                player.x = carrier.x + carrier.width / 2 - player.width / 2;
                player.y = carrier.y - player.height;
            }
        }

        // Undock (W key)
        if (this.input.isKeyPressed('KeyW') && player.docked) {
            // Check if standing up would immediately collide with ceiling
            // The player's visual height expands, but logical height is always PLAYER_HEIGHT
            // We give a small upward boost (-3 vy). Check if space above is clear.
            let headClear = true;
            const checkY = player.y - 4; // Check just above the player

            // Check top-left and top-right corners for the space they are about to occupy
            if (this.map.isSolidAtPixel(player.x + 2, checkY) ||
                this.map.isSolidAtPixel(player.x + player.width - 2, checkY)) {
                headClear = false;
            }

            if (headClear) {
                player.docked = false;
                player.vy = -3; // Small upward boost on launch
                player.walkFrame = 2; // Standing straight
            }
        }
    },

    // ==========================================
    // SHOOTING LOGIC
    // ==========================================
    _handleShooting() {
        const player = this.player;
        if (!player || !player.alive || player.docked) return;

        // Cannot fire weapons while crouching or stunned
        if (player.crouching || player.stunTimer > 0) return;

        const targetWorld = this.input.getTargetWorld(this.camera);
        const px = player.x + player.width / 2;
        const py = player.y + player.height / 2;
        const angle = Math.atan2(targetWorld.y - py, targetWorld.x - px);

        // Left click or Space: Missile
        const fireMissile = this.input.mouse.left || this.input.isKeyDown('Space');
        if (fireMissile && player.missiles > 0 && player.missileCooldown <= 0) {
            const activeMissiles = this.projectiles.filter(p => p instanceof Missile && p.isPlayerOwned).length;
            if (activeMissiles < MISSILE_MAX_ON_SCREEN) {
                const muzzleX = px + Math.cos(angle) * 12;
                const muzzleY = py + Math.sin(angle) * 12;
                this.projectiles.push(new Missile(this, muzzleX, muzzleY, angle, true));
                player.missiles--;
                player.missileCooldown = 15; // 0.25s cooldown between shots
                audioManager.playMissile();
            }
        }

        // Right click: Grenade
        if (this.input.isRightClickPressed() && player.grenades > 0) {
            const muzzleX = px + Math.cos(angle) * 10;
            const muzzleY = py + Math.sin(angle) * 10;
            this.projectiles.push(new Grenade(this, muzzleX, muzzleY, angle));
            player.grenades--;
            audioManager.playExplosion(false); // Small "thump" or explosion for launch
        }
    },

    // ==========================================
    _respawnPlayer() {
        if (this.carrier && this.carrier.alive) {
            this.player.respawn(
                this.carrier.x + this.carrier.width / 2 - this.player.width / 2,
                this.carrier.y - this.player.height
            );
        }
    },

    _respawnCarrier() {
        if (this.carrier) {
            // Respawn carrier at its original spawn coordinates
            this.carrier.respawn();

            // Camera immediately snaps back to carrier location
            this.camera.follow(this.carrier);
            this.camera.snapToTarget();
        }
    },

    // ==========================================
    // DRAW
    // ==========================================
    draw() {
        const ctx = this.ctx;

        // Clear entire canvas
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.gameState === 'title') {
            this._drawTitleScreen(ctx);
            return;
        }

        // --- Draw game world (camera-transformed) ---
        ctx.save();
        ctx.translate(-this.camera.x, -this.camera.y);

        // Cave background
        ctx.fillStyle = COLOR_CAVE_BG;
        ctx.fillRect(this.camera.x, this.camera.y, this.canvas.width, this.canvas.height);

        // Map
        this.map.draw(ctx);

        // Carrier
        if (this.carrier) this.carrier.draw(ctx);

        // Player
        if (this.player) this.player.draw(ctx);

        // Projectiles
        for (const proj of this.projectiles) {
            proj.draw(ctx);
        }

        // Particles
        for (const particle of this.particles) {
            particle.draw(ctx);
        }

        // Landmines (drawn on top of map, below player)
        for (const mine of this.landmines) {
            mine.draw(ctx);
        }

        // Enemies
        for (const enemy of this.enemies) {
            enemy.draw(ctx);
        }

        // Enemy bullets
        for (const bullet of this.enemyBullets) {
            bullet.draw(ctx);
        }

        // Flag
        if (this.flag) {
            this.flag.draw(ctx);
        }

        ctx.restore();

        // --- Draw HUD (screen-space) ---
        this.hud.draw(ctx);

        // --- Draw crosshair (screen-space) ---
        this.crosshair.draw(ctx);

        // --- Game Over overlay ---
        if (this.gameState === 'gameover') {
            this._drawGameOver(ctx);
        } else if (this.gameState === 'mission_clear') {
            this._drawMissionClear(ctx);
        } else if (this.showMiniMap) {
            this._drawMiniMap(ctx);
        }
    },

    _drawTitleScreen(ctx) {
        const ASCII_LOGO = [
            "    __  ______ _    ____________     ___  _______________   ________ __",
            "   / / / / __ \\ |  / / ____/ __ \\   /   |/_  __/_  __/   | / ____/ //_/",
            "  / /_/ / / / / | / / __/ / /_/ /  / /| | / /   / / / /| |/ /   / ,<  ",
            " / __  / /_/ /| |/ / /___/ _, _/  / ___ |/ /   / / / ___ / /___/ /| |  ",
            "/_/ /_/\\____/ |___/_____/_/ |_|  /_/  |_/_/   /_/ /_/  |_\\____/_/ |_|  "
        ];

        ctx.fillStyle = '#00FF00'; // Retro green
        ctx.font = 'bold 16px "Courier New", monospace';
        ctx.textAlign = 'left';

        // Approx character width for 16px Courier New is ~9.6px
        const logoWidth = 72 * 9.6;
        const startX = (this.canvas.width - logoWidth) / 2;
        const startY = this.canvas.height / 3 - 40;

        for (let i = 0; i < ASCII_LOGO.length; i++) {
            ctx.fillText(ASCII_LOGO[i], startX, startY + (i * 18));
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '20px "Courier New", monospace';
        ctx.textAlign = 'center';

        // Blinking text
        if (Math.floor(Date.now() / 500) % 2 === 0) {
            ctx.fillText('Press [W] or [Click] to Start', this.canvas.width / 2, this.canvas.height / 2 + 60);
        }

        // Render instructions
        ctx.fillStyle = '#AAAAAA';
        ctx.font = '14px "Courier New", monospace';
        ctx.fillText('Move: A/D | Launch/Burst: W | Hover: W (Hold) | Shoot: L-Click | Grenade: R-Click', this.canvas.width / 2, this.canvas.height - 60);
        ctx.fillText('Map: M | Lock-on: Shift | Dock: S', this.canvas.width / 2, this.canvas.height - 40);
    },

    _drawMissionClear(ctx) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.fillStyle = '#00FF00';
        ctx.font = '30px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('MISSION COMPLETE', this.canvas.width / 2, this.canvas.height / 2 - 20);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '16px "Courier New", monospace';
        ctx.fillText('Press [W] or [Click] to continue', this.canvas.width / 2, this.canvas.height / 2 + 20);

        // Allow next mission
        if (this.input.isKeyPressed('KeyW') || this.input.isLeftClickPressed()) {
            this.gameState = 'playing';
            this._nextMission();
        }
    },

    _drawMiniMap(ctx) {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const mm = this.map.miniMapCanvas;

        if (!mm) return;

        // Center of the screen
        const mmX = (w - mm.width) / 2;
        const mmY = (h - mm.height) / 2;

        ctx.save();
        ctx.globalAlpha = 0.85;

        // Draw the cached static map
        ctx.drawImage(mm, mmX, mmY);

        // Draw border
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(mmX, mmY, mm.width, mm.height);

        ctx.globalAlpha = 1.0;

        // Helper to draw a dot
        const drawDot = (worldX, worldY, color, size = 2) => {
            const px = mmX + (worldX / TILE_SIZE) * this.map.miniMapScale;
            const py = mmY + (worldY / TILE_SIZE) * this.map.miniMapScale;
            ctx.fillStyle = color;
            ctx.fillRect(px - size / 2, py - size / 2, size, size);
        };

        // Carrier (Blue square)
        if (this.carrier && this.carrier.alive) {
            drawDot(this.carrier.x + this.carrier.width / 2, this.carrier.y + this.carrier.height / 2, '#0088FF', 5);
        }

        // Enemies (Red squares)
        for (const enemy of this.enemies) {
            if (enemy.alive) drawDot(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#FF3333', 3);
        }

        // Player (White square)
        if (this.player && this.player.alive && !this.player.docked) {
            drawDot(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, '#FFFFFF', 4);
        }

        ctx.restore();
    },

    _drawGameOver(ctx) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.fillStyle = '#FF3333';
        ctx.font = 'bold 36px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 20);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '18px "Courier New", monospace';
        ctx.fillText(`FINAL SCORE: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2 + 20);

        ctx.fillStyle = '#888888';
        ctx.font = '14px "Courier New", monospace';
        ctx.fillText('Press R to Restart', this.canvas.width / 2, this.canvas.height / 2 + 60);
        ctx.textAlign = 'left';

        // Restart on R
        if (this.input.isKeyPressed('KeyR')) {
            this._restart();
        }
    },

    _restart() {
        this.score = 0;
        this.missionsCompleted = 0;
        this.projectiles = [];
        this.particles = [];
        this.landmines = [];
        this.enemies = [];
        this.enemyBullets = [];
        this.base = null;
        this.flag = null;
        this.gameState = 'playing';

        // Regenerate map
        this.map = new Map(this, this.missionsCompleted);
        this.hud = new HUD(this);

        const spawnPos = this._findSpawnPosition(5, 5, 12, 10);
        this.carrier = new Carrier(this, spawnPos.x, spawnPos.y);
        this.player = new Player(
            this,
            this.carrier.x + this.carrier.width / 2 - 10,
            this.carrier.y - 24
        );
        this.player.docked = true;
        this.camera.follow(this.player);
        this.camera.snapToTarget();

        // Recreate landmines
        this._spawnLandmines();

        // Recreate enemies
        this._spawnEnemies();
    },

    _nextMission() {
        this.projectiles = [];
        this.particles = [];
        this.landmines = [];
        this.enemies = [];
        this.enemyBullets = [];
        this.base = null;
        this.flag = null;
        this.gameState = 'playing';

        // Regenerate map
        this.map = new Map(this, this.missionsCompleted);
        this.hud = new HUD(this);

        const spawnPos = this._findSpawnPosition(5, 5, 12, 10);
        this.carrier = new Carrier(this, spawnPos.x, spawnPos.y);
        this.player = new Player(
            this,
            this.carrier.x + this.carrier.width / 2 - 10,
            this.carrier.y - 24
        );
        this.player.docked = true;
        this.camera.follow(this.player);
        this.camera.snapToTarget();

        // Recreate landmines
        this._spawnLandmines();

        // Recreate enemies
        this._spawnEnemies();
    },

    // ==========================================
    // HELPERS
    // ==========================================

    /** Spawn explosion particles at position */
    _checkLaserHit(bullet, target) {
        // Broad phase box check
        if (bullet.x > target.x && bullet.x < target.x + target.width &&
            bullet.y > target.y && bullet.y < target.y + target.height) {
            return true;
        }
        return false;
    },

    spawnExplosion(x, y, size) {
        const newParticles = createExplosion(x, y, size);
        this.particles.push(...newParticles);

        // Play explosion sound (large if size > 10)
        audioManager.playExplosion(size > 10);

        // Any explosion triggers nearby mines
        if (this.landmines) {
            for (const mine of this.landmines) {
                if (mine.alive) {
                    const ex = mine.x + mine.width / 2;
                    const ey = mine.y + mine.height / 2;
                    const dx = ex - x;
                    const dy = ey - y;
                    if (dx * dx + dy * dy <= LANDMINE_BLAST_RADIUS * LANDMINE_BLAST_RADIUS) {
                        // Detonate on next frame/tick to avoid deep call stacks
                        mine.detonate();
                    }
                }
            }
        }
    },

    /** Spawn damage sparks at position */
    spawnSparks(x, y) {
        const newParticles = createSparks(x, y);
        this.particles.push(...newParticles);
    },

    /** Add to score */
    addScore(points) {
        this.score += points;
    },

    /** Create Landmine entities from the map's spawn data */
    _spawnLandmines() {
        this.landmines = [];
        for (const pos of this.map.landmineSpawns) {
            this.landmines.push(new Landmine(this, pos.x, pos.y));
        }
    },

    /** Create EnemyTank and EnemyAttacker entities from the map's spawn data */
    _spawnEnemies() {
        this.enemies = [];
        this.enemyBullets = [];

        // Helper function to find a non-overlapping spawn offset
        const resolveOverlap = (baseX, baseY) => {
            let x = baseX;
            let y = baseY;
            // Try to find a clear spot by nudging left or right up to 3 times
            for (let attempt = 0; attempt < 10; attempt++) {
                let isOverlapping = false;
                for (const e of this.enemies) {
                    // Check if centers are too close (e.g. < 24px)
                    const dx = (e.x + e.width / 2) - (x + 12); // assume ~24px width
                    const dy = (e.y + e.height / 2) - (y + 8);
                    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) {
                        isOverlapping = true;
                        break;
                    }
                }
                if (!isOverlapping) return { x, y }; // Found a good spot
                // Nudge left or right randomly
                x += (Math.random() < 0.5 ? -1 : 1) * 16;
            }
            return { x, y }; // Fallback to whatever we have if it's too crowded
        };

        // Spawn hover tanks
        for (const pos of this.map.enemyTankSpawns) {
            const adjustedPos = resolveOverlap(pos.x, pos.y);
            this.enemies.push(new EnemyTank(this, adjustedPos.x, adjustedPos.y));
        }

        // Filter available attacker types based on missionsCompleted
        // Mission 1 (0): None (handled by Map.js)
        // Mission 2 (1): Standard only
        // Mission 3+ (2+): Standard + Heavy
        // Mission 4+ (3+): Standard + Heavy + Rival
        const availableTypes = {};
        let totalWeight = 0;

        for (const [key, type] of Object.entries(ENEMY_ATTACKER_TYPES)) {
            if (key === 'heavy' && this.missionsCompleted < 2) continue;
            if (key === 'rival' && this.missionsCompleted < 3) continue;

            availableTypes[key] = type;
            totalWeight += type.spawnWeight;
        }

        // Attackers (Humanoids)
        for (const pos of this.map.enemyAttackerSpawns) {
            let rnd = Math.random() * totalWeight;
            let selectedTypeKey = 'standard';

            for (const [key, typeDef] of Object.entries(availableTypes)) {
                if (rnd < typeDef.spawnWeight) {
                    selectedTypeKey = key;
                    break;
                }
                rnd -= typeDef.spawnWeight;
            }
            const adjustedPos = resolveOverlap(pos.x, pos.y);
            this.enemies.push(new EnemyAttacker(this, adjustedPos.x, adjustedPos.y, availableTypes[selectedTypeKey]));
        }

        // Spawn aerial drones
        for (const pos of this.map.enemyDroneSpawns) {
            // Drones hover, so overlapping is less of an issue, but staggering helps
            this.enemies.push(new EnemyDrone(this, pos.x, pos.y));
        }

        // Spawn stationary turrets
        for (const pos of this.map.enemyTurretSpawns) {
            this.enemies.push(new EnemyTurret(this, pos.x, pos.y, pos.isCeiling));
        }

        // Spawn Main Base at the very end
        if (this.map.enemyBaseSpawn) {
            this.base = new EnemyBase(this, this.map.enemyBaseSpawn.x, this.map.enemyBaseSpawn.y);
            this.enemies.push(this.base);
        }
    },

    // ==========================================
    // GAME LOOP
    // ==========================================
    loop(timestamp) {
        let deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        // Cap deltaTime to prevent spiraling
        if (deltaTime > 50) deltaTime = 50;

        this.update(deltaTime);
        this.draw();

        // Clear input state after drawing (which might process input for menus/screens)
        this.input.endFrame();

        requestAnimationFrame(this.loop.bind(this));
    }
};

// ============================================
// Start (ES modules are deferred, DOM is ready)
// ============================================
Game.init();
