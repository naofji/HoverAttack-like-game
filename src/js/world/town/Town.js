// ============================================
// Town - 3面の町並み
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md
// 建物1棟ごとに canvas を1枚焼き、毎フレームは画面に掛かる建物を drawImage で
// 貼るだけにする（案1。町全体を1枚に焼く案は、段2で崩れ落ちる部分を毎回
// 大きな絵から切り出すことになるので採らなかった）。
// 段1は置いて描くだけ。段2以降はこの buildings の cells / anchors を読み書きする。
//
// 描く場所は main._drawWorld の「遠景のあと・地形の前」。土台は岩の縁の奥に隠れ、
// 機体や弾は必ず建物より手前に出る。

import { rasterizeParts, computeAnchors } from './chunks.js';
import { paintParts } from './shapes.js';

function defaultCreateCanvas(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    return cv;
}

export class Town {
    /**
     * @param {Array<object>} specs generateTown() の設計図
     * @param {{isSolidTile?: (r:number, c:number) => boolean, createCanvas?: (w:number, h:number) => object}} [opts]
     */
    constructor(specs, { isSolidTile = () => false, createCanvas = defaultCreateCanvas } = {}) {
        this.buildings = specs.map((spec, id) => {
            const { cells, cw, ch } = rasterizeParts(spec.parts, spec.w, spec.h);
            const canvas = createCanvas(spec.w, spec.h);
            paintParts(canvas.getContext('2d'), spec.parts);
            return {
                id, site: spec.site, style: spec.style, kind: spec.kind,
                x: spec.x, y: spec.y, width: spec.w, height: spec.h,
                cells, cw, ch,
                anchors: computeAnchors(cells, cw, ch, spec.x, spec.y, isSolidTile),
                canvas,
            };
        });
    }

    /**
     * 画面に掛かる建物だけを描く。ctx はワールド座標に translate 済み。
     * 判定は外接矩形の重なり（utils/viewCull.js の isInView は外接円で取るので、
     * 縦長の塔では余分に描く。数百棟を毎フレーム見るので矩形で足りる）。
     * @param {{x:number, y:number, w:number, h:number}} view 画面のワールド矩形
     */
    draw(ctx, view) {
        const x1 = view.x + view.w;
        const y1 = view.y + view.h;
        for (const b of this.buildings) {
            if (b.x >= x1 || b.x + b.width <= view.x || b.y >= y1 || b.y + b.height <= view.y) continue;
            ctx.drawImage(b.canvas, b.x, b.y);
        }
    }
}
