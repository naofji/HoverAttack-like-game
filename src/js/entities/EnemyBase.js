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
    CRUISE_MISSILE_MAX_DELAY
} from '../utils/Constants.js';
import { BaseLaser } from './BaseLaser.js';
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
            this.dyingTimer--;
            
            // Random explosions across the structure
            if (this.dyingTimer % 6 === 0) {
                const rx = this.x + Math.random() * this.width;
                const ry = this.y + Math.random() * this.height;
                const size = 20 + Math.random() * 30;
                this.game.spawnExplosion(rx, ry, size);
                audioManager.playExplosion(size > 35);
                
                if (this.game.camera) {
                    this.game.camera.shake(8, 3);
                }
            }

            if (this.dyingTimer <= 0) {
                this._finishDestruction();
            }
            return;
        }

        // Animate the core
        this.coreAnimTimer += 1;

        // Update Laser State
        this._updateLaser();

        // Update Cruise Missile State
        this._updateCruiseMissile();

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
    }

    _updateCruiseMissile() {
        // Enabled from Mission 7 (missionsCompleted 6)
        if (this.game.missionsCompleted >= 6) {
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
                if (nr < 0 || nr >= map.rows || nc < 0 || nc >= map.cols) continue;
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

        // --- Pre-launch Path Visualization (World Space) ---
        if (this.cruiseWarning && this.preLaunchPath) {
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 0, 0, 1.0)'; // Solid red for warning phase
            ctx.setLineDash([10, 5]);
            ctx.lineWidth = 3; // Make it thicker so it's clearly visible
            ctx.beginPath();
            ctx.moveTo(this.x + this.width / 2, this.y + this.height / 2);
            for (const pt of this.preLaunchPath) {
                ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
            ctx.restore();
        }

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
            // Determine core colors based on mission index (Balanced brightness)
            const colors = [
                { main: '#FF2222', glow: 'rgba(255, 34, 34, 0)' },   // 1: Red
                { main: '#FFAA11', glow: 'rgba(255, 170, 17, 0)' },  // 2: Orange
                { main: '#FFFF33', glow: 'rgba(255, 255, 51, 0)' },  // 3: Yellow
                { main: '#33FF33', glow: 'rgba(51, 255, 51, 0)' },   // 4: Green
                { main: '#22CCFF', glow: 'rgba(34, 204, 255, 0)' },  // 5: Blue (Cyan)
                { main: '#8344C0', glow: 'rgba(131, 68, 192, 0)' },  // 6: Indigo
                { main: '#F68DF6', glow: 'rgba(246, 141, 246, 0)' }  // 7: Violet
            ];
            const colorIdx = (this.game.missionsCompleted || 0) % colors.length;
            const coreColor = colors[colorIdx].main;
            const coreGlow = colors[colorIdx].glow;

            // Draw a larger faint bloom first
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const bloomGradient = ctx.createRadialGradient(safeCoreX, safeCoreY, 0, safeCoreX, safeCoreY, coreRadius * 4);
            bloomGradient.addColorStop(0, coreColor);
            bloomGradient.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = bloomGradient;
            ctx.beginPath();
            ctx.arc(safeCoreX, safeCoreY, coreRadius * 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Glowing gradient (Primary Core)
            const gradient = ctx.createRadialGradient(safeCoreX, safeCoreY, 0, safeCoreX, safeCoreY, coreRadius * 2);
            gradient.addColorStop(0, '#FFFFFF'); // Bright white center
            gradient.addColorStop(0.2, '#FFFFFF'); // Keep white longer
            gradient.addColorStop(0.5 + pulse * 0.2, coreColor);
            gradient.addColorStop(1, coreGlow); // Fade out

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
            ctx.fillStyle = '#FFFFFF'; // Bright glow
            ctx.beginPath();
            ctx.arc(safeCoreX, safeCoreY, coreRadius * 0.5, 0, Math.PI * 2);
            ctx.fill();

            // Draw Charge Particles
            if (this.attackState === 'charging') {
                ctx.fillStyle = coreColor;
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
