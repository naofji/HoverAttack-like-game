// ============================================
// Map - Cave generation & destructible terrain
// ============================================

import {
    TILE_SIZE, MAP_COLS, MAP_ROWS, MAP_WIDTH, MAP_HEIGHT,
    BLOCK_EMPTY, BLOCK_NORMAL, BLOCK_HARD, BLOCK_INDESTRUCTIBLE,
    COLOR_NORMAL_BLOCK, COLOR_NORMAL_BLOCK_BORDER,
    COLOR_HARD_BLOCK, COLOR_HARD_BLOCK_BORDER,
    COLOR_INDESTRUCTIBLE_BLOCK, COLOR_INDESTRUCTIBLE_BLOCK_BORDER,
    LANDMINE_COUNT, LANDMINE_WIDTH, LANDMINE_HEIGHT,
    ENEMY_TANK_COUNT, ENEMY_TANK_WIDTH, ENEMY_TANK_HEIGHT,
    ENEMY_ATTACKER_TOTAL_COUNT, PLAYER_WIDTH, PLAYER_HEIGHT,
    COLOR_CAVE_BG
} from '../utils/Constants.js';

// --- Block rendering styles (lookup table) ---
const BLOCK_STYLES = {
    [BLOCK_NORMAL]: { fill: COLOR_NORMAL_BLOCK, border: COLOR_NORMAL_BLOCK_BORDER },
    [BLOCK_HARD]: { fill: COLOR_HARD_BLOCK, border: COLOR_HARD_BLOCK_BORDER },
    [BLOCK_INDESTRUCTIBLE]: { fill: COLOR_INDESTRUCTIBLE_BLOCK, border: COLOR_INDESTRUCTIBLE_BLOCK_BORDER },
};

// --- Map generation constants ---
const BORDER_THICKNESS = 2;
const INITIAL_FILL_RATIO = 0.45;
const SMOOTH_PASSES = 5;
const HARD_BLOCK_CHANCE = 0.06;
const HARD_BLOCK_HP = 3;

export class Map {
    constructor(game) {
        this.game = game;
        this.cols = MAP_COLS;
        this.rows = MAP_ROWS;
        this.width = MAP_WIDTH;
        this.height = MAP_HEIGHT;
        this.grid = [];
        this.blockHP = [];
        this.landmineSpawns = []; // Pixel coordinates for landmine placement
        this.enemyTankSpawns = []; // Pixel coordinates for enemy tank placement
        this.enemyAttackerSpawns = []; // Pixel coordinates for enemy attacker placement

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

        // Step 2: Carve start area (top-left)
        this._carveRoom(3, 3, 12, 10);
        this.rooms.push({ centerR: 3 + 5, centerC: 3 + 6 });

        // Step 3: Carve goal area (bottom-right)
        this._carveRoom(this.cols - 15, this.rows - 12, 12, 9);
        this.rooms.push({ centerR: this.rows - 12 + 4, centerC: this.cols - 15 + 6 });

        // Step 4: Scatter random rooms (Chambers)
        const numRooms = 20 + Math.floor(Math.random() * 8); // Slightly fewer rooms, but larger
        for (let i = 0; i < numRooms; i++) {
            const w = 8 + Math.floor(Math.random() * 12); // Width 8-19 (was 4-11)
            const h = 8 + Math.floor(Math.random() * 12); // Height 8-19 (was 4-11)
            const c = BORDER_THICKNESS + Math.floor(Math.random() * (this.cols - BORDER_THICKNESS * 2 - w));
            const r = BORDER_THICKNESS + Math.floor(Math.random() * (this.rows - BORDER_THICKNESS * 2 - h));

            // 50% chance for elliptic room vs rectangular
            if (Math.random() < 0.5) {
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
            const r1 = this.rooms[Math.floor(Math.random() * this.rooms.length)];
            const r2 = this.rooms[Math.floor(Math.random() * this.rooms.length)];
            this._carveTunnelPath(r1.centerR, r1.centerC, r2.centerR, r2.centerC, 2);
        }

        // Step 7: Cellular automaton smoothing to make it look organic (like an ant nest)
        // Just 2 passes to erode straight edges and round things off
        for (let i = 0; i < 2; i++) {
            this._smoothStep();
        }

        // Ensure start area remains somewhat clear after smoothing
        this._carveRoom(4, 4, 8, 6);

        // Step 8: Sprinkle hard blocks
        this._placeHardBlocks();

        // Step 9: Determine entity spawn positions
        this.landmineSpawns = this._findLandminePositions();
        this.enemyTankSpawns = this._findEnemyTankPositions();
        this.enemyAttackerSpawns = this._findEnemyAttackerPositions();

        // Step 10: Generate off-screen mini-map
        this._generateMiniMap();
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
            // Varying tunnel width between 3 and 5 for larger feel
            const tunnelWidth = 3 + Math.floor(Math.random() * 3);
            this._carveTunnelPath(bestFrom.centerR, bestFrom.centerC, bestTo.centerR, bestTo.centerC, tunnelWidth);

            connected.push(bestTo);
        }
    }

    _carveTunnelPath(r1, c1, r2, c2, width) {
        // Manhattan-style L-shaped tunnels look more like an ant nest than direct diagonals
        const midC = c1;
        const midR = r2;

        // Vertical then Horizontal (or vice versa)
        if (Math.random() < 0.5) {
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
            const rand = Math.random();
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
                if (this.grid[r][c] === BLOCK_NORMAL && Math.random() < HARD_BLOCK_CHANCE) {
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
        const count = Math.min(LANDMINE_COUNT, candidates.length);
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
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
        const count = Math.min(ENEMY_TANK_COUNT, candidates.length);
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
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
                // Need 2 empty tiles above solid floor
                if (this.grid[r][c] === BLOCK_EMPTY &&
                    this.grid[r - 1][c] === BLOCK_EMPTY &&
                    r + 1 < this.rows && this.grid[r + 1][c] !== BLOCK_EMPTY) {
                    candidates.push({ r, c });
                }
            }
        }

        const spawns = [];
        const count = Math.min(ENEMY_ATTACKER_TOTAL_COUNT, candidates.length);
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
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
            return true;
        }
        return false;
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

                ctx.fillStyle = BLOCK_STYLES[block].fill;
                ctx.fillRect(c * this.miniMapScale, r * this.miniMapScale, this.miniMapScale, this.miniMapScale);
            }
        }
    }

    // ------------------------------------------
    // Collision Helpers
    // ------------------------------------------

    isSolid(r, c) {
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return true;
        return this.grid[r][c] !== BLOCK_EMPTY;
    }

    isSolidAtPixel(x, y) {
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

        for (let r = startRow; r < endRow; r++) {
            for (let c = startCol; c < endCol; c++) {
                const block = this.grid[r][c];
                if (block === BLOCK_EMPTY) continue;

                const x = c * TILE_SIZE;
                const y = r * TILE_SIZE;
                const style = BLOCK_STYLES[block];

                ctx.fillStyle = style.fill;
                ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                ctx.strokeStyle = style.border;
                ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

                // Draw crack lines on damaged hard blocks
                if (block === BLOCK_HARD && this.blockHP[r][c] < HARD_BLOCK_HP) {
                    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                    ctx.beginPath();
                    ctx.moveTo(x + 8, y + 8);
                    ctx.lineTo(x + TILE_SIZE - 8, y + TILE_SIZE - 8);
                    ctx.stroke();
                }
            }
        }
    }
}
