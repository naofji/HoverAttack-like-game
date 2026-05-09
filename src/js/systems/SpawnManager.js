// ============================================
// Spawn Manager - Entity spawning logic
// ============================================

import { TILE_SIZE, ENEMY_ATTACKER_TYPES } from '../utils/Constants.js';
import { Landmine } from '../entities/Landmine.js';
import { EnemyTank } from '../entities/EnemyTank.js';
import { EnemyAttacker } from '../entities/EnemyAttacker.js';
import { EnemyDrone } from '../entities/EnemyDrone.js';
import { EnemyTurret } from '../entities/EnemyTurret.js';
import { EnemyBase } from '../entities/EnemyBase.js';

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
     * Create all enemy entities from the map's spawn data.
     */
    spawnEnemies() {
        const game = this.game;
        game.enemies = [];
        game.enemyBullets = [];

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
                x += (Math.random() < 0.5 ? -1 : 1) * 16;
            }
            return { x, y };
        };

        // Spawn hover tanks
        for (const pos of game.map.enemyTankSpawns) {
            const adjustedPos = resolveOverlap(pos.x, pos.y);
            game.enemies.push(new EnemyTank(game, adjustedPos.x, adjustedPos.y));
        }

        // Filter available attacker types based on missionsCompleted
        const availableTypes = {};
        let totalWeight = 0;

        for (const [key, type] of Object.entries(ENEMY_ATTACKER_TYPES)) {
            if (key === 'heavy' && game.missionsCompleted < 2) continue;
            if (key === 'rival' && game.missionsCompleted < 4) continue;
            if (key === 'artillery' && game.missionsCompleted < 5) continue; // Mission 6+

            availableTypes[key] = type;
            totalWeight += type.spawnWeight;
        }

        // Attackers (Humanoids)
        for (const pos of game.map.enemyAttackerSpawns) {
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
            game.enemies.push(new EnemyAttacker(game, adjustedPos.x, adjustedPos.y, availableTypes[selectedTypeKey]));
        }

        // Spawn aerial drones
        for (const pos of game.map.enemyDroneSpawns) {
            game.enemies.push(new EnemyDrone(game, pos.x, pos.y));
        }

        // Spawn stationary turrets
        for (const pos of game.map.enemyTurretSpawns) {
            game.enemies.push(new EnemyTurret(game, pos.x, pos.y, pos.isCeiling));
        }

        // Spawn Main Base at the very end
        if (game.map.enemyBaseSpawn) {
            game.base = new EnemyBase(game, game.map.enemyBaseSpawn.x, game.map.enemyBaseSpawn.y);
            game.enemies.push(game.base);
        }
    }
}
