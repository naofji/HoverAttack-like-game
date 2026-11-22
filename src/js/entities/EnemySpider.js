// ============================================
// EnemySpider - 6面の後半の小型ロボ（床・壁・天井を這い、自機の頭上で破裂する弾を撃つ）
// ============================================
//
// 設計書 docs/superpowers/specs/2026-11-22-spider-enemy-design.md。
// 6面の後半を単調にしないこと、上からの弾を避けさせることがねらい（ユーザー）。
//
// 体は自機・アタッカーの歩く仕組み（walkerBody.js）を使わない。あちらは床の上を歩く前提で、
// 壁・天井を這わせると共有部品を曲げることになる。面に沿って進む規則は utils/surfaceCrawl.js に
// 純粋関数として置き、ここは「いつ走る・止まる・跳ぶ・糸を使う」の判断と、空中の動きだけを持つ。
//
// 判断の乱数は**湧いた場所から作った個体の乱数**（spawnStateRng）だけを使い、Math.random は使わない。
// 同じ週・同じ面・同じ場所のスパイダーは同じ動きをする（面別ランキングの公平さ。utils/spawnState.js）。

import {
    TILE_SIZE, SPIDER_SIZE, SPIDER_HP, SPIDER_SCORE,
    SPIDER_CRAWL_SPEED, SPIDER_RUN_FRAMES, SPIDER_PAUSE_FRAMES, SPIDER_TURN_CHANCE,
    SPIDER_HOP_CHANCE, SPIDER_HOP_SPEED, SPIDER_HOP_GRAVITY,
    SPIDER_THREAD_CHANCE, SPIDER_THREAD_MAX_TILES, SPIDER_THREAD_SHOOT_FRAMES,
    SPIDER_THREAD_CLIMB_SPEED, SPIDER_THREAD_DESCEND_SPEED,
    SPIDER_LEAP_CHANCE, SPIDER_LEAP_MAX_TILES, SPIDER_LEAP_SPEED,
    SPIDER_AIRBORNE_MAX_FRAMES, SPIDER_FALL_GRAVITY, SPIDER_FALL_MAX,
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
        this.x = next.x;
        this.y = next.y;
        this.surface = next.surface;
        this.drawSurface = next.surface;
        this.fwd = next.fwd;
        this.walkPhase += SPIDER_CRAWL_SPEED * 0.5;
        if (--this.modeTimer <= 0) this._endRun();
    }

    _updatePause() {
        if (!hasSupport(this._isSolid(), this._body())) {
            this._startFall();
            return;
        }
        if (--this.modeTimer > 0) return;
        if (this.rng.next() < SPIDER_TURN_CHANCE) this.fwd = { x: -this.fwd.x || 0, y: -this.fwd.y || 0 };
        this._startRun();
    }

    _startRun() {
        this.mode = 'crawl';
        this.modeTimer = pick(this.rng, SPIDER_RUN_FRAMES);
    }

    _startPause() {
        this.mode = 'pause';
        this.modeTimer = pick(this.rng, SPIDER_PAUSE_FRAMES);
    }

    /**
     * 走り終わりに次の動きを決める。床・天井では糸、壁では跳び移りを先に引き、
     * 外れたら小ジャンプ、それも外れたら止まる。乱数は「使えるかどうか」に関係なく毎回同じ数だけ引く
     * （地形の違いで引く回数が変わると、同じ場所のスパイダーでも以降の判断がずれていく）
     */
    _endRun() {
        const vertical = this.surface === 'floor' || this.surface === 'ceiling';
        const moveRoll = this.rng.next();
        const hopRoll = this.rng.next();
        if (vertical && moveRoll < SPIDER_THREAD_CHANCE && this._threadGap() !== null) {
            this._startThread();
        } else if (!vertical && moveRoll < SPIDER_LEAP_CHANCE && this._gapAlong(this._away(), SPIDER_LEAP_MAX_TILES) !== null) {
            this._startLeap();
        } else if (hopRoll < SPIDER_HOP_CHANCE) {
            this._startHop();
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
        const away = this._away();
        this.mode = 'hop';
        // 面から離れつつ、進む向きへ少し流れる（その場で真上に跳ぶより生き物らしい）
        this.vx = away.x * SPIDER_HOP_SPEED + this.fwd.x * SPIDER_CRAWL_SPEED;
        this.vy = away.y * SPIDER_HOP_SPEED + this.fwd.y * SPIDER_CRAWL_SPEED;
        const d = downOf(this.surface);
        this.airGravity = { x: d.x * SPIDER_HOP_GRAVITY, y: d.y * SPIDER_HOP_GRAVITY };
        this._leaveSurface();
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
        // 壁の小ジャンプで面の外へ出ると、横向きの重力のまま戻ってこない。一定時間で普通に落とす
        if (this.mode !== 'fall' && ++this.airFrames > SPIDER_AIRBORNE_MAX_FRAMES) this._startFall();
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
            this._startPause();
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
     * 自機の頭上の点を通る低い弧。撃てない（見えない・遠い・届かない・途中に岩）なら null
     * @returns {{x:number, y:number, angle:number, target:{x:number, y:number, frames:number}}|null}
     */
    _aim() {
        const p = this.game.player;
        if (!p || !p.alive || p.docked) return null;
        const half = SPIDER_SIZE / 2;
        const cx = this.x + half;
        const cy = this.y + half;
        const pcx = p.x + p.width / 2;
        const pcy = p.y + p.height / 2;
        if (!withinSight(pcx - cx, pcy - cy, SPIDER_SIGHT_RANGE * sightScaleFor(this.game))) return null;
        const map = this.game.map;
        if (!hasLineOfSight(cx, cy, pcx, pcy, map)) return null;
        const away = this._away();
        const mx = cx + away.x * SPIDER_MUZZLE_OFFSET;
        const my = cy + away.y * SPIDER_MUZZLE_OFFSET;
        const tx = pcx;
        const ty = pcy - SPIDER_SHELL_AIM_ABOVE;
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
