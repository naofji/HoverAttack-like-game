// ============================================
// Map - Cave generation & destructible terrain
// ============================================

import {
    MIN_MAP_COLS, MIN_MAP_ROWS, MAX_MAP_COLS, MAX_MAP_ROWS,
    BLOCK_EMPTY, BLOCK_NORMAL, BLOCK_HARD, BLOCK_INDESTRUCTIBLE,
    COLOR_HARD_BLOCK, COLOR_HARD_BLOCK_BORDER,
    COLOR_INDESTRUCTIBLE_BLOCK, COLOR_INDESTRUCTIBLE_BLOCK_BORDER,
    PLAYER_WIDTH, PLAYER_HEIGHT,
    ENEMY_TANK_WIDTH, ENEMY_TANK_HEIGHT,
    ENEMY_DRONE_WIDTH, ENEMY_DRONE_HEIGHT,
    ENEMY_TURRET_WIDTH, ENEMY_TURRET_HEIGHT,
    ENEMY_BASE_WIDTH, ENEMY_BASE_HEIGHT,
    COLOR_CAVE_BG, TILE_SIZE,
    LANDMINE_WIDTH, LANDMINE_HEIGHT,
    STAGE_PALETTES
} from '../utils/Constants.js';


// --- Map generation constants ---
const BORDER_THICKNESS = 2;
const HARD_BLOCK_CHANCE = 0.06;
const HARD_BLOCK_HP = 3;

export class Map {
    constructor(game, missionLevel = 0) {
        this.game = game;
        this.missionLevel = missionLevel;

        // Reference stage-specific palettes for normal blocks
        const palettes = STAGE_PALETTES;
        const palIdx = (this.missionLevel || 0) % palettes.length;

        this.blockStyles = {
            [BLOCK_NORMAL]: palettes[palIdx],
            [BLOCK_HARD]: { fill: COLOR_HARD_BLOCK, border: COLOR_HARD_BLOCK_BORDER },
            [BLOCK_INDESTRUCTIBLE]: { fill: COLOR_INDESTRUCTIBLE_BLOCK, border: COLOR_INDESTRUCTIBLE_BLOCK_BORDER },
        };

        // Scale map size based on mission level (levels 0 to 4 correspond to Mission 1 to 5)
        // Cap the scaling factor at level 4 (Mission 5)
        const scaleLevel = Math.min(this.missionLevel, 4);
        const scaleFactor = scaleLevel / 4; // 0.0 to 1.0

        this.cols = Math.floor(MIN_MAP_COLS + (MAX_MAP_COLS - MIN_MAP_COLS) * scaleFactor);
        this.rows = Math.floor(MIN_MAP_ROWS + (MAX_MAP_ROWS - MIN_MAP_ROWS) * scaleFactor);

        this.width = this.cols * TILE_SIZE;
        this.height = this.rows * TILE_SIZE;

        // Dynamic target counts based on map size relative to max size
        const areaRatio = (this.cols * this.rows) / (MAX_MAP_COLS * MAX_MAP_ROWS);

        // Base counts at max size (Mission 5 equivalents)
        const maxTanks = 30;
        const maxLandmines = 60;
        const maxAttackers = 40;
        const maxDrones = 20;
        const maxTurrets = 12;

        this.targetTankCount = Math.max(4, Math.floor(maxTanks * areaRatio));
        this.targetLandmineCount = Math.max(12, Math.floor(maxLandmines * areaRatio));

        // Attackers enabled from Mission 2 (missionLevel 1)
        this.targetAttackerCount = (this.missionLevel >= 1) ? Math.max(5, Math.floor(maxAttackers * areaRatio)) : 0;

        // Drones start from Mission 4 (missionLevel 3)
        this.targetDroneCount = (this.missionLevel >= 3) ? Math.max(5, Math.floor(maxDrones * areaRatio)) : 0;

        // Turrets start from Mission 3 (missionLevel 2)
        this.targetTurretCount = (this.missionLevel >= 2) ? Math.max(3, Math.floor(maxTurrets * areaRatio)) : 0;

        this.grid = [];
        this.blockHP = [];
        this.landmineSpawns = [];
        this.enemyTankSpawns = [];
        this.enemyAttackerSpawns = [];
        this.enemyDroneSpawns = [];
        this.enemyTurretSpawns = [];
        this.enemyBaseSpawn = null;

        this._generate();
    }

    // ------------------------------------------
    // Procedural Cave Generation (Rooms & Tunnels + Smoothing)
    // ------------------------------------------
    _generate() {
        // Step 1: Solid fill
        for (let r = 0; r < this.rows; r++) {
            this.grid[r] = [];
            this.blockHP[r] = [];
            for (let c = 0; c < this.cols; c++) {
                this.grid[r][c] = BLOCK_NORMAL;
                this.blockHP[r][c] = 1;
                if (this._isBorder(r, c)) {
                    this.grid[r][c] = BLOCK_INDESTRUCTIBLE;
                    this.blockHP[r][c] = -1;
                }
            }
        }

        // Object to track all rooms for tunneling
        this.rooms = [];

        // Step 2: Carve large designated areas
        // Start area (top-left) - Much larger
        this._carveRoom(3, 3, 20, 16);
        this.rooms.push({ centerR: 3 + 8, centerC: 3 + 10 });

        // Boss / Goal area (bottom-right) - Huge room
        const bossW = 30;
        const bossH = 22;
        this._carveRoom(this.cols - 3 - bossW, this.rows - 3 - bossH, bossW, bossH);
        this.rooms.push({ centerR: this.rows - 3 - Math.floor(bossH / 2), centerC: this.cols - 3 - Math.floor(bossW / 2) });

        // Random large enemy area
        const enemyW = 28;
        const enemyH = 20;
        const enemyC = BORDER_THICKNESS + Math.floor(this.cols * 0.3 + this.game.rng.next() * (this.cols * 0.4 - enemyW));
        const enemyR = BORDER_THICKNESS + Math.floor(this.rows * 0.3 + this.game.rng.next() * (this.rows * 0.4 - enemyH));
        this._carveRoom(enemyC, enemyR, enemyW, enemyH);
        this.rooms.push({ centerR: enemyR + Math.floor(enemyH / 2), centerC: enemyC + Math.floor(enemyW / 2) });

        // Step 4: Scatter random rooms (Chambers)
        const baseRooms = 15;
        const scalingRooms = 35;
        const numRooms = baseRooms + Math.floor(scalingRooms * ((this.cols * this.rows) / (MAX_MAP_COLS * MAX_MAP_ROWS)));

        for (let i = 0; i < numRooms; i++) {
            // Room sizes also scale slightly
            const w = 15 + Math.floor(this.game.rng.next() * 20);
            const h = 15 + Math.floor(this.game.rng.next() * 20);
            const c = BORDER_THICKNESS + Math.floor(this.game.rng.next() * (this.cols - BORDER_THICKNESS * 2 - w));
            const r = BORDER_THICKNESS + Math.floor(this.game.rng.next() * (this.rows - BORDER_THICKNESS * 2 - h));

            // 50% chance for elliptic room vs rectangular
            if (this.game.rng.next() < 0.5) {
                this._carveEllipse(r + Math.floor(h / 2), c + Math.floor(w / 2), Math.floor(h / 2), Math.floor(w / 2));
            } else {
                this._carveRoom(c, r, w, h);
            }
            this.rooms.push({ centerR: r + Math.floor(h / 2), centerC: c + Math.floor(w / 2) });
        }

        // Step 5: Connect all rooms with tunnels
        this._connectRooms();

        // Step 6: Add some random loops/cross-connections
        for (let i = 0; i < 5; i++) {
            const r1 = this.rooms[Math.floor(this.game.rng.next() * this.rooms.length)];
            const r2 = this.rooms[Math.floor(this.game.rng.next() * this.rooms.length)];
            this._carveTunnelPath(r1.centerR, r1.centerC, r2.centerR, r2.centerC, 2);
        }

        // Step 7: Cellular automaton smoothing to make it look organic (like an ant nest)
        // Just 2 passes to erode straight edges and round things off
        for (let i = 0; i < 2; i++) {
            this._smoothStep();
        }

        // Ensure start area remains somewhat clear after smoothing
        this._carveRoom(4, 4, 10, 8);

        // Carve Main Base Area (far right)
        this._carveMainBaseRoom();

        // Step 8: Platform generation for large empty spaces
        this._generatePlatforms();

        // Step 9: Sprinkle hard blocks
        this._placeHardBlocks();

        // Step 10: Determine entity spawn positions
        this.landmineSpawns = this._findLandminePositions();
        this.enemyTankSpawns = this._findEnemyTankPositions();
        this.enemyAttackerSpawns = this._findEnemyAttackerPositions();
        this.enemyDroneSpawns = this._findEnemyDronePositions();
        this.enemyTurretSpawns = this._findEnemyTurretPositions();
        this._addMainBaseDefenders(); // Force add defenders specifically around the base

        // Step 11: Generate off-screen mini-map
        this._generateMiniMap();
        this._initTileCache();
    }

    _generatePlatforms() {
        // Look for wide vertical open spaces and place horizontal platforms
        for (let r = BORDER_THICKNESS + 3; r < this.rows - BORDER_THICKNESS - 4; r++) {
            for (let c = BORDER_THICKNESS + 3; c < this.cols - BORDER_THICKNESS - 7; c++) {
                // Check if current tile is empty, and there's plenty of space above/below it (7x7 area)
                if (this._isAreaEmpty(r - 3, c, 7, 7)) {
                    // With a low probability, generate a floating platform here
                    if (this.game.rng.next() < 0.06) { // Sparse platforms
                        const platWidth = 4 + Math.floor(this.game.rng.next() * 6); // width 4 to 9
                        const platHeight = 1; // thickness 1 (thinner)

                        for (let pr = r; pr < r + platHeight; pr++) {
                            for (let pc = c; pc < c + platWidth; pc++) {
                                // Double check boundaries
                                if (pr < this.rows - BORDER_THICKNESS && pc < this.cols - BORDER_THICKNESS) {
                                    this.grid[pr][pc] = BLOCK_NORMAL;
                                    this.blockHP[pr][pc] = 1;
                                }
                            }
                        }
                        // Skip ahead so we don't immediately generate another overlapping platform
                        c += platWidth + 2;
                    }
                }
            }
        }
    }

    _isAreaEmpty(startR, startC, height, width) {
        for (let r = startR; r < startR + height; r++) {
            for (let c = startC; c < startC + width; c++) {
                if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
                if (this.grid[r][c] !== BLOCK_EMPTY) return false;
            }
        }
        return true;
    }

    _isBorder(r, c) {
        return r < BORDER_THICKNESS || r >= this.rows - BORDER_THICKNESS ||
            c < BORDER_THICKNESS || c >= this.cols - BORDER_THICKNESS;
    }

    _carveRoom(startC, startR, width, height) {
        for (let r = startR; r < startR + height; r++) {
            for (let c = startC; c < startC + width; c++) {
                if (r >= BORDER_THICKNESS && r < this.rows - BORDER_THICKNESS &&
                    c >= BORDER_THICKNESS && c < this.cols - BORDER_THICKNESS) {
                    this.grid[r][c] = BLOCK_EMPTY;
                    this.blockHP[r][c] = 0;
                }
            }
        }
    }

    _carveEllipse(centerR, centerC, radiusR, radiusC) {
        for (let r = centerR - radiusR; r <= centerR + radiusR; r++) {
            for (let c = centerC - radiusC; c <= centerC + radiusC; c++) {
                if (r >= BORDER_THICKNESS && r < this.rows - BORDER_THICKNESS &&
                    c >= BORDER_THICKNESS && c < this.cols - BORDER_THICKNESS) {
                    // Ellipse equation: (x-h)^2/a^2 + (y-k)^2/b^2 <= 1
                    const normalizedDist = Math.pow((c - centerC) / radiusC, 2) + Math.pow((r - centerR) / radiusR, 2);
                    if (normalizedDist <= 1) {
                        this.grid[r][c] = BLOCK_EMPTY;
                        this.blockHP[r][c] = 0;
                    }
                }
            }
        }
    }

    _connectRooms() {
        // Simple MST-like connection: connect each room to its nearest unconnected neighbor
        const unconnected = [...this.rooms];
        const connected = [];

        // Start with the first room (start area)
        connected.push(unconnected.shift());

        while (unconnected.length > 0) {
            let bestDist = Infinity;
            let bestFrom = null;
            let bestToIdx = -1;

            for (let i = 0; i < connected.length; i++) {
                for (let j = 0; j < unconnected.length; j++) {
                    const roomA = connected[i];
                    const roomB = unconnected[j];
                    const distSq = Math.pow(roomA.centerC - roomB.centerC, 2) + Math.pow(roomA.centerR - roomB.centerR, 2);
                    if (distSq < bestDist) {
                        bestDist = distSq;
                        bestFrom = roomA;
                        bestToIdx = j;
                    }
                }
            }

            const bestTo = unconnected.splice(bestToIdx, 1)[0];

            // Carve a tunnel between bestFrom and bestTo
            // Varying tunnel width between 6 and 11 for massive connecting halls
            const tunnelWidth = 6 + Math.floor(this.game.rng.next() * 6);
            this._carveTunnelPath(bestFrom.centerR, bestFrom.centerC, bestTo.centerR, bestTo.centerC, tunnelWidth);

            connected.push(bestTo);
        }
    }

    _carveTunnelPath(r1, c1, r2, c2, width) {
        // Manhattan-style L-shaped tunnels look more like an ant nest than direct diagonals
        const midC = c1;
        const midR = r2;

        // Vertical then Horizontal (or vice versa)
        if (this.game.rng.next() < 0.5) {
            this._carveTunnelLine(r1, c1, r2, c1, width); // Vertical
            this._carveTunnelLine(r2, c1, r2, c2, width); // Horizontal
        } else {
            this._carveTunnelLine(r1, c1, r1, c2, width); // Horizontal
            this._carveTunnelLine(r1, c2, r2, c2, width); // Vertical
        }
    }

    _carveTunnelLine(r1, c1, r2, c2, width) {
        const startR = Math.min(r1, r2);
        const endR = Math.max(r1, r2);
        const startC = Math.min(c1, c2);
        const endC = Math.max(c1, c2);

        for (let r = startR; r <= endR; r++) {
            for (let c = startC; c <= endC; c++) {
                this._carveBrush(r, c, width);
            }
        }
    }

    _carveBrush(centerR, centerC, size) {
        const offset = Math.floor(size / 2);
        for (let dr = -offset; dr <= offset; dr++) {
            for (let dc = -offset; dc <= offset; dc++) {
                const r = centerR + dr;
                const c = centerC + dc;
                if (r >= BORDER_THICKNESS && r < this.rows - BORDER_THICKNESS &&
                    c >= BORDER_THICKNESS && c < this.cols - BORDER_THICKNESS) {
                    this.grid[r][c] = BLOCK_EMPTY;
                    this.blockHP[r][c] = 0;
                }
            }
        }
    }

    _smoothStep() {
        // Standard cellular automata smoothing rule
        const newGrid = [];
        const newHP = [];
        for (let r = 0; r < this.rows; r++) {
            newGrid[r] = [];
            newHP[r] = [];
            for (let c = 0; c < this.cols; c++) {
                if (this._isBorder(r, c)) {
                    newGrid[r][c] = this.grid[r][c];
                    newHP[r][c] = this.blockHP[r][c];
                    continue;
                }
                const neighbors = this._countNeighbors(r, c);
                // "B5678/S45678" style rules: become wall if many wall neighbors, otherwise empty.
                if (neighbors >= 5) {
                    newGrid[r][c] = BLOCK_NORMAL;
                    newHP[r][c] = 1;
                } else if (neighbors <= 3) {
                    newGrid[r][c] = BLOCK_EMPTY;
                    newHP[r][c] = 0;
                } else {
                    newGrid[r][c] = this.grid[r][c];
                    newHP[r][c] = this.blockHP[r][c];
                }
            }
        }
        this.grid = newGrid;
        this.blockHP = newHP;
    }

    _countNeighbors(r, c) {
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = r + dr;
                const nc = c + dc;
                if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) {
                    count++;
                } else if (this.grid[nr][nc] !== BLOCK_EMPTY) {
                    count++;
                }
            }
        }
        return count;
    }

    _carveArea(startC, startR, width, height) {
        for (let r = startR; r < startR + height && r < this.rows - BORDER_THICKNESS; r++) {
            for (let c = startC; c < startC + width && c < this.cols - BORDER_THICKNESS; c++) {
                if (r >= BORDER_THICKNESS && c >= BORDER_THICKNESS) {
                    this.grid[r][c] = BLOCK_EMPTY;
                    this.blockHP[r][c] = 0;
                }
            }
        }
    }

    _carveMainPath() {
        let r = 5;
        let c = 5;
        const targetR = this.rows - 8;
        const targetC = this.cols - 8;

        while (r < targetR || c < targetC) {
            this._carveTunnel(r, c, 3);
            const rand = this.game.rng.next();
            if (c < targetC && (rand < 0.5 || r >= targetR)) {
                c += 1;
            } else if (r < targetR) {
                r += 1;
            }
        }
        this._carveTunnel(r, c, 3);
    }

    _carveTunnel(r, c, size) {
        for (let dr = -1; dr < size; dr++) {
            for (let dc = -1; dc < size; dc++) {
                const nr = r + dr;
                const nc = c + dc;
                if (nr >= BORDER_THICKNESS && nr < this.rows - BORDER_THICKNESS &&
                    nc >= BORDER_THICKNESS && nc < this.cols - BORDER_THICKNESS) {
                    this.grid[nr][nc] = BLOCK_EMPTY;
                    this.blockHP[nr][nc] = 0;
                }
            }
        }
    }

    _placeHardBlocks() {
        for (let r = BORDER_THICKNESS; r < this.rows - BORDER_THICKNESS; r++) {
            for (let c = BORDER_THICKNESS; c < this.cols - BORDER_THICKNESS; c++) {
                if (this.grid[r][c] === BLOCK_NORMAL && this.game.rng.next() < HARD_BLOCK_CHANCE) {
                    this.grid[r][c] = BLOCK_HARD;
                    this.blockHP[r][c] = HARD_BLOCK_HP;
                }
            }
        }
    }

    /**
     * Find valid floor positions for landmine placement.
     * A valid position is an empty tile with a solid tile directly below it.
     * Returns an array of {x, y} pixel coordinates.
     */
    _findLandminePositions() {
        const candidates = [];
        // Exclude borders and the start area (top-left 15x12 tiles)
        for (let r = BORDER_THICKNESS; r < this.rows - BORDER_THICKNESS; r++) {
            for (let c = BORDER_THICKNESS; c < this.cols - BORDER_THICKNESS; c++) {
                // Skip start area
                if (r < 14 && c < 16) continue;
                // Empty tile with solid floor below
                if (this.grid[r][c] === BLOCK_EMPTY &&
                    r + 1 < this.rows && this.grid[r + 1][c] !== BLOCK_EMPTY) {
                    candidates.push({ r, c });
                }
            }
        }

        // Shuffle and pick LANDMINE_COUNT positions
        const spawns = [];
        const count = Math.min(this.targetLandmineCount, candidates.length);
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(this.game.rng.next() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
        for (let i = 0; i < count; i++) {
            const tile = candidates[i];
            // Place centered on the tile floor
            spawns.push({
                x: tile.c * TILE_SIZE + (TILE_SIZE - LANDMINE_WIDTH) / 2,
                y: (tile.r + 1) * TILE_SIZE - LANDMINE_HEIGHT // Sit on top of the floor tile
            });
        }
        return spawns;
    }

    /**
     * Find valid positions for enemy hover tanks.
     * Needs an empty tile (and empty tile above) with solid floor below.
     * Returns an array of {x, y} pixel coordinates.
     */
    _findEnemyTankPositions() {
        const candidates = [];
        for (let r = BORDER_THICKNESS + 1; r < this.rows - BORDER_THICKNESS; r++) {
            for (let c = BORDER_THICKNESS; c < this.cols - BORDER_THICKNESS; c++) {
                // Skip start area (larger exclusion zone)
                if (r < 16 && c < 20) continue;
                // Need empty tile + empty tile above + solid floor below
                if (this.grid[r][c] === BLOCK_EMPTY &&
                    this.grid[r - 1][c] === BLOCK_EMPTY &&
                    r + 1 < this.rows && this.grid[r + 1][c] !== BLOCK_EMPTY) {
                    candidates.push({ r, c });
                }
            }
        }

        // Shuffle and pick ENEMY_TANK_COUNT positions
        const spawns = [];
        const count = Math.min(this.targetTankCount, candidates.length);
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(this.game.rng.next() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
        for (let i = 0; i < count; i++) {
            const tile = candidates[i];
            spawns.push({
                x: tile.c * TILE_SIZE + (TILE_SIZE - ENEMY_TANK_WIDTH) / 2,
                y: (tile.r + 1) * TILE_SIZE - ENEMY_TANK_HEIGHT // Hover just above the floor
            });
        }
        return spawns;
    }

    /**
     * Find valid positions for enemy attackers (humanoid robots).
     * Needs 2 empty tiles above a solid floor for the 24px tall body.
     */
    _findEnemyAttackerPositions() {
        const candidates = [];
        for (let r = BORDER_THICKNESS + 2; r < this.rows - BORDER_THICKNESS; r++) {
            for (let c = BORDER_THICKNESS; c < this.cols - BORDER_THICKNESS; c++) {
                if (r < 16 && c < 20) continue; // Skip start area
                // Need 2 empty tiles above solid floor (blocks or platforms)
                if (this.grid[r][c] === BLOCK_EMPTY &&
                    this.grid[r - 1][c] === BLOCK_EMPTY &&
                    r + 1 < this.rows && this.grid[r + 1][c] !== BLOCK_EMPTY) {
                    candidates.push({ r, c });
                }
            }
        }

        const spawns = [];
        const count = Math.min(this.targetAttackerCount, candidates.length);
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(this.game.rng.next() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
        for (let i = 0; i < count; i++) {
            const tile = candidates[i];
            spawns.push({
                x: tile.c * TILE_SIZE + (TILE_SIZE - PLAYER_WIDTH) / 2,
                y: (tile.r + 1) * TILE_SIZE - PLAYER_HEIGHT
            });
        }
        return spawns;
    }

    /**
     * Find valid positions for enemy drones (aerial).
     * Needs ample empty space (e.g., 3x3 empty blocks) so they spawn hovering in the air.
     */
    _findEnemyDronePositions() {
        const candidates = [];
        for (let r = BORDER_THICKNESS + 2; r < this.rows - BORDER_THICKNESS - 2; r++) {
            for (let c = BORDER_THICKNESS + 2; c < this.cols - BORDER_THICKNESS - 2; c++) {
                if (r < 16 && c < 20) continue; // Skip start area
                // Need a 3x3 empty area to ensure it spawns floating in an open space
                if (this._isAreaEmpty(r - 1, c - 1, 3, 3)) {
                    candidates.push({ r, c });
                }
            }
        }

        const spawns = [];
        const count = Math.min(this.targetDroneCount, candidates.length);
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(this.game.rng.next() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
        for (let i = 0; i < count; i++) {
            const tile = candidates[i];
            spawns.push({
                x: tile.c * TILE_SIZE + (TILE_SIZE - ENEMY_DRONE_WIDTH) / 2,
                y: tile.r * TILE_SIZE + (TILE_SIZE - ENEMY_DRONE_HEIGHT) / 2
            });
        }
        return spawns;
    }

    _carveMainBaseRoom() {
        // Random position along the right edge: between middle (rows/2) and bottom (near rows-15)
        const minR = Math.floor(this.rows / 2);
        const maxR = this.rows - 15;
        const centerR = minR + Math.floor(this.game.rng.next() * (maxR - minR));
        const centerC = this.cols - 12;

        // Ensure there is a tunnel connecting to it
        this._carveTunnelPath(centerR, centerC, centerR, centerC - 20, 6);

        // Carve the main large room
        this._carveRoom(centerC - 8, centerR - 10, 16, 20);

        // Build a strong floor platform for the base
        const floorR = centerR + 8;
        for (let c = centerC - 6; c <= centerC + 6; c++) {
            this.grid[floorR][c] = BLOCK_INDESTRUCTIBLE;
            this.blockHP[floorR][c] = 999;
        }

        // Platforms for turrets - staggered based on mission level
        // 1. Ceiling platforms (Always 2 from Mission 1)
        this.grid[centerR - 4][centerC - 6] = BLOCK_INDESTRUCTIBLE;
        this.blockHP[centerR - 4][centerC - 6] = 999;
        this.grid[centerR - 4][centerC + 6] = BLOCK_INDESTRUCTIBLE;
        this.blockHP[centerR - 4][centerC + 6] = 999;

        // 2. Middle floor platform (From Mission 3)
        if (this.missionLevel >= 2) {
            this.grid[centerR + 2][centerC] = BLOCK_INDESTRUCTIBLE;
            this.blockHP[centerR + 2][centerC] = 999;
        }

        // 3. Side floor platforms (From Mission 4)
        if (this.missionLevel >= 3) {
            // Left side platform
            this.grid[centerR + 4][centerC - 4] = BLOCK_INDESTRUCTIBLE;
            this.blockHP[centerR + 4][centerC - 4] = 999;
            // Right side platform
            this.grid[centerR + 4][centerC + 4] = BLOCK_INDESTRUCTIBLE;
            this.blockHP[centerR + 4][centerC + 4] = 999;
        }

        // Add some hard blocks for cover
        this.grid[floorR - 1][centerC - 7] = BLOCK_INDESTRUCTIBLE;
        this.blockHP[floorR - 1][centerC - 7] = 999;
        this.grid[floorR - 2][centerC - 7] = BLOCK_INDESTRUCTIBLE;
        this.blockHP[floorR - 2][centerC - 7] = 999;

        // Save spawn location for the Main Base (base rests on the indestructible floor)
        this.enemyBaseSpawn = {
            x: centerC * TILE_SIZE - (ENEMY_BASE_WIDTH / 2),
            y: floorR * TILE_SIZE - ENEMY_BASE_HEIGHT
        };
        this.enemyBaseCenter = { r: centerR, c: centerC, floorR: floorR };
    }

    _addMainBaseDefenders() {
        if (!this.enemyBaseCenter) return;

        const { r, c, floorR } = this.enemyBaseCenter;

        // Add Turrets on the indestructible spots we created - Staggered by MissionLevel
        // Ceiling turrets (Always 2)
        this.enemyTurretSpawns.push({
            x: (c - 6) * TILE_SIZE,
            y: (r - 4 + 1) * TILE_SIZE,
            isCeiling: true
        });
        this.enemyTurretSpawns.push({
            x: (c + 6) * TILE_SIZE,
            y: (r - 4 + 1) * TILE_SIZE,
            isCeiling: true
        });

        // Floor turret on the middle platform (Mission 3 only)
        if (this.missionLevel === 2) {
            this.enemyTurretSpawns.push({
                x: c * TILE_SIZE,
                y: (r + 2 - 1) * TILE_SIZE,
                isCeiling: false
            });
        }

        // Floor turrets on side platforms (Mission 4+)
        if (this.missionLevel >= 3) {
            this.enemyTurretSpawns.push({
                x: (c - 4) * TILE_SIZE,
                y: (r + 4 - 1) * TILE_SIZE,
                isCeiling: false
            });
            this.enemyTurretSpawns.push({
                x: (c + 4) * TILE_SIZE,
                y: (r + 4 - 1) * TILE_SIZE,
                isCeiling: false
            });
        }

        // Add a few tanks
        this.enemyTankSpawns.push({
            x: (c - 4) * TILE_SIZE,
            y: (floorR - 1) * TILE_SIZE - ENEMY_TANK_HEIGHT
        });
        this.enemyTankSpawns.push({
            x: (c + 4) * TILE_SIZE,
            y: (floorR - 1) * TILE_SIZE - ENEMY_TANK_HEIGHT
        });

        // Add some drones (Mission 4+)
        if (this.missionLevel >= 3) {
            this.enemyDroneSpawns.push({
                x: (c - 3) * TILE_SIZE,
                y: (r - 6) * TILE_SIZE
            });
            this.enemyDroneSpawns.push({
                x: (c + 3) * TILE_SIZE,
                y: (r - 6) * TILE_SIZE
            });
        }
    }

    /**
     * Find valid positions for enemy turrets (stationary).
     * Needs a solid floor OR solid ceiling.
     */
    _findEnemyTurretPositions() {
        const floorCandidates = [];
        const ceilingCandidates = [];

        for (let r = BORDER_THICKNESS + 2; r < this.rows - BORDER_THICKNESS - 2; r++) {
            for (let c = BORDER_THICKNESS + 2; c < this.cols - BORDER_THICKNESS - 2; c++) {
                if (r < 16 && c < 20) continue; // Skip start area

                // Floor mount: this tile is empty, left and right are empty, below is solid
                if (this.grid[r][c] === BLOCK_EMPTY &&
                    this.grid[r][c - 1] === BLOCK_EMPTY &&
                    this.grid[r][c + 1] === BLOCK_EMPTY &&
                    this.grid[r + 1][c] !== BLOCK_EMPTY) {
                    floorCandidates.push({ r, c, isCeiling: false });
                }

                // Ceiling mount: this tile is empty, left and right are empty, above is solid
                if (this.grid[r][c] === BLOCK_EMPTY &&
                    this.grid[r][c - 1] === BLOCK_EMPTY &&
                    this.grid[r][c + 1] === BLOCK_EMPTY &&
                    this.grid[r - 1][c] !== BLOCK_EMPTY) {
                    ceilingCandidates.push({ r, c, isCeiling: true });
                }
            }
        }

        // Combine all candidates
        const allCandidates = [...floorCandidates, ...ceilingCandidates];

        const spawns = [];
        const count = Math.min(this.targetTurretCount, allCandidates.length);

        // Shuffle candidates
        for (let i = allCandidates.length - 1; i > 0; i--) {
            const j = Math.floor(this.game.rng.next() * (i + 1));
            [allCandidates[i], allCandidates[j]] = [allCandidates[j], allCandidates[i]];
        }

        for (let i = 0; i < count; i++) {
            const tile = allCandidates[i];
            let yPos = tile.r * TILE_SIZE;

            // Adjust Y based on mounting
            if (tile.isCeiling) {
                // Attached to top of tile
                yPos = tile.r * TILE_SIZE;
            } else {
                // Attached to bottom of tile
                yPos = tile.r * TILE_SIZE + TILE_SIZE - ENEMY_TURRET_HEIGHT;
            }

            spawns.push({
                x: tile.c * TILE_SIZE + (TILE_SIZE - ENEMY_TURRET_WIDTH) / 2,
                y: yPos,
                isCeiling: tile.isCeiling
            });
        }
        return spawns;
    }

    // ------------------------------------------
    // Block Destruction
    // ------------------------------------------

    /** Damage a single block. Returns true if destroyed. */
    damageBlock(r, c, damage = 1) {
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
        const block = this.grid[r][c];
        if (block === BLOCK_EMPTY || block === BLOCK_INDESTRUCTIBLE) return false;

        this.blockHP[r][c] -= damage;
        if (this.blockHP[r][c] <= 0) {
            this.grid[r][c] = BLOCK_EMPTY;
            this.blockHP[r][c] = 0;
            this.invalidateTileRegion(r, c);
            return true;
        }
        // 非致命ダメージ: ブロック自身のひび割れ表現が変わるため中心タイルを再描画する。
        // (周囲8マスの見た目は自身が空洞化した時のみ変化するため9マス再描画で構わない)
        this.invalidateTileRegion(r, c);
        return false;
    }

    /** Redraw the destroyed tile and its 8 neighbors in the tile cache
     *  (neighbors' exposure flags/notches depend on this tile's state). */
    invalidateTileRegion(centerR, centerC) {
        const S = TILE_SIZE;
        const startR = Math.max(0, centerR - 1);
        const endR = Math.min(this.rows - 1, centerR + 1);
        const startC = Math.max(0, centerC - 1);
        const endC = Math.min(this.cols - 1, centerC + 1);

        for (let r = startR; r <= endR; r++) {
            for (let c = startC; c <= endC; c++) {
                this.tileCacheCtx.clearRect(c * S, r * S, S, S);
                const block = this.grid[r][c];
                if (block === BLOCK_EMPTY) continue;
                if (block === BLOCK_INDESTRUCTIBLE) {
                    this._drawPolishedBlock(this.tileCacheCtx, c * S, r * S, S);
                } else {
                    this._drawRockyBlock(this.tileCacheCtx, r, c, block);
                }
            }
        }
    }

    /** Destroy blocks in a radius (for grenades) */
    destroyArea(centerR, centerC, radius) {
        const destroyed = [];
        for (let r = centerR - radius; r <= centerR + radius; r++) {
            for (let c = centerC - radius; c <= centerC + radius; c++) {
                const dist = Math.abs(r - centerR) + Math.abs(c - centerC);
                if (dist <= radius) {
                    if (this.damageBlock(r, c, 3)) {
                        destroyed.push({ r, c });
                    }
                }
            }
        }
        return destroyed;
    }

    // ------------------------------------------
    // Tile Render Cache
    // ------------------------------------------

    _initTileCache() {
        this.tileCacheCanvas = document.createElement('canvas');
        this.tileCacheCanvas.width = this.width;
        this.tileCacheCanvas.height = this.height;
        this.tileCacheCtx = this.tileCacheCanvas.getContext('2d');
        this._renderAllToCache();
    }

    _renderAllToCache() {
        const S = TILE_SIZE;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const block = this.grid[r][c];
                if (block === BLOCK_EMPTY) continue;
                if (block === BLOCK_INDESTRUCTIBLE) {
                    this._drawPolishedBlock(this.tileCacheCtx, c * S, r * S, S);
                } else {
                    this._drawRockyBlock(this.tileCacheCtx, r, c, block);
                }
            }
        }
    }

    // ------------------------------------------
    // Mini-Map Generation
    // ------------------------------------------

    _generateMiniMap() {
        this.miniMapScale = 2; // 2 pixels per tile
        this.miniMapCanvas = document.createElement('canvas');
        this.miniMapCanvas.width = this.cols * this.miniMapScale;
        this.miniMapCanvas.height = this.rows * this.miniMapScale;
        const ctx = this.miniMapCanvas.getContext('2d');

        // Draw background
        ctx.fillStyle = COLOR_CAVE_BG;
        ctx.fillRect(0, 0, this.miniMapCanvas.width, this.miniMapCanvas.height);

        // Draw static blocks
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const block = this.grid[r][c];
                if (block === BLOCK_EMPTY) continue;

                ctx.fillStyle = this.blockStyles[block].fill;
                ctx.fillRect(c * this.miniMapScale, r * this.miniMapScale, this.miniMapScale, this.miniMapScale);
            }
        }
    }

    // ------------------------------------------
    // Collision Helpers
    // ------------------------------------------

    isSolid(r, c) {
        if (isNaN(r) || isNaN(c)) return true;
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return true;
        return this.grid[r][c] !== BLOCK_EMPTY;
    }

    isSolidAtPixel(x, y) {
        if (isNaN(x) || isNaN(y)) return true;
        return this.isSolid(Math.floor(y / TILE_SIZE), Math.floor(x / TILE_SIZE));
    }

    pixelToTile(x, y) {
        return {
            c: Math.floor(x / TILE_SIZE),
            r: Math.floor(y / TILE_SIZE)
        };
    }

    // ------------------------------------------
    // Update & Draw
    // ------------------------------------------

    update() {
        // Placeholder for future map animations
    }

    draw(ctx) {
        const cam = this.game.camera;
        const startCol = Math.max(0, Math.floor(cam.x / TILE_SIZE));
        const endCol = Math.min(this.cols, Math.ceil((cam.x + this.game.canvas.width) / TILE_SIZE));
        const startRow = Math.max(0, Math.floor(cam.y / TILE_SIZE));
        const endRow = Math.min(this.rows, Math.ceil((cam.y + this.game.canvas.height) / TILE_SIZE));

        const S = TILE_SIZE;
        for (let r = startRow; r < endRow; r++) {
            for (let c = startCol; c < endCol; c++) {
                const block = this.grid[r][c];
                if (block === BLOCK_EMPTY) continue;
                if (block === BLOCK_INDESTRUCTIBLE) {
                    this._drawPolishedBlock(ctx, c * S, r * S, S);
                } else {
                    this._drawRockyBlock(ctx, r, c, block);
                }
            }
        }
    }

    _drawRockyBlock(ctx, r, c, block) {
        const S = TILE_SIZE;
        const x = c * S;
        const y = r * S;

        const style = this.blockStyles[block];

        // タイル座標から計算する決定論的乱数（毎フレーム同一値）
        const seed = (r * 7919 + c * 104729) | 0;
        const rng = (i) => {
            let h = Math.imul((seed ^ Math.imul(i, 2654435761)) | 0, 0x9e3779b9) >>> 0;
            h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
            return (h >>> 0) / 0xFFFFFFFF;
        };

        // 4方向の露出判定（空洞に面しているか）
        const expTop = r === 0 || this.grid[r - 1][c] === BLOCK_EMPTY;
        const expBottom = r === this.rows - 1 || this.grid[r + 1][c] === BLOCK_EMPTY;
        const expLeft = c === 0 || this.grid[r][c - 1] === BLOCK_EMPTY;
        const expRight = c === this.cols - 1 || this.grid[r][c + 1] === BLOCK_EMPTY;

        // 凸角：両隣が空洞 → 面取りサイズを決定論的に選ぶ
        const cTL = (expTop && expLeft) ? (4 + Math.floor(rng(90) * 6)) : 0;
        const cTR = (expTop && expRight) ? (4 + Math.floor(rng(91) * 6)) : 0;
        const cBR = (expBottom && expRight) ? (4 + Math.floor(rng(92) * 6)) : 0;
        const cBL = (expBottom && expLeft) ? (4 + Math.floor(rng(93) * 6)) : 0;

        // 凹角：両隣は塞がっているが斜め方向が空洞 → 影ノッチ
        const notchTL = !expTop && !expLeft && r > 0 && c > 0 && this.grid[r - 1][c - 1] === BLOCK_EMPTY;
        const notchTR = !expTop && !expRight && r > 0 && c < this.cols - 1 && this.grid[r - 1][c + 1] === BLOCK_EMPTY;
        const notchBL = !expBottom && !expLeft && r < this.rows - 1 && c > 0 && this.grid[r + 1][c - 1] === BLOCK_EMPTY;
        const notchBR = !expBottom && !expRight && r < this.rows - 1 && c < this.cols - 1 && this.grid[r + 1][c + 1] === BLOCK_EMPTY;

        // 1. 面取り多角形でベース塗り（時計回りで頂点列挙）
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x + cTL, y);           // 上辺：左端（TL面取り分だけ右へ）
        ctx.lineTo(x + S - cTR, y);           // 上辺：右端
        if (cTR) ctx.lineTo(x + S, y + cTR); // TR面取り斜線
        ctx.lineTo(x + S, y + S - cBR);       // 右辺：下端
        if (cBR) ctx.lineTo(x + S - cBR, y + S); // BR面取り斜線
        ctx.lineTo(x + cBL, y + S);       // 下辺：左端
        if (cBL) ctx.lineTo(x, y + S - cBL); // BL面取り斜線
        ctx.lineTo(x, y + cTL);     // 左辺：上端
        if (cTL) ctx.lineTo(x + cTL, y);     // TL面取り斜線（→ closePath と一致）
        ctx.closePath();

        ctx.fillStyle = style.fill;
        ctx.fill();

        // 以降の描画をこの多角形内に制限
        ctx.clip();

        // 2. ブロックごとの明度バリエーション（5段階）
        const v = Math.floor(rng(80) * 5);
        if (v === 0) { ctx.fillStyle = 'rgba(0,0,0,0.09)'; ctx.fillRect(x, y, S, S); }
        if (v === 1) { ctx.fillStyle = 'rgba(0,0,0,0.04)'; ctx.fillRect(x, y, S, S); }
        if (v === 3) { ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(x, y, S, S); }
        if (v === 4) { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x, y, S, S); }

        // 3. 凹角の影ノッチ（隣ブロックとの接合部に小さな暗い三角）
        const NOTCH = 4;
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        if (notchTL) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + NOTCH, y); ctx.lineTo(x, y + NOTCH); ctx.closePath(); ctx.fill(); }
        if (notchTR) { ctx.beginPath(); ctx.moveTo(x + S, y); ctx.lineTo(x + S - NOTCH, y); ctx.lineTo(x + S, y + NOTCH); ctx.closePath(); ctx.fill(); }
        if (notchBL) { ctx.beginPath(); ctx.moveTo(x, y + S); ctx.lineTo(x + NOTCH, y + S); ctx.lineTo(x, y + S - NOTCH); ctx.closePath(); ctx.fill(); }
        if (notchBR) { ctx.beginPath(); ctx.moveTo(x + S, y + S); ctx.lineTo(x + S - NOTCH, y + S); ctx.lineTo(x + S, y + S - NOTCH); ctx.closePath(); ctx.fill(); }

        // 4. 露出面をジャギーポリゴンで描画（clip が面取り部分を自動除外）
        const STEPS = 4;
        const JITTER = 6;

        // 上面：光が当たる明るい面
        if (expTop) {
            ctx.fillStyle = 'rgba(255,255,255,0.32)';
            ctx.beginPath();
            ctx.moveTo(x, y);
            for (let i = 0; i <= STEPS; i++)
                ctx.lineTo(x + S * i / STEPS, y + 1 + rng(i) * JITTER);
            ctx.lineTo(x + S, y);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.60)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 0; i <= STEPS; i++) {
                const px = x + S * i / STEPS, py = y + rng(i + 10) * 2;
                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.stroke();
        }

        // 下面：影になる暗い面
        if (expBottom) {
            ctx.fillStyle = 'rgba(0,0,0,0.50)';
            ctx.beginPath();
            ctx.moveTo(x, y + S);
            for (let i = 0; i <= STEPS; i++)
                ctx.lineTo(x + S * i / STEPS, y + S - 1 - rng(i + 20) * JITTER);
            ctx.lineTo(x + S, y + S);
            ctx.closePath();
            ctx.fill();
        }

        // 左面：やや明るい面
        if (expLeft) {
            ctx.fillStyle = 'rgba(255,255,255,0.20)';
            ctx.beginPath();
            ctx.moveTo(x, y);
            for (let i = 0; i <= STEPS; i++)
                ctx.lineTo(x + 1 + rng(i + 30) * JITTER, y + S * i / STEPS);
            ctx.lineTo(x, y + S);
            ctx.closePath();
            ctx.fill();
        }

        // 右面：やや暗い面
        if (expRight) {
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.beginPath();
            ctx.moveTo(x + S, y);
            for (let i = 0; i <= STEPS; i++)
                ctx.lineTo(x + S - 1 - rng(i + 40) * JITTER, y + S * i / STEPS);
            ctx.lineTo(x + S, y + S);
            ctx.closePath();
            ctx.fill();
        }

        // 5. 内部テクスチャ（岩の多角形ファセット + ひび線）
        // --- 暗い面：必ず2枚 ---
        ctx.fillStyle = `rgba(0,0,0,${0.10 + rng(200) * 0.10})`;
        ctx.beginPath();
        ctx.moveTo(x + rng(201) * S, y + rng(202) * S);
        ctx.lineTo(x + rng(203) * S, y + rng(204) * S);
        ctx.lineTo(x + rng(205) * S, y + rng(206) * S);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = `rgba(0,0,0,${0.07 + rng(207) * 0.08})`;
        ctx.beginPath();
        ctx.moveTo(x + rng(208) * S, y + rng(209) * S);
        ctx.lineTo(x + rng(210) * S, y + rng(211) * S);
        ctx.lineTo(x + rng(212) * S, y + rng(213) * S);
        ctx.closePath();
        ctx.fill();

        // --- 明るい面：60%の確率で1枚 ---
        if (rng(214) > 0.40) {
            ctx.fillStyle = `rgba(255,255,255,${0.07 + rng(215) * 0.09})`;
            ctx.beginPath();
            ctx.moveTo(x + rng(216) * S, y + rng(217) * S);
            ctx.lineTo(x + rng(218) * S, y + rng(219) * S);
            ctx.lineTo(x + rng(220) * S, y + rng(221) * S);
            ctx.closePath();
            ctx.fill();
        }

        // --- ハイライト：35%の確率で追加1枚 ---
        if (rng(222) > 0.65) {
            ctx.fillStyle = `rgba(255,255,255,${0.04 + rng(223) * 0.07})`;
            ctx.beginPath();
            ctx.moveTo(x + 1 + rng(224) * (S - 2), y + 1 + rng(225) * (S - 2));
            ctx.lineTo(x + 1 + rng(226) * (S - 2), y + 1 + rng(227) * (S - 2));
            ctx.lineTo(x + 1 + rng(228) * (S - 2), y + 1 + rng(229) * (S - 2));
            ctx.closePath();
            ctx.fill();
        }

        // --- ひび線 ---
        ctx.strokeStyle = 'rgba(0,0,0,0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 2 + rng(50) * (S - 4), y + 2 + rng(51) * (S - 4));
        ctx.lineTo(x + 2 + rng(52) * (S - 4), y + 2 + rng(53) * (S - 4));
        ctx.stroke();
        if (rng(60) > 0.5) {
            ctx.strokeStyle = 'rgba(0,0,0,0.09)';
            ctx.beginPath();
            ctx.moveTo(x + 3 + rng(61) * (S - 6), y + 3 + rng(62) * (S - 6));
            ctx.lineTo(x + 3 + rng(63) * (S - 6), y + 3 + rng(64) * (S - 6));
            ctx.stroke();
        }

        // 6. ハードブロックのダメージクラック（被ダメージ1回につき2本追加）
        if (block === BLOCK_HARD && this.blockHP[r][c] < HARD_BLOCK_HP) {
            const damageTaken = HARD_BLOCK_HP - this.blockHP[r][c];
            const crackCount = Math.min(damageTaken * 2, 4);
            // 各クラックのスタイル定義（後から入るほど濃く・太く）
            const crackStyles = [
                { color: 'rgba(255,255,255,0.38)', width: 1 },
                { color: 'rgba(255,255,255,0.44)', width: 1 },
                { color: 'rgba(255,255,255,0.52)', width: 1.5 },
                { color: 'rgba(255,255,255,0.62)', width: 1.5 },
            ];
            for (let ci = 0; ci < crackCount; ci++) {
                const base = 100 + ci * 4; // rng の他用途と被らないシード帯
                ctx.strokeStyle = crackStyles[ci].color;
                ctx.lineWidth = crackStyles[ci].width;
                ctx.beginPath();
                ctx.moveTo(x + 1 + rng(base) * (S - 2), y + 1 + rng(base + 1) * (S - 2));
                ctx.lineTo(x + 1 + rng(base + 2) * (S - 2), y + 1 + rng(base + 3) * (S - 2));
                ctx.stroke();
            }
        }

        ctx.restore();
    }

    _drawPolishedBlock(ctx, x, y, S) {
        const style = this.blockStyles[BLOCK_INDESTRUCTIBLE];
        const B = 3; // ベベル幅

        // ベース塗り
        ctx.fillStyle = style.fill;
        ctx.fillRect(x, y, S, S);

        // 上面ハイライト（光が当たる面）
        ctx.fillStyle = 'rgba(255,255,255,0.38)';
        ctx.fillRect(x, y, S, B);
        // 左面ハイライト
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(x, y + B, B, S - B);

        // 下面シャドウ
        ctx.fillStyle = 'rgba(0,0,0,0.50)';
        ctx.fillRect(x, y + S - B, S, B);
        // 右面シャドウ
        ctx.fillStyle = 'rgba(0,0,0,0.34)';
        ctx.fillRect(x + S - B, y, B, S - B);

        // 内側の陰刻ライン（機械加工されたタイル感）
        ctx.strokeStyle = 'rgba(255,255,255,0.13)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + B + 0.5, y + B + 0.5, S - 2 * B - 1, S - 2 * B - 1);

        // 光沢スポット（左上に小さな鏡面ハイライト）
        const inner = S - 2 * B;
        ctx.fillStyle = 'rgba(255,255,255,0.24)';
        ctx.fillRect(x + B, y + B, Math.ceil(inner * 0.55), Math.ceil(inner * 0.38));

        // エッジラインで個々のタイル境界をくっきり示す
        ctx.fillStyle = 'rgba(255,255,255,0.62)';
        ctx.fillRect(x, y, S, 1);           // 上端
        ctx.fillRect(x, y, 1, S);           // 左端
        ctx.fillStyle = 'rgba(0,0,0,0.68)';
        ctx.fillRect(x, y + S - 1, S, 1);   // 下端
        ctx.fillRect(x + S - 1, y, 1, S);   // 右端
    }
}

export { BLOCK_EMPTY, BLOCK_INDESTRUCTIBLE, BLOCK_HARD } from '../utils/Constants.js';
