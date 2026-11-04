// ============================================
// Map - Cave generation & destructible terrain
// ============================================

import {
    MIN_MAP_COLS, MIN_MAP_ROWS, MAX_MAP_COLS, MAX_MAP_ROWS,
    BLOCK_EMPTY, BLOCK_NORMAL, BLOCK_HARD, BLOCK_INDESTRUCTIBLE, BLOCK_METAL,
    COLOR_HARD_BLOCK, COLOR_HARD_BLOCK_BORDER, HARD_BLOCK_TINT, HARD_BLOCK_DARKEN,
    COLOR_METAL_BLOCK, COLOR_METAL_BLOCK_BORDER, METAL_BLOCK_TINT, METAL_BLOCK_DARKEN,
    METAL_BLOCK_HP,
    COLOR_INDESTRUCTIBLE_BLOCK, COLOR_INDESTRUCTIBLE_BLOCK_BORDER,
    PLAYER_WIDTH, PLAYER_HEIGHT,
    ENEMY_TANK_WIDTH, ENEMY_TANK_HEIGHT,
    ENEMY_DRONE_WIDTH, ENEMY_DRONE_HEIGHT,
    ENEMY_TURRET_WIDTH, ENEMY_TURRET_HEIGHT,
    ENEMY_BASE_WIDTH, ENEMY_BASE_HEIGHT, ENEMY_BASE_DRAW_OVERHANG,
    TILE_SIZE,
    LANDMINE_WIDTH, LANDMINE_HEIGHT,
    STAGE_PALETTES, STAGE_ENVIRONMENTS, STAIRS_PROFILES,
    ORB_SIZES, ORB_SPAWN_TOP_FRACTION, ORB_SPAWN_MIN_COL_GAP, ORB_SPAWN_SALT, ORB_SIZE_MIX,
    WATER_POOL_COUNT, WATER_POOL_DEPTH_MIN, WATER_POOL_DEPTH_RANGE, WATER_POOL_MAX_TILES,
    GRENADE_BLOCK_DAMAGE,
    FORTRESS_ZONE_COUNT, FORTRESS_ZONE_W_MIN, FORTRESS_ZONE_W_RANGE,
    FORTRESS_ZONE_H_MIN, FORTRESS_ZONE_H_RANGE, FORTRESS_ZONE_MARGIN,
    FORTRESS_WALL_THICKNESS, FORTRESS_CEILING_H, FORTRESS_FLOOR_H,
    FORTRESS_SHAFT_W, FORTRESS_GATE_SIZE, FORTRESS_OPENING_TUNNEL_MAX,
    FACILITY_STAIRS_COUNT, FACILITY_STAIRS_LENGTH_MIN, FACILITY_STAIRS_LENGTH_RANGE,
    FACILITY_AREA_COUNT, FACILITY_AREA_W_MIN, FACILITY_AREA_W_RANGE, FACILITY_AREA_H_MIN, FACILITY_AREA_H_RANGE,
    FORTRESS_TREASURE_COUNT, FORTRESS_EXTRA_LIFE_COUNT, FORTRESS_EXTRA_LIFE_SLOT, FORTRESS_GARRISON_TURRETS, FORTRESS_GARRISON_TANKS,
    FORTRESS_BARRIER_CLEARANCE, ELECTRIC_FLOOR_MIN_LEN, ELECTRIC_FLOOR_BARRIER_GAP, ELECTRIC_FLOOR_H,
    FORTRESS_GATE_GUARD_TYPE, FORTRESS_GATE_GUARD_INSET,
    FORTRESS_CORRIDOR_H, FORTRESS_ROOM_MARGIN, FORTRESS_ROOM_W, FORTRESS_CORRIDOR_MIN_W,
    HARD_BLOCK_CHANCE_BY_STAGE, HARD_BLOCK_HP,
    MAX_WATER_MASS, MIN_WATER_MASS,
    WATER_SPRING_INTERVAL, WATER_SPRING_MASS, WATER_SPRING_COUNT,
    WATER_SPRING_MAX_ROW_RATIO,
    WATER_FALL_INTERVAL,
    WATER_PRESSURE_INTERVAL,
    TOWN_BASE_QUIET_INNER, TOWN_BASE_QUIET_OUTER,
} from '../utils/Constants.js';
import { CaveBackdrop } from './CaveBackdrop.js';
import { SeededRNG } from '../utils/SeededRNG.js';
import { lerpColor, luminance, withLuminance } from '../utils/color.js';
import { generateWaterPools, generateWaterSprings } from './waterPools.js';
import { stepWaterSimulation } from './waterSimulation.js';
import { decayStream } from './waterStream.js';
import {
    rebuildWaterCache, WATER_NONE, WATER_SURFACE, WATER_FALL,
} from './waterQuery.js';
import { carveSnowStairs } from './snowStairs.js';
import { carveFortressZones } from './fortress.js';
import { pickFacilityAreas, metalizeFacilityBand } from './facility.js';
import { generateTown } from './town/generate.js';
import { generatePlants } from './town/generatePlants.js';
import { generateSnowTrees } from './town/generateSnowTrees.js';
import { generateIcicles } from './town/generateIcicles.js';
import { Town } from './town/Town.js';
import {
    SHAPE_FULL, SHAPE_EMPTY, computeTileShape, shapeContainsPoint, shapeOverlapsRect, shapeTopY, shapeBottomY,
    shapeFloorSlope, shapeCeilingSlope, hypotenuseNormal, hypotenuseAhead, shapeAfterBreak,
} from '../utils/tileShape.js';
// 層ごとのメソッド（Map.prototype へ混ぜる。ファイル末尾の Mixins 節）
import { MapRender } from './mapRender.js';
import { MapMiniMap } from './mapMiniMap.js';


// --- Map generation constants ---
const BORDER_THICKNESS = 2;

/** Fisher-Yates で list をその場で混ぜて返す（派生ストリーム用。湧き探索の game.rng の混ぜ方と同じ手順） */
function shuffleWith(rng, list) {
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

/**
 * 硬い岩の描画色を、面のパレットの色 base から作る。
 * gray へ HARD_BLOCK_TINT だけ寄せて色味を残し、輝度は base の HARD_BLOCK_DARKEN 倍に置く。
 * 輝度を base に対する比で決めるので、元が暗い面（6面）でも黒へ潰れない。
 */
function hardBlockColor(base, gray) {
    return withLuminance(lerpColor(base, gray, HARD_BLOCK_TINT), luminance(base) * HARD_BLOCK_DARKEN);
}

/**
 * 要塞の金属の色。硬い岩と同じ2段構えだが、寄せ先が鋼色で、暗くする度合いも弱い。
 * 岩（暗く彩度が低い）と金属（明るく青い）を並べたときに素材が違うと読めるようにする。
 */
function metalBlockColor(base, steel) {
    return withLuminance(lerpColor(base, steel, METAL_BLOCK_TINT), luminance(base) * METAL_BLOCK_DARKEN);
}

export class Map {
    constructor(game, missionLevel = 0) {
        this.game = game;
        this.missionLevel = missionLevel;

        // Reference stage-specific palettes for normal blocks
        const palettes = STAGE_PALETTES;
        const palIdx = (this.missionLevel || 0) % palettes.length;

        this.blockStyles = {
            [BLOCK_NORMAL]: palettes[palIdx],
            // 硬い岩は面のテーマ色を残した「暗くて彩度の低い岩」にする。係数の意味は
            // Constants.js の HARD_BLOCK_TINT / HARD_BLOCK_DARKEN のコメントを見ること
            [BLOCK_HARD]: {
                fill: hardBlockColor(palettes[palIdx].fill, COLOR_HARD_BLOCK),
                border: hardBlockColor(palettes[palIdx].border, COLOR_HARD_BLOCK_BORDER),
            },
            [BLOCK_INDESTRUCTIBLE]: { fill: COLOR_INDESTRUCTIBLE_BLOCK, border: COLOR_INDESTRUCTIBLE_BLOCK_BORDER },
            [BLOCK_METAL]: {
                fill: metalBlockColor(palettes[palIdx].fill, COLOR_METAL_BLOCK),
                border: metalBlockColor(palettes[palIdx].border, COLOR_METAL_BLOCK_BORDER),
            },
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

        this.water = null;          // Uint8Array(rows*cols)。0..MAX_WATER_MASS。水の無い面は null のまま
        this.waterKind = null;      // Uint8Array。0=水なし 1=水中 2=水面 3=滝。water[] から導く要約
        this.waterSurfaceY = null;  // Int16Array。水面セルの液面 Y(px)。それ以外 -1
        this.waterPaintTopY = null; // Int16Array。塗りの上端 Y(px)。塗らないセルは -1（waterQuery の paintTopAt）
        this.waterFoam = null;      // Uint8Array。泡のマス（流れ落ちる満水の真下の隙間）なら 1（waterQuery の isFoamAt）
        this.waterFoamCells = null; // Set。泡のマスの一覧 (r * cols + c)。描画が泡の粒を生む場所
        this.waterStreamHold = null; // Uint8Array。細い流れが落ちてからの残りフレーム数（waterStream.js）
        this.waterStreamLive = null; // Set。waterStreamHold が 0 でないセル (r * cols + c)
        this.dirtyWaterCols = new Set(); // 作り直しが要る列。問い合わせの手前でまとめて処理する
        this.waterRepaintCells = null;   // Set。作り直しで塗りが変わったセル。描画キャッシュが描く前に引き取る
        this.waterCells = [];       // 生成直後の一覧（決定性テストと描画キャッシュの初期化用）
        this.activeWaterCells = new Set(); // 現在水流シミュレーションがアクティブなセル
        this.envKind = STAGE_ENVIRONMENTS[(missionLevel || 0) % STAGE_ENVIRONMENTS.length].kind;
        // 地形の生成規則。'fortress' なら洞窟を掘ったあとに要塞区画を埋め込む
        this.envTerrain = STAGE_ENVIRONMENTS[(missionLevel || 0) % STAGE_ENVIRONMENTS.length].terrain;
        // タイルの形の規則（utils/tileShape.js）。表に無い面は今までどおり四角
        this.tileShapeRule = STAGE_ENVIRONMENTS[(missionLevel || 0) % STAGE_ENVIRONMENTS.length].tileShape || 'square';
        this.tileShapes = null; // Uint16Array。地形が出来上がってから _buildTileShapes() が焼く

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

        // Step 9a: 7面の要塞区画（派生ストリーム）。**硬い岩のあとに置く** —
        // 7面は硬い岩が4割あり、区画の中に混ざると洞窟に戻ってしまうので、
        // 要塞は自分の矩形を後から書き潰す
        this.fortress = new Uint8Array(this.rows * this.cols);
        this.fortressZones = [];
        if (this.envTerrain === 'fortress') this._generateFortress();

        // Step 9a2: 7面の施設エリア（区画の外の地形をメタルパネルに。派生ストリーム）。
        // 区画が先に場所を取るので、区画のあとに置く。他の面でも空で持つ（描画と形が読む）
        this.facility = new Uint8Array(this.rows * this.cols);
        this.facilityAreas = [];
        this.metalStairs = [];
        if (this.envTerrain === 'fortress') this._generateFacility();

        // Step 9b: 地底湖（4面だけ）。派生ストリームなので game.rng は動かない。
        // 開始の部屋（左上 3,3 から 20x16）と基地の部屋は除外
        if (this.envKind === 'water') this._generateWater();

        // Step 9c: 雪の面の階段（派生ストリーム）。exposedAtGen を記録する前に盛るので
        // 段の上面にも雪が積もる。開始の部屋・基地の部屋は水と同じ除外矩形で弾く
        // （レビュー指摘: 除外せずに実装すると、開始直後や基地の部屋に階段が生えうる）
        // 2面（洞窟の坂）も同じ関数で盛る。どの面に何本盛るかは STAGE_ENVIRONMENTS の stairs → STAIRS_PROFILES
        this.stairs = [];
        const stairsProfile = STAIRS_PROFILES[STAGE_ENVIRONMENTS[this.missionLevel % STAGE_ENVIRONMENTS.length].stairs];
        if (stairsProfile) {
            this.stairs = carveSnowStairs({
                grid: this.grid, blockHP: this.blockHP, rows: this.rows, cols: this.cols, rooms: this.rooms,
                excludeRects: this._reservedRects(),
                rng: new SeededRNG((this.game.rng.state ^ stairsProfile.salt) >>> 0),
                count: stairsProfile.count, lengthMin: stairsProfile.lengthMin, lengthRange: stairsProfile.lengthRange,
            });
        }

        // Step 9d: 基地の砲台の箱に掛かる岩を空ける。浮き足場(Step 8)や硬い岩(Step 9)は基地の部屋にも
        // 乱数で置かれるので、天井の砲台に刺さることがあった。湧き探索(Step 10)の前に空けておけば、
        // ほかの湧きがその岩を足場に選ぶことも無い。乱数は使わない
        this._clearBaseTurretBoxes();

        // Step 10: Determine entity spawn positions
        this.landmineSpawns = this._findLandminePositions();
        this.enemyTankSpawns = this._findEnemyTankPositions();
        this.enemyAttackerSpawns = this._findEnemyAttackerPositions();
        this.enemyDroneSpawns = this._findEnemyDronePositions();
        this.enemyTurretSpawns = this._findEnemyTurretPositions();
        this._addMainBaseDefenders(); // Force add defenders specifically around the base
        // 要塞の中身は「探索が終わったあと」に足す（先に足すとシャッフルで散る）
        // 格納塔の置き場所 {x: 中心, y: 下端＝床の上面, kind: 中身}。今は7面の要塞だけが足す。
        // ほかの面に置くときは、その面の生成がここに足せば塔が立つ（塔の側は面を知らない）
        this.storageTowerSpawns = [];
        if (this.envTerrain === 'fortress') this._placeFortressContents();

        // Step 11: Generate off-screen mini-map
        // tile cache (実寸で焼いた地形) を先に作ってから、それを縮小してミニマップにする。
        // 以前はミニマップ用に独自にタイルを塗り直していて、実際の地形(面取り多角形・
        // ひび割れ)と見え方が食い違っていた。tile cache から drawImage で縮小するだけに
        // すれば、本編の見た目とミニマップが常に一致する。
        // 上が空洞になっているブロックの積雪ビット。生成時に一括で立てたあと、
        // 爆発で新しく上面が露出したマスも _snowDressExposedBelow() で同じビットを立てる
        // （5面で爆発跡がいつまでも素の岩のままだと不自然なため）。
        // 破壊の再描画は _drawRockyBlock がこのビットを見る
        this.exposedAtGen = new Uint8Array(this.rows * this.cols);
        for (let r = 1; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.grid[r][c] !== BLOCK_EMPTY && this.grid[r - 1][c] === BLOCK_EMPTY) {
                    this.exposedAtGen[r * this.cols + c] = 1;
                }
            }
        }

        // タイルの形。地形の生成（階段まで）が終わってから焼く。描画のキャッシュと町・植物の
        // 置き場所がこのあと形を読むので、その前に置く。乱数は使わない（週次の決定性）
        this._buildTileShapes();
        if (this.envTerrain === 'fortress') this._metalizeFacilitySlopes();
        // 湧き位置（Step 10）は形を焼く前にタイルの上端で決めているので、形の高さへ置き直す
        this._seatSpawnsOnShapes();
        // 2面の Orb（押せて転がる鉱物）。形を焼いた後に置く（平らな床を形で選ぶため）。派生ストリーム
        this.orbSpawns = this._findOrbPositions();

        this._initTileCache();
        this._generateMiniMap();

        // Step 12: Generate the parallax far backdrop (must come last —
        // it consumes rng, and moving it earlier would shift terrain generation).
        // Uses a derived RNG stream so the shared game.rng is left untouched for
        // downstream consumers (e.g. SpawnManager's deterministic weekly seed).
        this.backdrop = new CaveBackdrop(
            this.width, this.height,
            this.blockStyles[BLOCK_NORMAL].fill,
            new SeededRNG((this.game.rng.state ^ 0x9E3779B9) >>> 0),
            // missionLevel はデバッグで面数を超えうるので、パレットと同じく剰余で丸める
            STAGE_ENVIRONMENTS[this.missionLevel % STAGE_ENVIRONMENTS.length].backdrop,
        );

        // Step 13: 3面の町並み（設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md）。
        // 遠景と同じく派生ストリームで、game.rng は消費しない（このあと SpawnManager が使う）。
        // missionLevel はデバッグで面数を超えうるので、パレットと同じく剰余で丸める
        // 4面は苔とシダ（props: 'ferns'）、5面は雪をかぶった木と天井のつらら（props: 'snow'）。同じ Town の仕組みに、
        // 燃えない植物の設計図を載せる
        // （map.town という名前は、弾・爆発・岩の破壊の配線がすべてこれを見ているので変えない）
        this.town = null;
        const props = STAGE_ENVIRONMENTS[this.missionLevel % STAGE_ENVIRONMENTS.length].props;
        if (props === 'town') this._generateTown();
        else if (props === 'ferns') this._generatePlants();
        else if (props === 'snow') this._generateSnow();
    }

    // 開始の部屋・基地の部屋を避けるための矩形。水（_generateWater）と雪の階段
    // （carveSnowStairs）の両方が使う。別々に計算すると数値がずれて食い違う恐れがある
    // ため、値をここ1箇所にまとめる（レビュー指摘で追加）。
    _reservedRects() {
        const b = this.enemyBaseCenter;
        return [
            { r0: 0, r1: 3 + 16 + 2, c0: 0, c1: 3 + 20 + 2 },
            { r0: b.r - 12, r1: b.floorR + 2, c0: b.c - 10, c1: this.cols - 1 },
        ];
    }
    /**
     * 町の設計図。tools/render-town-scene.mjs も同じものを呼ぶ（乱数の作り方を
     * 2か所に書くと、道具の絵と実機の町が食い違うため）。町は生成の最後に作るので、
     * 生成後に呼んでも game.rng.state は生成中と同じ値で、同じ町になる。
     */
    _buildTownSpecs() {
        return generateTown({
            grid: this.grid, rows: this.rows, cols: this.cols,
            // 基地の部屋だけ避ける。開始の部屋には置く（面に入った瞬間に町だと分かるように）
            excludeRects: [this._reservedRects()[1]],
            rng: new SeededRNG((this.game.rng.state ^ 0x70E4E5) >>> 0),
            // 爆発物の置き場所（段3b）は別の派生ストリーム。建物の rng に混ぜると町並みが変わる
            explosiveRng: new SeededRNG((this.game.rng.state ^ 0xB0A3B5) >>> 0),
            // 最後の敵基地の周りは岩肌だけにする（基地へ近づくほど町が途切れる）
            quietZones: [{
                c: this.enemyBaseCenter.c, r: this.enemyBaseCenter.r,
                inner: TOWN_BASE_QUIET_INNER, outer: TOWN_BASE_QUIET_OUTER,
            }],
        });
    }

    /** 植物の設計図。tools/render-town-scene.mjs も同じものを呼ぶ（町と同じ理由） */
    _buildPlantSpecs() {
        return generatePlants({
            grid: this.grid, rows: this.rows, cols: this.cols,
            // 基地の部屋だけ避ける（町と同じ。パルスや砲台を見やすくしておく）
            excludeRects: [this._reservedRects()[1]],
            rng: new SeededRNG((this.game.rng.state ^ 0x4F3A57) >>> 0),
        });
    }

    _generatePlants() {
        this.town = new Town(this._buildPlantSpecs(), { isSolidTile: (r, c) => this.isSolid(r, c) });
    }

    /** 雪の木の設計図。乱数の流れは植物と別（同じ ^ だと、同じ面で並べ方が揃ってしまう）。tools/render-town-scene.mjs も呼ぶ */
    _buildSnowTreeSpecs() {
        return generateSnowTrees({
            grid: this.grid, rows: this.rows, cols: this.cols,
            excludeRects: [this._reservedRects()[1]],
            rng: new SeededRNG((this.game.rng.state ^ 0x5E0A71) >>> 0),
            // 根元は形の床の高さに立てる（坂・面取りの上で浮かないように）。床の行 r の上の空きから
            // 下へ2タイルまで探す。坂の低い側の列は、形の上端が次の行の上端（r+1 の上端）まで下がる
            rockAt: (x, y) => this.isSolidPoint(x, y),
            floorY: (x, r) => this.terrainTopY(x, r * TILE_SIZE - 1, (r + 2) * TILE_SIZE) ?? r * TILE_SIZE,
        });
    }

    /**
     * つららの設計図。tools/render-town-scene.mjs も同じものを呼ぶ（町・植物・木と同じ理由）。
     * 木・植物とは別の派生ストリーム。除外の矩形は開始の部屋と基地の部屋の**両方**（ユーザー決定: 面に入った直後に
     * 事故らないよう開始の部屋は避ける。木は開始の部屋にも置く）
     */
    _buildIcicleSpecs() {
        return generateIcicles({
            grid: this.grid, rows: this.rows, cols: this.cols,
            excludeRects: this._reservedRects(),
            rng: new SeededRNG((this.game.rng.state ^ 0x1C1CE5) >>> 0),
            // 根元は形の天井の高さに吊るす（木の floorY と同じ理由）。天井の行 r の下の空きから上へ探す
            rockAt: (x, y) => this.isSolidPoint(x, y),
            ceilingY: (x, r) => this.terrainBottomY(x, (r + 1) * TILE_SIZE + TILE_SIZE / 2, (r - 1) * TILE_SIZE) ?? (r + 1) * TILE_SIZE,
        });
    }

    /** 5面: 雪の木 ＋ 天井のつらら を 1 つの Town に載せる。木が先（建物の番号が変わらず、木の欠け方の乱数が変わらない） */
    _generateSnow() {
        // 支えも形で見る（隣が壊れて根元の下が削れた木は倒れ、つららは落ちる。Town の rockAt）
        this.town = new Town([...this._buildSnowTreeSpecs(), ...this._buildIcicleSpecs()], {
            isSolidTile: (r, c) => this.isSolid(r, c), rockAt: (x, y) => this.isSolidPoint(x, y),
        });
    }

    _generateTown() {
        this.town = new Town(this._buildTownSpecs(), { isSolidTile: (r, c) => this.isSolid(r, c) });
    }

    /** 施設エリアを置き、縁の岩を金属にし、印（this.facility）を立てる */
    _generateFacility() {
        const M = FORTRESS_ZONE_MARGIN;
        const excludeRects = [
            ...this._reservedRects(),
            // 区画の外壁のすぐ外にパネルが貼り付くと、区画の輪郭が読めなくなるので余白を空ける
            ...this.fortressZones.map((z) => ({ r0: z.r0 - M, r1: z.r1 + M, c0: z.c0 - M, c1: z.c1 + M })),
        ];
        this.facilityAreas = pickFacilityAreas({
            rows: this.rows, cols: this.cols, rooms: this.rooms, excludeRects,
            // 派生ストリーム。game.rng を消費すると敵の構成が変わり、週の決定性が壊れる
            rng: new SeededRNG((this.game.rng.state ^ 0xFAC17E) >>> 0),
            count: FACILITY_AREA_COUNT,
            wMin: FACILITY_AREA_W_MIN, wRange: FACILITY_AREA_W_RANGE,
            hMin: FACILITY_AREA_H_MIN, hRange: FACILITY_AREA_H_RANGE,
            margin: M,
        });
        for (const a of this.facilityAreas) {
            metalizeFacilityBand(this.grid, this.blockHP, a);
            for (let r = a.r0; r <= a.r1; r++) {
                for (let c = a.c0; c <= a.c1; c++) this.facility[r * this.cols + c] = 1;
            }
        }
        // 金属の階段。段は形の規則（'metalSlope'）で45度の金属の斜面になる
        const inArea = (room) => this.facilityAreas.some((a) =>
            room.centerR >= a.r0 && room.centerR <= a.r1 && room.centerC >= a.c0 && room.centerC <= a.c1);
        this.metalStairs = carveSnowStairs({
            grid: this.grid, blockHP: this.blockHP, rows: this.rows, cols: this.cols,
            rooms: this.rooms.filter(inArea), excludeRects,
            rng: new SeededRNG((this.game.rng.state ^ 0xFAC57A) >>> 0),
            count: FACILITY_STAIRS_COUNT,
            lengthMin: FACILITY_STAIRS_LENGTH_MIN, lengthRange: FACILITY_STAIRS_LENGTH_RANGE,
            block: BLOCK_METAL, hp: METAL_BLOCK_HP, withinRects: this.facilityAreas,
        });
    }

    _generateFortress() {
        const result = carveFortressZones({
            grid: this.grid, blockHP: this.blockHP, rows: this.rows, cols: this.cols,
            rooms: this.rooms, excludeRects: this._reservedRects(),
            // 派生ストリーム。game.rng を消費すると敵の構成が変わり、週の決定性が壊れる
            rng: new SeededRNG((this.game.rng.state ^ 0xF0A7E5) >>> 0),
            count: FORTRESS_ZONE_COUNT,
            wMin: FORTRESS_ZONE_W_MIN, wRange: FORTRESS_ZONE_W_RANGE,
            hMin: FORTRESS_ZONE_H_MIN, hRange: FORTRESS_ZONE_H_RANGE,
            margin: FORTRESS_ZONE_MARGIN,
            thickness: FORTRESS_WALL_THICKNESS, ceilingH: FORTRESS_CEILING_H,
            floorH: FORTRESS_FLOOR_H, shaftW: FORTRESS_SHAFT_W, gateSize: FORTRESS_GATE_SIZE,
            tunnelMax: FORTRESS_OPENING_TUNNEL_MAX,
            corridorH: FORTRESS_CORRIDOR_H, roomW: FORTRESS_ROOM_W,
            roomMargin: FORTRESS_ROOM_MARGIN, corridorMinW: FORTRESS_CORRIDOR_MIN_W,
            treasureCount: FORTRESS_TREASURE_COUNT,
            extraLifeCount: FORTRESS_EXTRA_LIFE_COUNT, extraLifeSlot: FORTRESS_EXTRA_LIFE_SLOT,
            garrisonTurrets: FORTRESS_GARRISON_TURRETS,
            garrisonTanks: FORTRESS_GARRISON_TANKS,
            barrierClearance: FORTRESS_BARRIER_CLEARANCE, electricMinLen: ELECTRIC_FLOOR_MIN_LEN, electricGap: ELECTRIC_FLOOR_BARRIER_GAP,
            guardType: FORTRESS_GATE_GUARD_TYPE, guardInset: FORTRESS_GATE_GUARD_INSET,
        });
        this.fortressZones = result.zones;
        this.fortress = result.marks;
    }

    /**
     * 要塞のお宝（を入れた格納塔）と守備隊を、面全体の湧きの配列に足す。
     *
     * **スポーン探索（Step 10）のあとに呼ぶ。** 先に足すとシャッフルで混ざって
     * 区画の外へ散ってしまう。既存の湧きに「足す」だけなので、面全体の上限
     * （maxTurrets など）は触らない＝他の面には一切影響しない。
     */
    _placeFortressContents() {
        const S = TILE_SIZE;
        this.storageTowerSpawns = [];

        // まず、面全体の湧き（Step 10 で決まったもの）からバリアに重なるものを外す。
        // 守備隊はバリアを避けて置いているが、**元からある湧きは要塞を知らない**ので
        // バリアの中に立ってしまう。そうなると開ける前に一方的に撃たれるうえ、
        // 撃ち返した弾はバリアに吸われて届かない（実機の指摘）
        const onBarrier = (pos) => {
            const r = Math.floor(pos.y / S);
            const c = Math.floor(pos.x / S);
            return this.fortressZones.some((zone) => zone.barriers.some(
                (b) => Math.abs(b.c - c) <= FORTRESS_BARRIER_CLEARANCE
                    && r >= b.top && r <= b.bottom,
            ));
        };
        // 電流の床の上にも立たせない。敵は電流を受けないが、床に置く砲台や地雷に放電が重なって見えるのは
        // 何の仕掛けか読めなくなる。放電の高さ（ELECTRIC_FLOOR_H）ぶんの行と、その左右1列を空ける
        const electricRows = Math.ceil(ELECTRIC_FLOOR_H / S);
        const onElectricFloor = (pos) => {
            const r = Math.floor(pos.y / S);
            const c = Math.floor(pos.x / S);
            return this.fortressZones.some((zone) => zone.electricFloors.some(
                (f) => c >= f.c0 - 1 && c <= f.c1 + 1 && r > f.r - electricRows && r <= f.r,
            ));
        };
        const clear = (p) => !onBarrier(p) && !onElectricFloor(p);
        this.enemyTurretSpawns = this.enemyTurretSpawns.filter(clear);
        this.enemyTankSpawns = this.enemyTankSpawns.filter(clear);
        this.enemyDroneSpawns = this.enemyDroneSpawns.filter(clear);
        this.enemyAttackerSpawns = this.enemyAttackerSpawns.filter(clear);
        // 地雷は格納塔（お宝）の足元にも埋めない。塔の陰に隠れて見えず、壊して出た中身を拾いに降りると
        // 踏む。塔の下端を狙った弾も先に地雷を起爆して消える（最終レビューの指摘。200シードの 22% で起きた）。
        // 塔はお宝の列 c の中心に幅1タイル、行 r とその上の行に立つ。地雷の幅を見込んで左右1列も空ける。
        // 外すだけで乱数を使わないので、週次の決定性は保たれる
        const onTreasure = (pos) => {
            const r = Math.floor(pos.y / S);
            const c = Math.floor(pos.x / S);
            return this.fortressZones.some((zone) => zone.treasures.some(
                (t) => Math.abs(t.c - c) <= 1 && r >= t.r - 1 && r <= t.r,
            ));
        };
        this.landmineSpawns = this.landmineSpawns.filter((p) => clear(p) && !onTreasure(p));
        for (const zone of this.fortressZones) {
            for (const t of zone.treasures) {
                // お宝はむき出しにせず格納塔に入れる。t.r は床の1つ上の行なので、塔の下端は (r+1) 行目の上
                this.storageTowerSpawns.push({ x: t.c * S + S / 2, y: (t.r + 1) * S, kind: t.kind });
            }
            for (const g of zone.garrison.turrets) {
                // type を持つものは砲台の種類を固定する（入り口の守衛はノーマル）
                // g.r は空洞の端の行（天井付けは一番上・床置きは一番下）。タイルの中央に寄せ、付け根を
                // その行の外の面に合わせる。以前は左上をタイルの角に置いていて、床置きの土台が床に
                // 8px 沈んでいた（砲台は 24px でタイルより大きい）
                this.enemyTurretSpawns.push({
                    x: g.c * S + (S - ENEMY_TURRET_WIDTH) / 2,
                    y: g.isCeiling ? g.r * S : (g.r + 1) * S - ENEMY_TURRET_HEIGHT,
                    isCeiling: g.isCeiling, type: g.type,
                });
            }
            for (const g of zone.garrison.tanks) {
                this.enemyTankSpawns.push({ x: g.c * S, y: g.r * S });
            }
        }
    }

    _generateWater() {
        const rng = new SeededRNG((this.game.rng.state ^ 0x5DEECE66) >>> 0);
        const excludeRects = this._reservedRects();
        const pools = generateWaterPools({
            grid: this.grid, rows: this.rows, cols: this.cols, rooms: this.rooms, excludeRects, rng,
            count: WATER_POOL_COUNT, depthMin: WATER_POOL_DEPTH_MIN, depthRange: WATER_POOL_DEPTH_RANGE,
            maxTiles: WATER_POOL_MAX_TILES,
        });
        this.water = new Uint8Array(this.rows * this.cols);
        this.waterKind = new Uint8Array(this.rows * this.cols);
        this.waterSurfaceY = new Int16Array(this.rows * this.cols).fill(-1);
        this.waterPaintTopY = new Int16Array(this.rows * this.cols).fill(-1);
        this.waterFoam = new Uint8Array(this.rows * this.cols);
        this.waterFoamCells = new Set();
        this.waterStreamHold = new Uint8Array(this.rows * this.cols);
        this.waterStreamLive = new Set();
        this.dirtyWaterCols = new Set();
        this.waterRepaintCells = new Set();
        this.activeWaterCells = new Set();
        for (const pool of pools) {
            for (const [r, c] of pool.cells) {
                this.water[r * this.cols + c] = MAX_WATER_MASS;
                this.waterCells.push([r, c]);
            }
        }
        const springs = generateWaterSprings({
            grid: this.grid, rows: this.rows, cols: this.cols, rooms: this.rooms, excludeRects, rng,
            count: WATER_SPRING_COUNT, maxRowRatio: WATER_SPRING_MAX_ROW_RATIO,
        });
        this.waterSprings = springs.map((s) => ({ r: s.r, c: s.c, timer: 0 }));

        // 生成直後は全列を作り直して初期状態を揃える。実測 235.7µs（この1回だけ）
        for (let c = 0; c < this.cols; c++) this.dirtyWaterCols.add(c);
        this._rebuildWaterCacheIfDirty();
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
        // 面ごとの割合。パレット・環境と同じく剰余で丸める（debugStartMission で面数を超えうる）。
        // rng.next() は if の外に出さない代わりに、確率に関係なく必ず1タイル1回引く形を保つこと。
        // 消費数が割合で変わると、後続のスポーン決定がずれて週次の決定性が壊れる。
        const row = HARD_BLOCK_CHANCE_BY_STAGE[this.missionLevel % HARD_BLOCK_CHANCE_BY_STAGE.length];
        // 行が [左端, 右端] の対なら列で線形に補間する（7面。右へ進むほど固くなる）
        const span = this.cols - 1 - BORDER_THICKNESS * 2;
        const chanceAt = Array.isArray(row)
            ? (c) => row[0] + (row[1] - row[0]) * ((c - BORDER_THICKNESS) / span)
            : () => row;
        for (let r = BORDER_THICKNESS; r < this.rows - BORDER_THICKNESS; r++) {
            for (let c = BORDER_THICKNESS; c < this.cols - BORDER_THICKNESS; c++) {
                // rng.next() は if の外に出さない代わりに、確率に関係なく必ず1タイル1回引く
                if (this.grid[r][c] === BLOCK_NORMAL && this.game.rng.next() < chanceAt(c)) {
                    this.grid[r][c] = BLOCK_HARD;
                    this.blockHP[r][c] = HARD_BLOCK_HP;
                }
            }
        }
    }

    /**
     * 候補タイルを集め、混ぜて、先頭から必要数だけピクセル座標にして返す。
     *
     * 地雷・タンク・アタッカー・ドローンの4つが、この「走査 → シャッフル →
     * 先頭n件 → ピクセル変換」の骨格を丸ごと写していた。違うのは候補の
     * 条件・必要数・機体の大きさ・足元の合わせ方だけなので、そこだけを
     * spec で受け取る。
     *
     * ★ 週次の決定性に直結する。シャッフルは候補数-1 回ちょうど乱数を引き、
     * 必要数で打ち切らない。ここで消費回数が変わると以降の生成がすべて
     * ずれて、同じ週なのに別のステージになる（tests/MapDeterminism.test.js）。
     *
     * @param {object} spec
     * @param {number} spec.rowFrom 走査する行の始まり
     * @param {number} spec.rowTo   終わり（この値は含まない）
     * @param {number} spec.colFrom 走査する列の始まり
     * @param {number} spec.colTo   終わり（この値は含まない）
     * @param {number} spec.startAreaRows 開始地点の除外範囲（行）
     * @param {number} spec.startAreaCols 開始地点の除外範囲（列）
     * @param {(r:number, c:number) => boolean} spec.accept 置ける地形か
     * @param {number} spec.count 置きたい数
     * @param {number} spec.width  機体の幅（タイル中央に寄せるのに使う）
     * @param {number} spec.height 機体の高さ
     * @param {boolean} [spec.centerInTile] true なら空中に浮かせてタイル中央へ、
     *   false（既定）ならタイルの床に足を着ける
     * @returns {Array<{x:number, y:number}>} ピクセル座標
     */
    _pickSpawnPositions(spec) {
        const candidates = [];
        for (let r = spec.rowFrom; r < spec.rowTo; r++) {
            for (let c = spec.colFrom; c < spec.colTo; c++) {
                // 開始地点のまわりには置かない（出た瞬間に撃たれないように）
                if (r < spec.startAreaRows && c < spec.startAreaCols) continue;
                if (!spec.accept(r, c)) continue;
                candidates.push({ r, c });
            }
        }

        // Fisher-Yates。候補全体を混ぜてから先頭を採る（上の走査順の偏りを消す）
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(this.game.rng.next() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }

        const count = Math.min(spec.count, candidates.length);
        const spawns = [];
        for (let i = 0; i < count; i++) {
            const tile = candidates[i];
            spawns.push({
                x: tile.c * TILE_SIZE + (TILE_SIZE - spec.width) / 2,
                y: spec.centerInTile
                    ? tile.r * TILE_SIZE + (TILE_SIZE - spec.height) / 2
                    : (tile.r + 1) * TILE_SIZE - spec.height,
            });
        }
        return spawns;
    }

    /** 床の上が空いているタイル（真下が地面）。 */
    _hasFloorBelow(r, c) {
        return this.grid[r][c] === BLOCK_EMPTY &&
            r + 1 < this.rows && this.grid[r + 1][c] !== BLOCK_EMPTY;
    }

    /** 上に2マスぶんの空きがある足場（背の高い機体はこれが要る）。 */
    _hasHeadroomOnFloor(r, c) {
        return this.grid[r - 1][c] === BLOCK_EMPTY && this._hasFloorBelow(r, c);
    }

    /**
     * Find valid floor positions for landmine placement.
     * A valid position is an empty tile with a solid tile directly below it.
     */
    _findLandminePositions() {
        return this._pickSpawnPositions({
            rowFrom: BORDER_THICKNESS, rowTo: this.rows - BORDER_THICKNESS,
            colFrom: BORDER_THICKNESS, colTo: this.cols - BORDER_THICKNESS,
            startAreaRows: 14, startAreaCols: 16,
            accept: (r, c) => this._hasFloorBelow(r, c),
            count: this.targetLandmineCount,
            width: LANDMINE_WIDTH, height: LANDMINE_HEIGHT,
        });
    }

    /**
     * Find valid positions for enemy hover tanks.
     * Needs an empty tile (and empty tile above) with solid floor below.
     */
    _findEnemyTankPositions() {
        return this._pickSpawnPositions({
            rowFrom: BORDER_THICKNESS + 1, rowTo: this.rows - BORDER_THICKNESS,
            colFrom: BORDER_THICKNESS, colTo: this.cols - BORDER_THICKNESS,
            startAreaRows: 16, startAreaCols: 20,
            accept: (r, c) => this._hasHeadroomOnFloor(r, c),
            count: this.targetTankCount,
            width: ENEMY_TANK_WIDTH, height: ENEMY_TANK_HEIGHT,
        });
    }

    /**
     * Find valid positions for enemy attackers (humanoid robots).
     * Needs 2 empty tiles above a solid floor for the 24px tall body.
     */
    _findEnemyAttackerPositions() {
        return this._pickSpawnPositions({
            // 地雷やタンクより1行ぶん内側から。背が高いので上の余白が要る
            rowFrom: BORDER_THICKNESS + 2, rowTo: this.rows - BORDER_THICKNESS,
            colFrom: BORDER_THICKNESS, colTo: this.cols - BORDER_THICKNESS,
            startAreaRows: 16, startAreaCols: 20,
            accept: (r, c) => this._hasHeadroomOnFloor(r, c),
            count: this.targetAttackerCount,
            width: PLAYER_WIDTH, height: PLAYER_HEIGHT,
        });
    }

    /**
     * Find valid positions for enemy drones (aerial).
     * Needs ample empty space (e.g., 3x3 empty blocks) so they spawn hovering in the air.
     */
    _findEnemyDronePositions() {
        return this._pickSpawnPositions({
            rowFrom: BORDER_THICKNESS + 2, rowTo: this.rows - BORDER_THICKNESS - 2,
            colFrom: BORDER_THICKNESS + 2, colTo: this.cols - BORDER_THICKNESS - 2,
            startAreaRows: 16, startAreaCols: 20,
            // 3x3 が空いている＝壁に埋まらず宙に浮ける
            accept: (r, c) => this._isAreaEmpty(r - 1, c - 1, 3, 3),
            count: this.targetDroneCount,
            width: ENEMY_DRONE_WIDTH, height: ENEMY_DRONE_HEIGHT,
            centerInTile: true,   // 床ではなくタイルの中央に浮かせる
        });
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
        //
        // 床に合わせるのは**当たり判定の箱ではなく構造物の描画の下端**。
        // 基地の絵は箱より下へ ENEMY_BASE_DRAW_OVERHANG(12px) はみ出していて、
        // 箱の下端を床に合わせると土台がまるごとブロックの中に埋まる。
        this.enemyBaseSpawn = {
            x: centerC * TILE_SIZE - (ENEMY_BASE_WIDTH / 2),
            y: floorR * TILE_SIZE - ENEMY_BASE_HEIGHT - ENEMY_BASE_DRAW_OVERHANG
        };
        this.enemyBaseCenter = { r: centerR, c: centerC, floorR: floorR };
    }

    /**
     * 基地の砲台の置き場所。台にしている1タイルの中央に、付け根（天井付けは上・床置きは下）を
     * 台の面に合わせる。砲台は 24px 角でタイル(16px)より大きいので、左上をタイルの角に合わせると
     * 右へ 8px はみ出し、床置きは土台が台に 8px 沈んで見えた（実機の指摘「壁に埋まっている」）
     */
    _baseTurretSpots() {
        if (!this.enemyBaseCenter) return [];
        const S = TILE_SIZE;
        const { r, c } = this.enemyBaseCenter;
        const x = (col) => col * S + (S - ENEMY_TURRET_WIDTH) / 2;
        // 天井の台は (r - 4) 行、床の台は真ん中が (r + 2) 行・左右が (r + 4) 行（_carveMainBaseRoom）
        const ceiling = (col) => ({ x: x(col), y: (r - 4 + 1) * S, isCeiling: true });
        const floor = (row, col) => ({ x: x(col), y: row * S - ENEMY_TURRET_HEIGHT, isCeiling: false });
        const spots = [ceiling(c - 6), ceiling(c + 6)];         // Always 2
        if (this.missionLevel === 2) spots.push(floor(r + 2, c)); // Mission 3 only
        if (this.missionLevel >= 3) spots.push(floor(r + 4, c - 4), floor(r + 4, c + 4)); // Mission 4+
        return spots;
    }

    /** 基地の砲台の箱に掛かる壊せる岩を空にする（台そのものは不壊なので残る）。Step 9d */
    _clearBaseTurretBoxes() {
        const S = TILE_SIZE;
        for (const p of this._baseTurretSpots()) {
            const c0 = Math.floor(p.x / S), c1 = Math.ceil((p.x + ENEMY_TURRET_WIDTH) / S) - 1;
            const r0 = Math.floor(p.y / S), r1 = Math.ceil((p.y + ENEMY_TURRET_HEIGHT) / S) - 1;
            for (let rr = r0; rr <= r1; rr++) {
                for (let cc = c0; cc <= c1; cc++) {
                    if (this.grid[rr][cc] === BLOCK_INDESTRUCTIBLE) continue;
                    this.grid[rr][cc] = BLOCK_EMPTY;
                    this.blockHP[rr][cc] = 0;
                }
            }
        }
    }

    _addMainBaseDefenders() {
        if (!this.enemyBaseCenter) return;

        const { r, c, floorR } = this.enemyBaseCenter;

        // Add Turrets on the indestructible spots we created - Staggered by MissionLevel
        this.enemyTurretSpawns.push(...this._baseTurretSpots());

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
        // 砲台は 24px でタイルより 8px 高いので、付け根と反対側の隣の行（床置きは上・天井付けは下）にも
        // 8px はみ出す。候補の条件は自分の行しか見ていないので、そこに岩があると刺さって見えた。
        // **候補から外すのではなく、選ぶときに飛ばす** — 候補の数を変えると下のシャッフルが消費する
        // 乱数の数が変わり、以降の敵の構成が全部ずれる（週次の決定性）
        const overhangClear = (t) => this._isAreaEmpty(t.isCeiling ? t.r + 1 : t.r - 1, t.c - 1, 1, 3);

        // Shuffle candidates
        for (let i = allCandidates.length - 1; i > 0; i--) {
            const j = Math.floor(this.game.rng.next() * (i + 1));
            [allCandidates[i], allCandidates[j]] = [allCandidates[j], allCandidates[i]];
        }

        for (let i = 0; i < allCandidates.length && spawns.length < count; i++) {
            const tile = allCandidates[i];
            if (!overhangClear(tile)) continue;
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

    /** 5面で、(r, c) が空洞化したことで直下 (r+1, c) の上面が新しく露出した場合に
     *  積雪ビットを立てる。即時に積もる見た目でよい（実測1件・低リスク優先）。
     *  雪面でない環境では exposedAtGen 自体を _drawRockyBlock が見ないので早期returnで十分。 */
    _snowDressExposedBelow(r, c) {
        if (this.envKind !== 'snow') return;
        const nr = r + 1;
        if (nr >= this.rows) return;
        if (this.grid[nr][c] === BLOCK_EMPTY) return;
        this.exposedAtGen[nr * this.cols + c] = 1;
    }

    /** Damage a single block. Returns true if destroyed. */
    damageBlock(r, c, damage = 1) {
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
        const block = this.grid[r][c];
        if (block === BLOCK_EMPTY || block === BLOCK_INDESTRUCTIBLE) return false;

        this.blockHP[r][c] -= damage;
        if (this.blockHP[r][c] <= 0) {
            this.grid[r][c] = BLOCK_EMPTY;
            this.blockHP[r][c] = 0;
            // 破壊されたブロックの周囲をアクティブ化し、水流セル・オートマトンで自然に流れ込ませる
            if (this.water) {
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        const nr = r + dr, nc = c + dc;
                        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
                            this.activeWaterCells.add(nr * this.cols + nc);
                        }
                    }
                }
                // 地形が変わると水量が変わらなくても種別が変わる（直下が岩でなくなる、
                // 天井が抜けて水面になる）ので、この列は必ず作り直す。onWaterChanged
                // は水量が動いたときしか呼ばれないので、そちら任せにはできない
                for (let dc = -1; dc <= 1; dc++) {
                    const nc = c + dc;
                    if (nc >= 0 && nc < this.cols) this.dirtyWaterCols.add(nc);
                }
            }
            // envKind を先に見てから呼ぶ: metal-block.test.js などが Map.prototype.damageBlock を
            // envKind の無いフェイクオブジェクトへ bind しているため、無条件呼び出しだと落ちる
            if (this.envKind === 'snow') this._snowDressExposedBelow(r, c);
            // 形は描画のキャッシュより先に作り直す（描画が形を読むため）。tileShapes を見てから
            // 呼ぶのは、metal-block.test.js などが damageBlock を形の無い偽オブジェクトへ bind しているため
            if (this.tileShapes) this._rebuildTileShapesAround(r, c);
            this.invalidateTileRegion(r, c);
            const env = this.game && this.game.env;
            if (env && env.renderer && env.renderer.onBlockDestroyed) {
                env.renderer.onBlockDestroyed(r, c);
            }
            // 3面の町。支えの岩が壊れた建物は、支えを失った部分が落ちる
            if (this.town) this.town.onBlockDestroyed(r, c);
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
                this._drawTile(this.tileCacheCtx, r, c);
            }
        }

        // ミニマップは tile cache を縮小して焼いているので、地形が壊れたら古くなる。
        // 毎フレーム焼き直すと無駄なので「古い」印だけ立てて、実際に開いて
        // 描画する直前(refreshMiniMap)まで焼き直しを遅延させる。
        this.miniMapDirty = true;
    }

    /** Destroy blocks in a radius (for grenades).
     *  damage は呼び出し側が渡す（敵のグレネードは ENEMY_GRENADE_BLOCK_DAMAGE で弱い）。 */
    destroyArea(centerR, centerC, radius, damage = GRENADE_BLOCK_DAMAGE) {
        const destroyed = [];
        for (let r = centerR - radius; r <= centerR + radius; r++) {
            for (let c = centerC - radius; c <= centerC + radius; c++) {
                const dist = Math.abs(r - centerR) + Math.abs(c - centerC);
                if (dist <= radius) {
                    if (this.damageBlock(r, c, damage)) {
                        destroyed.push({ r, c });
                    }
                }
            }
        }
        // 水のアクティブ化は damageBlock が壊れたブロックごとに済ませている
        return destroyed;
    }

    /**
     * 水量が変わったとき。派生キャッシュを dirty にする。
     * 描画キャッシュには直接知らせない — 描く直前に takeWaterRepaintCells で、作り直しで
     * 塗りの上端が変わったセルを引き取る。以前はここで描画側の invalidate を呼び、
     * 描画側が「水量が変わったセルの上下と同じ行の水面」を塗り直していたが、液面の平均が
     * 遠くまで動く形や、厚い岩の上の水で沈み判定が変わる形を取りこぼした
     */
    onWaterChanged(cells) {
        this._markWaterDirty(cells);
    }

    /** 変化したセルの「列」を覚えておく。作り直しは列単位で行う */
    _markWaterDirty(cells) {
        if (!this.water) return;
        for (const [, c] of cells) this.dirtyWaterCols.add(c);
    }

    /**
     * dirty な列の waterKind / waterSurfaceY を作り直す。
     *
     * update() の末尾ではなく問い合わせの手前で呼ぶのは、ブロック破壊が
     * update() の外（衝突処理の中）でも起きるため。Set.size の判定は
     * 実質ゼロコストなので、呼ばれる順序に関係なく正しくなるほうを取った。
     */
    _rebuildWaterCacheIfDirty() {
        if (!this.water || this.dirtyWaterCols.size === 0) return;
        rebuildWaterCache({
            water: this.water,
            kind: this.waterKind,
            surfaceY: this.waterSurfaceY,
            paintTopY: this.waterPaintTopY,
            foam: this.waterFoam,
            foamCells: this.waterFoamCells,
            rows: this.rows,
            cols: this.cols,
            isSolid: this._waterSolidFn(),
            dirtyCols: this.dirtyWaterCols,
            repaint: this.waterRepaintCells,
            hold: this.waterStreamHold,
        });
        this.dirtyWaterCols.clear();
    }

    /**
     * 作り直しで塗りが変わったセルを [行, 列] で渡し、空にする。描画キャッシュが描く直前に呼ぶ。
     * 作り直しは問い合わせのたびに遅れて走る（衝突処理の中のブロック破壊でも）ので、
     * onWaterChanged の時点では拾い切れない。描く直前に引き取れば、どこで作り直されても漏れない
     */
    takeWaterRepaintCells() {
        this._rebuildWaterCacheIfDirty();
        if (!this.waterRepaintCells || this.waterRepaintCells.size === 0) return [];
        const out = [];
        for (const k of this.waterRepaintCells) out.push([Math.floor(k / this.cols), k % this.cols]);
        this.waterRepaintCells.clear();
        return out;
    }

    /**
     * セル (r, c) の塗りの上端 Y(px)。塗らないセル・範囲外は -1。描画キャッシュが読む。
     * 水のある面で waterPaintTopY が無いときに -1 で黙らないのは、それで水が1枚も塗られない
     * まま通ってしまうため（手で派生キャッシュを組むテストで実際に起きた）
     */
    getWaterPaintTopY(r, c) {
        if (!this.water) return -1;
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return -1;
        this._rebuildWaterCacheIfDirty();
        return this.waterPaintTopY[r * this.cols + c];
    }

    /**
     * セル (r, c) が泡のマスか（流れ落ちる満水のセルの真下の隙間。描画だけが泡の多い水として塗る）。
     * 種別は空気のままで、当たり判定は水にしない
     */
    isWaterFoam(r, c) {
        if (!this.water) return false;
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
        this._rebuildWaterCacheIfDirty();
        return this.waterFoam[r * this.cols + c] === 1;
    }

    /** 泡のマスの一覧 (r * cols + c)。描画が泡の粒を生む場所。マップ全体を走査せずに済むよう作り直しで保つ */
    getWaterFoamCells() {
        if (!this.water) return [];
        this._rebuildWaterCacheIfDirty();
        return this.waterFoamCells;
    }

    /** 水の純関数群に渡す isSolid。毎フレーム作り直さないよう1本を使い回す */
    _waterSolidFn() {
        if (!this._waterIsSolid) this._waterIsSolid = (r, c) => this.isSolid(r, c);
        return this._waterIsSolid;
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

    // --- タイルの形（設計: docs/superpowers/specs/2026-10-27-tile-shape-collision-design.md） ---
    // isSolid は「タイルのどこかに岩がある」の意味で残し、水・湧き位置・破片などはそちらを読む。
    // 形で当てたいもの（地面を動く機体と飛び道具）だけが下の問い合わせを使う。5面以外は形が
    // 満ちか空しか無いので、どの問い合わせも isSolid と同じ答えになる（tile-shape-map.test.js）

    /** computeTileShape に渡すセルの種類。範囲外は外周と同じ磨き仕上げ（削らず、隣からは岩） */
    _tileShapeCell(r, c) {
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return 'polished';
        const b = this.grid[r][c];
        if (b === BLOCK_EMPTY) return 'empty';
        // 7面は施設エリアの中だけ斜面にする（金属も削る）。外の洞窟の岩・要塞の区画は四角のまま
        if (this.tileShapeRule === 'metalSlope') {
            return this.facility && this.facility[r * this.cols + c] === 1 ? 'rock' : 'polished';
        }
        return (b === BLOCK_INDESTRUCTIBLE || b === BLOCK_METAL) ? 'polished' : 'rock';
    }

    /**
     * 7面の施設エリアの斜面を本物の金属にする（ユーザー判断「斜面は本物の金属」）。
     * 施設エリアの中は金属も 'rock' として形を作るので、ここで材質を変えても形は変わらない
     */
    _metalizeFacilitySlopes() {
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const i = r * this.cols + c;
                if (this.facility[i] !== 1) continue;
                const code = this.tileShapes[i];
                if (code === SHAPE_FULL || code === SHAPE_EMPTY) continue;
                this.grid[r][c] = BLOCK_METAL;
                this.blockHP[r][c] = METAL_BLOCK_HP;
            }
        }
    }

    _buildTileShapes() {
        const cellAt = (r, c) => this._tileShapeCell(r, c);
        this.tileShapes = new Uint16Array(this.rows * this.cols);
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                this.tileShapes[r * this.cols + c] = computeTileShape(cellAt, r, c, this.tileShapeRule);
            }
        }
    }

    /**
     * 壊れたタイルとその8近傍の形を作り直す（形は隣と斜めの隣までしか見ない）。
     * 作り直した形は前の形と両方に収まる形にする（shapeAfterBreak。設計 決定13）。規則どおりだけだと、
     * 坂の条件が崩れたタイルが小さい面取りに戻って、壊したのに岩が増えて見えた（実機で発見）
     */
    _rebuildTileShapesAround(r, c) {
        const cellAt = (rr, cc) => this._tileShapeCell(rr, cc);
        // 7面（'metalSlope'）は加工された金属なので、壊れても隣の形は作り直さない（ユーザー指定）。
        // 雪の面は崩れた所が「^」の山に削れていくが、金属の斜面は生成時の形のまま残す。
        // 壊れたタイル自身だけ空にする
        if (this.tileShapeRule === 'metalSlope') {
            this.tileShapes[r * this.cols + c] = computeTileShape(cellAt, r, c, this.tileShapeRule);
            return;
        }
        for (let rr = r - 1; rr <= r + 1; rr++) {
            if (rr < 0 || rr >= this.rows) continue;
            for (let cc = c - 1; cc <= c + 1; cc++) {
                if (cc < 0 || cc >= this.cols) continue;
                const i = rr * this.cols + cc;
                this.tileShapes[i] = shapeAfterBreak(this.tileShapes[i], computeTileShape(cellAt, rr, cc, this.tileShapeRule));
            }
        }
    }

    /** タイルの形。範囲外と NaN は isSolid と同じく岩（満ち） */
    tileShapeAt(r, c) {
        if (isNaN(r) || isNaN(c)) return SHAPE_FULL;
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return SHAPE_FULL;
        return this.tileShapes[r * this.cols + c];
    }

    /** ワールド座標の点が形の岩の中か */
    isSolidPoint(x, y) {
        if (isNaN(x) || isNaN(y)) return true;
        const r = Math.floor(y / TILE_SIZE), c = Math.floor(x / TILE_SIZE);
        const code = this.tileShapeAt(r, c);
        if (code === SHAPE_FULL) return true;
        if (code === 0) return false;
        return shapeContainsPoint(code, x - c * TILE_SIZE, y - r * TILE_SIZE);
    }

    /** 半開矩形 [x, x+w) × [y, y+h) が形の岩に掛かるか。範囲外のタイルは岩 */
    rectHitsTerrain(x, y, w, h) {
        if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) return true;
        const x1 = x + w, y1 = y + h;
        const c0 = Math.floor(x / TILE_SIZE), c1 = Math.ceil(x1 / TILE_SIZE) - 1;
        const r0 = Math.floor(y / TILE_SIZE), r1 = Math.ceil(y1 / TILE_SIZE) - 1;
        for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) {
                const code = this.tileShapeAt(r, c);
                if (code === SHAPE_FULL) return true;
                if (code === 0) continue;
                const tx = c * TILE_SIZE, ty = r * TILE_SIZE;
                if (shapeOverlapsRect(code,
                    Math.max(x - tx, 0), Math.max(y - ty, 0),
                    Math.min(x1 - tx, TILE_SIZE), Math.min(y1 - ty, TILE_SIZE))) return true;
            }
        }
        return false;
    }

    /**
     * 列 x を yFrom から下へ yTo まで見て、最初に岩が始まる y（床の高さ）。無ければ null。
     * yFrom が岩の中なら yFrom を返す。
     */
    terrainTopY(x, yFrom, yTo) {
        if (isNaN(x) || isNaN(yFrom)) return yFrom;
        const c = Math.floor(x / TILE_SIZE), lx = x - c * TILE_SIZE;
        for (let r = Math.floor(yFrom / TILE_SIZE), rEnd = Math.floor(yTo / TILE_SIZE); r <= rEnd; r++) {
            const code = this.tileShapeAt(r, c);
            const top = shapeTopY(code, lx);
            if (top === null) continue;
            if (r * TILE_SIZE + shapeBottomY(code, lx) < yFrom) continue; // 岩が始点より上で終わっている
            const y = Math.max(r * TILE_SIZE + top, yFrom);
            return y <= yTo ? y : null;
        }
        return null;
    }

    /**
     * 列 x を yFrom から上へ yTo（≦ yFrom）まで見て、最初に岩が終わる y（天井の高さ）。無ければ null。
     * yFrom が岩の中なら yFrom を返す。
     */
    terrainBottomY(x, yFrom, yTo) {
        if (isNaN(x) || isNaN(yFrom)) return yFrom;
        const c = Math.floor(x / TILE_SIZE), lx = x - c * TILE_SIZE;
        // 終わりの行は ceil − 1: 下端がちょうど yTo（タイル境目）の岩は上の行に属するので、
        // floor だとその行を見ずに「天井なし」と答えてしまう（床の terrainTopY は上端が下の行に属するので floor でよい）
        for (let r = Math.floor(yFrom / TILE_SIZE), rEnd = Math.ceil(yTo / TILE_SIZE) - 1; r >= rEnd; r--) {
            const code = this.tileShapeAt(r, c);
            const bottom = shapeBottomY(code, lx);
            if (bottom === null) continue;
            if (r * TILE_SIZE + shapeTopY(code, lx) > yFrom) continue; // 岩が始点より下から始まっている
            const y = Math.min(r * TILE_SIZE + bottom, yFrom);
            return y >= yTo ? y : null;
        }
        return null;
    }

    /** 床の上面の点 (x, y)（terrainTopY の戻り値）の傾き。+1 = 右へ上る。上面は岩に含まれるので行は floor */
    floorSlopeAt(x, y) {
        const r = Math.floor(y / TILE_SIZE), c = Math.floor(x / TILE_SIZE);
        return shapeFloorSlope(this.tileShapeAt(r, c), x - c * TILE_SIZE);
    }

    /**
     * 天井の下面の点 (x, y)（terrainBottomY の戻り値）の傾き。+1 = 右へ下がる。
     * 下面がタイル境目ちょうどのとき、その岩は上の行に属するので行は ceil − 1
     */
    ceilingSlopeAt(x, y) {
        const r = Math.ceil(y / TILE_SIZE) - 1, c = Math.floor(x / TILE_SIZE);
        return shapeCeilingSlope(this.tileShapeAt(r, c), x - c * TILE_SIZE);
    }

    /**
     * 半開矩形に掛かるタイルに、満ちでも空でもない形が1枚でもあるか。機体はこれが偽のあいだ
     * 今までのタイル単位の手順をそのまま通る（5面以外の軌跡を1フレームも変えないため。
     * tests/terrain-shape-invariance.test.js）
     */
    hasShapedTileIn(x, y, w, h) {
        if (this.tileShapeRule === 'square') return false;
        const c0 = Math.floor(x / TILE_SIZE), c1 = Math.ceil((x + w) / TILE_SIZE) - 1;
        const r0 = Math.floor(y / TILE_SIZE), r1 = Math.ceil((y + h) / TILE_SIZE) - 1;
        for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) {
                const code = this.tileShapeAt(r, c);
                if (code !== SHAPE_FULL && code !== 0) return true;
            }
        }
        return false;
    }

    /**
     * (x0, y0) から (x1, y1) への1フレームの移動で最初に触れた岩が斜辺なら、触れる直前の空の点と
     * 斜辺の外向きの法線の符号の組 `{ x, y, sx, sy }`。最初に触れたのが垂直・水平な面か、何にも
     * 触れない、または始点が岩の中なら null（呼んだ側は今までの軸ごとの手順で解く）。
     * 1px 刻みでたどるのは、グレネード（最大 6px/フレーム）や反射ビーム（5px）の移動先の点だけを
     * 見ると、斜辺を通り越して下の満ちた象限に入り、平らな床として跳ね返ってしまうから。
     * 四角い地形と、線分の近くに形のあるタイルが無いときはたどらずに null（5面以外の軌跡を変えない）
     */
    /**
     * 幅 w の物の足の列（両端から 2px 内側と中央）を yFrom から1タイル下まで見て、一番高い床の y。
     * どの列にも無ければ null。止まっている物を坂に乗せるとき、沈めずに一番高い所で支える
     * （下り側が少し浮くが、岩にめり込むより自然。段4の計画の判断）
     */
    floorUnder(x, w, yFrom) {
        let best = null;
        for (const cx of [x + 2, x + w / 2, x + w - 2]) {
            const top = this.terrainTopY(cx, yFrom, yFrom + TILE_SIZE);
            if (top !== null && (best === null || top < best)) best = top;
        }
        return best;
    }

    /** floorUnder の天井版: 同じ3列を yFrom から1タイル上まで見て、一番低い天井の y。無ければ null */
    ceilingOver(x, w, yFrom) {
        let best = null;
        for (const cx of [x + 2, x + w / 2, x + w - 2]) {
            const bottom = this.terrainBottomY(cx, yFrom, yFrom - TILE_SIZE);
            if (bottom !== null && (best === null || bottom > best)) best = bottom;
        }
        return best;
    }

    /**
     * 床に乗る湧き位置（地雷・戦車・敵アタッカー・床の砲台）を一番高い床へ、天井の砲台を一番低い
     * 天井へ置き直す（決定12）。坂の上では最大 16px、面取りの上では 8px 浮いていた。
     * 下へ（天井は上へ）動かすだけで、すでに岩に掛かっている置き方（基地の台の砲台など）は変えない。
     * 乱数は使わない（週次の決定性）。四角い地形では形がタイルと同じなので、何もしない
     */
    _seatSpawnsOnShapes() {
        if (this.tileShapeRule === 'square') return;
        const seatFloor = (list, w, h) => {
            for (const p of list) {
                if (p.isCeiling) continue;
                const floor = this.floorUnder(p.x, w, p.y + h);
                if (floor !== null && floor > p.y + h) p.y = floor - h;
            }
        };
        seatFloor(this.landmineSpawns, LANDMINE_WIDTH, LANDMINE_HEIGHT);
        seatFloor(this.enemyTankSpawns, ENEMY_TANK_WIDTH, ENEMY_TANK_HEIGHT);
        seatFloor(this.enemyAttackerSpawns, PLAYER_WIDTH, PLAYER_HEIGHT);
        seatFloor(this.enemyTurretSpawns, ENEMY_TURRET_WIDTH, ENEMY_TURRET_HEIGHT);
        for (const p of this.enemyTurretSpawns) {
            if (!p.isCeiling) continue;
            const ceiling = this.ceilingOver(p.x, ENEMY_TURRET_WIDTH, p.y);
            if (ceiling !== null && ceiling < p.y) p.y = ceiling;
        }
    }

    /**
     * 2面の Orb の置き場所（設計 2026-11-01-stage2-orb-design.md 4.2）。STAGE_ENVIRONMENTS の orbs が無い面は空。
     * 「マップの上の方を初期位置に、坂の上でなくてよい」（ユーザー指定）ので、上から ORB_SPAWN_TOP_FRACTION 以内の
     * 平らな床を候補にし、足りなければ 0.1 ずつ下へ広げる。横に散らすため、選んだものと列を ORB_SPAWN_MIN_COL_GAP 以上離す。
     * 平らな床（真下のタイルが全部満ち）に限るのは、置いた瞬間に転がり出さないため（落とすのはプレイヤー）。
     * 乱数は派生ストリーム（game.rng を消費しない＝敵の構成は変わらない）
     * @returns {Array<{cx:number, cy:number, size:'small'|'large'}>}
     */
    _findOrbPositions() {
        const count = STAGE_ENVIRONMENTS[this.missionLevel % STAGE_ENVIRONMENTS.length].orbs || 0;
        if (count === 0) return [];
        const rng = new SeededRNG((this.game.rng.state ^ ORB_SPAWN_SALT) >>> 0);
        const sizes = shuffleWith(rng, [...ORB_SIZE_MIX]).slice(0, count);
        const rects = this._reservedRects();
        const inRects = (r, c) => rects.some((q) => r >= q.r0 && r <= q.r1 && c >= q.c0 && c <= q.c1);
        // 地雷・敵の湧き位置の周り 1 タイルにも置かない。予約矩形だけを避けていたら、週の 13.5% で Orb が地雷に
        // 触れた位置に置かれて開始1ティック目に爆発し、敵の湧き位置と重なると開始時に敵がずれた（最終レビュー Important 4）。
        // どれも地図が持っている値なので、乱数は使わない
        const keepOut = [
            ...this.landmineSpawns.map((p) => [p.x, p.y, LANDMINE_WIDTH, LANDMINE_HEIGHT]),
            ...this.enemyTankSpawns.map((p) => [p.x, p.y, ENEMY_TANK_WIDTH, ENEMY_TANK_HEIGHT]),
            ...this.enemyAttackerSpawns.map((p) => [p.x, p.y, PLAYER_WIDTH, PLAYER_HEIGHT]),
            ...this.enemyDroneSpawns.map((p) => [p.x, p.y, ENEMY_DRONE_WIDTH, ENEMY_DRONE_HEIGHT]),
            ...this.enemyTurretSpawns.map((p) => [p.x, p.y, ENEMY_TURRET_WIDTH, ENEMY_TURRET_HEIGHT]),
            ...(this.enemyBaseSpawn ? [[this.enemyBaseSpawn.x, this.enemyBaseSpawn.y, ENEMY_BASE_WIDTH, ENEMY_BASE_HEIGHT]] : []),
        ];
        // 左上のタイル (r, c) から n×n タイルの箱を 1 タイル広げて、湧き位置の箱に掛かるか
        const nearSpawn = (r, c, n) => {
            const x0 = (c - 1) * TILE_SIZE, y0 = (r - 1) * TILE_SIZE, x1 = (c + n + 1) * TILE_SIZE, y1 = (r + n + 1) * TILE_SIZE;
            return keepOut.some(([x, y, w, h]) => x1 > x && x0 < x + w && y1 > y && y0 < y + h);
        };
        // 左上のタイル (r, c) から n×n が空で、真下の n タイルが平らな床か
        const fits = (r, c, n) => {
            if (r + n >= this.rows || c + n > this.cols) return false;
            for (let dc = 0; dc < n; dc++) {
                if (this.tileShapeAt(r + n, c + dc) !== SHAPE_FULL || this.grid[r + n][c + dc] === BLOCK_EMPTY) return false;
                for (let dr = 0; dr < n; dr++) {
                    if (this.grid[r + dr][c + dc] !== BLOCK_EMPTY || inRects(r + dr, c + dc)) return false;
                }
            }
            return true;
        };
        const picked = [];
        for (const size of sizes) {
            // 足元のタイル数。24px は 1.5 タイルなので 2 タイルの床の真ん中に置く（端数のまま数えると候補が1つも無かった）
            const n = Math.ceil(ORB_SIZES[size].diameter / TILE_SIZE);
            for (let frac = ORB_SPAWN_TOP_FRACTION; frac <= 1.0001; frac += 0.1) {
                const maxR = Math.floor(this.rows * frac);
                const cands = [];
                for (let r = 1; r + n <= maxR; r++) {
                    for (let c = 1; c < this.cols - n; c++) if (fits(r, c, n) && !nearSpawn(r, c, n)) cands.push({ r, c });
                }
                shuffleWith(rng, cands);
                const hit = cands.find((p) => picked.every((q) => Math.abs(q.c - p.c) >= ORB_SPAWN_MIN_COL_GAP));
                if (!hit) continue;
                picked.push({ ...hit, n, d: ORB_SIZES[size].diameter, size });
                break;
            }
        }
        // 中心は床の上面にちょうど接する高さ（Orb は接しているだけなら岩に入ったと見ない。orbPhysics の ORB_CONTACT_EPS）
        return picked.map((p) => ({
            cx: (p.c + p.n / 2) * TILE_SIZE, cy: (p.r + p.n) * TILE_SIZE - p.d / 2, size: p.size,
        }));
    }

    /**
     * 点 (x, y) が形の岩の中なら、真上へ1タイル以内で最初に空になる y（1px 刻み）。岩の外、
     * 1タイル上まで岩、四角い地形、近くに形のあるタイルが無いときは null。
     * 決定13 の前は、坂の下の段や隣が壊れると坂だったタイルが小さい面取りに戻り、削れていた所が岩になった。
     * そこにいたグレネード・反射ビームは、slopeHitAlong も軸ごとの判定も岩の中からは解けず、動けなくなった
     * （段3の最終レビュー I1）。今は壊した後の形が前の形より岩を増やさない（shapeAfterBreak）ので壊れて
     * 埋まることは無いが、ほかの経路で岩に入ったときの備えとして残す。5面以外では通らない
     */
    popOutOfRock(x, y) {
        if (this.tileShapeRule === 'square') return null;
        if (!this.hasShapedTileIn(x - 1, y - TILE_SIZE, 2, TILE_SIZE + 1)) return null;
        if (!this.isSolidPoint(x, y)) return null;
        for (let k = 1; k <= TILE_SIZE; k++) {
            if (!this.isSolidPoint(x, y - k)) return y - k;
        }
        return null;
    }

    slopeHitAlong(x0, y0, x1, y1) {
        if (this.tileShapeRule === 'square') return null;
        const minX = Math.min(x0, x1), minY = Math.min(y0, y1);
        if (!this.hasShapedTileIn(minX - 1, minY - 1, Math.abs(x1 - x0) + 2, Math.abs(y1 - y0) + 2)) return null;
        if (this.isSolidPoint(x0, y0)) return null;
        const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
        let qx = x0, qy = y0;
        for (let i = 1; i <= n; i++) {
            const sx = x0 + (x1 - x0) * (i / n), sy = y0 + (y1 - y0) * (i / n);
            if (this.isSolidPoint(sx, sy)) {
                const r = Math.floor(sy / TILE_SIZE), c = Math.floor(sx / TILE_SIZE);
                const tx = c * TILE_SIZE, ty = r * TILE_SIZE;
                // 入った先のタイルの斜辺か、出てきた側のタイルの斜辺（坂のタイルの境目の列）か
                let normal = hypotenuseNormal(this.tileShapeAt(r, c), sx - tx, sy - ty, qx - tx, qy - ty);
                if (!normal) {
                    const pr = Math.floor(qy / TILE_SIZE), pc = Math.floor(qx / TILE_SIZE);
                    const ptx = pc * TILE_SIZE, pty = pr * TILE_SIZE;
                    normal = hypotenuseAhead(this.tileShapeAt(pr, pc), qx - ptx, qy - pty, sx - ptx, sy - pty);
                }
                return normal ? { x: qx, y: qy, sx: normal.sx, sy: normal.sy } : null;
            }
            qx = sx; qy = sy;
        }
        return null;
    }

    isWater(r, c) {
        if (!this.water) return false;
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
        return this.water[r * this.cols + c] >= MIN_WATER_MASS;
    }

    /** セルが水面（水たまりの液面）を形成しているか */
    isWaterSurface(r, c) {
        if (!this.waterKind) return false;
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
        this._rebuildWaterCacheIfDirty();
        return this.waterKind[r * this.cols + c] === WATER_SURFACE;
    }

    /** セルが落下中の滝（水流）の中にあるか */
    isWaterfallCell(r, c) {
        if (!this.waterKind) return false;
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
        this._rebuildWaterCacheIfDirty();
        return this.waterKind[r * this.cols + c] === WATER_FALL;
    }

    /**
     * セル (r, c) にかかっている水塊の液面 Y 座標 (px)。水がかかっていなければ -1。
     * 液面を持たない水（天井に張り付いた水、滝）はタイルの上辺を返す。
     *
     * 「かかっている」の意味は isWaterAtPixel と同じ。水量が0でも、液面が
     * このタイルまで上がっていれば液面を返す（以前は水量だけを見て -1 を返し、
     * isWaterAtPixel が水と答えるセルで液面が取れなかった）。
     * 水面の「行」だけを返す waterSurfaceRow もあったが、液面はタイルの途中にある
     * ので、しぶきやドローンの停止位置が最大15px ずれ、滝の中では滝のてっぺんまで
     * 遡っていた。水面の定義をこれ1つにした。
     *
     * 液面を持たないセルは、水量ではなく種別で「水か」を決める（isWaterAtPixel と同じ）。
     * 流れの記録（waterStream.js）で滝になった空のセルは水量0なので、水量で見ると
     * isWaterAtPixel は水と答えるのに -1 を返し、爆発の水柱が黙って出なかった。
     * 水量のあるセルの種別は必ず滝・水面・水中のどれかなので、それ以外の答えは変わらない
     */
    getSurfaceY(r, c) {
        if (!this.water) return -1;
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return -1;
        this._rebuildWaterCacheIfDirty();
        const level = this.waterSurfaceY[r * this.cols + c];
        if (level >= 0) return level;
        return this.waterKind[r * this.cols + c] !== WATER_NONE ? r * TILE_SIZE : -1;
    }

    isWaterAtPixel(x, y) {
        if (!this.water) return false;
        const r = Math.floor(y / TILE_SIZE);
        const c = Math.floor(x / TILE_SIZE);
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
        this._rebuildWaterCacheIfDirty();
        const k = r * this.cols + c;
        const kind = this.waterKind[k];
        const level = this.waterSurfaceY[k];
        // 液面を持つセルは、その液面より下かどうかで決める。水量が無いセルでも
        // 液面がかかっていれば水（水塊の液面はひとつなので、量子化のせいで
        // 水量が届いていない列でも液面までは水として扱う）
        if (level >= 0) return y >= level;
        if (kind === WATER_NONE) return false;
        return true;
    }

    /**
     * 滝が水へ着水しているセル（滝の最下段で、真下が滝でない水）の列の一覧。
     * 着水の波紋に使う。種別の配列を直接1回なめる（実物の4面で中央値 23µs。
     * セルごとに isWaterfallCell を呼ぶ形だと 128µs だった）
     */
    waterfallLandingCols() {
        const out = [];
        if (!this.waterKind) return out;
        this._rebuildWaterCacheIfDirty();
        const { rows, cols } = this;
        const kind = this.waterKind;
        for (let k = 0; k < (rows - 1) * cols; k++) {
            if (kind[k] !== WATER_FALL) continue;
            const below = kind[k + cols];
            if (below !== WATER_NONE && below !== WATER_FALL) out.push(k % cols);
        }
        return out;
    }

    /** ピクセル座標が落下中の滝（水流）の中にあるか */
    isWaterfallAtPixel(x, y) {
        if (!this.water) return false;
        const r = Math.floor(y / TILE_SIZE);
        const c = Math.floor(x / TILE_SIZE);
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
        this._rebuildWaterCacheIfDirty();
        return this.waterKind[r * this.cols + c] === WATER_FALL;
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
        if (this.envKind === 'water' && this.water) {
            // 水源（湧水）の処理
            // **水源は止まらない**。面がゆっくり水没していくのは仕様（ユーザー判断、
            // 2026-09-06 の問い合わせ層キャッシュ化の設計書）。水源のセルと真下が
            // 満水なら注ぎ足す先が無いので、そのときだけ自然に止まる。
            //
            // 以前はここに停止ガードが2つあり、どちらも「構造的に成立しない」と
            // コメントされていたが誤りだった。「sp.r <= WATER_SPRING_STOP_ROW(6)」は
            // 生成時に決まる定数条件で、その行の水源（200シードで 400個中 7個）は
            // 最初から永久に湧かず、口から滴る演出だけが出ていた。「真上が満水」は、
            // プレイヤーが真上の岩を壊せば成立する。どちらも仕様と食い違うので外した
            if (this.waterSprings && this.waterSprings.length > 0) {
                for (const sp of this.waterSprings) {
                    sp.timer++;
                    if (sp.timer >= WATER_SPRING_INTERVAL) {
                        sp.timer = 0;
                        const key = sp.r * this.cols + sp.c;
                        const cur = this.water[key];
                        // 足したセルは onWaterChanged で種別キャッシュと描画に伝える。
                        // 以前は activeWaterCells に入れるだけで、落下が4フレームに1回だったころ、
                        // そのフレームで水が流れないと「水量1なのに
                        // 水なし」のまま残り、水源の口の滝が数フレームおきに消えていた
                        if (cur < MAX_WATER_MASS) {
                            this.water[key] = Math.min(MAX_WATER_MASS, cur + WATER_SPRING_MASS);
                            this.activeWaterCells.add(key);
                            this.onWaterChanged([[sp.r, sp.c]]);
                        } else if (sp.r + 1 < this.rows && !this.isSolid(sp.r + 1, sp.c)) {
                            const downKey = (sp.r + 1) * this.cols + sp.c;
                            const downCur = this.water[downKey];
                            if (downCur < MAX_WATER_MASS) {
                                this.water[downKey] = Math.min(MAX_WATER_MASS, downCur + WATER_SPRING_MASS);
                                this.activeWaterCells.add(downKey);
                                this.onWaterChanged([[sp.r + 1, sp.c]]);
                            }
                        }
                    }
                }
            }

            // 以前はここで90フレームごとに「取りこぼされた縦穴」を全マップ走査で
            // 拾い直していたが、実測で一度も何も拾っておらず、漏れはアクティブ管理で
            // 構造的に塞がっていたので撤去した（tests/water-active-invariant.test.js）

            // 流れの記録を1フレーム進める。切れたセルは水量が変わらなくても種別が変わる
            // （空の滝 → 水なし）ので、onWaterChanged で種別キャッシュに知らせる。
            // 知らせないと、その列は dirty にならず滝のまま残る
            if (this.waterStreamLive.size > 0) {
                const expired = decayStream(this.waterStreamHold, this.waterStreamLive);
                if (expired.length > 0) {
                    this.onWaterChanged(expired.map((k) => [Math.floor(k / this.cols), k % this.cols]));
                }
            }

            if (this.activeWaterCells.size > 0) {
                this.waterFallTimer = (this.waterFallTimer || 0) + 1;
                const doFall = (this.waterFallTimer >= WATER_FALL_INTERVAL);
                if (doFall) {
                    this.waterFallTimer = 0;
                }
                // 水圧は落下と別の間隔で運ぶ（WATER_PRESSURE_INTERVAL のコメント）
                this.waterPressureTimer = (this.waterPressureTimer || 0) + 1;
                const doPressure = (this.waterPressureTimer >= WATER_PRESSURE_INTERVAL);
                if (doPressure) {
                    this.waterPressureTimer = 0;
                }
                const res = stepWaterSimulation({
                    water: this.water,
                    rows: this.rows,
                    cols: this.cols,
                    isSolid: this._waterSolidFn(),
                    activeCells: this.activeWaterCells,
                    doFall,
                    doPressure,
                    streamHold: this.waterStreamHold,
                    streamLive: this.waterStreamLive,
                });
                this.activeWaterCells = res.nextActiveCells;
                if (res.changedCells.length > 0) {
                    this.onWaterChanged(res.changedCells);
                }
            }
        }
    }
}

// ------------------------------------------
// Mixins
// ------------------------------------------
// 責務ごとのメソッドを別ファイルのオブジェクトリテラルに置き、ここで Map.prototype へ混ぜる
// （EnemyAttacker / ScreenRenderer / Game と同じ作り）。クラスに割らず mixin にしたのは、
// 生成・当たり・水・描画が約60の共有フィールド（this.grid / this.water / this.tileShapes …）を
// 読み書きしていて、クラスに割ると全メソッドの this. と、Map.prototype._xxx を直接呼ぶ
// テストの呼び方が全部変わるため（docs/superpowers/specs/2026-11-04-map-split-design.md）。
// Object.assign は同名を黙って後勝ちで上書きするので、名前が重ならないことは
// tests/map-mixins.test.js が縛っている
Object.assign(Map.prototype,
    MapRender,
    MapMiniMap,
);

export { BLOCK_EMPTY, BLOCK_INDESTRUCTIBLE, BLOCK_HARD, BLOCK_METAL } from '../utils/Constants.js';
