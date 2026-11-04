// ============================================
// Map - Cave generation & destructible terrain
// ============================================

import {
    MIN_MAP_COLS, MIN_MAP_ROWS, MAX_MAP_COLS, MAX_MAP_ROWS,
    BLOCK_EMPTY, BLOCK_NORMAL, BLOCK_HARD, BLOCK_INDESTRUCTIBLE, BLOCK_METAL,
    COLOR_HARD_BLOCK, COLOR_HARD_BLOCK_BORDER, HARD_BLOCK_TINT, HARD_BLOCK_DARKEN,
    COLOR_METAL_BLOCK, COLOR_METAL_BLOCK_BORDER, METAL_BLOCK_TINT, METAL_BLOCK_DARKEN,
    COLOR_INDESTRUCTIBLE_BLOCK, COLOR_INDESTRUCTIBLE_BLOCK_BORDER,
    TILE_SIZE,
    STAGE_PALETTES, STAGE_ENVIRONMENTS, STAIRS_PROFILES,
    GRENADE_BLOCK_DAMAGE,
    MAX_WATER_MASS,
    WATER_SPRING_INTERVAL, WATER_SPRING_MASS,
    WATER_FALL_INTERVAL,
    WATER_PRESSURE_INTERVAL,
} from '../utils/Constants.js';
import { CaveBackdrop } from './CaveBackdrop.js';
import { SeededRNG } from '../utils/SeededRNG.js';
import { lerpColor, luminance, withLuminance } from '../utils/color.js';
import { stepWaterSimulation } from './waterSimulation.js';
import { decayStream } from './waterStream.js';
import { carveSnowStairs } from './snowStairs.js';
import { BORDER_THICKNESS } from './mapgen/common.js';
// 層ごとのメソッド（Map.prototype へ混ぜる。ファイル末尾の Mixins 節）
import { MapRender } from './mapRender.js';
import { MapMiniMap } from './mapMiniMap.js';
import { MapWater } from './mapWater.js';
import { MapShapes } from './mapShapes.js';
import { MapSpawns } from './mapgen/spawns.js';
import { MapFeatures } from './mapgen/features.js';
import { MapCarve } from './mapgen/carve.js';


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
    MapFeatures,
    MapCarve,
);

export { BLOCK_EMPTY, BLOCK_INDESTRUCTIBLE, BLOCK_HARD, BLOCK_METAL } from '../utils/Constants.js';
