// ============================================
// Map - 水の通知と問い合わせ（読む側）
// ============================================
//
// water[] から導く要約（waterKind / waterSurfaceY / waterPaintTopY / 泡）は、列ごとの
// dirty 印をつけておき、問い合わせの手前でまとめて作り直す（waterQuery.js の rebuildWaterCache）。
// **water[] を書いた処理は必ず onWaterChanged を通す**（通さないと要約と描画が古いまま残る。
// memory: lazy-cache-every-writer-notifies）。
//
// 水を進める側（水源の注ぎ足しとシミュレーションの1ステップ）は Map.js の update() に残している。
// 書く側と読む側を別のファイルに置いて、「書いたら通知」が守られているかを update() だけ見れば
// 確かめられるようにするため。
//
// **Map.prototype へ Object.assign で混ぜる前提**のオブジェクトリテラルで、`this` は
// Map のインスタンスを指す（理由は world/mapRender.js の冒頭）。Map.js を import しないこと。

import { TILE_SIZE, MIN_WATER_MASS } from '../utils/Constants.js';
import { rebuildWaterCache, WATER_NONE, WATER_SURFACE, WATER_FALL } from './waterQuery.js';

export const MapWater = {
    /**
     * 水量が変わったとき。派生キャッシュを dirty にする。
     * 描画キャッシュには直接知らせない — 描く直前に takeWaterRepaintCells で、作り直しで
     * 塗りの上端が変わったセルを引き取る。以前はここで描画側の invalidate を呼び、
     * 描画側が「水量が変わったセルの上下と同じ行の水面」を塗り直していたが、液面の平均が
     * 遠くまで動く形や、厚い岩の上の水で沈み判定が変わる形を取りこぼした
     */
    onWaterChanged(cells) {
        this._markWaterDirty(cells);
    },

    /** 変化したセルの「列」を覚えておく。作り直しは列単位で行う */
    _markWaterDirty(cells) {
        if (!this.water) return;
        for (const [, c] of cells) this.dirtyWaterCols.add(c);
    },

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
    },

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
    },

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
    },

    /**
     * セル (r, c) が泡のマスか（流れ落ちる満水のセルの真下の隙間。描画だけが泡の多い水として塗る）。
     * 種別は空気のままで、当たり判定は水にしない
     */
    isWaterFoam(r, c) {
        if (!this.water) return false;
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
        this._rebuildWaterCacheIfDirty();
        return this.waterFoam[r * this.cols + c] === 1;
    },

    /** 泡のマスの一覧 (r * cols + c)。描画が泡の粒を生む場所。マップ全体を走査せずに済むよう作り直しで保つ */
    getWaterFoamCells() {
        if (!this.water) return [];
        this._rebuildWaterCacheIfDirty();
        return this.waterFoamCells;
    },

    /** 水の純関数群に渡す isSolid。毎フレーム作り直さないよう1本を使い回す */
    _waterSolidFn() {
        if (!this._waterIsSolid) this._waterIsSolid = (r, c) => this.isSolid(r, c);
        return this._waterIsSolid;
    },

    isWater(r, c) {
        if (!this.water) return false;
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
        return this.water[r * this.cols + c] >= MIN_WATER_MASS;
    },

    /** セルが水面（水たまりの液面）を形成しているか */
    isWaterSurface(r, c) {
        if (!this.waterKind) return false;
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
        this._rebuildWaterCacheIfDirty();
        return this.waterKind[r * this.cols + c] === WATER_SURFACE;
    },

    /** セルが落下中の滝（水流）の中にあるか */
    isWaterfallCell(r, c) {
        if (!this.waterKind) return false;
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
        this._rebuildWaterCacheIfDirty();
        return this.waterKind[r * this.cols + c] === WATER_FALL;
    },

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
    },

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
    },

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
    },

    /** ピクセル座標が落下中の滝（水流）の中にあるか */
    isWaterfallAtPixel(x, y) {
        if (!this.water) return false;
        const r = Math.floor(y / TILE_SIZE);
        const c = Math.floor(x / TILE_SIZE);
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
        this._rebuildWaterCacheIfDirty();
        return this.waterKind[r * this.cols + c] === WATER_FALL;
    },
};
