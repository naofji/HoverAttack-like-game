// ============================================
// Map - ミニマップ（地形を 1タイル=2px に縮めた画像）
// ============================================
//
// 生成時に一度だけ miniMapCanvas へ描き、地形が壊れたら Map.js の invalidateTileRegion が
// miniMapDirty を立てて、ミニマップの画面（ui/screens/miniMap.js）が描く手前で refreshMiniMap が描き直す。
//
// **Map.prototype へ Object.assign で混ぜる前提**のオブジェクトリテラルで、`this` は
// Map のインスタンスを指す（理由は world/mapRender.js の冒頭）。Map.js を import しないこと。

import { COLOR_CAVE_BG, MINIMAP_SATURATION, MINIMAP_BRIGHTNESS } from '../utils/Constants.js';

export const MapMiniMap = {
    // ------------------------------------------
    // Mini-Map Generation
    // ------------------------------------------

    _generateMiniMap() {
        this.miniMapScale = 2; // 2 pixels per tile。drawMiniMap() 側の座標計算が前提にしているので変えない。
        this.miniMapCanvas = document.createElement('canvas');
        this.miniMapCanvas.width = this.cols * this.miniMapScale;
        this.miniMapCanvas.height = this.rows * this.miniMapScale;
        const ctx = this.miniMapCanvas.getContext('2d');

        // 実際の地形(tileCacheCanvas, TILE_SIZE=16px/タイル)を 2px/タイルへ縮小して
        // 焼くだけにする。以前はここで独自にタイルを fillRect し直していて、面取り
        // 多角形やひび割れ表現を持つ本編の見た目と食い違っていた。
        if (ctx.imageSmoothingQuality !== undefined) {
            ctx.imageSmoothingQuality = 'high';
        }
        this._applyMiniMapToning(ctx, () => {
            // 背景を先に塗る。tile cache は空きタイルを描かない(透明)ので、塗らないと
            // 縮小画像を重ねたときに背景が抜けて見える。
            //
            // ★ 背景の fillRect もこのコールバック(トーニングの対象)の中に入れる。
            // 以前は toning の外(if 分岐より前)で塗っていて、ctx.filter が使える環境
            // では filter が「これから描く内容」にしかかからないため tile cache だけが
            // トーニングされ、背景(COLOR_CAVE_BG)は無彩色化・減光されないまま透けて
            // 見えていた。一方フォールバック経路は draw() のあとキャンバス全体へ
            // ブレンドをかけるので、背景も一緒にトーニングされる — 同じ処理のはずが
            // 経路によって背景の暗さが変わっていた（レビュー指摘）。
            // COLOR_CAVE_BG はもともと暗いので実害は小さいが、意図しない差なので、
            // 「両経路とも背景を含めて全体にかける」方に統一する。tile cache 側だけに
            // 絞る案(フォールバックのブレンド範囲をタイル形状に切り抜く)は tile cache が
            // 空きタイル抜きの不定形で、クリップの組み方が複雑になり実装リスクが上がる
            // ため見送った。
            ctx.fillStyle = COLOR_CAVE_BG;
            ctx.fillRect(0, 0, this.miniMapCanvas.width, this.miniMapCanvas.height);

            ctx.drawImage(
                this.tileCacheCanvas,
                0, 0, this.width, this.height,
                0, 0, this.miniMapCanvas.width, this.miniMapCanvas.height
            );
        });

        this.miniMapDirty = false;
    },

    /**
     * 縮小した地形の彩度・明度を落として背景に沈める(前景の自機・敵の点を目立たせるため)。
     * `ctx.filter` が使える環境ではそれで一発、使えない環境向けにブレンドモードでの
     * フォールバックを用意する。draw はコールバックとして渡し、filter 適用中に呼ぶ。
     */
    _applyMiniMapToning(ctx, draw) {
        if (typeof ctx.filter === 'string') {
            const prevFilter = ctx.filter;
            ctx.filter = `saturate(${MINIMAP_SATURATION}) brightness(${MINIMAP_BRIGHTNESS})`;
            draw();
            ctx.filter = prevFilter;
            return;
        }

        // filter 非対応環境向け: ブレンドモードで代替する。
        // 'saturation' ブレンドは「色相・明度は背景(=描いた地形)から、彩度だけ描画色
        // (=灰色=無彩色)から取る」効果になるので、globalAlpha で不透明度を絞って
        // 元の彩度と無彩色の間を MINIMAP_SATURATION の割合で混ぜることで代用する。
        draw();
        const w = this.miniMapCanvas.width;
        const h = this.miniMapCanvas.height;

        ctx.save();
        ctx.globalCompositeOperation = 'saturation';
        ctx.globalAlpha = 1 - MINIMAP_SATURATION;
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();

        // 明度を落とす: 黒を半透明で重ねるだけの単純な近似(source-over)。
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1 - MINIMAP_BRIGHTNESS;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    },

    /**
     * ミニマップが「古い」場合だけ焼き直す。ScreenRenderer.drawMiniMap() が
     * 描画の直前に呼ぶ。閉じている間は焼かず、開いて描画するときに1回だけ焼き直す
     * ので、地形破壊がミニマップへ反映されつつ毎フレームのコストは増えない。
     */
    refreshMiniMap() {
        if (!this.miniMapDirty) return;
        this._generateMiniMap();
    },
};
