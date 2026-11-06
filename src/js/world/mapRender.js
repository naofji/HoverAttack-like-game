// ============================================
// Map - 地形の描画（タイルキャッシュと岩・パネル・磨いた岩の絵）
// ============================================
//
// 地形はすべて生成時にオフスクリーンの tileCacheCanvas へ一度だけ描き、毎フレームの
// draw() はそこから画面に見えている範囲を切り出すだけ。壊れた周りの描き直しは
// Map.js の invalidateTileRegion が _drawTile を呼ぶ。
//
// **Map.prototype へ Object.assign で混ぜる前提**のオブジェクトリテラルで、`this` は
// Map のインスタンスを指す（EnemyAttacker の attacker/ や ScreenRenderer の ui/screens/ と
// 同じ作り。テストが Map.prototype._drawRockyBlock などを直接呼ぶので、名前も呼び方も変えない）。
// Map.js を import しないこと（Map.js がこちらを import する一方向にして循環を作らない）。

import {
    BLOCK_EMPTY, BLOCK_NORMAL, BLOCK_HARD, BLOCK_INDESTRUCTIBLE, BLOCK_METAL, METAL_BLOCK_HP, METAL_HEAT_COLOR,
    FACILITY_PLATE_DARKEN, TILE_SIZE, SNOW_CAP_COLOR, SNOW_CAP_THICKNESS, HARD_BLOCK_HP,
} from '../utils/Constants.js';
import { lerpColor, luminance, withLuminance } from '../utils/color.js';
import { drawMetalPanel, drawArmorPanel, drawPlatePanel, plateBreaksLeft, tileRng } from './panelBlocks.js';
import { SHAPE_FULL, isRoundedRule, shapeCornerCuts, shapeTriangle } from '../utils/tileShape.js';

export const MapRender = {
    // ------------------------------------------
    // Tile Render Cache
    // ------------------------------------------

    _initTileCache() {
        this.tileCacheCanvas = document.createElement('canvas');
        this.tileCacheCanvas.width = this.width;
        this.tileCacheCanvas.height = this.height;
        this.tileCacheCtx = this.tileCacheCanvas.getContext('2d');
        this._renderAllToCache();
    },

    _renderAllToCache() {
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                this._drawTile(this.tileCacheCtx, r, c);
            }
        }
    },

    draw(ctx) {
        const cam = this.game.camera;
        const startCol = Math.max(0, Math.floor(cam.x / TILE_SIZE));
        const endCol = Math.min(this.cols, Math.ceil((cam.x + this.game.canvas.width) / TILE_SIZE));
        const startRow = Math.max(0, Math.floor(cam.y / TILE_SIZE));
        const endRow = Math.min(this.rows, Math.ceil((cam.y + this.game.canvas.height) / TILE_SIZE));

        const S = TILE_SIZE;
        const sx = startCol * S;
        const sy = startRow * S;
        const sWidth = (endCol - startCol) * S;
        const sHeight = (endRow - startRow) * S;
        if (sWidth <= 0 || sHeight <= 0) return;

        ctx.drawImage(
            this.tileCacheCanvas,
            sx, sy, sWidth, sHeight,
            sx, sy, sWidth, sHeight
        );
    },

    /**
     * 地形を矩形の範囲だけ描き直して上に重ねる。町（建物・木・つらら）を機体より手前に描いたあと、
     * 床に埋めた土台・天井に刺さったつららの根元を岩の縁の奥に戻すためのもの。
     * 地形の絵はタイルのキャッシュ1枚で、空のタイルは透明なので、岩のある所だけが上書きされる
     * （draw と同じ drawImage を矩形ごとに1回。建物の外は描かないので機体の足元は変わらない）
     * @param {Array<{x:number,y:number,w:number,h:number}>} rects ワールド座標
     */
    drawTerrainOver(ctx, rects) {
        const W = this.width, H = this.height;
        for (const r of rects) {
            // drawImage は元の矩形がキャンバスの外に出ると描かないブラウザがあるので、盤面の内側に切る
            const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
            const x1 = Math.min(W, Math.ceil(r.x + r.w)), y1 = Math.min(H, Math.ceil(r.y + r.h));
            if (x1 <= x0 || y1 <= y0) continue;
            ctx.drawImage(this.tileCacheCanvas, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
        }
    },

    /**
     * タイル (r, c) を ctx の (c*S, r*S) に描く。種類ごとの絵の振り分けはここ1か所
     * （全面の描き直しと、壊れた周りの描き直しの両方がこれを呼ぶ）。
     * 要塞のパネル（金属と、要塞の中の硬い岩）は岩と別の絵（world/panelBlocks.js）。
     * 硬い岩は区画の外では普通の岩なので、区画の印（this.fortress）で振り分ける
     */
    _drawTile(ctx, r, c) {
        const block = this.grid[r][c];
        if (block === BLOCK_EMPTY) return;
        if (block === BLOCK_INDESTRUCTIBLE) {
            this._drawPolishedBlock(ctx, c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, this.blockStyles[block]);
        } else if (block === BLOCK_METAL || (block === BLOCK_HARD && this.fortress && this.fortress[r * this.cols + c])
            || (this.facility && this.facility[r * this.cols + c] === 1)) {
            // 7面の施設エリアは通常の岩もパネル（薄い板）で描く
            this._drawPanelBlock(ctx, r, c, block);
        } else {
            this._drawRockyBlock(ctx, r, c, block);
        }
    },

    /** 要塞のパネル（金属・装甲板）。空洞への露出・焼け・ダメージを集めて panelBlocks に渡す */
    _drawPanelBlock(ctx, r, c, block) {
        const S = TILE_SIZE;
        const empty = (rr, cc) => rr < 0 || cc < 0 || rr >= this.rows || cc >= this.cols || this.grid[rr][cc] === BLOCK_EMPTY;
        const exp = { t: empty(r - 1, c), b: empty(r + 1, c), l: empty(r, c - 1), r: empty(r, c + 1) };
        const rng = tileRng(r, c);
        const style = this.blockStyles[block];
        // 7面の施設エリアの斜面は形で描く（形の外は塗らない）。四角のタイルには渡さない
        const code = this.tileShapeRule === 'metalSlope' ? this.tileShapeAt(r, c) : SHAPE_FULL;
        const shape = code === SHAPE_FULL ? undefined : code;
        if (block === BLOCK_NORMAL) {
            // 薄い板の色は金属の色を暗くしたもの（同じ鋼の系統で、艶が無い）
            const metal = this.blockStyles[BLOCK_METAL].fill;
            const fill = withLuminance(metal, luminance(metal) * FACILITY_PLATE_DARKEN);
            drawPlatePanel(ctx, c * S, r * S, S, { fill, exp, rng, shape });
        } else if (block === BLOCK_METAL) {
            // 金属の焼け。0 = 無傷、1 = あと1発。色だけでなく艶も飛ばす（drawMetalPanel）
            const heat = (METAL_BLOCK_HP - this.blockHP[r][c]) / METAL_BLOCK_HP;
            const fill = heat > 0 ? lerpColor(style.fill, METAL_HEAT_COLOR, heat) : style.fill;
            drawMetalPanel(ctx, c * S, r * S, S, { fill, exp, seamLeft: plateBreaksLeft(r, c), heat, rng, shape });
        } else {
            drawArmorPanel(ctx, c * S, r * S, S, { fill: style.fill, exp, damage: HARD_BLOCK_HP - this.blockHP[r][c], rng, shape });
        }
    },

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
        // （雪の面だけ下で書き換えるので let。他の面では値も rng の消費順も従来どおり）
        let cTL = (expTop && expLeft) ? (4 + Math.floor(rng(90) * 6)) : 0;
        let cTR = (expTop && expRight) ? (4 + Math.floor(rng(91) * 6)) : 0;
        let cBR = (expBottom && expRight) ? (4 + Math.floor(rng(92) * 6)) : 0;
        let cBL = (expBottom && expLeft) ? (4 + Math.floor(rng(93) * 6)) : 0;

        // 形の規則が四角でない面（5面）は、当たり判定と同じタイルの形（utils/tileShape.js）の
        // 削り幅で輪郭を作る（設計 決定3「絵と判定は同じ形を共有する」）。坂はタイル1枚ぶんの斜め、
        // 浮いた板の先は上下の小さい面取りで「<」、単独のタイルは菱形になる。
        // 以前はここだけで階段を検出して坂・くの字を描き（判定は四角のまま）、自機の絵を描画
        // オフセットで斜辺へ下げていたが、壊した後に絵と判定が食い違って見えた。
        // 削り幅は形が決めるので、乱数の 4〜9px の面取りは5面では使わない（判定が 8px のため）
        // 7面（'metalSlope'）で削れるのは施設エリアの中だけで、そこはパネルの絵で描く（_drawTile）。
        // 岩の絵の面取りは今までどおり乱数の 4〜9px にする（形の削り幅 0 を読むと四角になる）
        const shaped = this.tileShapes && isRoundedRule(this.tileShapeRule);
        // 壊した後にだけ出る三角（^ v < >。設計 決定13）は、角の削り幅の列挙では辺が戻って自己交差するので、
        // 輪郭と雪のふちを shapeTriangle の頂点で書く
        let tri = null;
        if (shaped) {
            const code = this.tileShapeAt(r, c);
            const cuts = shapeCornerCuts(code);
            cTL = cuts.tl; cTR = cuts.tr; cBR = cuts.br; cBL = cuts.bl;
            tri = shapeTriangle(code);
        }

        // 凹角：両隣は塞がっているが斜め方向が空洞 → 影ノッチ
        const notchTL = !expTop && !expLeft && r > 0 && c > 0 && this.grid[r - 1][c - 1] === BLOCK_EMPTY;
        const notchTR = !expTop && !expRight && r > 0 && c < this.cols - 1 && this.grid[r - 1][c + 1] === BLOCK_EMPTY;
        const notchBL = !expBottom && !expLeft && r < this.rows - 1 && c > 0 && this.grid[r + 1][c - 1] === BLOCK_EMPTY;
        const notchBR = !expBottom && !expRight && r < this.rows - 1 && c < this.cols - 1 && this.grid[r + 1][c + 1] === BLOCK_EMPTY;

        // 1. 面取り多角形でベース塗り（時計回りで頂点列挙）
        ctx.save();
        ctx.beginPath();
        if (tri) {
            tri.poly.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(x + px, y + py) : ctx.lineTo(x + px, y + py)));
        } else {
            // 削り幅が 16（タイル1枚ぶんの斜め）でも同じ列挙で書ける。形の規則が、斜めにした角の
            // 隣の2角を削らない（tileShape.js の computeTileShape）ので、辺が戻って自己交差しない
            ctx.moveTo(x + cTL, y);                  // 上辺：左端（TL面取り分だけ右へ）
            ctx.lineTo(x + S - cTR, y);              // 上辺：右端
            if (cTR) ctx.lineTo(x + S, y + cTR);     // TR面取り斜線
            ctx.lineTo(x + S, y + S - cBR);          // 右辺：下端
            if (cBR) ctx.lineTo(x + S - cBR, y + S); // BR面取り斜線
            ctx.lineTo(x + cBL, y + S);              // 下辺：左端
            if (cBL) ctx.lineTo(x, y + S - cBL);     // BL面取り斜線
            ctx.lineTo(x, y + cTL);                  // 左辺：上端
            if (cTL) ctx.lineTo(x + cTL, y);         // TL面取り斜線（→ closePath と一致）
        }
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

            // 積雪の帯（5面）。生成時に露出していた上面にだけ。
            if (this.envKind === 'snow' && this.exposedAtGen && this.exposedAtGen[r * this.cols + c]) {
                // 帯は上面の輪郭（上の2角の切り口と上辺）に沿わせる。坂には水平な上面が無く、
                // 面取りの角では水平の帯だけだと雪が切り口で途切れて見える。
                // 線幅を倍にして clip の内側に残る半分だけを積雪の厚みとして使う
                ctx.strokeStyle = SNOW_CAP_COLOR;
                ctx.lineWidth = SNOW_CAP_THICKNESS * 2;
                ctx.beginPath();
                if (tri) {
                    tri.top.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(x + px, y + py) : ctx.lineTo(x + px, y + py)));
                } else {
                    ctx.moveTo(x, y + cTL);
                    ctx.lineTo(x + cTL, y);
                    ctx.lineTo(x + S - cTR, y);
                    ctx.lineTo(x + S, y + cTR);
                }
                ctx.stroke();
            }
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
    },

    /**
     * 壊せない装甲（地形の縁）の絵。1タイルごとに4辺へ面取りが付く磨かれた板。
     * 要塞の金属は以前これを共有していたが、並べるとボタンの格子に見えたので
     * world/panelBlocks.js の drawMetalPanel に分けた
     */
    _drawPolishedBlock(ctx, x, y, S, style = this.blockStyles[BLOCK_INDESTRUCTIBLE]) {
        const B = 3; // ベベル幅
        const gloss = 1;

        // ベース塗り
        ctx.fillStyle = style.fill;
        ctx.fillRect(x, y, S, S);

        // 上面ハイライト（光が当たる面）
        ctx.fillStyle = `rgba(255,255,255,${(0.38 * gloss).toFixed(3)})`;
        ctx.fillRect(x, y, S, B);
        // 左面ハイライト
        ctx.fillStyle = `rgba(255,255,255,${(0.22 * gloss).toFixed(3)})`;
        ctx.fillRect(x, y + B, B, S - B);

        // 下面シャドウ
        ctx.fillStyle = 'rgba(0,0,0,0.50)';
        ctx.fillRect(x, y + S - B, S, B);
        // 右面シャドウ
        ctx.fillStyle = 'rgba(0,0,0,0.34)';
        ctx.fillRect(x + S - B, y, B, S - B);

        // 内側の陰刻ライン（機械加工されたタイル感）
        ctx.strokeStyle = `rgba(255,255,255,${(0.13 * gloss).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + B + 0.5, y + B + 0.5, S - 2 * B - 1, S - 2 * B - 1);

        // 光沢スポット（左上に小さな鏡面ハイライト）
        const inner = S - 2 * B;
        ctx.fillStyle = `rgba(255,255,255,${(0.24 * gloss).toFixed(3)})`;
        ctx.fillRect(x + B, y + B, Math.ceil(inner * 0.55), Math.ceil(inner * 0.38));

        // エッジラインで個々のタイル境界をくっきり示す（焼けると縁の艶も落ちる）
        ctx.fillStyle = `rgba(255,255,255,${(0.62 * gloss).toFixed(3)})`;
        ctx.fillRect(x, y, S, 1);           // 上端
        ctx.fillRect(x, y, 1, S);           // 左端
        ctx.fillStyle = 'rgba(0,0,0,0.68)';
        ctx.fillRect(x, y + S - 1, S, 1);   // 下端
        ctx.fillRect(x + S - 1, y, 1, S);   // 右端
    },
};
