// ============================================
// Map の生成 - 面ごとの飾り（町・植物・雪・施設・要塞・水）
// ============================================
//
// 洞窟を掘ったあとに、面の環境（STAGE_ENVIRONMENTS の kind / terrain）ごとに載せるもの。
// ここのメソッドは **game.rng を直接は引かない**。乱数が要るものはすべて派生ストリーム
// （new SeededRNG((this.game.rng.state ^ SALT) >>> 0)）を作って渡している。面ごとの飾りを
// 足し引きしても、game.rng の消費（＝敵の構成）が変わらないようにするため
// （CLAUDE.md の「週次の決定性」）。SALT と、game.rng.state を読む時点は変えないこと。
//
// **Map.prototype へ Object.assign で混ぜる前提**のオブジェクトリテラルで、`this` は
// Map のインスタンスを指す（理由は world/mapRender.js の冒頭）。Map.js を import しないこと。

import {
    BLOCK_EMPTY, BLOCK_METAL, METAL_BLOCK_HP, ENEMY_TURRET_WIDTH, ENEMY_TURRET_HEIGHT, TILE_SIZE, WATER_POOL_COUNT,
    WATER_POOL_DEPTH_MIN, WATER_POOL_DEPTH_RANGE, WATER_POOL_MAX_TILES, FORTRESS_ZONE_COUNT, FORTRESS_ZONE_W_MIN,
    FORTRESS_ZONE_W_RANGE, FORTRESS_ZONE_H_MIN, FORTRESS_ZONE_H_RANGE, FORTRESS_ZONE_MARGIN,
    FORTRESS_WALL_THICKNESS, FORTRESS_CEILING_H, FORTRESS_FLOOR_H, FORTRESS_SHAFT_W, FORTRESS_GATE_SIZE,
    FORTRESS_OPENING_TUNNEL_MAX, FACILITY_STAIRS_COUNT, FACILITY_STAIRS_LENGTH_MIN, FACILITY_STAIRS_LENGTH_RANGE,
    FACILITY_AREA_COUNT, FACILITY_AREA_W_MIN, FACILITY_AREA_W_RANGE, FACILITY_AREA_H_MIN, FACILITY_AREA_H_RANGE,
    FORTRESS_TREASURE_COUNT, FORTRESS_EXTRA_LIFE_COUNT, FORTRESS_EXTRA_LIFE_SLOT, FORTRESS_GARRISON_TURRETS,
    FORTRESS_GARRISON_TANKS, FORTRESS_BARRIER_CLEARANCE, ELECTRIC_FLOOR_MIN_LEN, ELECTRIC_FLOOR_BARRIER_GAP,
    ELECTRIC_FLOOR_H, FORTRESS_GATE_GUARD_TYPE, FORTRESS_GATE_GUARD_INSET, FORTRESS_CORRIDOR_H,
    FORTRESS_ROOM_MARGIN, FORTRESS_ROOM_W, FORTRESS_CORRIDOR_MIN_W, MAX_WATER_MASS, WATER_SPRING_COUNT,
    WATER_SPRING_MAX_ROW_RATIO, TOWN_BASE_QUIET_INNER, TOWN_BASE_QUIET_OUTER,
} from '../../utils/Constants.js';
import { SeededRNG } from '../../utils/SeededRNG.js';
import { generateWaterPools, generateWaterSprings } from '../waterPools.js';
import { carveSnowStairs } from '../snowStairs.js';
import { carveFortressZones } from '../fortress.js';
import { pickFacilityAreas, metalizeFacilityBand } from '../facility.js';
import { generateTown } from '../town/generate.js';
import { generatePlants } from '../town/generatePlants.js';
import { generateSnowTrees } from '../town/generateSnowTrees.js';
import { generateIcicles } from '../town/generateIcicles.js';
import { Town } from '../town/Town.js';

export const MapFeatures = {
    // 開始の部屋・基地の部屋を避けるための矩形。水（_generateWater）と雪の階段
    // （carveSnowStairs）の両方が使う。別々に計算すると数値がずれて食い違う恐れがある
    // ため、値をここ1箇所にまとめる（レビュー指摘で追加）。
    _reservedRects() {
        const b = this.enemyBaseCenter;
        return [
            { r0: 0, r1: 3 + 16 + 2, c0: 0, c1: 3 + 20 + 2 },
            { r0: b.r - 12, r1: b.floorR + 2, c0: b.c - 10, c1: this.cols - 1 },
        ];
    },
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
    },

    /** 植物の設計図。tools/render-town-scene.mjs も同じものを呼ぶ（町と同じ理由） */
    _buildPlantSpecs() {
        return generatePlants({
            grid: this.grid, rows: this.rows, cols: this.cols,
            // 基地の部屋だけ避ける（町と同じ。パルスや砲台を見やすくしておく）
            excludeRects: [this._reservedRects()[1]],
            rng: new SeededRNG((this.game.rng.state ^ 0x4F3A57) >>> 0),
        });
    },

    _generatePlants() {
        this.town = new Town(this._buildPlantSpecs(), { isSolidTile: (r, c) => this.isSolid(r, c) });
    },

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
    },

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
    },

    /** 5面: 雪の木 ＋ 天井のつらら を 1 つの Town に載せる。木が先（建物の番号が変わらず、木の欠け方の乱数が変わらない） */
    _generateSnow() {
        // 支えも形で見る（隣が壊れて根元の下が削れた木は倒れ、つららは落ちる。Town の rockAt）
        this.town = new Town([...this._buildSnowTreeSpecs(), ...this._buildIcicleSpecs()], {
            isSolidTile: (r, c) => this.isSolid(r, c), rockAt: (x, y) => this.isSolidPoint(x, y),
        });
    },

    _generateTown() {
        this.town = new Town(this._buildTownSpecs(), { isSolidTile: (r, c) => this.isSolid(r, c) });
    },

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
    },

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
    },

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
    },

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
    },

    /** 5面で、(r, c) が空洞化したことで直下 (r+1, c) の上面が新しく露出した場合に
     *  積雪ビットを立てる。即時に積もる見た目でよい（実測1件・低リスク優先）。
     *  雪面でない環境では exposedAtGen 自体を _drawRockyBlock が見ないので早期returnで十分。 */
    _snowDressExposedBelow(r, c) {
        if (this.envKind !== 'snow') return;
        const nr = r + 1;
        if (nr >= this.rows) return;
        if (this.grid[nr][c] === BLOCK_EMPTY) return;
        this.exposedAtGen[nr * this.cols + c] = 1;
    },
};
