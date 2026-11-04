// ============================================
// Map - 形と当たりの問い合わせ（tileShapeAt 系・isSolid 系）
// ============================================
//
// タイルの形（utils/tileShape.js の4象限の形）は地形が出来上がってから _buildTileShapes が
// tileShapes に焼き、壊れたら _rebuildTileShapesAround が周りだけ焼き直す。当たり判定はすべて
// ここの問い合わせを通す（自機・敵・弾・地面に乗るもの。memory: hoverattack-tile-shape-collision）。
//
// **Map.prototype へ Object.assign で混ぜる前提**のオブジェクトリテラルで、`this` は
// Map のインスタンスを指す（理由は world/mapRender.js の冒頭）。Map.js を import しないこと。

import { BLOCK_EMPTY, BLOCK_INDESTRUCTIBLE, BLOCK_METAL, METAL_BLOCK_HP, TILE_SIZE } from '../utils/Constants.js';
import {
    SHAPE_FULL, SHAPE_EMPTY, computeTileShape, shapeContainsPoint, shapeOverlapsRect, shapeTopY, shapeBottomY,
    shapeFloorSlope, shapeCeilingSlope, hypotenuseNormal, hypotenuseAhead, shapeAfterBreak,
} from '../utils/tileShape.js';

export const MapShapes = {
    // ------------------------------------------
    // Collision Helpers
    // ------------------------------------------

    isSolid(r, c) {
        if (isNaN(r) || isNaN(c)) return true;
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return true;
        return this.grid[r][c] !== BLOCK_EMPTY;
    },

    isSolidAtPixel(x, y) {
        if (isNaN(x) || isNaN(y)) return true;
        return this.isSolid(Math.floor(y / TILE_SIZE), Math.floor(x / TILE_SIZE));
    },

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
    },

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
    },

    _buildTileShapes() {
        const cellAt = (r, c) => this._tileShapeCell(r, c);
        this.tileShapes = new Uint16Array(this.rows * this.cols);
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                this.tileShapes[r * this.cols + c] = computeTileShape(cellAt, r, c, this.tileShapeRule);
            }
        }
    },

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
    },

    /** タイルの形。範囲外と NaN は isSolid と同じく岩（満ち） */
    tileShapeAt(r, c) {
        if (isNaN(r) || isNaN(c)) return SHAPE_FULL;
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return SHAPE_FULL;
        return this.tileShapes[r * this.cols + c];
    },

    /** ワールド座標の点が形の岩の中か */
    isSolidPoint(x, y) {
        if (isNaN(x) || isNaN(y)) return true;
        const r = Math.floor(y / TILE_SIZE), c = Math.floor(x / TILE_SIZE);
        const code = this.tileShapeAt(r, c);
        if (code === SHAPE_FULL) return true;
        if (code === 0) return false;
        return shapeContainsPoint(code, x - c * TILE_SIZE, y - r * TILE_SIZE);
    },

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
    },

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
    },

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
    },

    /** 床の上面の点 (x, y)（terrainTopY の戻り値）の傾き。+1 = 右へ上る。上面は岩に含まれるので行は floor */
    floorSlopeAt(x, y) {
        const r = Math.floor(y / TILE_SIZE), c = Math.floor(x / TILE_SIZE);
        return shapeFloorSlope(this.tileShapeAt(r, c), x - c * TILE_SIZE);
    },

    /**
     * 天井の下面の点 (x, y)（terrainBottomY の戻り値）の傾き。+1 = 右へ下がる。
     * 下面がタイル境目ちょうどのとき、その岩は上の行に属するので行は ceil − 1
     */
    ceilingSlopeAt(x, y) {
        const r = Math.ceil(y / TILE_SIZE) - 1, c = Math.floor(x / TILE_SIZE);
        return shapeCeilingSlope(this.tileShapeAt(r, c), x - c * TILE_SIZE);
    },

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
    },

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
    },

    /** floorUnder の天井版: 同じ3列を yFrom から1タイル上まで見て、一番低い天井の y。無ければ null */
    ceilingOver(x, w, yFrom) {
        let best = null;
        for (const cx of [x + 2, x + w / 2, x + w - 2]) {
            const bottom = this.terrainBottomY(cx, yFrom, yFrom - TILE_SIZE);
            if (bottom !== null && (best === null || bottom > best)) best = bottom;
        }
        return best;
    },

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
    },

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
    },
};
