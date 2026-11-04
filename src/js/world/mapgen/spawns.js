// ============================================
// Map の生成 - 湧き位置（敵・地雷・基地の部屋・Orb）と形への着地
// ============================================
//
// **game.rng を消費するメソッドを含む**（_pickSpawnPositions のシャッフル、
// _carveMainBaseRoom の基地の高さ、_findEnemyTurretPositions のシャッフル）。
// 週次の決定性（同じ ISO 週なら全員が同じステージ）は乱数を引く順と回数で決まるので、
// ここのメソッドの中身も呼ぶ順も変えないこと。
// 呼ぶ順の唯一の記述は Map.js の _generate()。Orb の配置は派生ストリーム（ORB_SPAWN_SALT）で、
// game.rng を進めない。
//
// **Map.prototype へ Object.assign で混ぜる前提**のオブジェクトリテラルで、`this` は
// Map のインスタンスを指す（理由は world/mapRender.js の冒頭）。Map.js を import しないこと。

import {
    BLOCK_EMPTY, BLOCK_INDESTRUCTIBLE, PLAYER_WIDTH, PLAYER_HEIGHT, ENEMY_TANK_WIDTH, ENEMY_TANK_HEIGHT,
    ENEMY_DRONE_WIDTH, ENEMY_DRONE_HEIGHT, ENEMY_TURRET_WIDTH, ENEMY_TURRET_HEIGHT, ENEMY_BASE_WIDTH,
    ENEMY_BASE_HEIGHT, ENEMY_BASE_DRAW_OVERHANG, TILE_SIZE, LANDMINE_WIDTH, LANDMINE_HEIGHT, STAGE_ENVIRONMENTS,
    ORB_SIZES, ORB_SPAWN_TOP_FRACTION, ORB_SPAWN_MIN_COL_GAP, ORB_SPAWN_SALT, ORB_SIZE_MIX,
} from '../../utils/Constants.js';
import { SeededRNG } from '../../utils/SeededRNG.js';
import { BORDER_THICKNESS } from './common.js';
import { SHAPE_FULL } from '../../utils/tileShape.js';

/** Fisher-Yates で list をその場で混ぜて返す（派生ストリーム用。湧き探索の game.rng の混ぜ方と同じ手順） */
function shuffleWith(rng, list) {
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

export const MapSpawns = {
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
    },

    /** 床の上が空いているタイル（真下が地面）。 */
    _hasFloorBelow(r, c) {
        return this.grid[r][c] === BLOCK_EMPTY &&
            r + 1 < this.rows && this.grid[r + 1][c] !== BLOCK_EMPTY;
    },

    /** 上に2マスぶんの空きがある足場（背の高い機体はこれが要る）。 */
    _hasHeadroomOnFloor(r, c) {
        return this.grid[r - 1][c] === BLOCK_EMPTY && this._hasFloorBelow(r, c);
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },
};
