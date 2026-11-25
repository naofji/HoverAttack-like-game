// ============================================
// EnemySpider: 面を離れる動き（横跳び・跳び移り・落ちる・糸で登り降りする・張り付く）
// ============================================
//
// entities/EnemySpider.js から切り出した（2026-11-25、中身は動かしただけ）。attacker/ と同じく
// **EnemySpider.prototype へ Object.assign で混ぜる前提**のオブジェクトリテラルで、`this` はインスタンス。
// 毎フレームどの順で何を進めるかは EnemySpider.js の update() が唯一の記述。

import {
    TILE_SIZE, SPIDER_SIZE, SPIDER_HOP_SPEED, SPIDER_HOP_SIDE_SPEED, SPIDER_HOP_GRAVITY,
    SPIDER_THREAD_MAX_TILES, SPIDER_THREAD_SHOOT_FRAMES, SPIDER_THREAD_CLIMB_SPEED,
    SPIDER_THREAD_DESCEND_SPEED, SPIDER_LEAP_SPEED, SPIDER_AIRBORNE_MAX_FRAMES, SPIDER_HOP_MAX_FRAMES,
    SPIDER_FALL_GRAVITY, SPIDER_FALL_MAX,
} from '../../utils/Constants.js';
import { hasSupport, boxHitsSolid, downOf } from '../../utils/surfaceCrawl.js';

// 箱の端ちょうどは隣のタイルに入らない（surfaceCrawl.js と同じ半開区間の見方）
const EPS = 1e-6;

export const SpiderAir = {
    /** 床なら真上、天井なら真下の面までの距離（px）。糸が届かなければ null */
    _threadGap() {
        return this._gapAlong(this._away(), SPIDER_THREAD_MAX_TILES);
    },

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
    },

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
    },

    _startLeap() {
        const away = this._away();
        this.mode = 'leap';
        this.vx = away.x * SPIDER_LEAP_SPEED;
        this.vy = away.y * SPIDER_LEAP_SPEED;
        this.airGravity = { x: 0, y: 0 };
        this._leaveSurface();
    },

    _startFall() {
        this.mode = 'fall';
        this.vx = 0;
        this.vy = Math.max(0, this.vy);
        this.airGravity = { x: 0, y: SPIDER_FALL_GRAVITY };
        this.threadAnchor = null;
        this._leaveSurface();
    },

    _leaveSurface() {
        if (this.surface) this.drawSurface = this.surface;
        this.surface = null;
        this.airFrames = 0;
    },

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
    },

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
    },

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
    },

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
    },

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
    },
};
