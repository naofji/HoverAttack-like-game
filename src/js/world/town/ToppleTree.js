// ============================================
// ToppleTree - 幹が切れて倒れる雪の木の塊
// ============================================
//
// FallingPiece（支えを失って落ちる塊）の一種。ふつうの破片は落ち始めた最初のコマで床に触れて砕けるので、
// 根元で切れた木は倒れる間もなく雪の粒になって消えていた。こちらは「切れ目の下端の角」を軸に、真っ直ぐ立った
// 状態から傾き（傾くほど加速）、横たわってから薄れて消える。軸の下に足場が無ければ、傾きながら下へも落ちる。
//
// 軸を塊の外接矩形の下端の「倒れる側の角」にしたのは、箱が縁を軸に倒れるのと同じで、回しても塊のどの点も
// 軸を通る水平線より下に出ないため（軸を幹の真下にすると、傾いた枝が床にめり込み、地形の描画の下に隠れて半分消えて見えた）。
// x, y は回す前の外接矩形の左上（描画補間 utils/renderInterp.js は x, y だけを動かす）。
//
// 床・岩との当たり（軸が足場に乗っているか）と、粒の注文は Town が持つ。この塊は状態と絵だけ。

import { FallingPiece } from './FallingPiece.js';
import { CHUNK } from './chunks.js';
import {
    TOWN_FALL_GRAVITY, TOWN_FALL_MAX_SPEED,
    SNOWTREE_TOPPLE_ACCEL, SNOWTREE_TOPPLE_SEED, SNOWTREE_TOPPLE_LIE_TICKS,
} from '../../utils/Constants.js';

const QUARTER = Math.PI / 2;
// 横たわる角度の上限（π/2 から先へ、先端が地面に着くまで進める。薄い木で軸が大きく傾いても 135° まで）
const LIE_MAX = (3 * Math.PI) / 4;
const LIE_SCAN = Math.PI / 360;   // 0.5° 刻みで探す

export class ToppleTree extends FallingPiece {
    /** @param {{lean: 1|-1}} opts lean: 倒れる向き。1 が右、-1 が左 */
    constructor({ lean, ...piece }) {
        super(piece);
        this.topple = true;
        this.lean = lean;
        // 軸の、外接矩形の中での位置
        this.px = lean > 0 ? this.width : 0;
        this.py = this.height;
        this.theta = 0;       // 倒れた角度（0 = 立っている、thetaMax = 横たわる）
        this.thetaMax = this._lyingAngle();
        this.omega = 0;
        this.lieLeft = -1;    // 横たわってから消えるまでの残り tick。-1 はまだ倒れている途中
        // 回した絵が届く範囲（Town.draw の画面外の判定）。軸の周りを外接矩形の対角線ぶん回る
        this.reach = 2 * Math.hypot(this.width, this.height);
    }

    /**
     * 横たわる角度。90° で止めると、円錐形の木は先端が軸の高さ（枝の広がりの半分）で宙に浮いたまま横たわる
     * （実際に PNG にして見つけた: 幅 40・高さ 60 の針葉樹で約 20px 浮いた）。軸の角から見て、かけらの中心が
     * 全部、軸を通る水平線の上にある最大の角度まで進める。90° では箱の性質で必ず全部が線の上にあり、
     * それより先は点ごとに単調に下がるので、0.5° 刻みの走査で足りる
     */
    _lyingAngle() {
        const pts = [];
        for (let k = 0; k < this.cells.length; k++) {
            if (!this.cells[k]) continue;
            const i = k % this.cw, j = (k - i) / this.cw;
            pts.push([this.lean * ((i + 0.5) * CHUNK - this.px), (j + 0.5) * CHUNK - this.py + CHUNK / 2]);   // 下端（かけらの中心 + 半分）
        }
        let theta = QUARTER;
        while (theta + LIE_SCAN <= LIE_MAX) {
            const next = theta + LIE_SCAN;
            const s = Math.sin(next), c = Math.cos(next);
            if (pts.some(([u, v]) => u * s + v * c > 0)) break;
            theta = next;
        }
        return theta;
    }

    get pivotX() { return this.x + this.px; }
    get pivotY() { return this.y + this.py; }
    get lying() { return this.lieLeft >= 0; }
    get done() { return this.lieLeft === 0; }
    /** 薄れ具合（1 = そのまま、0 = 消えた）。倒れているあいだは 1 */
    get alpha() { return this.lieLeft < 0 ? 1 : this.lieLeft / SNOWTREE_TOPPLE_LIE_TICKS; }

    /**
     * 1 tick 進める。supported は「軸の下に足場があるか」（Town が岩のタイルで確かめる）。
     * 倒れる角度は足場に関係なく進み、足場が無ければ軸が落ちる。横たわるのは、thetaMax まで倒れて足場に乗ったとき
     * @returns {boolean} この tick で横たわった（粒を出す合図）
     */
    advance(supported) {
        if (this.lying) {
            this.lieLeft--;
            return false;
        }
        if (this.theta < this.thetaMax) {
            this.omega += SNOWTREE_TOPPLE_ACCEL * (Math.sin(this.theta) + SNOWTREE_TOPPLE_SEED);
            this.theta = Math.min(this.thetaMax, this.theta + this.omega);
        }
        if (supported) {
            this.vy = 0;
        } else {
            this.vy = Math.min(TOWN_FALL_MAX_SPEED, this.vy + TOWN_FALL_GRAVITY);
            this.y += this.vy;
        }
        if (supported && this.theta >= this.thetaMax) {
            this.lieLeft = SNOWTREE_TOPPLE_LIE_TICKS;
            return true;
        }
        return false;
    }

    /** 軸の角から、倒れた塊の長さ方向（元の「上」）へ distance だけ進んだ点。横たわった木は地面の線に沿うので、粒を木に沿って出すのに使う */
    pointAlong(distance) {
        const a = this.lean * this.theta;
        return { x: this.pivotX + Math.sin(a) * distance, y: this.pivotY - Math.cos(a) * distance };
    }

    draw(ctx) {
        ctx.save();
        if (this.alpha < 1) ctx.globalAlpha = this.alpha;
        ctx.translate(this.pivotX, this.pivotY);
        ctx.rotate(this.lean * this.theta);
        ctx.drawImage(this.canvas, -this.px, -this.py);
        ctx.restore();
    }
}
