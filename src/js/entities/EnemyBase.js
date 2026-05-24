import {
    ENEMY_BASE_WIDTH,
    ENEMY_BASE_HEIGHT,
    ENEMY_BASE_SCORE,
    ENEMY_BASE_SHIELDS,
    ENEMY_BASE_HP,
    TILE_SIZE,
    BASE_LASER_RANGE,
    BASE_LASER_CHARGE_TIME,
    BASE_LASER_COOLDOWN,
    CRUISE_MISSILE_WARNING_TIME,
    CRUISE_MISSILE_MIN_DELAY,
    CRUISE_MISSILE_MAX_DELAY,
    ENEMY_BASE_TURRET_COOLDOWN,
    ENEMY_BASE_TURRET_BURST_COUNT,
    ENEMY_BASE_TURRET_BURST_DELAY,
    ENEMY_BASE_MISSILE_COOLDOWN,
    ENEMY_BASE_HOMING_COOLDOWN,
    CRUISE_MISSILE_ACTIVATION_RANGE
} from '../utils/Constants.js';
import { BaseLaser } from './BaseLaser.js';
import { EnemyBullet } from './EnemyBullet.js';
import { Missile } from './Missile.js';
import { EnemyHomingMissile } from './EnemyHomingMissile.js';
import { EnemyCruiseMissile } from './EnemyCruiseMissile.js';
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

        // Additional Weapons State
        this.turretState = 'idle'; // 'idle', 'bursting', 'cooldown'
        this.turretCooldownTimer = Math.floor(Math.random() * ENEMY_BASE_TURRET_COOLDOWN);
        this.turretBurstCount = 0;
        this.turretBurstTimer = 0;

        this.missileTimer = ENEMY_BASE_MISSILE_COOLDOWN;
        this.homingTimer  = ENEMY_BASE_HOMING_COOLDOWN;

        // Cruise Missile State
        this._resetCruiseMissileTimer();
        this.cruiseWarning = false;

        // Destruction Sequence State
        this.dying = false;
        this.dyingTimer = 0;
    }

    _resetCruiseMissileTimer() {
        const range = CRUISE_MISSILE_MAX_DELAY - CRUISE_MISSILE_MIN_DELAY;
        this.cruiseMissileTimer = CRUISE_MISSILE_MIN_DELAY + Math.floor(Math.random() * range);
    }

    update() {
        if (!this.alive) return;

        if (this.dying) {
            this._updateDyingSequence();
            return;
        }

        this.coreAnimTimer += 1;
        this._updateLaser();
        this._updateBaseTurret();
        this._updateBaseMissile();
        this._updateBaseHoming();
        this._updateCruiseMissile();

        // Keep bounds in sync with position
        this.bounds.x = this.x;
        this.bounds.y = this.y;
    }

    /** Tick the cinematic destruction sequence. */
    _updateDyingSequence() {
        this.dyingTimer--;

        if (this.dyingTimer % 6 === 0) {
            const rx   = this.x + Math.random() * this.width;
            const ry   = this.y + Math.random() * this.height;
            const size = 20 + Math.random() * 30;
            this.game.spawnExplosion(rx, ry, size);
            audioManager.playExplosion(size > 35);
            if (this.game.camera) this.game.camera.shake(8, 3);
        }

        if (this.dyingTimer <= 0) this._finishDestruction();
    }

    _updateLaser() {
        const target = this._findTarget(BASE_LASER_RANGE);

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

    _updateBaseTurret() {
        // Mission 2+ (missionsCompleted 1+)
        if (this.game.missionsCompleted < 1) return;

        const target = this._findTarget(BASE_LASER_RANGE);

        if (this.turretState === 'idle') {
            if (this.turretCooldownTimer > 0) {
                this.turretCooldownTimer--;
            } else if (target) {
                this.turretState = 'bursting';
                this.turretBurstCount = ENEMY_BASE_TURRET_BURST_COUNT;
                this.turretBurstTimer = 0;
            }
        } else if (this.turretState === 'bursting') {
            if (this.turretBurstTimer <= 0) {
                this._fireTurretBullet(target);
                this.turretBurstCount--;
                this.turretBurstTimer = ENEMY_BASE_TURRET_BURST_DELAY;
                if (this.turretBurstCount <= 0) {
                    this.turretState = 'cooldown';
                    this.turretCooldownTimer = ENEMY_BASE_TURRET_COOLDOWN;
                }
            } else {
                this.turretBurstTimer--;
            }
        } else if (this.turretState === 'cooldown') {
            this.turretCooldownTimer--;
            if (this.turretCooldownTimer <= 0) this.turretState = 'idle';
        }
    }

    _fireTurretBullet(target) {
        if (!target) return;
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const angle = Math.atan2(target.y + target.height / 2 - centerY, target.x + target.width / 2 - centerX);
        const inaccuracy = (Math.random() - 0.5) * 0.15;

        const bullet = new EnemyBullet(this.game, centerX, centerY, angle + inaccuracy);
        this.game.enemyBullets.push(bullet);
        audioManager.playEnemyFire();
    }

    _updateBaseMissile() {
        // Mission 4+ (missionsCompleted 3+)
        if (this.game.missionsCompleted < 3) return;

        this.missileTimer--;
        if (this.missileTimer <= 0) {
            const target = this._findTarget(BASE_LASER_RANGE);
            if (target) {
                this._fireBaseMissile(target);
                this.missileTimer = ENEMY_BASE_MISSILE_COOLDOWN;
            } else {
                this.missileTimer = 30; // Check again soon
            }
        }
    }

    _fireBaseMissile(target) {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const angle = Math.atan2(target.y + target.height / 2 - centerY, target.x + target.width / 2 - centerX);

        const missile = new Missile(this.game, centerX, centerY, angle, false); // isPlayerOwned = false
        this.game.enemyBullets.push(missile);
        audioManager.playEnemyFire();
    }

    _updateBaseHoming() {
        // Mission 6+ (missionsCompleted 5+)
        if (this.game.missionsCompleted < 5) return;

        this.homingTimer--;
        if (this.homingTimer <= 0) {
            const target = this._findTarget(BASE_LASER_RANGE);
            if (target) {
                this._fireBaseHomingVolley(target);
                this.homingTimer = ENEMY_BASE_HOMING_COOLDOWN;
            } else {
                this.homingTimer = 30; // Check again soon
            }
        }
    }

    _fireBaseHomingVolley(target) {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const baseAngle = Math.atan2(target.y + target.height / 2 - centerY, target.x + target.width / 2 - centerX);

        // Fire 4 homing missiles in a spread
        const spread = 0.6;
        for (let i = 0; i < 4; i++) {
            const offset = (i - 1.5) * spread;
            const missile = new EnemyHomingMissile(this.game, centerX, centerY, baseAngle + offset);
            this.game.enemyBullets.push(missile);
        }
        audioManager.playEnemyFire();
    }

    _findTarget(maxRange = Infinity) {
        // Find closest between player and carrier
        const candidates = [];
        if (this.game.player && this.game.player.alive && !this.game.player.docked) candidates.push(this.game.player);
        if (this.game.carrier && this.game.carrier.alive) candidates.push(this.game.carrier);

        let bestTarget = null;
        let minDist = maxRange;

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
    }

    _updateCruiseMissile() {
        // Enabled from Mission 7 (missionsCompleted 6)
        if (this.game.missionsCompleted >= 6) {
            const target = this._findCruiseTarget();
            if (!target) return;

            // Only check activation range BEFORE the warning starts.
            // Once the warning is active, the missile is committed to launching.
            if (!this.cruiseWarning) {
                const dx = target.x - this.x;
                const dy = target.y - this.y;
                const distSq = dx * dx + dy * dy;
                if (distSq > CRUISE_MISSILE_ACTIVATION_RANGE * CRUISE_MISSILE_ACTIVATION_RANGE) {
                    return;
                }
            }

            this.cruiseMissileTimer--;
            
            if (this.cruiseMissileTimer <= CRUISE_MISSILE_WARNING_TIME) {
                // When warning starts
                if (!this.cruiseWarning) {
                    this.cruiseWarning = true;
                }

                // If we don't have a path yet, try to find one, but throttle the attempts to avoid lag
                if (!this.preLaunchPath) {
                    // Only try every 30 frames (twice a second) to avoid freezing the game
                    if (this.cruiseMissileTimer % 30 === 0) {
                        const target = this._findCruiseTarget();
                        if (target) {
                            this.preLaunchPath = this._findPathToTarget(target);
                        }
                    }
                }
            }

            if (this.cruiseMissileTimer <= 0) {
                this._fireCruiseMissile();
                this._resetCruiseMissileTimer();
                this.cruiseWarning = false;
                this.preLaunchPath = null;
            }
        }
    }

    _fireCruiseMissile() {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        
        // Always launch diagonally up-left to simulate a natural silo ejection
        let angle = -Math.PI * 0.6; 
        let path = this.preLaunchPath;

        // Try to find an A* path to the target for the initial launch direction if not already found
        if (!path) {
            const target = this._findCruiseTarget();
            if (target) {
                path = this._findPathToTarget(target);
            }
        }

        console.log("BOSS BASE: FIRING CRUISE MISSILE!");
        const missile = new EnemyCruiseMissile(this.game, centerX, centerY, angle, path);
        this.game.enemyBullets.push(missile);
        
        audioManager.playEnemyFire();
    }

    _findCruiseTarget() {
        const carrier = this.game.carrier;
        if (carrier && carrier.alive) return carrier;
        const player = this.game.player;
        if (player && player.alive && !player.docked) return player;
        return null;
    }

    _findPathToTarget(target) {
        if (!target) return null;
        const map = this.game.map;
        const TS = TILE_SIZE; // 16px per tile
        const start = map.pixelToTile(this.x + this.width / 2, this.y + this.height / 2);
        const end = map.pixelToTile(target.x + target.width / 2, target.y + target.height / 2);

        if (start.r === end.r && start.c === end.c) return null;

        // Octile distance heuristic (admissible for 8-directional movement)
        const hCost = (r, c) => {
            const dr = Math.abs(r - end.r);
            const dc = Math.abs(c - end.c);
            return 1.414 * Math.min(dr, dc) + Math.abs(dr - dc);
        };

        // --- Search area cropping (Optimization) ---
        // Limit search to a rectangle encompassing both points plus a margin.
        // This prevents the algorithm from exploring the entire map if blocked.
        const margin = 20;
        const minR = Math.max(0, Math.min(start.r, end.r) - margin);
        const maxR = Math.min(map.rows - 1, Math.max(start.r, end.r) + margin);
        const minC = Math.max(0, Math.min(start.c, end.c) - margin);
        const maxC = Math.min(map.cols - 1, Math.max(start.c, end.c) + margin);

        // --- A* with parent-pointer (no path-array copying per node) ---
        // Each node stores: r, c, g, h, f, parent
        const gScore = new Map();
        const parentMap = new Map();
        const startKey = `${start.r},${start.c}`;
        gScore.set(startKey, 0);
        parentMap.set(startKey, null);

        // Simple array-based priority queue (small maps make this fast enough)
        const openList = [{ r: start.r, c: start.c, g: 0, f: hCost(start.r, start.c) }];

        let iterations = 0;
        const maxIterations = 8000;
        let foundEnd = false;

        while (openList.length > 0 && iterations < maxIterations) {
            iterations++;
            // Pop the node with lowest f
            openList.sort((a, b) => a.f - b.f);
            const curr = openList.shift();
            const currKey = `${curr.r},${curr.c}`;

            // Skip stale entries
            if (curr.g > (gScore.get(currKey) ?? Infinity)) continue;

            if (curr.r === end.r && curr.c === end.c) {
                foundEnd = true;
                break;
            }

            const dirs = [
                {r:-1, c:0, cost:1}, {r:1, c:0, cost:1}, {r:0, c:-1, cost:1}, {r:0, c:1, cost:1},
                {r:-1, c:-1, cost:1.414}, {r:-1, c:1, cost:1.414}, {r:1, c:-1, cost:1.414}, {r:1, c:1, cost:1.414}
            ];

            for (const d of dirs) {
                const nr = curr.r + d.r;
                const nc = curr.c + d.c;

                // Cropping check
                if (nr < minR || nr > maxR || nc < minC || nc > maxC) continue;
                if (map.isSolid(nr, nc) && !(nr === end.r && nc === end.c)) continue;

                // Diagonal movement: both cardinal neighbors must be open (prevents corner-cutting)
                if (d.r !== 0 && d.c !== 0) {
                    if (map.isSolid(curr.r + d.r, curr.c) || map.isSolid(curr.r, curr.c + d.c)) continue;
                }

                // Clearance penalty: tiered by distance to nearest wall
                // Tier 1: immediately adjacent (8-dir check) — very strongly discouraged
                // Tier 2: within 2 tiles — moderately discouraged
                // This forces the path to prefer the centre of open passages
                let clearancePenalty = 0;

                const adjToWall =
                    map.isSolid(nr - 1, nc) || map.isSolid(nr + 1, nc) ||
                    map.isSolid(nr, nc - 1) || map.isSolid(nr, nc + 1) ||
                    map.isSolid(nr - 1, nc - 1) || map.isSolid(nr - 1, nc + 1) ||
                    map.isSolid(nr + 1, nc - 1) || map.isSolid(nr + 1, nc + 1);

                if (adjToWall) {
                    clearancePenalty = 4.0; // Very expensive – almost never preferred
                } else {
                    // 2-tile radius check (cardinal + diagonal)
                    const nearWall =
                        map.isSolid(nr - 2, nc) || map.isSolid(nr + 2, nc) ||
                        map.isSolid(nr, nc - 2) || map.isSolid(nr, nc + 2) ||
                        map.isSolid(nr - 2, nc - 1) || map.isSolid(nr - 2, nc + 1) ||
                        map.isSolid(nr + 2, nc - 1) || map.isSolid(nr + 2, nc + 1) ||
                        map.isSolid(nr - 1, nc - 2) || map.isSolid(nr - 1, nc + 2) ||
                        map.isSolid(nr + 1, nc - 2) || map.isSolid(nr + 1, nc + 2);
                    if (nearWall) {
                        clearancePenalty = 1.5; // Mildly discouraged
                    }
                }

                const newG = curr.g + d.cost + clearancePenalty;
                const nKey = `${nr},${nc}`;
                if (newG < (gScore.get(nKey) ?? Infinity)) {
                    gScore.set(nKey, newG);
                    parentMap.set(nKey, currKey);
                    openList.push({ r: nr, c: nc, g: newG, f: newG + hCost(nr, nc) });
                }
            }
        }

        if (!foundEnd) return null;

        // Reconstruct grid path from parent pointers
        const gridPath = [];
        let key = `${end.r},${end.c}`;
        while (key !== null) {
            const [r, c] = key.split(',').map(Number);
            gridPath.unshift({ r, c });
            key = parentMap.get(key);
        }

        return this._smoothPath(gridPath, TS);
    }

    // --- Path Smoothing (String Pulling) ---
    _smoothPath(gridPath, TS = TILE_SIZE) {
        if (!gridPath || gridPath.length === 0) return null;

        const HS = TS / 2; // half tile = 8px = tile center offset
        const smoothed = [];

        // First waypoint: exact base center (precise launch origin)
        const startX = this.x + this.width / 2;
        const startY = this.y + this.height / 2;
        smoothed.push({ x: startX, y: startY });

        let currentPt = { x: startX, y: startY };
        let currentIdx = 0;

        while (currentIdx < gridPath.length - 1) {
            let furthestVisible = currentIdx + 1;

            // Look ahead: skip as many waypoints as we can see in a straight line
            for (let i = currentIdx + 2; i < gridPath.length; i++) {
                const tx = gridPath[i].c * TS + HS;
                const ty = gridPath[i].r * TS + HS;
                if (this._hasLineOfSight(currentPt.x, currentPt.y, tx, ty)) {
                    furthestVisible = i;
                } else {
                    break; // Once blocked, no point checking further
                }
            }

            const t = gridPath[furthestVisible];
            currentPt = { x: t.c * TS + HS, y: t.r * TS + HS };
            smoothed.push(currentPt);
            currentIdx = furthestVisible;
        }

        return smoothed;
    }

    _hasLineOfSight(x0, y0, x1, y1) {
        const map = this.game.map;

        const ddx = x1 - x0;
        const ddy = y1 - y0;
        const totalDist = Math.sqrt(ddx * ddx + ddy * ddy);
        if (totalDist === 0) return true;

        // Unit direction vector along the line
        const ux = ddx / totalDist;
        const uy = ddy / totalDist;

        // Perpendicular unit vector (90deg rotated) — this is the missile's "width" axis
        const perpX = -uy;
        const perpY =  ux;

        // Clearance: one full TILE_SIZE (16px) — ensures missile body never clips corners
        const CLEARANCE = 16;

        // Step along the line every 8px for performance
        const stepSize = 8;
        const steps = Math.ceil(totalDist / stepSize);

        for (let i = 0; i <= steps; i++) {
            const t = Math.min(i * stepSize, totalDist);
            const cx = x0 + ux * t;
            const cy = y0 + uy * t;

            // Check center and both sides perpendicular to travel direction
            if (map.isSolidAtPixel(cx, cy) ||
                map.isSolidAtPixel(cx + perpX * CLEARANCE, cy + perpY * CLEARANCE) ||
                map.isSolidAtPixel(cx - perpX * CLEARANCE, cy - perpY * CLEARANCE)) {
                return false;
            }
        }
        return true;
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
        if (this.dying) return;
        this.dying = true;
        this.dyingTimer = 90; // 1.5 seconds of explosions
        this.game.score += this.scoreValue;
        audioManager.playBaseDestroyed();
    }

    _finishDestruction() {
        this.alive = false;
        // Final massive explosion
        this.game.spawnExplosion(this.x + this.width / 2, this.y + this.height / 2, 80);
    }

    draw(ctx) {
        if (!this.alive) return;
        this._drawWarningPath(ctx);

        const drawX = Math.round(this.x);
        const drawY = Math.round(this.y);
        ctx.save();
        ctx.translate(drawX, drawY);

        this._drawStructure(ctx);
        this._drawShields(ctx);
        this._drawCore(ctx);

        ctx.restore();
    }

    /** Draw the pre-launch cruise-missile warning path. */
    _drawWarningPath(ctx) {
        if (!this.cruiseWarning || !this.preLaunchPath) return;
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 0, 0, 1.0)';
        ctx.setLineDash([10, 5]);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(this.x + this.width / 2, this.y + this.height / 2);
        for (const pt of this.preLaunchPath) ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
        ctx.restore();
    }

    /** Draw the base frame and structural pillars. */
    _drawStructure(ctx) {
        const coreX = this.width / 2;
        const coreY = this.height / 2;

        // Dark frame
        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 0, this.width, this.height);

        // Structural pillars
        ctx.fillStyle = '#CCCCCC';
        ctx.fillRect(coreX - 20, 0, 40, coreY - 25);
        ctx.fillRect(coreX - 20, coreY + 25, 40, this.height - (coreY + 25));

        // Pillar shading
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(coreX - 16, 0, 4, coreY - 25);
        ctx.fillRect(coreX - 16, coreY + 25, 4, this.height - (coreY + 25));
        ctx.fillStyle = '#888888';
        ctx.fillRect(coreX + 12, 0, 4, coreY - 25);
        ctx.fillRect(coreX + 12, coreY + 25, 4, this.height - (coreY + 25));

        // Horizontal clamps
        ctx.fillStyle = '#AAAAAA';
        ctx.fillRect(coreX - 25, coreY - 28, 50, 6);
        ctx.fillRect(coreX - 25, coreY + 22, 50, 6);
        ctx.fillStyle = '#DDDDDD';
        ctx.fillRect(coreX - 23, coreY - 27, 46, 2);
        ctx.fillRect(coreX - 23, coreY + 23, 46, 2);
    }

    /** Draw all active shield rings. */
    _drawShields(ctx) {
        const cx    = this.width  / 2;
        const cy    = this.height / 2;
        const t     = this.coreAnimTimer;
        const rot1  =  t * 0.020;
        const rot2  = -t * 0.030;
        const rot3  =  t * 0.015;

        // Shield 3 (Outer)
        if (this.shields >= 3) {
            ctx.lineWidth = 3;
            this._drawSegmentedShield(ctx, cx, cy, 45, '#DDDDDD', rot3, 8);
            ctx.strokeStyle = '#888888';
            ctx.lineWidth   = 1;
            ctx.beginPath();
            ctx.arc(cx, cy, 48, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Shield 2 (Middle)
        if (this.shields >= 2) {
            ctx.lineWidth = 4;
            this._drawSegmentedShield(ctx, cx, cy, 35, '#AAAAAA', rot2, 6);
        }

        // Shield 1 (Inner)
        if (this.shields >= 1) {
            ctx.lineWidth = 5;
            this._drawSegmentedShield(ctx, cx, cy, 25, '#FFFFFF', rot1, 4);
            // Inner hex
            ctx.strokeStyle = 'rgba(200, 255, 255, 0.4)';
            ctx.lineWidth   = 2;
            ctx.beginPath();
            for (let i = 0; i <= 6; i++) {
                const a  = i * (Math.PI / 3) + rot1;
                const hx = cx + Math.cos(a) * 20;
                const hy = cy + Math.sin(a) * 20;
                if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
            }
            ctx.stroke();
        }
    }

    /**
     * Draw metallic segmented arc shield ring.
     * @param {number} segments - Number of arc segments.
     */
    _drawSegmentedShield(ctx, cx, cy, radius, color, rotOffset, segments = 8) {
        ctx.strokeStyle = color;
        ctx.beginPath();
        const step = (Math.PI * 2) / segments;
        const gap  = 0.15;
        for (let i = 0; i < segments; i++) {
            const a = i * step + rotOffset;
            ctx.arc(cx, cy, radius, a + gap, a + step - gap);
        }
        ctx.stroke();

        // Connector nodes
        ctx.fillStyle = '#FFFFFF';
        for (let i = 0; i < segments; i++) {
            const a  = i * step + rotOffset;
            const nx = cx + Math.cos(a) * radius;
            const ny = cy + Math.sin(a) * radius;
            ctx.fillRect(nx - 2, ny - 2, 4, 4);
        }
    }

    /** Draw the pulsating energy core with bloom, sparkles, and charge particles. */
    _drawCore(ctx) {
        let cx = this.width  / 2 || 16;
        let cy = this.height / 2 || 24;
        if (!isFinite(cx)) cx = 16;
        if (!isFinite(cy)) cy = 24;

        const t      = this.coreAnimTimer || 0;
        const pulse  = (Math.sin(t / 8) + 1) / 2;
        const radius = Math.max(1, 8 + pulse * 3);

        try {
            const { main: coreColor, glow: coreGlow } = this._getCoreColors();

            // Bloom
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 4);
            bloom.addColorStop(0, coreColor);
            bloom.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = bloom;
            ctx.beginPath();
            ctx.arc(cx, cy, radius * 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Primary glow gradient
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 2);
            grad.addColorStop(0,              '#FFFFFF');
            grad.addColorStop(0.2,            '#FFFFFF');
            grad.addColorStop(0.5 + pulse * 0.2, coreColor);
            grad.addColorStop(1,              coreGlow);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, radius * 2, 0, Math.PI * 2);
            ctx.fill();

            // Sparkles
            ctx.fillStyle = '#FFFFFF';
            for (let i = 0; i < 4; i++) {
                const sa = t * 0.1 + i * (Math.PI / 2);
                const sd = ((Math.sin(t * 0.2 + i) + 1) / 2) * radius;
                const sx = cx + Math.cos(sa) * sd;
                const sy = cy + Math.sin(sa) * sd;
                const ss = Math.random() * 2 + 1;
                ctx.fillRect(sx - ss / 2, sy - 0.5, ss, 1);
                ctx.fillRect(sx - 0.5, sy - ss / 2, 1, ss);
            }

            // Solid inner core
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
            ctx.fill();

            // Charge particles
            if (this.attackState === 'charging') {
                ctx.fillStyle = coreColor;
                for (const p of this.chargeParticles) {
                    const s = 1 + (p.life / 30) * 2;
                    ctx.fillRect(cx + p.x - s / 2, cy + p.y - s / 2, s, s);
                }
            }
        } catch (e) {
            console.error('Gradient error in base:', e);
        }
    }

    /** Return the core color pair for the current mission index. */
    _getCoreColors() {
        const COLORS = [
            { main: '#FF2222', glow: 'rgba(255, 34, 34, 0)'   },
            { main: '#FFAA11', glow: 'rgba(255, 170, 17, 0)'  },
            { main: '#FFFF33', glow: 'rgba(255, 255, 51, 0)'  },
            { main: '#33FF33', glow: 'rgba(51, 255, 51, 0)'   },
            { main: '#22CCFF', glow: 'rgba(34, 204, 255, 0)'  },
            { main: '#8344C0', glow: 'rgba(131, 68, 192, 0)'  },
            { main: '#F68DF6', glow: 'rgba(246, 141, 246, 0)' },
        ];
        const idx = (this.game.missionsCompleted || 0) % COLORS.length;
        return COLORS[idx];
    }
}
