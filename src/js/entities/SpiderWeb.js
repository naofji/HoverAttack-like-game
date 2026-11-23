// ============================================
// SpiderWeb - スパイダーの弾が割れて広がる糸（自機に絡まって動きを遅くする）
// ============================================
//
// 2026-11-23 ユーザー指定: 割れたら5発の普通の敵弾ではなく、5本の糸を広げて自機の動きを邪魔する。
// 糸は点線、絡む感じが出るよう隣り合う糸を横糸で結ぶ。当たってもダメージは無い（Player.entangle）。
//
// 割れた点から自機へ向けた扇に、縦糸が SPIDER_WEB_SPEED ずつ伸びる。岩・建物に当たった糸はそこで止まる。
// 横糸は中心から SPIDER_WEB_RING_STEP ごとの距離で、両隣の縦糸がそこまで伸びていれば結ぶ（扇を網で埋める。
// 縦糸だけだと 140px 先で糸と糸の間が 25px 空き、自機の幅 16 ならすり抜けられた）。
// 伸び切ったら（全部止まったら）SPIDER_WEB_FADE_FRAMES かけて薄れて消える。
//
// game.enemyBullets に入れる（更新・描画・面の切り替えでの片付けを普通の敵弾と共有するため）。
// 点の弾ではないので、CollisionManager は isSpiderWeb を見て、町・Orb の掃引と母艦への当たりを飛ばし、
// 自機への当たりは segments() の線分で見る（反射ビームと同じ作法）。

import {
    SPIDER_WEB_STRANDS, SPIDER_WEB_SPREAD, SPIDER_WEB_SPEED, SPIDER_WEB_MAX_LENGTH,
    SPIDER_WEB_RING_STEP, SPIDER_WEB_FADE_FRAMES, SPIDER_WEB_DASH, COLOR_SPIDER_WEB,
} from '../utils/Constants.js';

// 伸びる途中で岩・建物を見る刻み（px）。1 フレームの伸び（3）より細かく見て、先が壁へ入らないようにする
const PROBE_STEP = 1;

export class SpiderWeb {
    /**
     * @param {object} game
     * @param {number} x 割れた点
     * @param {number} y
     * @param {number} angle 扇の真ん中の向き（自機へ）
     */
    constructor(game, x, y, angle) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.isSpiderWeb = true;
        this.isPlayerOwned = false;
        this.alive = true;
        this.fade = 0;   // 伸び切ってから数える
        const n = SPIDER_WEB_STRANDS;
        this.strands = [];
        for (let i = 0; i < n; i++) {
            this.strands.push({
                angle: angle - SPIDER_WEB_SPREAD / 2 + (SPIDER_WEB_SPREAD * i) / (n - 1),
                len: 0,
                stopped: false,
            });
        }
    }

    update() {
        if (!this.alive) return;
        let growing = false;
        for (const s of this.strands) {
            if (s.stopped) continue;
            this._grow(s);
            if (!s.stopped) growing = true;
        }
        if (growing) return;
        if (++this.fade > SPIDER_WEB_FADE_FRAMES) this.alive = false;
    }

    /** 1本を SPEED だけ伸ばす。岩・建物の手前か、MAX_LENGTH で止める */
    _grow(s) {
        const target = Math.min(SPIDER_WEB_MAX_LENGTH, s.len + SPIDER_WEB_SPEED);
        const cos = Math.cos(s.angle);
        const sin = Math.sin(s.angle);
        let len = s.len;
        while (len < target) {
            const next = Math.min(target, len + PROBE_STEP);
            if (this._blocked(this.x + cos * next, this.y + sin * next)) {
                s.stopped = true;
                break;
            }
            len = next;
        }
        s.len = len;
        if (len >= SPIDER_WEB_MAX_LENGTH) s.stopped = true;
    }

    _blocked(x, y) {
        const map = this.game.map;
        if (map.isSolidAtPixel(x, y)) return true;
        const town = map.town;
        if (!town) return false;
        return town.buildingsAt(x, y).some((b) => {
            const k = town.cellAt(b, x, y);
            return k >= 0 && !!b.cells[k];
        });
    }

    /** 縦糸の、中心から r の点 */
    _point(s, r) {
        return { x: this.x + Math.cos(s.angle) * r, y: this.y + Math.sin(s.angle) * r };
    }

    /**
     * 当たり判定と描画が共有する線分（ここが食い違うと「見えているのに当たらない」になる）。
     * 縦糸 SPIDER_WEB_STRANDS 本（中心 → 先）と、横糸（隣り合う縦糸の同じ距離の点どうし）
     * @returns {{x1:number, y1:number, x2:number, y2:number}[]}
     */
    segments() {
        const out = [];
        for (const s of this.strands) {
            const t = this._point(s, s.len);
            out.push({ x1: this.x, y1: this.y, x2: t.x, y2: t.y });
        }
        for (let i = 0; i + 1 < this.strands.length; i++) {
            const a = this.strands[i];
            const b = this.strands[i + 1];
            const reach = Math.min(a.len, b.len);
            for (let r = SPIDER_WEB_RING_STEP; r <= reach + 1e-9; r += SPIDER_WEB_RING_STEP) {
                const p = this._point(a, r);
                const q = this._point(b, r);
                out.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y });
            }
        }
        return out;
    }

    draw(ctx) {
        if (!this.alive) return;
        ctx.save();
        ctx.globalAlpha = 1 - this.fade / (SPIDER_WEB_FADE_FRAMES + 1);
        ctx.strokeStyle = COLOR_SPIDER_WEB;
        ctx.lineWidth = 1;
        ctx.setLineDash(SPIDER_WEB_DASH);
        ctx.beginPath();
        for (const s of this.segments()) {
            ctx.moveTo(s.x1, s.y1);
            ctx.lineTo(s.x2, s.y2);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }
}
