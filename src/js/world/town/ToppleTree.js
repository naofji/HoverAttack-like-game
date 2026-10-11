// ============================================
// ToppleTree - 幹が切れて倒れる雪の木の塊
// ============================================
//
// FallingPiece（支えを失って落ちる塊）の一種。ふつうの破片は落ち始めた最初のコマで床に触れて砕けるので、
// 根元で切れた木は倒れる間もなく雪の粒になって消えていた。こちらは「根元」（切れ目の中心）を軸に、真っ直ぐ立った
// 状態から傾き（傾くほど加速）、横たわってから薄れて消える。軸の下に足場が無ければ、傾きながら下へも落ちる。
//
// 軸は根元（塊の一番下の段のかけらの中心、下端の高さ）。最初は塊の外接矩形の下端の「倒れる側の角」を軸にした
// （箱が縁を軸に倒れる形。枝が床にめり込まず、横たわる角度も求めやすい）が、ユーザーに「根本を視点として傾いていく
// ように」と言われて直した: 角を軸にすると、倒れるにつれて木の根元が切り株から持ち上がり、木が箱のように
// 転がって見えた。根元を軸にすると、傾いた枝が床にめり込む（床の下に回った分は、地形の描画が上から隠す）。
// 横たわる角度は 90°（軸が地面の線の上に水平に寝る）。
// x, y は回す前の外接矩形の左上（描画補間 utils/renderInterp.js は x, y と theta を動かす）。
//
// 床・岩・切り株との当たり（軸が足場に乗っているか）と、粒の注文は Town が持つ。この塊は状態と絵だけ。

import { FallingPiece } from './FallingPiece.js';
import { CHUNK } from './chunks.js';
import {
    TOWN_FALL_GRAVITY, TOWN_FALL_MAX_SPEED,
    SNOWTREE_TOPPLE_ACCEL, SNOWTREE_TOPPLE_SEED, SNOWTREE_TOPPLE_LIE_TICKS,
} from '../../utils/Constants.js';

const QUARTER = Math.PI / 2;

export class ToppleTree extends FallingPiece {
    /**
     * @param {{lean: 1|-1, footX?: number}} opts lean: 倒れる向き（1 が右、-1 が左）。footX: 軸の x（塊の左端から px）。
     *   Town が切り株の真ん中（無ければ木の幹の x）を渡す。無ければ、塊の一番下の段のかけらから推す
     */
    constructor({ lean, footX, ...piece }) {
        super(piece);
        this.topple = true;
        this.lean = lean;
        // 軸（根元）の、外接矩形の中での位置（下端の高さ）。手がかり footX（切り株の真ん中。無ければ木の幹の x）が
        // あればそこ: 一番下の段のかけらの平均や、幹の横の枝の根元の連なりを軸にすると、軸が切り株から外れて
        // 切り株をすり抜けて落ちた（実測: 6px ずれた）。針葉樹の幹が丸ごと壊れて、一番下の段が枝の角だけでも、
        // 軸は幹のあった位置（塊が切り株の上に乗る）。手がかりが無いとき（テスト・道具）だけ、一番下の段のかけらのうち、
        // 塊全体の重心の x に一番近い連なり（幹）の真ん中
        if (footX !== undefined) {
            this.px = Math.min(this.width, Math.max(0, footX));
        } else {
            let mean = 0, count = 0;
            for (let k = 0; k < this.cells.length; k++) {
                if (this.cells[k]) { mean += ((k % this.cw) + 0.5) * CHUNK; count++; }
            }
            mean = count > 0 ? mean / count : this.width / 2;
            const last = this.ch - 1;
            let best = null;
            for (let i = 0; i < this.cw;) {
                if (!this.cells[last * this.cw + i]) { i++; continue; }
                const i0 = i;
                while (i < this.cw && this.cells[last * this.cw + i]) i++;
                const mid = ((i0 + i) / 2) * CHUNK;   // 連なりの真ん中（かけらの左端 i0 から右端 i まで）
                if (best === null || Math.abs(mid - mean) < Math.abs(best - mean)) best = mid;
            }
            this.px = best !== null ? best : this.width / 2;
        }
        this.py = this.height;
        this.theta = 0;       // 倒れた角度（0 = 立っている、π/2 = 横たわる）
        this.omega = 0;
        this.age = 0;         // 倒れ始めてからの tick（Town が雪をこぼす間隔に使う）
        this.lieLeft = -1;    // 横たわってから消えるまでの残り tick。-1 はまだ倒れている途中
        // 回した絵が届く範囲（Town.draw の画面外の判定）。軸の周りを外接矩形の対角線ぶん回る
        this.reach = 2 * Math.hypot(this.width, this.height);
    }

    get pivotX() { return this.x + this.px; }
    get pivotY() { return this.y + this.py; }
    get lying() { return this.lieLeft >= 0; }
    get done() { return this.lieLeft === 0; }
    /** 薄れ具合（1 = そのまま、0 = 消えた）。倒れているあいだは 1 */
    get alpha() { return this.lieLeft < 0 ? 1 : this.lieLeft / SNOWTREE_TOPPLE_LIE_TICKS; }

    /**
     * 1 tick 進める。supported は「軸の下に足場があるか」（Town が岩のタイルで確かめる）。
     * 倒れる角度は足場に関係なく進み、足場が無ければ軸が落ちる。横たわるのは、π/2 まで倒れて足場に乗ったとき
     * @returns {boolean} この tick で横たわった（粒を出す合図）
     */
    advance(supported) {
        this.age++;
        if (this.lying) {
            this.lieLeft--;
            return false;
        }
        if (this.theta < QUARTER) {
            this.omega += SNOWTREE_TOPPLE_ACCEL * (Math.sin(this.theta) + SNOWTREE_TOPPLE_SEED);
            this.theta = Math.min(QUARTER, this.theta + this.omega);
        }
        if (supported) {
            this.vy = 0;
        } else {
            this.vy = Math.min(TOWN_FALL_MAX_SPEED, this.vy + TOWN_FALL_GRAVITY);
            this.y += this.vy;
        }
        if (supported && this.theta >= QUARTER) {
            this.lieLeft = SNOWTREE_TOPPLE_LIE_TICKS;
            return true;
        }
        return false;
    }

    /** 軸（根元）から、倒れた塊の長さ方向（元の「上」）へ distance だけ進んだ点。横たわった木は地面の線に沿うので、粒を木に沿って出すのに使う */
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
