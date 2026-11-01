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
    GRAVITY, ORB_SIZES, ORB_GLOW_PERIOD, ORB_ROLL_RESISTANCE, ORB_STOP_SPEED, ORB_MAX_SPEED,
    ORB_TERRAIN_RESTITUTION, ORB_BOUNCE_MIN_SPEED,
} from '../utils/Constants.js';
import { circleTerrainNormal, resolveCircleTerrain, reflectVelocity } from '../utils/orbPhysics.js';

/** 接地を見るときに円を膨らませる量（px）。ぴったり接しているだけの床も「接地」と読むため */
const GROUND_PROBE = 1;

// 絵の色（描画専用なので Constants.js ではなくここに置く。LEG_STYLES と同じ例外）。
// ブラックオニキスを思わせる石（ユーザー指定）: わずかに青紫を帯びた漆黒の本体、ごく暗い灰紫の縞、
// 暗い洞窟から輪郭を浮かせる紫がかったリムライト、左上に固定した艶、奥で脈打つ淡い紫の光
const ONYX = {
    body: '#0B0A10',
    band: '#2A2338',
    rim: '#6E5C96',
    highlight: '#DCD6FF',
    glow: '#7A4FD0',
};
const OUTLINE_VERTICES = 8;      // いびつな多角形の頂点数（7〜9 のうち、回ったときに角が見え過ぎない数）
const OUTLINE_MIN = 0.9;         // 頂点の半径の倍率の下限（判定の円から 1 割まで凹む）
const BAND_OFFSETS = [-0.45, 0.05, 0.5];   // 縞の、中心からのずれ（r に対する比）。等間隔にしない（石の縞は不揃い）
const GLOW_ALPHA = [0.10, 0.32];           // 奥の光の不透明度（暗いとき・明るいとき）
const GLOW_SPEED_BOOST = 0.08;             // 速さ 1px/フレームあたりに足す明るさ（転がってくる Orb に気づけるように）
const HIGHLIGHT_ALPHA = 0.5;

/** 整数の座標から 0〜1 の決まった値（乱数を使わずに Orb ごとの形と位相を変える） */
function hash01(n) {
    let h = (n | 0) ^ 0x9E3779B9;
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B);
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

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
        this.bounceSpeed = 0;
        this.hitCooldown = new Map();   // 機体ごとの、次にダメージを与えられるまでのフレーム（orbInteractions）
        this.age = 0;               // 経過フレーム（奥の光の脈動）
        // 形と光の位相は置いた位置から決める（乱数を使わない。同じ週なら同じ見た目）
        const seed = Math.round(cx) * 73856093 ^ Math.round(cy) * 19349663;
        this.outline = [];
        for (let k = 0; k < OUTLINE_VERTICES; k++) this.outline.push(OUTLINE_MIN + (1 - OUTLINE_MIN) * hash01(seed + k));
        this.glowPhase = hash01(seed + 101) * ORB_GLOW_PERIOD;
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
        this.age++;
        this.bounceSpeed = 0;   // このフレームに地形で弾んだときの法線の速さ（音を鳴らす側が読む）
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
            if (e > 0) this.bounceSpeed = Math.max(this.bounceSpeed, -vn);
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

    /**
     * ブラックオニキス風の石（設計 4.8）。輪郭と縞は angle で回し、艶（ハイライト）は光源が動かないので回さない。
     * 縁のリムライトは、黒い石が暗い洞窟の背景に溶けて見えなくなるのを防ぐ
     */
    draw(ctx) {
        const cx = this.cx, cy = this.cy, r = this.r, a = this.angle;
        const pts = this.outline.map((k, i) => {
            const t = a + (i / OUTLINE_VERTICES) * Math.PI * 2;
            return [cx + Math.cos(t) * r * k, cy + Math.sin(t) * r * k];
        });
        const outline = () => {
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
            ctx.closePath();
        };
        ctx.save();
        outline();
        ctx.fillStyle = ONYX.body;
        ctx.fill();

        // 奥で脈打つ淡い紫の光。中心に置くので回転に関係しない
        const pulse = 0.5 + 0.5 * Math.sin(((this.age + this.glowPhase) / ORB_GLOW_PERIOD) * Math.PI * 2);
        const speed = Math.hypot(this.vx, this.vy);
        ctx.globalAlpha = Math.min(0.6, GLOW_ALPHA[0] + (GLOW_ALPHA[1] - GLOW_ALPHA[0]) * pulse + GLOW_SPEED_BOOST * speed);
        ctx.fillStyle = ONYX.glow;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // オニキスの縞。石の向き（angle）に沿った弦で、輪郭の内側（半径の 0.9 倍の円）に収める
        ctx.strokeStyle = ONYX.band;
        ctx.lineWidth = 1;
        const ux = Math.cos(a), uy = Math.sin(a);       // 縞の向き
        for (const off of BAND_OFFSETS) {
            const d = off * r, half = Math.sqrt(Math.max(0, (OUTLINE_MIN * r) ** 2 - d * d)) * 0.85;
            const mx = cx - uy * d, my = cy + ux * d;    // 縞の中点（縞に垂直な向きへ d ずらす）
            ctx.beginPath();
            ctx.moveTo(mx - ux * half, my - uy * half);
            ctx.lineTo(mx + ux * half, my + uy * half);
            ctx.stroke();
        }

        // リムライト
        outline();
        ctx.strokeStyle = ONYX.rim;
        ctx.lineWidth = 1;
        ctx.stroke();

        // 艶。左上に固定（回さない）
        ctx.globalAlpha = HIGHLIGHT_ALPHA;
        ctx.fillStyle = ONYX.highlight;
        ctx.beginPath();
        ctx.ellipse(cx - r * 0.35, cy - r * 0.4, r * 0.28, r * 0.16, -Math.PI / 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}
