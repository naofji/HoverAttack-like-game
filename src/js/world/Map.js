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
    ENEMY_TURRET_WIDTH, ENEMY_TURRET_HEIGHT,
    TILE_SIZE,
    STAGE_PALETTES, STAGE_ENVIRONMENTS, STAIRS_PROFILES,
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
    MAX_WATER_MASS,
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
import { carveSnowStairs } from './snowStairs.js';
import { carveFortressZones } from './fortress.js';
import { pickFacilityAreas, metalizeFacilityBand } from './facility.js';
import { generateTown } from './town/generate.js';
import { generatePlants } from './town/generatePlants.js';
import { generateSnowTrees } from './town/generateSnowTrees.js';
import { generateIcicles } from './town/generateIcicles.js';
import { Town } from './town/Town.js';
import { BORDER_THICKNESS } from './mapgen/common.js';
// 層ごとのメソッド（Map.prototype へ混ぜる。ファイル末尾の Mixins 節）
import { MapRender } from './mapRender.js';
import { MapMiniMap } from './mapMiniMap.js';
import { MapWater } from './mapWater.js';
import { MapShapes } from './mapShapes.js';
import { MapSpawns } from './mapgen/spawns.js';


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
    MapWater,
    MapShapes,
    MapSpawns,
);

export { BLOCK_EMPTY, BLOCK_INDESTRUCTIBLE, BLOCK_HARD, BLOCK_METAL } from '../utils/Constants.js';
