import {
    ENEMY_BASE_WIDTH,
    ENEMY_BASE_HEIGHT,
    ENEMY_BASE_DRAW_OVERHANG,
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
    CRUISE_MISSILE_ACTIVATION_RANGE,
    FINALE_SHAKE_INTENSITY, FINALE_SHAKE_DURATION,
    BASE_ORBIT_SHIELD_MISSION, BASE_ORBIT_SHIELD_PANELS, BASE_ORBIT_SHIELD_RADIUS,
    BASE_ORBIT_SHIELD_SPEED, BASE_ORBIT_SHIELD_GUARD_HALF, BASE_ORBIT_SHIELD_HEIGHT,
    BASE_ORBIT_SHIELD_DEPLOY
} from '../utils/Constants.js';
import {
    panelAngles, panelOffsetX, panelDepth, isGuardAngle, guardBlocks, deployEase,
} from '../utils/orbitShield.js';
import { BaseLaser } from './BaseLaser.js';
import { EnemyBullet } from './EnemyBullet.js';
import { Missile } from './Missile.js';
import { EnemyHomingMissile } from './EnemyHomingMissile.js';
import { EnemyCruiseMissile } from './EnemyCruiseMissile.js';
import { audioManager } from '../audio/AudioManager.js';
import { createDestructionFinale } from './DestructionFinale.js';
import { playBlast } from './destruction.js';
import { lerpColor, withAlpha } from '../utils/color.js';

// 周回シールドの羽根の見た目。描画専用のパラメータなので Constants ではなく
// ここに置いている（EnemyAttacker の LEG_STYLES と同じ扱い）。
const ORBIT_PANEL = {
    width: 13,          // 真正面を向いたときの見かけの幅 px
    // 真横（＝ガード成立）を向いたときに残る厚み。0 にすると一番肝心な瞬間に
    // 羽根が消えてしまうので、線として必ず残す
    edge: 3,
    dark: '#2B3440',    // 奥に回ったときの色
    light: '#F0F6FF',   // 手前に来たときの色
    // 手前／奥での拡大率。0.06 では平行投影と見分けがつかず「回っている板」に
    // 見えなかったので 0.30 まで上げた。手前で 1.3倍・奥で 0.7倍になり、
    // 幅にも高さにも掛ける（＝相似で大きくなる）
    perspective: 0.30,
    // 軌道リング（楕円）の見下ろし量。奥行きは羽根の大きさで見せ、
    // リングは「どこを回っているか」だけを示す。
    // 羽根自体はこの分ずらさない — 上下させると板の上端がふらついて落ち着かず、
    // 中心の高さを固定した方が回転が素直に読めた（ユーザー確認 2026-08-23）
    tilt: 7,
    orbitAlpha: 0.22,   // 軌道リングを薄く残す濃さ。羽根の行き先が読める
    barrierAlpha: 0.35, // ガード中にコアとの間へ引くバリア線の濃さ
};

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
        this.homingTimer = ENEMY_BASE_HOMING_COOLDOWN;

        // Cruise Missile State
        this._resetCruiseMissileTimer();
        this.cruiseWarning = false;

        // Destruction Sequence State
        this.dying = false;
        this.dyingTimer = 0;

        // Emergency Defense Alert pulse (visual only, one-shot)
        this.emergencyPulseTimer = 0;
        this.emergencyPulseDuration = 45; // ~0.75s of expanding ring

        // 周回シールド（6面以降）。リングが全部割れるまでは存在しない
        this.orbitShieldActive = false;
        this.orbitPhase = 0;
        this.orbitDeployTimer = 0;
    }

    // ------------------------------------------
    // 周回シールド（6面以降。むき出しのコアだけを守る）
    // ------------------------------------------

    /** この基地に周回シールドがあるか（面で決まる）。 */
    _hasOrbitShield() {
        return (this.game.missionsCompleted || 0) >= BASE_ORBIT_SHIELD_MISSION;
    }

    /** 最後のリングが割れたときに呼ぶ。コアの中心から羽根がせり出し始める。 */
    startOrbitShield() {
        if (this.orbitShieldActive) return;
        this.orbitShieldActive = true;
        this.orbitDeployTimer = 0;
        this.orbitPhase = 0;
        // 展開そのものには専用の音を付けていない。展開中の被弾はすべて
        // 弾かれて shieldDeflect が鳴るので、撃っていれば音の手がかりは出る
    }

    /** 展開の進み具合 0..1（イージング後）。1 で出きった状態。 */
    _orbitDeploy() {
        return deployEase(this.orbitDeployTimer / BASE_ORBIT_SHIELD_DEPLOY);
    }

    /** 今の軌道半径。展開中は 0 から所定の半径へ伸びる。 */
    orbitRadius() {
        if (!this.orbitShieldActive) return 0;
        return BASE_ORBIT_SHIELD_RADIUS * this._orbitDeploy();
    }

    /** 全ての羽根の位相。描画と判定で同じものを使う。 */
    orbitAngles() {
        return panelAngles(this.orbitPhase, BASE_ORBIT_SHIELD_PANELS);
    }

    /**
     * 1 tick ぶん回す。半径と同じイージングで回転も立ち上げるので、
     * せり出しながら加速していくように見える。
     */
    _updateOrbitShield() {
        if (!this.orbitShieldActive) return;
        if (this.orbitDeployTimer < BASE_ORBIT_SHIELD_DEPLOY) this.orbitDeployTimer++;
        this.orbitPhase += BASE_ORBIT_SHIELD_SPEED * this._orbitDeploy();
    }

    /**
     * その被弾点がガードされているか。
     * 展開中は角度に関係なく true（＝完全無敵）。MG の跳弾演出も同じ答えを使う。
     * @param {number} hitX 被弾点のX。省略時は判定しない
     */
    isOrbitGuarded(hitX) {
        if (!this.orbitShieldActive || hitX === undefined) return false;
        if (this.orbitDeployTimer < BASE_ORBIT_SHIELD_DEPLOY) return true;
        const dx = hitX - (this.x + this.width / 2);
        return guardBlocks(this.orbitAngles(), dx, BASE_ORBIT_SHIELD_GUARD_HALF);
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
        if (this.emergencyPulseTimer > 0) this.emergencyPulseTimer--;
        this._updateLaser();
        this._updateBaseTurret();
        this._updateBaseMissile();
        this._updateBaseHoming();
        this._updateCruiseMissile();
        this._updateOrbitShield();

        // Keep bounds in sync with position
        this.bounds.x = this.x;
        this.bounds.y = this.y;
    }

    /** Tick the cinematic destruction sequence. */
    _updateDyingSequence() {
        this.dyingTimer--;

        if (this.dyingTimer % 6 === 0) {
            const rx = this.x + Math.random() * this.width;
            const ry = this.y + Math.random() * this.height;
            const size = 20 + Math.random() * 30;
            playBlast(this.game, rx, ry, 'baseDying', size);
            audioManager.playExplosion(size > 35, rx);
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
        // 発射音は EnemyBullet のコンストラクタが鳴らす。ここで足すと二重になる
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
        audioManager.playWeapon('enemyMissile', centerX, centerY);
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
        audioManager.playWeapon('homing', centerX, centerY);
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

        audioManager.playWeapon('cruise', centerX, centerY);
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
                { r: -1, c: 0, cost: 1 }, { r: 1, c: 0, cost: 1 }, { r: 0, c: -1, cost: 1 }, { r: 0, c: 1, cost: 1 },
                { r: -1, c: -1, cost: 1.414 }, { r: -1, c: 1, cost: 1.414 }, { r: 1, c: -1, cost: 1.414 }, { r: 1, c: 1, cost: 1.414 }
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
        const perpY = ux;

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


    /**
     * @param {number} amount
     * @param {number} [hitX] 被弾点のX。周回シールド（6面以降）の左右判定に使う。
     *   省略した呼び出しは今までどおり素通しするので、他の敵と共通の
     *   takeDamage(amount) を呼んでいる箇所の挙動は変わらない
     */
    takeDamage(amount, hitX) {
        if (!this.alive) return;

        // むき出しのコアへの一撃だけが周回シールドの対象。リングが残っている間は
        // 今までどおり削れる（全部にタイミングを要求すると難しくなりすぎる）
        if (this.shields <= 0 && this.isOrbitGuarded(hitX)) {
            this._deflect(hitX);
            return; // 緊急防衛アラートも立てない。弾いた攻撃は「当たっていない」扱い
        }

        // Mission 2+ (missionsCompleted 1+): being hit calls in emergency reinforcements,
        // but not while the destruction sequence is already underway (dying window).
        if (this.game.missionsCompleted >= 1 && !this.dying) {
            const alreadyAlerted = !!this.game.baseEmergencyAlert;
            this.game.triggerBaseEmergencyAlert(this);
            // Only spawn the one-shot visual pulse the moment the alert first goes live,
            // not on every subsequent hit while it's already latched.
            if (!alreadyAlerted) this._spawnEmergencyPulse();
        }

        // Damage the shield first
        if (this.shields > 0) {
            this.shields--;
            this.game.score += 50; // Small score for breaking a shield
            this._spawnSparks();
            // 最後のリングが割れてコアが露出した瞬間に周回シールドがせり出す
            if (this.shields <= 0 && this._hasOrbitShield()) this.startOrbitShield();
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

    /**
     * 周回シールドが弾いたときの手応え。
     * 無敵なのに何の反応も無いと弾を飲み込まれたように見えるので、
     * 弾かれた場所に火花と金属音を出す。ダメージもスコアも動かさない。
     */
    _deflect(hitX) {
        const cy = this.y + this.height / 2;
        const x = hitX === undefined ? this.x + this.width / 2 : hitX;
        if (this.game.spawnSparks) this.game.spawnSparks(x, cy);
        audioManager.playWeapon('shieldDeflect', x, cy);
    }

    /** One-shot expanding red "rescue pulse" ring shown when the emergency alert first fires. */
    _spawnEmergencyPulse() {
        this.emergencyPulseTimer = this.emergencyPulseDuration;
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
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;

        // Final massive explosion
        playBlast(this.game, cx, cy, 'baseFinal');

        // フィナーレ（閃光→集中線→衝撃波リング）。爆発より後に push することで
        // パーティクルの描画順で手前に出る。
        this.game.particles.push(...createDestructionFinale(cx, cy));
        if (this.game.camera) {
            this.game.camera.shake(FINALE_SHAKE_INTENSITY, FINALE_SHAKE_DURATION);
        }

        // Emergency defense alert stays active even after base destruction so remaining
        // defenders continue their high-alert attack until stage clear / mission transition.
    }

    draw(ctx) {
        if (!this.alive) return;
        this._drawWarningPath(ctx);
        this._drawEmergencyPulse(ctx);

        const drawX = Math.round(this.x);
        const drawY = Math.round(this.y);
        ctx.save();
        ctx.translate(drawX, drawY);

        this._drawStructure(ctx);
        this._drawShields(ctx);
        // 奥に回っている羽根はコアより先に、手前の羽根はコアより後に描く。
        // 立体に見えるかどうかはこの順序がほぼ全て
        this._drawOrbitPanels(ctx, true);
        this._drawCore(ctx);
        this._drawOrbitPanels(ctx, false);

        ctx.restore();
    }

    /** Draw the expanding red rescue-pulse ring around the base while the alert is fresh. */
    _drawEmergencyPulse(ctx) {
        if (this.emergencyPulseTimer <= 0) return;

        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const progress = 1 - (this.emergencyPulseTimer / this.emergencyPulseDuration); // 0 -> 1
        const radius = 20 + progress * 100;
        const alpha = 1 - progress;

        ctx.save();
        ctx.strokeStyle = `rgba(255, 40, 40, ${alpha})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
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
        const cx = this.width / 2;
        const cy = this.height / 2;
        const t = this.coreAnimTimer;
        const rot1 = t * 0.020;
        const rot2 = -t * 0.030;
        const rot3 = t * 0.015;

        // Shield 3 (Outer)
        if (this.shields >= 3) {
            ctx.lineWidth = 3;
            this._drawSegmentedShield(ctx, cx, cy, 45, '#DDDDDD', rot3, 8);
            ctx.strokeStyle = '#888888';
            ctx.lineWidth = 1;
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
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i <= 6; i++) {
                const a = i * (Math.PI / 3) + rot1;
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
        const gap = 0.15;
        for (let i = 0; i < segments; i++) {
            const a = i * step + rotOffset;
            ctx.arc(cx, cy, radius, a + gap, a + step - gap);
        }
        ctx.stroke();

        // Connector nodes
        ctx.fillStyle = '#FFFFFF';
        for (let i = 0; i < segments; i++) {
            const a = i * step + rotOffset;
            const nx = cx + Math.cos(a) * radius;
            const ny = cy + Math.sin(a) * radius;
            ctx.fillRect(nx - 2, ny - 2, 4, 4);
        }
    }

    /**
     * 周回シールドの羽根を描く。
     *
     * 羽根はコア中心を通る鉛直軸のまわりを回る板で、それを真横から見ている。
     * 見かけの幅は正面を向いたとき最大、真横（＝ガード成立）で最小になる。
     * 一番守っている瞬間が一番細く見えるという困った性質があるので、
     * そのときだけコア色で縁を光らせ、コアとの間にバリア線を引いて補っている。
     *
     * @param {boolean} behind true なら奥に回っている羽根だけ（コアより先に描く）
     */
    _drawOrbitPanels(ctx, behind) {
        if (!this.orbitShieldActive) return;

        const cx = this.width / 2;
        const cy = this._orbitCenterY();
        const r = this.orbitRadius();
        // 展開が終わるまでは角度に関係なく無敵なので、見た目も全部光らせる
        const deploying = this.orbitDeployTimer < BASE_ORBIT_SHIELD_DEPLOY;
        const coreColor = this._getCoreColors().main;

        // 軌道リングを薄い楕円で残す。奥半分は羽根より先に、手前半分は後に
        // 描くので、コアの前後を線がくぐって見える
        this._drawOrbitTrail(ctx, cx, cy, r, behind);

        for (const a of this.orbitAngles()) {
            const depth = panelDepth(a);
            if ((depth < 0) !== behind) continue;

            const px = cx + panelOffsetX(a, r);
            // 手前ほど相似で大きく。幅は「板を斜めから見た見かけの幅」に
            // この拡大率を掛ける
            const scale = 1 + ORBIT_PANEL.perspective * depth;
            const w = (ORBIT_PANEL.edge + ORBIT_PANEL.width * Math.abs(depth)) * scale;
            const h = BASE_ORBIT_SHIELD_HEIGHT * scale;
            // 縦の中心は奥行きによらず一定。拡大は上下へ均等に伸びる
            const x = px - w / 2;
            const y = cy - h / 2;

            // 板の地の色。奥ほど暗く、手前ほど明るい
            ctx.fillStyle = lerpColor(ORBIT_PANEL.dark, ORBIT_PANEL.light, 0.5 + 0.5 * depth);
            ctx.fillRect(x, y, w, h);

            const guarding = deploying || isGuardAngle(a, BASE_ORBIT_SHIELD_GUARD_HALF);
            if (!guarding) continue;

            // ガード中の合図。縁をコア色で光らせる
            ctx.strokeStyle = coreColor;
            ctx.lineWidth = 1;
            ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);

            // コアとの間に薄いバリア線。細い羽根だけでは「今は防いでいる」が
            // 視界の端で拾えないので、面積のある手がかりを足している
            ctx.strokeStyle = withAlpha(coreColor, ORBIT_PANEL.barrierAlpha);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px, y);
            ctx.lineTo(px, y + h);
            ctx.stroke();
        }
    }

    /** 一番大きくなる（手前に来た）羽根の、中心から下端までの距離。 */
    _orbitMaxHalfHeight() {
        return (BASE_ORBIT_SHIELD_HEIGHT * (1 + ORBIT_PANEL.perspective)) / 2;
    }

    /**
     * 羽根の縦の中心。奥行きによらず一定に保つ（動かすと板の端がふらつく）。
     *
     * 素直にコアの高さ（箱の中心）でよい。基地は構造物のはみ出し
     * （ENEMY_BASE_DRAW_OVERHANG）ぶん持ち上げて置いてあるので、床の表面は
     * 箱の下端より 12px 下にある。手前で 1.3倍に伸びた羽根の下端（箱の下端 +7.4px）
     * でも届かない。それでも届く大きさにしたときのために、床で頭打ちにしておく。
     */
    _orbitCenterY() {
        const floorY = this.height + ENEMY_BASE_DRAW_OVERHANG;
        return Math.min(this.height / 2, floorY - this._orbitMaxHalfHeight());
    }

    /**
     * 軌道リングの楕円。rx は周回半径、ry は見下ろしぶん（ORBIT_PANEL.tilt）。
     * 楕円の媒介変数 t は y = cy + ry*sin t なので、t が π..2π の側が上＝奥、
     * 0..π の側が下＝手前になる。behind に合わせて半分ずつ描く。
     */
    _drawOrbitTrail(ctx, cx, cy, r, behind) {
        if (r <= 0) return;
        ctx.save();
        ctx.strokeStyle = withAlpha(ORBIT_PANEL.light, ORBIT_PANEL.orbitAlpha);
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (behind) ctx.ellipse(cx, cy, r, ORBIT_PANEL.tilt, 0, Math.PI, Math.PI * 2);
        else ctx.ellipse(cx, cy, r, ORBIT_PANEL.tilt, 0, 0, Math.PI);
        ctx.stroke();
        ctx.restore();
    }

    /** Draw the pulsating energy core with bloom, sparkles, and charge particles. */
    _drawCore(ctx) {
        let cx = this.width / 2 || 16;
        let cy = this.height / 2 || 24;
        if (!isFinite(cx)) cx = 16;
        if (!isFinite(cy)) cy = 24;

        const t = this.coreAnimTimer || 0;
        const pulse = (Math.sin(t / 8) + 1) / 2;
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
            grad.addColorStop(0, '#FFFFFF');
            grad.addColorStop(0.2, '#FFFFFF');
            grad.addColorStop(0.5 + pulse * 0.2, coreColor);
            grad.addColorStop(1, coreGlow);
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
            { main: '#FF2222', glow: 'rgba(255, 34, 34, 0)' },
            { main: '#FFAA11', glow: 'rgba(255, 170, 17, 0)' },
            { main: '#FFFF33', glow: 'rgba(255, 255, 51, 0)' },
            { main: '#33FF33', glow: 'rgba(51, 255, 51, 0)' },
            { main: '#22CCFF', glow: 'rgba(34, 204, 255, 0)' },
            { main: '#8344C0', glow: 'rgba(131, 68, 192, 0)' },
            { main: '#F68DF6', glow: 'rgba(246, 141, 246, 0)' },
        ];
        const idx = (this.game.missionsCompleted || 0) % COLORS.length;
        return COLORS[idx];
    }
}
