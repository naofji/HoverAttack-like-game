// ============================================
// EnemySpider - 6面の前半〜中盤の偵察の小型ロボ（床・壁・天井を這い、自機の頭上で破裂する弾を撃つ）
// ============================================
//
// 設計書 docs/superpowers/specs/2026-11-22-spider-enemy-design.md。
// 6面の後半を単調にしないこと、上からの弾を避けさせることがねらい（ユーザー）。
//
// 体は自機・アタッカーの歩く仕組み（walkerBody.js）を使わない。あちらは床の上を歩く前提で、
// 壁・天井を這わせると共有部品を曲げることになる。面に沿って進む規則は utils/surfaceCrawl.js に
// 純粋関数として置き、ここは「いつ走る・止まる・跳ぶ・糸を使う」の判断と、空中の動きだけを持つ。
//
// 動きはクモの「ダッと走る → ぴたっと止まる → 急に切り返す」と横跳び（2026-11-23 ユーザー指定。初めの一定速で
// 長く這う動きは「フナムシみたい」だった）。自機が見えると、ドローンと同じく自機から間合いを取った所へ走り寄り、
// 撃ったあとは横跳びで離れることがある。
//
// 判断の乱数は**湧いた場所から作った個体の乱数**（spawnStateRng）だけを使い、Math.random は使わない。
// 同じ週・同じ面・同じ場所のスパイダーは同じ動きをする（面別ランキングの公平さ。utils/spawnState.js）。

import {
    TILE_SIZE, SPIDER_SIZE, SPIDER_HP, SPIDER_SCORE,
    SPIDER_CRAWL_SPEED, SPIDER_CORNER_FRAMES, SPIDER_CONCAVE_FRAMES, SPIDER_CONCAVE_LIFT, SPIDER_RUN_FRAMES, SPIDER_PAUSE_FRAMES, SPIDER_TURN_CHANCE, SPIDER_JINK_CHANCE,
    SPIDER_ENGAGE_DIST_X, SPIDER_ENGAGE_DIST_Y, SPIDER_ENGAGE_JITTER, SPIDER_SEEK_DEADBAND,
    SPIDER_HOP_CHANCE, SPIDER_HOP_SPEED, SPIDER_HOP_SIDE_SPEED, SPIDER_HOP_GRAVITY, SPIDER_HOP_AFTER_FIRE_CHANCE,
    SPIDER_THREAD_CHANCE, SPIDER_THREAD_MAX_TILES, SPIDER_THREAD_SHOOT_FRAMES,
    SPIDER_THREAD_CLIMB_SPEED, SPIDER_THREAD_DESCEND_SPEED,
    SPIDER_LEAP_CHANCE, SPIDER_LEAP_MAX_TILES, SPIDER_LEAP_SPEED,
    SPIDER_AIRBORNE_MAX_FRAMES, SPIDER_HOP_MAX_FRAMES, SPIDER_FALL_GRAVITY, SPIDER_FALL_MAX,
    COLOR_SPIDER_THREAD,
    SPIDER_SIGHT_RANGE, SPIDER_FIRE_INTERVAL, SPIDER_FIRE_RETRY, SPIDER_FIRE_WINDUP, SPIDER_MUZZLE_OFFSET,
    SPIDER_SHELL_SPEED, SPIDER_SHELL_GRAVITY, SPIDER_SHELL_AIM_ABOVE,

} from '../utils/Constants.js';
import { stepCrawl, hasSupport, boxHitsSolid, downOf } from '../utils/surfaceCrawl.js';
import { spawnStateRng } from '../utils/spawnState.js';
import { applyDamage } from '../utils/damage.js';
import { playDestruction } from './destruction.js';
import { withinSight, hasLineOfSight } from '../utils/Physics.js';
import { sightScaleFor } from '../world/StageEnvironment.js';
import { solveLaunch, simulateShell } from '../utils/shellBallistics.js';
import { EnemyBurstShell } from './EnemyBurstShell.js';
import {
    SPIDER_LEG_COLOR, SPIDER_BODY_COLOR, SPIDER_PLATE_COLOR, SPIDER_EYE_COLOR,
} from './debris/spiderParts.js';

// 面ごとの絵の回転。絵は「下 = +y、前 = +x」で描き、張り付く面の向きへ回す
const ROTATION = { floor: 0, wallR: -Math.PI / 2, ceiling: Math.PI, wallL: Math.PI / 2 };

// 脚の付け根と足先の x（絵の座標、箱の中心が原点）。描画専用のパラメータなのでここに置く
const LEG_HIP_X = [-4, -1.5, 1.5, 4];
const LEG_FOOT_X = [-6, -2.5, 2.5, 6];

// 箱の端ちょうどは隣のタイルに入らない（surfaceCrawl.js と同じ半開区間の見方）
const EPS = 1e-6;

/** 角度を (−π, π] へ */
function wrapAngle(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a <= -Math.PI) a += 2 * Math.PI;
    return a;
}

/** [min, max] の範囲の整数を引く */
function pick(rng, [min, max]) {
    return min + Math.floor(rng.next() * (max - min + 1));
}

export class EnemySpider {
    /**
     * @param {object} game
     * @param {number} x 箱の左上
     * @param {number} y
     * @param {'floor'|'ceiling'|'wallL'|'wallR'} surface 張り付いている面
     */
    constructor(game, x, y, surface = 'floor') {
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = SPIDER_SIZE;
        this.height = SPIDER_SIZE;
        this.hp = SPIDER_HP;
        this.maxHp = this.hp;
        this.alive = true;

        this.rng = spawnStateRng(game, x, y);
        this.surface = surface;
        const dir = this.rng.next() < 0.5 ? 1 : -1;
        const down = downOf(surface);
        // 面に沿う向き（下と直交する軸）
        this.fwd = down.y !== 0 ? { x: dir, y: 0 } : { x: 0, y: dir };
        // 絵の向きを覚えておく（空中では面が無いので、最後に張り付いていた面で描く）
        this.drawSurface = surface;

        this.mode = 'crawl';
        this.modeTimer = pick(this.rng, SPIDER_RUN_FRAMES);
        this.vx = 0;
        this.vy = 0;
        this.airGravity = { x: 0, y: 0 };
        this.airFrames = 0;

        // 糸。thread の間だけ支点（天井の下面の点）を持つ
        this.threadAnchor = null;
        this.threadDir = 0;       // -1 = 登る、+1 = 降りる
        this.threadShoot = 0;     // 糸が伸びきるまでの残りフレーム

        this.walkPhase = 0;

        // 最初の発射までの時間も湧いた場所から決める（全員が同じ瞬間に撃ち始めないように）
        this.fireTimer = Math.floor(this.rng.next() * SPIDER_FIRE_INTERVAL);
    }

    _isSolid() {
        if (!this._solidFn) this._solidFn = (r, c) => this.game.map.isSolid(r, c);
        return this._solidFn;
    }

    _body() {
        return { x: this.x, y: this.y, size: SPIDER_SIZE, surface: this.surface, fwd: this.fwd };
    }

    update() {
        if (!this.alive) return;
        if (this._updateFire()) return;
        switch (this.mode) {
            case 'crawl': this._updateCrawl(); break;
            case 'pause': this._updatePause(); break;
            case 'hop':
            case 'leap':
            case 'fall': this._updateAirborne(); break;
            case 'thread': this._updateThread(); break;
            case 'corner': this._updateCorner(); break;
            default: break;
        }
    }

    // ------------------------------------------
    // 面の上
    // ------------------------------------------
    _updateCrawl() {
        const next = stepCrawl(this._isSolid(), this._body(), SPIDER_CRAWL_SPEED);
        if (next.surface === null) {
            this._startFall();
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
    }

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
    }

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
    }

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
    }

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
    }

    /** 理想の半円（0..π）のどこまで回ったか。t を省くと今のフレーム */
    _cornerProgress(t = this.corner.t) {
        const c = this.corner;
        return c.done + (Math.PI - c.done) * Math.min(1, t / c.frames);
    }

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
    }

    _reverse() {
        this.fwd = { x: -this.fwd.x || 0, y: -this.fwd.y || 0 };
    }

    /** @param {number} [maxFrames] 行き先までのフレーム数。走りの長さをこれで打ち切る */
    _startRun(maxFrames = Infinity) {
        this.mode = 'crawl';
        this.modeTimer = Math.max(1, Math.min(pick(this.rng, SPIDER_RUN_FRAMES), maxFrames));
    }

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
    }

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
    }

    _startPause() {
        this.mode = 'pause';
        this.modeTimer = pick(this.rng, SPIDER_PAUSE_FRAMES);
    }

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
    }

    /** 張り付いている面から離れる向き */
    _away() {
        const d = downOf(this.surface);
        return { x: -d.x || 0, y: -d.y || 0 };
    }

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
    }

    /** 床なら真上、天井なら真下の面までの距離（px）。糸が届かなければ null */
    _threadGap() {
        return this._gapAlong(this._away(), SPIDER_THREAD_MAX_TILES);
    }

    // ------------------------------------------
    // 空中（小ジャンプ・跳び移り・落下）
    // ------------------------------------------
    _startHop() {
        // 着地点に面が無ければ逆へ、どちらも無ければ跳ばずに止まる。横跳びにしたら、天井・壁の端を跳び越えて
        // 落ちるのが前の 3 倍近くに増え（本物の6面で 5 シード: 落下 284 → 797 回）、天井のスパイダーが頭上に残らなかった
        if (!this._hopLands(this.fwd)) {
            this._reverse();
            if (!this._hopLands(this.fwd)) {
                this._startPause();
                return;
            }
        }
        const away = this._away();
        this.mode = 'hop';
        // 横跳び（ユーザー指定）: 進む向きへ大きく、面から離れる向きへは少しだけ
        this.vx = away.x * SPIDER_HOP_SPEED + this.fwd.x * SPIDER_HOP_SIDE_SPEED;
        this.vy = away.y * SPIDER_HOP_SPEED + this.fwd.y * SPIDER_HOP_SIDE_SPEED;
        const d = downOf(this.surface);
        this.airGravity = { x: d.x * SPIDER_HOP_GRAVITY, y: d.y * SPIDER_HOP_GRAVITY };
        this._leaveSurface();
    }

    /**
     * dir へ横跳びしたとき、張り付ける所に降りるか。途中に岩（壁）があればそこへ張り付くので可、
     * 無ければ着地点（宙にいる時間 × 横の速さ ≈ 57px 先）の真下（面の向き）に足場があるか
     */
    _hopLands(dir) {
        const reach = SPIDER_HOP_SIDE_SPEED * (2 * SPIDER_HOP_SPEED / SPIDER_HOP_GRAVITY);
        if (this._gapAlong(dir, reach / TILE_SIZE) !== null) return true;
        const isSolid = this._isSolid();
        const body = { ...this._body(), x: this.x + dir.x * reach, y: this.y + dir.y * reach };
        return !boxHitsSolid(isSolid, body.x, body.y, SPIDER_SIZE) && hasSupport(isSolid, body);
    }

    _startLeap() {
        const away = this._away();
        this.mode = 'leap';
        this.vx = away.x * SPIDER_LEAP_SPEED;
        this.vy = away.y * SPIDER_LEAP_SPEED;
        this.airGravity = { x: 0, y: 0 };
        this._leaveSurface();
    }

    _startFall() {
        this.mode = 'fall';
        this.vx = 0;
        this.vy = Math.max(0, this.vy);
        this.airGravity = { x: 0, y: SPIDER_FALL_GRAVITY };
        this.threadAnchor = null;
        this._leaveSurface();
    }

    _leaveSurface() {
        if (this.surface) this.drawSurface = this.surface;
        this.surface = null;
        this.airFrames = 0;
    }

    _updateAirborne() {
        this.vx += this.airGravity.x;
        this.vy += this.airGravity.y;
        if (this.mode === 'fall') this.vy = Math.min(this.vy, SPIDER_FALL_MAX);
        const contact = this._moveAndCollide(this.vx, this.vy);
        if (contact) {
            this._attach(contact);
            return;
        }
        // 壁・天井の小ジャンプで面の端を越えると、面の向きの重力のまま戻ってこない。往復の時間を過ぎたら普通に落とす。
        // 跳び移りは向かいの壁があるのを確かめてから跳ぶので、長めの上限で足りる
        const limit = this.mode === 'hop' ? SPIDER_HOP_MAX_FRAMES : SPIDER_AIRBORNE_MAX_FRAMES;
        if (this.mode !== 'fall' && ++this.airFrames > limit) this._startFall();
    }

    /**
     * 軸ごとに動かし、岩に当たったらその手前（接する位置）で止める。
     * @returns {string|null} 当たった面（縦の当たりを優先）。当たらなければ null
     */
    _moveAndCollide(vx, vy) {
        const isSolid = this._isSolid();
        const T = TILE_SIZE;
        let hitX = null;
        let hitY = null;
        if (vx !== 0) {
            const nx = this.x + vx;
            if (boxHitsSolid(isSolid, nx, this.y, SPIDER_SIZE)) {
                this.x = vx > 0
                    ? Math.floor((nx + SPIDER_SIZE - EPS) / T) * T - SPIDER_SIZE
                    : (Math.floor(nx / T) + 1) * T;
                hitX = vx > 0 ? 'wallR' : 'wallL';
            } else {
                this.x = nx;
            }
        }
        if (vy !== 0) {
            const ny = this.y + vy;
            if (boxHitsSolid(isSolid, this.x, ny, SPIDER_SIZE)) {
                this.y = vy > 0
                    ? Math.floor((ny + SPIDER_SIZE - EPS) / T) * T - SPIDER_SIZE
                    : (Math.floor(ny / T) + 1) * T;
                hitY = vy > 0 ? 'floor' : 'ceiling';
            } else {
                this.y = ny;
            }
        }
        return hitY || hitX;
    }

    /** 当たった面に張り付く。進む向きは空中での流れの向きを引き継ぐ */
    _attach(surface) {
        const d = downOf(surface);
        if (d.y !== 0) {
            const sx = Math.sign(this.vx) || Math.sign(this.fwd.x) || 1;
            this.fwd = { x: sx, y: 0 };
        } else {
            const sy = Math.sign(this.vy) || Math.sign(this.fwd.y) || 1;
            this.fwd = { x: 0, y: sy };
        }
        this.surface = surface;
        this.drawSurface = surface;
        this.vx = 0;
        this.vy = 0;
        this.threadAnchor = null;
        this._startPause();
    }

    // ------------------------------------------
    // 糸（床 ⇄ 天井）
    // ------------------------------------------
    _startThread() {
        const gap = this._threadGap();
        if (gap === null) return;
        const cx = this.x + SPIDER_SIZE / 2;
        if (this.surface === 'floor') {
            // 支点は真上の天井の下面
            this.threadAnchor = { x: cx, y: this.y - gap };
            this.threadDir = -1;
        } else {
            // 天井から降りる。支点は今の天井の下面
            this.threadAnchor = { x: cx, y: this.y };
            this.threadDir = 1;
        }
        this.mode = 'thread';
        this.threadShoot = SPIDER_THREAD_SHOOT_FRAMES;
        this.vx = 0;
        this.vy = 0;
        this._leaveSurface();
    }

    _updateThread() {
        // 支点のタイル（天井）が壊されたら落ちる。糸そのものは切れない（ユーザー決定）
        const a = this.threadAnchor;
        if (!this.game.map.isSolid(Math.floor((a.y - 1) / TILE_SIZE), Math.floor(a.x / TILE_SIZE))) {
            this._startFall();
            return;
        }
        if (this.threadShoot > 0) {
            this.threadShoot--;
            return;
        }
        const speed = this.threadDir < 0 ? SPIDER_THREAD_CLIMB_SPEED : SPIDER_THREAD_DESCEND_SPEED;
        this.vy = this.threadDir * speed;
        const contact = this._moveAndCollide(0, this.vy);
        if (contact) this._attach(contact);
    }

    // ------------------------------------------
    // 撃つ
    // ------------------------------------------
    /**
     * 撃つ準備と発射。予備動作（windup）の間は移動を止めるので true を返す。
     * 面に張り付いていないとき（糸・小ジャンプ・跳び移り・落下）は撃たず、タイマーは 0 で待つ
     */
    _updateFire() {
        if (this.mode === 'windup') {
            if (!hasSupport(this._isSolid(), this._body())) {
                this._startFall();
                return true;
            }
            if (--this.modeTimer > 0) return true;
            // 止まっている間に自機が動いたので、狙いは撃つ瞬間に計算し直す
            const aim = this._aim();
            if (aim) {
                this.game.enemyBullets.push(new EnemyBurstShell(this.game, aim.x, aim.y, aim.angle, aim.target));
                this.fireTimer = SPIDER_FIRE_INTERVAL;
            } else {
                this.fireTimer = SPIDER_FIRE_RETRY;
            }
            // 撃ったら横跳びで離れることがある（ドローンの「撃ったらすぐ離れる」）。乱数は毎回 2 つ引く
            const hopRoll = this.rng.next();
            const dirRoll = this.rng.next();
            if (aim && hopRoll < SPIDER_HOP_AFTER_FIRE_CHANCE) {
                if (dirRoll < 0.5) this._reverse();
                this._startHop();
            } else {
                this._startPause();
            }
            return true;
        }
        if (this.fireTimer > 0) {
            this.fireTimer--;
            return false;
        }
        if (!this.surface || (this.mode !== 'crawl' && this.mode !== 'pause')) return false;
        if (!this._aim()) {
            this.fireTimer = SPIDER_FIRE_RETRY;
            return false;
        }
        this.mode = 'windup';
        this.modeTimer = SPIDER_FIRE_WINDUP;
        return true;
    }

    /**
     * 自機の頭上の点を通る低い弧。撃てない（見えない・遠い・どの高さにも届かない・途中に岩）なら null
     * @returns {{x:number, y:number, angle:number, target:{x:number, y:number, frames:number}}|null}
     */
    _aim() {
        const seen = this._seenPlayer();
        if (!seen) return null;
        const { cx, cy, pcx, pcy } = seen;
        const map = this.game.map;
        const away = this._away();
        const mx = cx + away.x * SPIDER_MUZZLE_OFFSET;
        const my = cy + away.y * SPIDER_MUZZLE_OFFSET;
        const tx = pcx;
        const ty = pcy - SPIDER_SHELL_AIM_ABOVE;
        if (map.isSolidAtPixel(tx, ty)) return null;
        const sol = solveLaunch(tx - mx, ty - my, SPIDER_SHELL_SPEED, SPIDER_SHELL_GRAVITY);
        if (!sol) return null;
        // 弧が途中で岩に当たるなら撃たない（無駄撃ちを避ける。建物は見ない＝当たれば破裂する）
        const pts = simulateShell(mx, my, sol.angle, SPIDER_SHELL_SPEED, SPIDER_SHELL_GRAVITY, sol.frames);
        if (pts.some((q) => map.isSolidAtPixel(q.x, q.y))) return null;
        return { x: mx, y: my, angle: sol.angle, target: { x: tx, y: ty, frames: sol.frames } };
    }

    // ------------------------------------------
    // 被弾・撃破
    // ------------------------------------------
    takeDamage(amount) {
        applyDamage(this, amount);
    }

    die() {
        this.alive = false;
        playDestruction(this.game, this, 'spider');
        this.game.addScore(SPIDER_SCORE);
    }

    // ------------------------------------------
    // 描画
    // ------------------------------------------
    /** 絵の回転（破片も読む）。空中では最後に張り付いていた面の向きで描く */
    _drawRotation() {
        if (this.mode === 'corner' && this.corner) {
            const c = this.corner;
            const frac = c.kind === 'concave' ? Math.min(1, c.t / c.frames) : this._cornerProgress() / Math.PI;
            return c.rot0 + c.rotSweep * frac;
        }
        return ROTATION[this.surface || this.drawSurface] || 0;
    }

    /** 進む向きが絵の「前」（回した +x）と逆なら左右反転（破片も読む） */
    _drawMirrored() {
        const r = this._drawRotation();
        return this.fwd.x * Math.cos(r) + this.fwd.y * Math.sin(r) < 0;
    }

    draw(ctx) {
        if (!this.alive) return;
        const half = SPIDER_SIZE / 2;
        const cx = this.x + half;
        const cy = this.y + half;

        // 糸は回す前に世界座標で描く（支点から体の中心まで。伸びている途中は途中まで）
        if (this.threadAnchor) {
            const a = this.threadAnchor;
            const k = 1 - this.threadShoot / SPIDER_THREAD_SHOOT_FRAMES;
            ctx.strokeStyle = COLOR_SPIDER_THREAD;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + (a.x - cx) * k, cy + (a.y - cy) * k);
            ctx.stroke();
        }

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this._drawRotation());
        if (this._drawMirrored()) ctx.scale(-1, 1);

        // 脚。付け根から膝（胴より上へ曲がる）を経て足先へ。歩くと足先が前後に揺れる
        ctx.strokeStyle = SPIDER_LEG_COLOR;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
            const swing = Math.sin(this.walkPhase + i * Math.PI / 2) * 1.2;
            const hx = LEG_HIP_X[i];
            const fx = LEG_FOOT_X[i] + swing;
            ctx.beginPath();
            ctx.moveTo(hx, -2);
            ctx.lineTo((hx + fx) / 2 + Math.sign(hx) * 1.5, -6);
            ctx.lineTo(fx, half);
            ctx.stroke();
        }

        // 胴・背の装甲板・目（破片パーツ spiderParts.js と同じ矩形）
        ctx.fillStyle = SPIDER_BODY_COLOR;
        ctx.fillRect(-5, -6, 10, 6);
        ctx.fillStyle = SPIDER_PLATE_COLOR;
        ctx.fillRect(-4, -7, 8, 2);
        ctx.fillStyle = SPIDER_EYE_COLOR;
        ctx.fillRect(2, -4, 3, 2);

        ctx.restore();
    }
}
