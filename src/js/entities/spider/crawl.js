// ============================================
// EnemySpider: 面を這う（走る・止まる・切り返す・角を回る・自機へ寄る）
// ============================================
//
// entities/EnemySpider.js から切り出した（2026-11-25、中身は動かしただけ）。attacker/ と同じく
// **EnemySpider.prototype へ Object.assign で混ぜる前提**のオブジェクトリテラルで、`this` はインスタンス。
// 毎フレームどの順で何を進めるかは EnemySpider.js の update() が唯一の記述。

import {
    TILE_SIZE, SPIDER_SIZE, SPIDER_CRAWL_SPEED, SPIDER_CORNER_FRAMES, SPIDER_CONCAVE_FRAMES,
    SPIDER_CONCAVE_LIFT, SPIDER_RUN_FRAMES, SPIDER_PAUSE_FRAMES, SPIDER_TURN_CHANCE, SPIDER_JINK_CHANCE,
    SPIDER_ENGAGE_DIST_X, SPIDER_ENGAGE_DIST_Y, SPIDER_ENGAGE_JITTER, SPIDER_SEEK_DEADBAND, SPIDER_HOP_CHANCE,
    SPIDER_THREAD_CHANCE, SPIDER_LEAP_CHANCE, SPIDER_LEAP_MAX_TILES, SPIDER_SIGHT_RANGE,
} from '../../utils/Constants.js';
import { stepCrawl, hasSupport, boxHitsSolid, downOf } from '../../utils/surfaceCrawl.js';
import { SHAPE_FULL } from '../../utils/tileShape.js';
import { withinSight, hasLineOfSight } from '../../utils/Physics.js';
import { sightScaleFor } from '../../world/StageEnvironment.js';

// 面ごとの絵の回転。絵は「下 = +y、前 = +x」で描き、張り付く面の向きへ回す
export const ROTATION = { floor: 0, wallR: -Math.PI / 2, ceiling: Math.PI, wallL: Math.PI / 2 };

/** 角度を (−π, π] へ */
function wrapAngle(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a <= -Math.PI) a += 2 * Math.PI;
    return a;
}

/** [min, max] の範囲の整数を引く */
export function pick(rng, [min, max]) {
    return min + Math.floor(rng.next() * (max - min + 1));
}

export const SpiderCrawl = {
    _isSolid() {
        if (!this._solidFn) this._solidFn = (r, c) => this.game.map.isSolid(r, c);
        return this._solidFn;
    },

    _body() {
        return { x: this.x, y: this.y, size: SPIDER_SIZE, surface: this.surface, fwd: this.fwd };
    },

    // ------------------------------------------
    // 面の上
    // ------------------------------------------
    _updateCrawl() {
        const next = stepCrawl(this._isSolid(), this._body(), SPIDER_CRAWL_SPEED);
        if (next.surface === null) {
            this._startFall();
            return;
        }
        // 形のある（斜面の）タイルへは這って入らず折り返す。スパイダーはタイル単位の岩の上を這うので、7面の金属の
        // 斜面に乗ると見える斜面から浮いて、四角い段の上を歩いて見える（2026-11-23、7面にも置くときに。本物の7面で
        // 這っている間の 2.3% が斜面の上だった）。すでに斜面の上（跳んで・糸で降りて乗った）なら、出られるようにそのまま
        if (this._onShapedTile(next) && !this._onShapedTile(this._body())) {
            this._reverse();
            if (--this.modeTimer <= 0) this._endRun();
            return;
        }
        // 出っ張った角（新しい前 = 元の下）は、1フレームで側面へ移さず回り込む
        const down = downOf(this.surface);
        if (next.surface !== this.surface && next.fwd.x === down.x && next.fwd.y === down.y) {
            this._startCorner(next);
            return;
        }
        // へこんだ角（新しい下 = 元の前）は、岩に接した位置でその場で体を起こす
        if (next.surface !== this.surface && next.fwd.x === -down.x && next.fwd.y === -down.y) {
            this._startConcave(next);
            return;
        }
        this.x = next.x;
        this.y = next.y;
        this.surface = next.surface;
        this.drawSurface = next.surface;
        this.fwd = next.fwd;
        // 脚の振り。速さに比例させると 4px で脚が回りすぎて見えないので、走っている間の一定の速さにした
        this.walkPhase += 1.2;
        if (--this.modeTimer <= 0) this._endRun();
    },

    /**
     * 出っ張った角を回り込む。stepCrawl が出した側面の位置 next へ、角の点 P を軸に体の中心を半円で動かす
     * （中心は P から 7√2 のまま、元の面の上 → 角の斜め外 → 側面）。絵は元の面の向きから新しい面の向きへ 90° 回す。
     * 半円の上ではどこでも箱は岩に入らない（箱が岩の側の象限に掛かるのは cos > 1/√2 かつ sin < −1/√2 のときで、両立しない）
     * @param {{x:number, y:number, surface:string, fwd:{x:number,y:number}}} next stepCrawl の回り込んだ後の体
     */
    _startCorner(next) {
        const h = SPIDER_SIZE / 2;
        const a0 = this._away();
        const f0 = this.fwd;
        const d1 = downOf(next.surface);
        const a1 = { x: -d1.x, y: -d1.y };
        const f1 = next.fwd;
        // 新しい位置の中心は P + h(a1 + f1)。そこから角の点を逆算する（next は stepCrawl がタイル境界に揃えた正確な値）
        const P = { x: next.x + h - h * (a1.x + f1.x), y: next.y + h - h * (a1.y + f1.y) };
        // 角を回る半円は、元の面の上で角に接する位置（中心 P + h(a0 − f0)）から、角の斜め外（a0 + f0 の向き）を通って
        // 側面の位置（P + h(a1 + f1)）まで。ただし箱は半分ほど角からはみ出すまで元の面に乗っていられるので、出発の角度は
        // 今の中心から取る（理想の出発点から回すと 7px 後ろへ跳んだ）。半径は 7√2 のまま（今の中心は角に近く、
        // その距離で回すと箱の角が岩に掛かる）。絵の回り方は、理想の半円のどこまで来たかに合わせる
        const thIdeal0 = Math.atan2(a0.y - f0.y, a0.x - f0.x);
        const thMid = Math.atan2(a0.y + f0.y, a0.x + f0.x);
        const dir = Math.sign(wrapAngle(thMid - thIdeal0));
        // 理想の出発点から回る向きに測った角度。わずかに手前（負）なら 0 とみなす（2π 近くと読んで回り終えたことにしない）
        const along = (a) => Math.max(0, wrapAngle(a - thIdeal0) * dir);
        const th0 = Math.atan2(this.y + h - P.y, this.x + h - P.x);
        const done = Math.min(along(th0), Math.PI);   // 理想の半円（π）のうち、もう回った分
        const rot0 = ROTATION[this.surface];
        const rotSweep = wrapAngle(ROTATION[next.surface] - rot0);
        this.corner = {
            P, r: h * Math.SQRT2, dir,
            thIdeal0, done, frames: Math.max(2, Math.round(SPIDER_CORNER_FRAMES * (Math.PI - done) / Math.PI)),
            rot0, rotSweep,
            next: { x: next.x, y: next.y, surface: next.surface, fwd: { ...next.fwd } },
            t: 0,
        };
        // 半円が岩に入らないのは、角のタイルのほかに岩が無いときだけ。1タイル幅の溝や、斜め外に別の岩がある所では
        // 半円の外側が向かいの岩に入った（本物の6面で 5 シード回して、めり込み 0 → 3766 フレーム）。
        // 回る前に全部の位置を確かめ、どこかで入るなら前のとおり1フレームで側面へ移す（狭い所で回れないだけ）
        const isSolid = this._isSolid();
        for (let t = 1; t < this.corner.frames; t++) {
            const q = this._cornerPos(t);
            if (boxHitsSolid(isSolid, q.x, q.y, SPIDER_SIZE)) {
                this.corner.t = this.corner.frames - 1;
                break;
            }
        }
        this.mode = 'corner';
        this._leaveSurface();
        this._updateCorner();
    },

    /**
     * へこんだ角で体を起こす。stepCrawl の next は岩に接した位置で、前後で箱は動かない（中心は両方の面から 7px）ので、
     * 絵だけを SPIDER_CONCAVE_FRAMES かけて 90° 回す。ただその場で回すと、45° のあたりで前の足先が
     * 斜めに伸びて岩へ 2px ほど入って見える。そこで回っている間は体を角から斜め外へ少し浮かせる
     * （SPIDER_CONCAVE_LIFT、真ん中で最大の山なり）。浮かせた位置が岩に入る狭い所では浮かせない
     * @param {{x:number, y:number, surface:string, fwd:{x:number,y:number}}} next stepCrawl の乗り換えた後の体
     */
    _startConcave(next) {
        const a0 = this._away();
        const f0 = this.fwd;
        // 角から離れる斜めの向き（元の面の上 a0 と、前の岩の反対 −f0 の和）
        const out = { x: (a0.x - f0.x) / Math.SQRT2, y: (a0.y - f0.y) / Math.SQRT2 };
        const rot0 = ROTATION[this.surface];
        this.corner = {
            kind: 'concave',
            base: { x: next.x, y: next.y }, out, lift: SPIDER_CONCAVE_LIFT,
            frames: SPIDER_CONCAVE_FRAMES,
            rot0, rotSweep: wrapAngle(ROTATION[next.surface] - rot0),
            next: { x: next.x, y: next.y, surface: next.surface, fwd: { ...next.fwd } },
            t: 0,
        };
        const isSolid = this._isSolid();
        for (let t = 1; t < this.corner.frames; t++) {
            const q = this._cornerPos(t);
            if (boxHitsSolid(isSolid, q.x, q.y, SPIDER_SIZE)) {
                this.corner.lift = 0;
                break;
            }
        }
        this.mode = 'corner';
        this._updateCorner();
    },

    /** 回り込みの t フレーム目の箱の左上 */
    _cornerPos(t) {
        const c = this.corner;
        if (c.kind === 'concave') {
            const k = c.lift * Math.sin(Math.PI * Math.min(1, t / c.frames));
            return { x: c.base.x + c.out.x * k, y: c.base.y + c.out.y * k };
        }
        const th = c.thIdeal0 + c.dir * this._cornerProgress(t);
        const h = SPIDER_SIZE / 2;
        return { x: c.P.x + c.r * Math.cos(th) - h, y: c.P.y + c.r * Math.sin(th) - h };
    },

    _updateCorner() {
        const c = this.corner;
        c.t++;
        this.walkPhase += 1.2;
        if (c.t >= c.frames) {
            const n = c.next;
            this.x = n.x;
            this.y = n.y;
            this.surface = n.surface;
            this.drawSurface = n.surface;
            this.fwd = n.fwd;
            this.corner = null;
            this.mode = 'crawl';   // 走りの残り（modeTimer）はそのまま続ける
            return;
        }
        // 回っている途中で岩ができることは無い（壊れて減るだけ）ので、始めに確かめた位置をそのままたどる
        const q = this._cornerPos(c.t);
        this.x = q.x;
        this.y = q.y;
    },

    /** 理想の半円（0..π）のどこまで回ったか。t を省くと今のフレーム */
    _cornerProgress(t = this.corner.t) {
        const c = this.corner;
        return c.done + (Math.PI - c.done) * Math.min(1, t / c.frames);
    },

    _updatePause() {
        if (!hasSupport(this._isSolid(), this._body())) {
            this._startFall();
            return;
        }
        if (--this.modeTimer > 0) return;
        // 乱数は自機が見えるかどうかに関係なく毎回同じ数だけ引く（_endRun と同じ理由）
        const turnRoll = this.rng.next();
        const jitterRoll = this.rng.next();
        const seek = this._seek(jitterRoll);
        if (seek && seek.dist > SPIDER_SEEK_DEADBAND) {
            this.fwd = seek.fwd;
            this._startRun(Math.ceil(seek.dist / SPIDER_CRAWL_SPEED));
            return;
        }
        // 見えない（行き先が無い）か、もう間合いの所にいる: その場で向きを変えることがある
        if (turnRoll < SPIDER_TURN_CHANCE) this._reverse();
        this._startRun();
    },

    _reverse() {
        this.fwd = { x: -this.fwd.x || 0, y: -this.fwd.y || 0 };
    },

    /** 体 body を支える面（下の 1px の帯）が、形のある（全部は埋まっていない）岩のタイルに掛かっているか */
    _onShapedTile(body) {
        const map = this.game.map;
        const d = downOf(body.surface);
        const n = SPIDER_SIZE;
        // 帯は下の向きの 1px 外側。帯が掛かるタイルの行・列の範囲
        const x0 = d.x < 0 ? body.x - 1 : d.x > 0 ? body.x + n : body.x;
        const x1 = d.x !== 0 ? x0 : body.x + n - 1;
        const y0 = d.y < 0 ? body.y - 1 : d.y > 0 ? body.y + n : body.y;
        const y1 = d.y !== 0 ? y0 : body.y + n - 1;
        for (let r = Math.floor(y0 / TILE_SIZE); r <= Math.floor(y1 / TILE_SIZE); r++) {
            for (let c = Math.floor(x0 / TILE_SIZE); c <= Math.floor(x1 / TILE_SIZE); c++) {
                if (map.isSolid(r, c) && map.tileShapeAt(r, c) !== SHAPE_FULL) return true;
            }
        }
        return false;
    },

    /** @param {number} [maxFrames] 行き先までのフレーム数。走りの長さをこれで打ち切る */
    _startRun(maxFrames = Infinity) {
        this.mode = 'crawl';
        this.modeTimer = Math.max(1, Math.min(pick(this.rng, SPIDER_RUN_FRAMES), maxFrames));
    },

    /**
     * 自機が見えるなら、ドローンの _startDash と同じく自機から間合いを取った行き先を決め、面に沿ったその向きと距離を返す。
     * 床・天井は横（自機の今いる側に ENGAGE_DIST_X）、壁は縦（自機より ENGAGE_DIST_Y 上）で測る。見えなければ null
     * @param {number} jitterRoll 0..1。行き先を ±JITTER/2 ずらす
     * @returns {{fwd:{x:number,y:number}, dist:number}|null}
     */
    _seek(jitterRoll) {
        const seen = this._seenPlayer();
        if (!seen) return null;
        const { cx, cy, pcx, pcy } = seen;
        const jitter = (jitterRoll - 0.5) * SPIDER_ENGAGE_JITTER;
        if (this.surface === 'floor' || this.surface === 'ceiling') {
            const side = Math.sign(cx - pcx) || 1;
            const d = pcx + side * SPIDER_ENGAGE_DIST_X + jitter - cx;
            return { fwd: { x: Math.sign(d) || 1, y: 0 }, dist: Math.abs(d) };
        }
        const d = pcy - SPIDER_ENGAGE_DIST_Y + jitter - cy;
        return { fwd: { x: 0, y: Math.sign(d) || 1 }, dist: Math.abs(d) };
    },

    /**
     * 自機が見えるか（索敵の楕円 × 霧の倍率、間に岩が無い）。見えれば体と自機の中心を返す
     * @returns {{cx:number, cy:number, pcx:number, pcy:number}|null}
     */
    _seenPlayer() {
        const p = this.game.player;
        if (!p || !p.alive || p.docked) return null;
        const half = SPIDER_SIZE / 2;
        const cx = this.x + half;
        const cy = this.y + half;
        const pcx = p.x + p.width / 2;
        const pcy = p.y + p.height / 2;
        if (!withinSight(pcx - cx, pcy - cy, SPIDER_SIGHT_RANGE * sightScaleFor(this.game))) return null;
        if (!hasLineOfSight(cx, cy, pcx, pcy, this.game.map)) return null;
        return { cx, cy, pcx, pcy };
    },

    _startPause() {
        this.mode = 'pause';
        this.modeTimer = pick(this.rng, SPIDER_PAUSE_FRAMES);
    },

    /**
     * 走り終わりに次の動きを決める。床・天井では糸、壁では跳び移りを先に引き、
     * 外れたら横跳び、それも外れたら切り返して走るか、止まる。乱数は「使えるかどうか」に関係なく毎回同じ数だけ引く
     * （地形の違いで引く回数が変わると、同じ場所のスパイダーでも以降の判断がずれていく）
     */
    _endRun() {
        const vertical = this.surface === 'floor' || this.surface === 'ceiling';
        const moveRoll = this.rng.next();
        const hopRoll = this.rng.next();
        const jinkRoll = this.rng.next();
        if (vertical && moveRoll < SPIDER_THREAD_CHANCE && this._threadGap() !== null) {
            this._startThread();
        } else if (!vertical && moveRoll < SPIDER_LEAP_CHANCE && this._gapAlong(this._away(), SPIDER_LEAP_MAX_TILES) !== null) {
            this._startLeap();
        } else if (hopRoll < SPIDER_HOP_CHANCE) {
            this._startHop();
        } else if (jinkRoll < SPIDER_JINK_CHANCE) {
            this._reverse();
            this._startRun();
        } else {
            this._startPause();
        }
    },

    /** 張り付いている面から離れる向き */
    _away() {
        const d = downOf(this.surface);
        return { x: -d.x || 0, y: -d.y || 0 };
    },

    /**
     * 箱を dir へ動かしていったとき、最大 maxTiles タイル以内に岩へ当たるなら、当たるまでの距離（px）。
     * 当たらなければ null。1px 刻みで見るのは、判断の瞬間だけで毎フレームではないから
     */
    _gapAlong(dir, maxTiles) {
        const isSolid = this._isSolid();
        const max = maxTiles * TILE_SIZE;
        for (let d = 1; d <= max; d++) {
            if (boxHitsSolid(isSolid, this.x + dir.x * d, this.y + dir.y * d, SPIDER_SIZE)) return d - 1;
        }
        return null;
    },
};
