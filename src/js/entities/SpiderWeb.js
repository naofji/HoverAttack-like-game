// ============================================
// SpiderWeb - スパイダーの弾が割れて広がる糸（自機に絡まって動きを遅くする）
// ============================================
//
// 2026-11-23 ユーザー指定: 割れたら5発の普通の敵弾ではなく、5本の糸を広げて自機の動きを邪魔する。
// 糸は点線、絡む感じが出るよう隣り合う糸を横糸で結ぶ。当たってもダメージは無い（Player.entangle）。
// 同日の2回目の指定: 「柔らかな布のような糸が降り注いでくる感じ」「急に消えるのではなく覆い被さって消えていく」。
//
// 割れた点から自機へ向けた扇に、縦糸が初めは速く（SPEED_START）、伸びるにつれ遅く（SPEED_END まで）伸びる。岩・建物に当たった糸はそこで止まる。
// 糸はまっすぐ伸びず、中心からの距離の2乗で下へ垂れ（DROOP）、先ほど大きく揺れる（FLUTTER）。
// 垂れるぶんは扇を上へ向けて打ち消す（aimAngle）。
// 横糸は中心から SPIDER_WEB_RING_STEP ごとの距離で、両隣の縦糸がそこまで伸びていれば結び、真ん中をたるませる
// （扇を網で埋める。縦糸だけだと 140px 先で糸と糸の間が 25px 空き、自機の幅 16 ならすり抜けられた）。
// 割れた瞬間から起点ごと沈み（SINK_SPEED）、伸び切ったら（全部止まったら）SPIDER_WEB_FADE_FRAMES かけて薄れて消える。
// 自機に当たったら消さずに、WRAP_FRAMES かけて機体のまわりへ縮んで覆い被さり、薄れて消える
// （そのあいだに自機の側のまとわりつく糸＝player/draw.js の _drawWeb が育って、入れ替わる）。
//
// game.enemyBullets に入れる（更新・描画・面の切り替えでの片付けを普通の敵弾と共有するため）。
// 点の弾ではないので、CollisionManager は isSpiderWeb を見て、町・Orb の掃引と母艦への当たりを飛ばし、
// 自機への当たりは segments() の線分で見る（反射ビームと同じ作法）。

import {
    SPIDER_WEB_STRANDS, SPIDER_WEB_SPREAD, SPIDER_WEB_SPEED_START, SPIDER_WEB_SPEED_END, SPIDER_WEB_MAX_LENGTH,
    SPIDER_WEB_RING_STEP, SPIDER_WEB_FADE_FRAMES, SPIDER_WEB_DASH, COLOR_SPIDER_WEB,
    SPIDER_WEB_DROOP, SPIDER_WEB_FLUTTER, SPIDER_WEB_NODE_STEP, SPIDER_WEB_CROSS_SAG,
    SPIDER_WEB_SINK_SPEED, SPIDER_WEB_WRAP_FRAMES, SPIDER_WEB_CLING_RADIUS,
    SPIDER_WEB_SCRAPS, SPIDER_WEB_SCRAP_SPEED, SPIDER_WEB_SCRAP_DRAG, SPIDER_WEB_SCRAP_GRAVITY,
    SPIDER_WEB_SCRAP_LENGTH, SPIDER_WEB_SCRAP_LIFETIME,
} from '../utils/Constants.js';

// 伸びる途中で岩・建物を見る刻み（px）。1 フレームの伸び（最大 5）より細かく見て、先が壁へ入らないようにする
const PROBE_STEP = 1;
// 揺れの波（描画専用の見た目）。フレームあたりの位相の進みと、糸に沿った波の細かさ（rad/px）
const FLUTTER_RATE = 0.2;
const FLUTTER_WAVE = 0.06;
// 覆い被さった糸が集まる半径（CLING_RADIUS の内側。自機の側の糸と重なる大きさ）
const WRAP_GATHER = SPIDER_WEB_CLING_RADIUS * 0.9;
// 覆い被さり終わりの薄さ（ここから自機の側の糸に任せる）
const WRAP_END_ALPHA = 0.4;

/** 縦糸が r まで伸びるフレーム数（_grow と同じ速さの落ち方で数える。岩に止められない場合） */
function framesToReach(r) {
    let len = 0;
    let n = 0;
    while (len < r && len < SPIDER_WEB_MAX_LENGTH) {
        len += growSpeed(len);
        n++;
    }
    return n;
}

/** 伸びた長さ len での1フレームの伸び。START から、伸び切る長さで END まで比例して落ちる */
function growSpeed(len) {
    return SPIDER_WEB_SPEED_START + (SPIDER_WEB_SPEED_END - SPIDER_WEB_SPEED_START) * (len / SPIDER_WEB_MAX_LENGTH);
}

/** 中心から r の垂れ（下向き px）。r² に比例し、伸び切った長さで DROOP */
function droopAt(r) {
    const k = r / SPIDER_WEB_MAX_LENGTH;
    return SPIDER_WEB_DROOP * k * k;
}

export class SpiderWeb {
    /**
     * 真ん中の糸の伸びていく先が (tx, ty) を通る向き。まっすぐ狙うと、垂れるぶん（140px 先で約 12px）と、
     * そこまで伸びる間に沈むぶん（41 フレームで約 25px）足元へ外れる。
     * 狙う点をその合計だけ上げ、その点までの距離で測り直す（数回で収まる）
     */
    static aimAngle(x, y, tx, ty) {
        let aimY = ty;
        for (let i = 0; i < 6; i++) {
            const r = Math.hypot(tx - x, aimY - y);
            aimY = ty - droopAt(r) - framesToReach(r) * SPIDER_WEB_SINK_SPEED;
        }
        return Math.atan2(aimY - y, tx - x);
    }

    /**
     * @param {object} game
     * @param {number} x 割れた点
     * @param {number} y
     * @param {number} angle 扇の真ん中の向き（自機へ。垂れを打ち消すなら aimAngle で求める）
     */
    constructor(game, x, y, angle) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.isSpiderWeb = true;
        this.isPlayerOwned = false;
        this.alive = true;
        this.age = 0;
        this.fade = 0;          // 伸び切ってから数える
        this.wrapping = null;   // 自機に覆い被さっている間の状態（wrapOnto）
        this.originDrop = 0;    // 起点が沈んだ量（点ごとの沈みは _settle）
        const n = SPIDER_WEB_STRANDS;
        this.strands = [];
        for (let i = 0; i < n; i++) {
            this.strands.push({
                angle: angle - SPIDER_WEB_SPREAD / 2 + (SPIDER_WEB_SPREAD * i) / (n - 1),
                len: 0,
                stopped: false,
                phase: i * 1.9,   // 糸ごとに揺れをずらす（そろうと板が揺れているように見える）
                drops: [0],       // 中心から k*NODE_STEP の点が沈んだ量（[0] は起点＝originDrop を使う）
                tipDrop: 0,       // 先の点が沈んだ量
            });
        }
    }

    update() {
        if (!this.alive) return;
        this.age++;
        if (this.wrapping) {
            const w = this.wrapping;
            const p = w.player;
            if (p && p.alive) {
                w.cx = p.x + p.width / 2;
                w.cy = p.y + p.height / 2;
            }
            if (++w.t >= SPIDER_WEB_WRAP_FRAMES) this.alive = false;
            return;
        }
        let growing = false;
        for (const s of this.strands) {
            if (s.stopped) continue;
            this._grow(s);
            if (!s.stopped) growing = true;
        }
        this._settle();
        if (growing) return;
        if (++this.fade > SPIDER_WEB_FADE_FRAMES) this.alive = false;
    }

    /**
     * 自機に当たった（CollisionManager._updateSpiderWeb）。今の形を自機の中心からの位置で覚え、
     * WRAP_FRAMES かけて機体のまわり（WRAP_GATHER の内側）へ縮める。自機が動けばついて行く
     */
    wrapOnto(player) {
        if (this.wrapping) return;
        const cx = player.x + player.width / 2;
        const cy = player.y + player.height / 2;
        const toOffset = (x, y) => {
            const ox = x - cx;
            const oy = y - cy;
            const d = Math.hypot(ox, oy);
            const k = d > WRAP_GATHER ? WRAP_GATHER / d : 1;
            return { ox, oy, gx: ox * k, gy: oy * k };
        };
        const segs = this.segments().map((s) => ({ a: toOffset(s.x1, s.y1), b: toOffset(s.x2, s.y2), kind: s.kind }));
        this.wrapping = { t: 0, player, cx, cy, segs };
    }

    /**
     * 1本を伸ばす。速さは伸びた長さに比例して START から END へ落ちる（投げた布が広がりながら勢いを失う）。
     * 岩・建物の手前か、MAX_LENGTH で止める（揺れを除いた垂れた線で見る）
     */
    _grow(s) {
        const target = Math.min(SPIDER_WEB_MAX_LENGTH, s.len + growSpeed(s.len));
        const sink = this.sink;
        let len = s.len;
        while (len < target) {
            const next = Math.min(target, len + PROBE_STEP);
            const b = this._base(s, next);
            if (this._blocked(b.x, b.y + sink)) {
                s.stopped = true;
                break;
            }
            len = next;
        }
        s.len = len;
        if (len >= SPIDER_WEB_MAX_LENGTH) s.stopped = true;
        // 新しく伸びた点は、宙の沈み（今の sink）の高さに生える（そこが空いているのは上で確かめた）
        while (s.drops.length * SPIDER_WEB_NODE_STEP <= len) s.drops.push(sink);
        s.tipDrop = sink;
    }

    /**
     * 点ごとに沈める。宙の沈み（sink）まで、1フレームに SINK_SPEED ずつ追いつく。沈んだ先が岩・建物なら
     * その点はそこで止まる（床に着いた糸）。行き先だけを見て沈めると、薄い床（16px）をすり抜けて下へ出たので、
     * 点ごとに沈んだ量を覚えて少しずつ動かす
     */
    _settle() {
        const sink = this.sink;
        const step = (d, x, y) => {
            if (d >= sink - 1e-9) return d;
            const next = Math.min(sink, d + SPIDER_WEB_SINK_SPEED);
            return this._blocked(x, y + next) ? d : next;
        };
        this.originDrop = step(this.originDrop, this.x, this.y);
        for (const s of this.strands) {
            for (let k = 1; k < s.drops.length; k++) {
                const b = this._base(s, k * SPIDER_WEB_NODE_STEP);
                s.drops[k] = step(s.drops[k], b.x, b.y);
            }
            const t = this._base(s, s.len);
            s.tipDrop = step(s.tipDrop, t.x, t.y);
        }
    }

    /** 縦糸の、中心から r の点が沈んだ量。前後の点（起点・NODE_STEP ごとの点・先）の沈みを直線でつなぐ */
    _dropAt(s, r) {
        const nodeDrop = (k) => (k === 0 ? this.originDrop : s.drops[k]);
        const last = s.drops.length - 1;
        const lastR = last * SPIDER_WEB_NODE_STEP;
        if (r >= lastR) {
            const span = s.len - lastR;
            const u = span > 1e-9 ? Math.min(1, (r - lastR) / span) : 1;
            return nodeDrop(last) + (s.tipDrop - nodeDrop(last)) * u;
        }
        const k = Math.floor(r / SPIDER_WEB_NODE_STEP);
        const u = r / SPIDER_WEB_NODE_STEP - k;
        return nodeDrop(k) + (nodeDrop(k + 1) - nodeDrop(k)) * u;
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

    /**
     * 宙での沈み（px）。割れた瞬間から沈む（2026-11-23 ユーザー指定「拡がりきってからではなく、拡がる最中から」。
     * それまでは伸び切って薄れ始めてから沈めていた）。岩・建物に着いた点はそこで止まる（_settle）
     */
    get sink() {
        return this.age * SPIDER_WEB_SINK_SPEED;
    }

    /**
     * 起点（割れた点）。糸の点と同じだけ沈める。以前は起点だけ沈まず、起点のそばの糸が引き伸ばされて
     * 網がゆがんで見えた（2026-11-23 ユーザー指摘。「起点以外の変形は前のままでいい」）
     */
    origin() {
        return { x: this.x, y: this.y + this.originDrop };
    }

    /** 縦糸の、中心から r の点（垂れだけ。伸びるときに岩を見た線なので、ここは必ず空いている） */
    _base(s, r) {
        return {
            x: this.x + Math.cos(s.angle) * r,
            y: this.y + Math.sin(s.angle) * r + droopAt(r),
        };
    }

    /**
     * 縦糸の、中心から r の点。垂れ＋揺れ＋沈み（_dropAt）。揺れで岩・建物に入るなら揺れを外す
     */
    pointAt(s, r) {
        const b = this._base(s, r);
        const k = r / SPIDER_WEB_MAX_LENGTH;
        const wave = SPIDER_WEB_FLUTTER * k * Math.sin(this.age * FLUTTER_RATE - r * FLUTTER_WAVE + s.phase);
        // 糸に直交する向きへ揺らす
        const fx = b.x - Math.sin(s.angle) * wave;
        const fy = b.y + Math.cos(s.angle) * wave;
        const d = this._dropAt(s, r);
        if (!this._blocked(fx, fy + d)) return { x: fx, y: fy + d };
        return { x: b.x, y: b.y + d };
    }

    /**
     * 当たり判定と描画が共有する線分（ここが食い違うと「見えているのに当たらない」になる）。
     * 縦糸（中心 → 先の折れ線、NODE_STEP 刻み、kind 'radial'）と、
     * 横糸（隣り合う縦糸の同じ距離の点どうしを、真ん中をたるませた2本で、kind 'cross'）。
     * 覆い被さっている間は、覚えた線分を機体のまわりへ縮めたもの
     * @returns {{x1:number, y1:number, x2:number, y2:number, kind:string}[]}
     */
    segments() {
        if (this.wrapping) return this._wrapSegments();
        const out = [];
        for (const s of this.strands) {
            let prev = this.origin();
            for (let r = SPIDER_WEB_NODE_STEP; ; r += SPIDER_WEB_NODE_STEP) {
                const rr = Math.min(r, s.len);
                if (rr <= 0) break;
                const q = this.pointAt(s, rr);
                out.push({ x1: prev.x, y1: prev.y, x2: q.x, y2: q.y, kind: 'radial' });
                prev = q;
                if (rr >= s.len) break;
            }
        }
        for (let i = 0; i + 1 < this.strands.length; i++) {
            const a = this.strands[i];
            const b = this.strands[i + 1];
            const reach = Math.min(a.len, b.len);
            for (let r = SPIDER_WEB_RING_STEP; r <= reach + 1e-9; r += SPIDER_WEB_RING_STEP) {
                const p = this.pointAt(a, r);
                const q = this.pointAt(b, r);
                const mx = (p.x + q.x) / 2;
                let my = (p.y + q.y) / 2 + SPIDER_WEB_CROSS_SAG;
                if (this._blocked(mx, my)) my -= SPIDER_WEB_CROSS_SAG;
                out.push({ x1: p.x, y1: p.y, x2: mx, y2: my, kind: 'cross' });
                out.push({ x1: mx, y1: my, x2: q.x, y2: q.y, kind: 'cross' });
            }
        }
        return out;
    }

    /** 覆い被さっている途中の線分。はじめ速く、機体に近づくほどゆっくり（布がふわっと被さる） */
    _wrapSegments() {
        const w = this.wrapping;
        const u = Math.min(1, w.t / SPIDER_WEB_WRAP_FRAMES);
        const e = 1 - (1 - u) ** 3;
        const at = (o) => ({ x: w.cx + o.ox + (o.gx - o.ox) * e, y: w.cy + o.oy + (o.gy - o.oy) * e });
        return w.segs.map((s) => {
            const a = at(s.a);
            const b = at(s.b);
            return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, kind: s.kind };
        });
    }

    draw(ctx) {
        if (!this.alive) return;
        ctx.save();
        ctx.globalAlpha = this.wrapping
            ? 1 - (1 - WRAP_END_ALPHA) * (this.wrapping.t / SPIDER_WEB_WRAP_FRAMES)
            : 1 - this.fade / (SPIDER_WEB_FADE_FRAMES + 1);
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

/**
 * 振りほどいたときに飛び散る糸の切れ端（2026-11-23 ユーザー指定）。game.particles に入る。
 * 短い曲がった糸で、くるくる回り、丸まり具合が揺れる。外へ飛んでから空気に押されてすぐ遅くなり、
 * 軽く落ちながら薄れる（布の切れ端なので、重力は弱く、DRAG で落ちる速さも頭打ちになる）
 */
export class WebScrap {
    /**
     * 絡まった機体のまわり（中心 cx, cy・半径 radius）から SPIDER_WEB_SCRAPS 本を散らす。
     * 向きは等分に散らし、phase で回して毎回違って見せる（Math.random を使わない＝テストで決まる）。
     * 揺さぶった向き dir の反対へ少し寄せる（機体が切り返した反動で、糸が置いていかれる）
     */
    static scatter(game, cx, cy, radius, dir, phase) {
        if (!game || !Array.isArray(game.particles)) return;
        const n = SPIDER_WEB_SCRAPS;
        for (let i = 0; i < n; i++) {
            const a = phase + (i * 2 * Math.PI) / n;
            const ux = Math.cos(a);
            const uy = Math.sin(a);
            game.particles.push(new WebScrap(
                cx + ux * radius, cy + uy * radius,
                ux * SPIDER_WEB_SCRAP_SPEED - dir * 0.6, uy * SPIDER_WEB_SCRAP_SPEED - 0.4,
                a + Math.PI / 2, i * 2.1,
            ));
        }
    }

    constructor(x, y, vx, vy, angle, phase = 0) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.angle = angle;
        this.spin = (phase % 2 < 1 ? 1 : -1) * 0.12;
        this.phase = phase;
        this.age = 0;
        this.alive = true;
    }

    update() {
        if (!this.alive) return;
        this.vx *= SPIDER_WEB_SCRAP_DRAG;
        this.vy = this.vy * SPIDER_WEB_SCRAP_DRAG + SPIDER_WEB_SCRAP_GRAVITY;
        this.x += this.vx;
        this.y += this.vy;
        this.angle += this.spin;
        if (++this.age >= SPIDER_WEB_SCRAP_LIFETIME) this.alive = false;
    }

    draw(ctx) {
        if (!this.alive) return;
        const h = SPIDER_WEB_SCRAP_LENGTH / 2;
        const ux = Math.cos(this.angle);
        const uy = Math.sin(this.angle);
        const curl = 2.5 * Math.sin(this.age * 0.3 + this.phase);   // 丸まり具合が揺れる
        ctx.save();
        ctx.globalAlpha = 1 - this.age / SPIDER_WEB_SCRAP_LIFETIME;
        ctx.strokeStyle = COLOR_SPIDER_WEB;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.x - ux * h, this.y - uy * h);
        ctx.quadraticCurveTo(this.x - uy * curl, this.y + ux * curl, this.x + ux * h, this.y + uy * h);
        ctx.stroke();
        ctx.restore();
    }
}
