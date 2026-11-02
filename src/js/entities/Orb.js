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

/**
 * 1回の刻みで、動いた距離に加えて押し出してよい距離（px）。重力で床へ沈む 0.3px ほどと、坂の継ぎ目の段差を
 * 吸収できればよい。これを超える押し出しは「すき間に挟まった」として止める
 */
const MAX_EXTRA_PUSH = 1.5;
/**
 * 眠らせる条件。接地中に、1フレームの移動がこれ未満で、速さが REST_SPEED 未満のフレームが REST_FRAMES 続いたら止める。
 * 2つの坂でできた V 字の谷では、膨らませた円がフレームごとに片側の坂だけに触れ、その接線へ重力で滑っては反対の坂に
 * 当たって 0.1〜0.3px 揺れ続けた（最終レビュー Important 3 の直し）。坂を転がり出す Orb は 3 フレームほどで速さ 0.3 を超えるので眠らない
 */
const REST_MOVE = 0.5;
const REST_SPEED = 0.3;
const REST_FRAMES = 10;
/** 接地を見るときに円を膨らませる量（px）。ぴったり接しているだけの床も「接地」と読むため */
const GROUND_PROBE = 1;

// 絵の色（描画専用なので Constants.js ではなくここに置く。LEG_STYLES と同じ例外）。
// ブラックオニキスを思わせる石（ユーザー指定）。2026-11-01 に「もっと神秘的に」（ユーザー指定）で次を足した:
//   縁が青みがかる（本体の塗りを、中心の漆黒から縁の深い青へのグラデーションに）／光の反射を増やす（艶を3つ）／
//   周囲に紫から赤紫のにじみ（石の外へ広がる光の輪。半径の 2.4 倍まで、外側で透明）
const ONYX = {
    core: '#07060C',             // 中心の漆黒
    mid: '#0E1122',              // 途中（ほぼ黒。急に青くならないように）
    edge: '#1C3266',             // 縁の深い青
    band: '#2A2848',
    rim: '#6F9BEA',              // リムライト（縁の青を光らせる。背景から輪郭を浮かせる）
    highlight: '#E4E8FF',        // 主の艶
    specular: '#FFFFFF',         // 主の艶の芯（鋭い点）
    reflect: '#7FA8FF',          // 右下の照り返し（洞窟の青い光を拾ったように）
    glow: '#7A4FD0',             // 奥の光
};
// 周囲のにじみ。内側の紫 → 赤紫 → 透明。不透明度は奥の光と同じく脈打つ
const AURA_PURPLE = [150, 80, 235];
const AURA_MAGENTA = [205, 55, 165];
const AURA_INNER = 0.8;          // 光の輪の内側の半径（r の倍率。石の中に少し食い込ませて境目を消す）
const AURA_OUTER = 2.4;          // 外側の半径（r の倍率）
const AURA_ALPHA = [0.18, 0.38]; // 輪の一番濃い所の不透明度（暗いとき・明るいとき）
const OUTLINE_VERTICES = 8;      // いびつな多角形の頂点数（7〜9 のうち、回ったときに角が見え過ぎない数）
const OUTLINE_MIN = 0.9;         // 頂点の半径の倍率の下限（判定の円から 1 割まで凹む）
const BAND_OFFSETS = [-0.45, 0.05, 0.5];   // 縞の、中心からのずれ（r に対する比）。等間隔にしない（石の縞は不揃い）
const GLOW_ALPHA = [0.10, 0.32];           // 奥の光の不透明度（暗いとき・明るいとき）
const GLOW_SPEED_BOOST = 0.08;             // 速さ 1px/フレームあたりに足す明るさ（転がってくる Orb に気づけるように）
const HIGHLIGHT_ALPHA = 0.7;     // 主の艶（0.5 → 0.7。反射を増やす指定）
const SPECULAR_ALPHA = 0.9;
const REFLECT_ALPHA = 0.3;

const rgba = ([r, g, b], a) => `rgba(${r}, ${g}, ${b}, ${a})`;

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
        this.liftSpeed = 0;         // liftFrom で次の update に効く、下からの持ち上げ
        this.bounceSpeed = 0;
        this.restFrames = 0;        // 眠らせるまでの、ほとんど動かないフレームの数
        this.sleeping = false;
        this.hitCooldown = new Map();   // 機体ごとの、次にダメージを与えられるまでのフレーム（orbInteractions）
        this.pushStall = new Map();     // 押している敵ごとの、押し始めの位置と時刻（押しても動かないかの見張り。orbInteractions）
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

    /**
     * 次の update で、真上へ speed で動かす（機体が下から持ち上げる。orbInteractions の liftOrb）。
     * 押されたフレームと同じく重力を掛けず、動きは _moveAndCollide で地形に当てる（天井の岩にめり込まない）
     * @param {number} speed px/フレーム
     */
    liftFrom(speed) {
        this.liftSpeed = speed;
    }

    update() {
        this.age++;
        this.bounceSpeed = 0;   // このフレームに地形で弾んだときの法線の速さ（音を鳴らす側が読む）
        for (const [body, t] of this.hitCooldown) {
            if (t <= 1) this.hitCooldown.delete(body); else this.hitCooldown.set(body, t - 1);
        }
        const lifted = this.liftSpeed > 0;
        const pushed = this.pushDir !== 0 || lifted;
        if (this.sleeping) {
            // 起きるのは、押されたとき・ほかの物（衝突・爆風・テスト）に速度を与えられたとき・足場が無くなったとき
            this._probeGround();
            if (!pushed && this.vx === 0 && this.vy === 0 && this.onGround) return;
            this.sleeping = false;
            this.restFrames = 0;
        }
        if (lifted) {
            this.vy = -this.liftSpeed;
        } else if (pushed) {
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
        this.liftSpeed = 0;

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

        const moved = Math.hypot(this.cx - x0, this.cy - y0);
        if (this.onGround && !pushed && moved < REST_MOVE && Math.hypot(this.vx, this.vy) < REST_SPEED) {
            if (++this.restFrames >= REST_FRAMES) { this.sleeping = true; this.vx = 0; this.vy = 0; }
        } else {
            this.restFrames = 0;
        }

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
        const stepLen = Math.hypot(this.vx, this.vy) / steps;
        for (let i = 0; i < steps; i++) {
            const sx = this.x, sy = this.y;
            this.x += this.vx / steps;
            this.y += this.vy / steps;
            const hit = resolveCircleTerrain(map, this.cx, this.cy, this.r);
            if (!hit) continue;
            // 押し出しがこの刻みで動いた距離より大きく跳ぶなら（狭いすき間に挟まった）、動く前の位置に戻して止める。
            // 跳ばせると、すき間の両側を 10〜14px ずつ行き来して止まらなかった（最終レビュー Important 3）
            const pushed = Math.hypot(hit.cx - this.cx, hit.cy - this.cy);
            if (hit.stuck || pushed > stepLen + MAX_EXTRA_PUSH) {
                this.x = sx; this.y = sy;
                this.vx = 0; this.vy = 0;
                return;
            }
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
     * 縁のリムライトは、黒い石が暗い洞窟の背景に溶けて見えなくなるのを防ぐ。
     * 描く順: 周囲のにじみ → 本体（中心の黒から縁の青へ）→ 奥の光 → 縞 → リムライト → 艶3つ
     */
    draw(ctx) {
        const cx = this.cx, cy = this.cy, r = this.r, a = this.angle;
        const pts = this.outline.map((k, i) => {
            const t = a + (i / OUTLINE_VERTICES) * Math.PI * 2;
            return [cx + Math.cos(t) * r * k, cy + Math.sin(t) * r * k];
        });
        // 輪郭は頂点を直線で結ばず、隣り合う頂点の中点を通る2次曲線でつなぐ（頂点を制御点にする）。
        // 直線の8角形では縁がカクカクして見えた（ユーザー指定 2026-11-01「もう少しなだらかに」）。
        // 曲線は頂点の多角形の内側を通るので、判定の円（半径 r）からははみ出さない
        const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        const outline = () => {
            const n = pts.length;
            const start = mid(pts[n - 1], pts[0]);
            ctx.beginPath();
            ctx.moveTo(start[0], start[1]);
            for (let i = 0; i < n; i++) {
                const m = mid(pts[i], pts[(i + 1) % n]);
                ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
            }
            ctx.closePath();
        };
        const pulse = 0.5 + 0.5 * Math.sin(((this.age + this.glowPhase) / ORB_GLOW_PERIOD) * Math.PI * 2);
        const speed = Math.hypot(this.vx, this.vy);
        ctx.save();

        // 周囲のにじみ（紫 → 赤紫 → 透明）。canvas の filter: blur は重いので、放射グラデーションでにじませる
        const auraA = Math.min(0.6, AURA_ALPHA[0] + (AURA_ALPHA[1] - AURA_ALPHA[0]) * pulse + GLOW_SPEED_BOOST * speed);
        const aura = ctx.createRadialGradient(cx, cy, r * AURA_INNER, cx, cy, r * AURA_OUTER);
        aura.addColorStop(0, rgba(AURA_PURPLE, auraA));
        aura.addColorStop(0.45, rgba(AURA_MAGENTA, auraA * 0.55));
        aura.addColorStop(1, rgba(AURA_MAGENTA, 0));
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(cx, cy, r * AURA_OUTER, 0, Math.PI * 2);
        ctx.fill();

        // 本体。中心を艶の側（左上）へ少し寄せた放射グラデーションで、縁ほど深い青になる（光源に合わせて回さない）
        const body = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.3, r * 0.1, cx, cy, r);
        body.addColorStop(0, ONYX.core);
        body.addColorStop(0.6, ONYX.mid);
        body.addColorStop(1, ONYX.edge);
        outline();
        ctx.fillStyle = body;
        ctx.fill();

        // 奥で脈打つ淡い紫の光。中心に置くので回転に関係しない
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

        // リムライト（縁の青）
        outline();
        ctx.strokeStyle = ONYX.rim;
        ctx.lineWidth = 1;
        ctx.stroke();

        // 艶。どれも光源に合わせて固定（回さない）。左上の主の艶・その芯・右下の青い照り返し
        ctx.fillStyle = ONYX.highlight;
        ctx.globalAlpha = HIGHLIGHT_ALPHA;
        ctx.beginPath();
        ctx.ellipse(cx - r * 0.35, cy - r * 0.4, r * 0.3, r * 0.17, -Math.PI / 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ONYX.specular;
        ctx.globalAlpha = SPECULAR_ALPHA;
        ctx.beginPath();
        ctx.ellipse(cx - r * 0.42, cy - r * 0.46, r * 0.09, r * 0.06, -Math.PI / 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ONYX.reflect;
        ctx.globalAlpha = REFLECT_ALPHA;
        ctx.beginPath();
        ctx.ellipse(cx + r * 0.38, cy + r * 0.45, r * 0.26, r * 0.08, -Math.PI / 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}
