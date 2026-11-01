// ============================================
// Orb — 2面の、押せて転がる壊せない鉱物
// ============================================
//
// 設計: docs/superpowers/specs/2026-11-01-stage2-orb-design.md
// 坂の上から落として敵に当てる（攻撃）／押して敵の弾を受ける（盾）、の2つの遊びのための物。
// ここは地形との物理（と絵）だけ。機体・弾・爆風との当たりは systems/orbInteractions.js。
//
// 判定は円。x, y は左上で width = height = 直径（renderInterp・視界カリングがほかの物と同じ形で扱えるように）。

import {
    GRAVITY, ORB_SIZES, ORB_ROLL_RESISTANCE, ORB_STOP_SPEED, ORB_MAX_SPEED,
    ORB_TERRAIN_RESTITUTION, ORB_BOUNCE_MIN_SPEED,
} from '../utils/Constants.js';
import { circleTerrainNormal, resolveCircleTerrain, reflectVelocity } from '../utils/orbPhysics.js';

/** 接地を見るときに円を膨らませる量（px）。ぴったり接しているだけの床も「接地」と読むため */
const GROUND_PROBE = 1;

export class Orb {
    /**
     * @param {object} game map を持つ
     * @param {{cx:number, cy:number, size:'small'|'large'}} spec
     */
    constructor(game, { cx, cy, size }) {
        this.game = game;
        this.size = size;
        this.spec = ORB_SIZES[size];
        this.r = this.spec.diameter / 2;
        this.mass = this.spec.mass;
        this.width = this.height = this.spec.diameter;
        this.x = cx - this.r;
        this.y = cy - this.r;
        this.vx = 0;
        this.vy = 0;
        this.alive = true;          // 壊せないので常に真（_forEachMovingEntity などの作法に合わせる）
        this.onGround = false;
        this.groundNx = 0;
        this.groundNy = -1;
        this.angle = 0;             // 絵の回転（転がった距離 / r）
        this.spin = 0;              // 空中で回り続ける角速度
        this.pushDir = 0;           // pushFrom で次の update に効く押し
        this.pushSpeed = 0;
        this.hitCooldown = new Map();   // 機体ごとの、次にダメージを与えられるまでのフレーム（orbInteractions）
        // 床の上に置かれたなら最初から接地にする（最初のフレームに落ちて押し出され、置いた位置から浮くのを防ぐ）
        this._probeGround();
    }

    get cx() { return this.x + this.r; }
    get cy() { return this.y + this.r; }

    /**
     * 次の update で、接地面の接線に沿って dir の向きへ speed で動かす。坂を上る向きなら speed × uphillScale
     * （重力がかかるので上りはきつい。ユーザー指定）。押されたフレームは接線方向の重力・抵抗を掛けない
     * （押す速さがそのまま出るように。母艦の pushFrom と同じ考え）
     * @param {-1|1} dir
     * @param {number} speed px/フレーム
     */
    pushFrom(dir, speed) {
        this.pushDir = dir;
        this.pushSpeed = speed;
    }

    update() {
        for (const [body, t] of this.hitCooldown) {
            if (t <= 1) this.hitCooldown.delete(body); else this.hitCooldown.set(body, t - 1);
        }
        const pushed = this.pushDir !== 0;
        if (pushed) {
            this._applyPush();
        } else {
            this.vy += GRAVITY;
            // 接地中は床へ向かう成分を先に消す。消さずに沈めて押し出すと、止まった Orb が毎フレーム
            // 0.3px 沈んで押し戻され、床の上で震えた
            if (this.onGround) this._dropIntoGround();
            // 床に止まっている Orb は動かさない。法線は円周の点の和なので 1e-16 ほど傾くことがあり、
            // 重力を消した残りでわずかに動くと、止まった位置が毎フレーム少しずつずれた
            if (this.onGround && Math.hypot(this.vx, this.vy) < ORB_STOP_SPEED) { this.vx = 0; this.vy = 0; }
        }
        this.pushDir = 0;

        const speed = Math.hypot(this.vx, this.vy);
        if (speed > ORB_MAX_SPEED) {
            this.vx *= ORB_MAX_SPEED / speed;
            this.vy *= ORB_MAX_SPEED / speed;
        }

        const x0 = this.cx, y0 = this.cy;
        this._moveAndCollide();
        this._probeGround();
        if (this.onGround && !pushed) this._rollResistance();
        if (Math.hypot(this.vx, this.vy) < ORB_STOP_SPEED) { this.vx = 0; this.vy = 0; }

        // 絵の回転。接地中は接線方向に動いた距離ぶん（滑らずに転がる）、空中は最後の回転を保つ
        if (this.onGround) {
            const tx = -this.groundNy, ty = this.groundNx;   // 接線（法線を時計回りに 90度）
            this.spin = ((this.cx - x0) * tx + (this.cy - y0) * ty) / this.r;
        }
        this.angle += this.spin;
    }

    _applyPush() {
        if (!this.onGround) {
            // 空中で押されたら横にだけ。縦は重力のまま
            this.vx = this.pushDir * this.pushSpeed;
            this.vy += GRAVITY;
            return;
        }
        // 接線（法線を時計回りに 90度）。平らな床（法線が真上）なら (1, 0)
        let tx = -this.groundNy, ty = this.groundNx;
        if (tx * this.pushDir < 0) { tx = -tx; ty = -ty; }
        const uphill = ty < -0.1;
        const s = this.pushSpeed * (uphill ? this.spec.uphillScale : 1);
        this.vx = tx * s;
        this.vy = ty * s;
    }

    _dropIntoGround() {
        const vn = this.vx * this.groundNx + this.vy * this.groundNy;
        // 速く落ちてきた分は消さない（地形との当たりで弾ませる）。膨らませた円で先に接地と読んだ
        // フレームに全部消すと、高い所から落としても弾まなかった
        if (vn < 0 && -vn < ORB_BOUNCE_MIN_SPEED) {
            this.vx -= vn * this.groundNx;
            this.vy -= vn * this.groundNy;
        }
    }

    /** 1回の移動が半径の半分を超えないよう刻んで動かし、刻みごとに岩から押し出して反射する */
    _moveAndCollide() {
        const map = this.game.map;
        const steps = Math.max(1, Math.ceil(Math.hypot(this.vx, this.vy) / (this.r / 2)));
        for (let i = 0; i < steps; i++) {
            this.x += this.vx / steps;
            this.y += this.vy / steps;
            const hit = resolveCircleTerrain(map, this.cx, this.cy, this.r);
            if (!hit) continue;
            this.x = hit.cx - this.r;
            this.y = hit.cy - this.r;
            const vn = this.vx * hit.nx + this.vy * hit.ny;
            if (vn >= 0) continue;
            // ゆっくり当たったら弾まずに法線成分を消す（転がっている最中の細かい跳ねを消す）
            const e = -vn < ORB_BOUNCE_MIN_SPEED ? 0 : ORB_TERRAIN_RESTITUTION;
            const v = reflectVelocity(this.vx, this.vy, hit.nx, hit.ny, e);
            this.vx = v.vx;
            this.vy = v.vy;
        }
    }

    /** 少し膨らませた円で床を探す。法線が上を向いていれば接地（坂も含む。壁・天井は接地ではない） */
    _probeGround() {
        const n = circleTerrainNormal(this.game.map, this.cx, this.cy, this.r + GROUND_PROBE);
        this.onGround = !!n && n.ny < -0.5;
        if (this.onGround) {
            this.groundNx = n.nx;
            this.groundNy = n.ny;
        }
    }

    /** 接線の速さを抵抗のぶん 0 へ寄せる。法線成分（弾んで離れていく分）は触らない */
    _rollResistance() {
        const tx = -this.groundNy, ty = this.groundNx;
        const vt = this.vx * tx + this.vy * ty;
        const vtNew = Math.sign(vt) * Math.max(0, Math.abs(vt) - ORB_ROLL_RESISTANCE);
        this.vx += (vtNew - vt) * tx;
        this.vy += (vtNew - vt) * ty;
    }
}
