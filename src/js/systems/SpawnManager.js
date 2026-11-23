// ============================================
// Spawn Manager - Entity spawning logic
// ============================================

import { Orb } from '../entities/Orb.js';
import { TILE_SIZE, ENEMY_ATTACKER_TYPES, BEAM_TURRET_MISSION, START_SAFE_RADIUS,
    ENEMY_TANK_WIDTH, ENEMY_TANK_HEIGHT, PLAYER_WIDTH, PLAYER_HEIGHT, ENEMY_DRONE_WIDTH, ENEMY_DRONE_HEIGHT,
    ENEMY_TURRET_WIDTH, ENEMY_TURRET_HEIGHT, SPIDER_SIZE,
} from '../utils/Constants.js';
import { standardWeaponAt, STANDARD_MG_CONFIG } from '../utils/attackerWeapon.js';
import { Landmine } from '../entities/Landmine.js';
import { EnemyTank } from '../entities/EnemyTank.js';
import { EnemyAttacker } from '../entities/EnemyAttacker.js';
import { EnemyDrone } from '../entities/EnemyDrone.js';
import { EnemySpider } from '../entities/EnemySpider.js';
import { EnemyTurret } from '../entities/EnemyTurret.js';
import { EnemyBase } from '../entities/EnemyBase.js';
import { StorageTower } from '../entities/StorageTower.js';
import { findSpotOutside } from './startSafeZone.js';
import { FortressBarrier } from '../entities/FortressBarrier.js';
import { ElectricFloor } from '../entities/ElectricFloor.js';

export class SpawnManager {
    constructor(game) {
        this.game = game;
    }

    /**
     * Find empty spawn position within a tile region.
     * @param {number} startC - Start column
     * @param {number} startR - Start row
     * @param {number} searchW - Search width in tiles
     * @param {number} searchH - Search height in tiles
     * @returns {{x: number, y: number}}
     */
    findSpawnPosition(startC, startR, searchW, searchH) {
        const map = this.game.map;
        for (let r = startR; r < startR + searchH; r++) {
            for (let c = startC; c < startC + searchW; c++) {
                // Need 3 wide x 2 tall empty space with floor below
                if (!map.isSolid(r, c) &&
                    !map.isSolid(r, c + 1) &&
                    !map.isSolid(r, c + 2) &&
                    !map.isSolid(r - 1, c) &&
                    !map.isSolid(r - 1, c + 1) &&
                    !map.isSolid(r - 1, c + 2) &&
                    map.isSolid(r + 1, c) &&
                    map.isSolid(r + 1, c + 1)) {
                    return {
                        x: c * TILE_SIZE,
                        y: (r - 1) * TILE_SIZE
                    };
                }
            }
        }
        // Fallback: just place in the carved start area
        return { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE };
    }

    /**
     * Create Landmine entities from the map's spawn data.
     */
    spawnLandmines() {
        this.game.landmines = [];
        for (const pos of this.game.map.landmineSpawns) {
            this.game.landmines.push(new Landmine(this.game, pos.x, pos.y));
        }
    }

    /**
     * 2面の Orb（押せて転がる鉱物）を置く（map.orbSpawns の数だけ。今は2面だけで、他の面は空振り）。
     * 面の種類では分岐しない（格納塔と同じ。置く面は STAGE_ENVIRONMENTS の orbs が決める）
     */
    spawnOrbs() {
        this.game.orbs = [];
        for (const spec of this.game.map.orbSpawns || []) this.game.orbs.push(new Orb(this.game, spec));
    }

    /**
     * 格納塔を立てる（map.storageTowerSpawns の数だけ。今は7面の要塞のお宝だけで、他の面は空振り）。
     *
     * 面の種類では分岐しない。ほかの面に置くときは、その面の生成が一覧に足すだけで済む。
     * 中身は塔を壊したときに出る（entities/itemKinds.js の表を通す）。
     */
    spawnStorageTowers() {
        this.game.storageTowers = [];
        for (const spec of this.game.map.storageTowerSpawns || []) {
            this.game.storageTowers.push(new StorageTower(this.game, spec));
        }
    }

    /**
     * 要塞の電磁パルスのバリアを立てる（7面だけ）。
     *
     * 敵の一種にはしない。game.enemies に入れると撃破数・スコア・Auto Aim の
     * 対象に混ざるので、地雷と同じく専用の配列に置く。
     */
    spawnBarriers() {
        this.game.barriers = [];
        for (const zone of this.game.map.fortressZones || []) {
            for (const spec of zone.barriers) {
                this.game.barriers.push(new FortressBarrier(this.game, spec));
            }
        }
    }

    /**
     * 要塞の電流の床を敷く（7面だけ）。バリアと同じく敵の配列には入れない。
     */
    spawnElectricFloors() {
        this.game.electricFloors = [];
        for (const zone of this.game.map.fortressZones || []) {
            for (const spec of zone.electricFloors) {
                this.game.electricFloors.push(new ElectricFloor(this.game, spec));
            }
        }
    }

    /**
     * Create all enemy entities from the map's spawn data.
     */
    spawnEnemies() {
        const game = this.game;
        game.enemies = [];
        game.enemyBullets = [];
        // 開始地点の安全圏の内側に置かれたら、外へ作り直すための材料（_moveOutOfStartArea）。
        // 敵ごとに「どこに置けるか」と「同じ敵を別の場所に作る関数」。型の抽選などは済んだ値を閉じ込める（乱数を引き直さない）
        const rebuild = new Map();
        const remember = (enemy, spec, make) => rebuild.set(enemy, { spec, make });

        // Helper: find a non-overlapping spawn offset
        const resolveOverlap = (baseX, baseY) => {
            let x = baseX;
            let y = baseY;
            for (let attempt = 0; attempt < 10; attempt++) {
                let isOverlapping = false;
                for (const e of game.enemies) {
                    const dx = (e.x + e.width / 2) - (x + 12);
                    const dy = (e.y + e.height / 2) - (y + 8);
                    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) {
                        isOverlapping = true;
                        break;
                    }
                }
                if (!isOverlapping) return { x, y };
                x += (this.game.rng.next() < 0.5 ? -1 : 1) * 16;
            }
            return { x, y };
        };

        // Spawn hover tanks
        const makeTank = (p) => new EnemyTank(game, p.x, p.y);
        for (const pos of game.map.enemyTankSpawns) {
            const adjustedPos = resolveOverlap(pos.x, pos.y);
            const tank = makeTank(adjustedPos);
            remember(tank, { kind: 'ground', w: ENEMY_TANK_WIDTH, h: ENEMY_TANK_HEIGHT }, makeTank);
            game.enemies.push(tank);
        }

        // Filter available attacker types based on missionsCompleted
        const availableTypes = {};
        let totalWeight = 0;

        // 型ごとの解禁は表の firstMission 列。並び順（＝抽選で重みを引く順）は表の順のまま
        for (const [key, type] of Object.entries(ENEMY_ATTACKER_TYPES)) {
            if (game.missionsCompleted < type.firstMission) continue;

            availableTypes[key] = type;
            totalWeight += type.spawnWeight;
        }

        // Attackers (Humanoids)
        // standard の何機目か。MG 持ちの割り当て（utils/attackerWeapon.js）に使う。
        // 乱数は引かない（引くと週次の決定性が壊れる）
        let standardIndex = 0;
        for (const pos of game.map.enemyAttackerSpawns) {
            let rnd = this.game.rng.next() * totalWeight;
            let selectedTypeKey = 'standard';

            for (const [key, typeDef] of Object.entries(availableTypes)) {
                if (rnd < typeDef.spawnWeight) {
                    selectedTypeKey = key;
                    break;
                }
                rnd -= typeDef.spawnWeight;
            }
            const adjustedPos = resolveOverlap(pos.x, pos.y);
            let config = availableTypes[selectedTypeKey];
            // standard の一部は MG 持ち（色違い）の行で作る
            if (selectedTypeKey === 'standard'
                && standardWeaponAt(game.missionsCompleted, standardIndex++) === 'mg') {
                config = STANDARD_MG_CONFIG;
            }
            const makeAttacker = (p) => {
                const a = new EnemyAttacker(game, p.x, p.y, config);
                if (game.baseEmergencyAlert) a.setEmergencyDefense(true, game.emergencyTargetBase);
                return a;
            };
            const attacker = makeAttacker(adjustedPos);
            remember(attacker, { kind: 'ground', w: PLAYER_WIDTH, h: PLAYER_HEIGHT }, makeAttacker);
            game.enemies.push(attacker);
        }

        // Spawn aerial drones
        const makeDrone = (p) => {
            const d = new EnemyDrone(game, p.x, p.y);
            if (game.baseEmergencyAlert) d.setEmergencyDefense(true, game.emergencyTargetBase);
            return d;
        };
        for (const pos of game.map.enemyDroneSpawns) {
            const drone = makeDrone(pos);
            remember(drone, { kind: 'air', w: ENEMY_DRONE_WIDTH, h: ENEMY_DRONE_HEIGHT }, makeDrone);
            game.enemies.push(drone);
        }

        // 6面のスパイダー。置き場所は面に接するよう地図が決めてあるので、resolveOverlap は通さない
        // （横にずらすと面から離れるうえ、game.rng を引いて週次の決定性が壊れる）
        for (const p of game.map.spiderSpawns) {
            const makeSpider = (q) => new EnemySpider(game, q.x, q.y, p.surface);
            const spider = makeSpider(p);
            remember(spider, { kind: 'spider', w: SPIDER_SIZE, h: SPIDER_SIZE, surface: p.surface }, makeSpider);
            game.enemies.push(spider);
        }

        // Spawn stationary turrets
        // 7面（BEAM_TURRET_MISSION）からは**並び順の偶数番目**を反射ビームに
        // 差し替える。この配列は Map._findEnemyTurretPositions() が既に game.rng で
        // シャッフルして作っているので、偶数番目を取るだけなら**追加の乱数消費が
        // ゼロ**になる。ここで rng.next() を1回でも呼ぶと、以降の敵の構成が全部
        // ずれて週次の決定性が壊れる（tests/MapDeterminism.test.js）
        const beamMission = game.missionsCompleted >= BEAM_TURRET_MISSION;
        game.map.enemyTurretSpawns.forEach((pos, i) => {
            // pos.type があればそれに従う（要塞の入り口の守衛はノーマルに固定。
            // 7面はビームが混ざる面なので、放っておくと門番がビームになって
            // 入る前に削られる）。無ければ今までどおり偶数番目をビームに
            const type = pos.type ?? ((beamMission && i % 2 === 0) ? 'beam' : 'gun');
            const makeTurret = (p) => new EnemyTurret(game, p.x, p.y, pos.isCeiling, type);
            const turret = makeTurret(pos);
            remember(turret, { kind: 'turret', w: ENEMY_TURRET_WIDTH, h: ENEMY_TURRET_HEIGHT, isCeiling: !!pos.isCeiling }, makeTurret);
            game.enemies.push(turret);
        });

        // Spawn Main Base at the very end
        if (game.map.enemyBaseSpawn) {
            game.base = new EnemyBase(game, game.map.enemyBaseSpawn.x, game.map.enemyBaseSpawn.y);
            game.enemies.push(game.base);
        }

        this._moveOutOfStartArea(rebuild);
    }

    /**
     * 開始地点（自機の中心）から START_SAFE_RADIUS の内側の敵を、外の「その敵が置ける一番近い場所」へ作り直す
     * （2026-11-23 ユーザー指定。地雷は別。初めは外していたが、週によって敵の数が減るので「移すほうがいい」）。
     * 開始地点は地図を作った後に母艦の置き場所で決まるので、地図の生成ではなくここで移す。
     * **置く処理を全部走らせてから移す** — 置く前に飛ばすと、型の抽選・重なりの回避が game.rng を引く回数が
     * 変わり、同じ週なのに敵の構成が変わる（週次の決定性）。移し先は地図だけで決める（systems/startSafeZone.js）。
     * 敵基地は動かさない（面の目的なので）。置ける場所が見つからない敵だけは外す
     * @param {Map<object, {spec:object, make:(p:{x:number,y:number}) => object}>} rebuild
     */
    _moveOutOfStartArea(rebuild) {
        const game = this.game;
        const p = game.player;
        if (!p) return;
        const start = { x: p.x + p.width / 2, y: p.y + p.height / 2 };
        const inside = (e) => Math.hypot(e.x + e.width / 2 - start.x, e.y + e.height / 2 - start.y) < START_SAFE_RADIUS;
        const T = TILE_SIZE;
        const town = game.map.town;
        const inBuilding = (x, y) => !!town && town.buildingsAt(x, y).some((b) => {
            const k = town.cellAt(b, x, y);
            return k >= 0 && !!b.cells[k];
        });
        for (let i = 0; i < game.enemies.length; i++) {
            const e = game.enemies[i];
            if (e === game.base || !inside(e)) continue;
            const entry = rebuild.get(e);
            // 置ける場所かどうか: ほかの敵と重ならない（resolveOverlap と同じ 24px）、地雷・Orb・町の建物に掛からない
            const isFree = (box) => {
                const cx = box.x + box.w / 2;
                const cy = box.y + box.h / 2;
                for (const o of game.enemies) {
                    if (o === e) continue;
                    if (Math.abs(o.x + o.width / 2 - cx) < 24 && Math.abs(o.y + o.height / 2 - cy) < 24) return false;
                }
                for (const m of game.landmines || []) {
                    if (box.x < m.x + m.width + T && box.x + box.w > m.x - T
                        && box.y < m.y + m.height + T && box.y + box.h > m.y - T) return false;
                }
                for (const o of game.orbs || []) {
                    if (Math.hypot(o.cx - cx, o.cy - cy) < (o.r || 0) + Math.max(box.w, box.h)) return false;
                }
                const corners = [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h], [cx, cy]];
                return !corners.some(([x, y]) => inBuilding(x, y));
            };
            const spot = entry && findSpotOutside(game.map, entry.spec, e, start, START_SAFE_RADIUS, isFree);
            if (spot) {
                game.enemies[i] = entry.make(spot);
            } else {
                game.enemies.splice(i, 1);
                i--;
            }
        }
    }
}
