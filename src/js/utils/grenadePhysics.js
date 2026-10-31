// ============================================
// grenadePhysics - グレネードの1フレームの物理（純ロジック）
// ============================================
//
// Grenade.update（本体）と CombatActions._calcGrenadeTrajectory（照準の軌道予測）が
// 同じ式を2か所に書いていた。片方だけ直すと予測が実際の軌道とずれるので、1つにまとめて
// 両方から呼ぶ（tests/grenade-trajectory.test.js が一致を縛る）。
// 回転・寿命・画面外・バリアは呼んだ側に残す（予測と本体で扱いが違うため）。

import {
    GRENADE_GRAVITY, GRENADE_MAX_FALLING_SPEED, GRENADE_BOUNCE, GRENADE_FRICTION,
} from './Constants.js';
import { fallSpeedScaleFor } from '../world/StageEnvironment.js';

// 斜辺に触れた点を法線の向きへ浮かせる量（px、各軸）。誤差で岩の縁に乗らないための余白で、
// 見た目には分からない大きさ。調整用の数値ではないのでここに置く
const SLOPE_CONTACT_GAP = 0.01;

/**
 * グレネードを1フレーム進める（重力・最大落下速度・地形での跳ね返りと接地の摩擦）。
 * @param {object} map isSolidPoint・slopeHitAlong・popOutOfRock を持つ
 * @param {{x:number,y:number,vx:number,vy:number}} g 書き換える
 * @param {object} motion motionFor の戻り値
 */
export function stepGrenade(map, g, motion) {
    // 壊れて形が作り直され、居る所が岩になったら、先に真上の空中へ出す（Map.popOutOfRock）
    const popped = map.popOutOfRock(g.x, g.y);
    if (popped !== null) g.y = popped;

    g.vy += GRENADE_GRAVITY * motion.gravity + (motion.downforce || 0);
    const maxFall = GRENADE_MAX_FALLING_SPEED * fallSpeedScaleFor(motion);
    if (g.vy > maxFall) g.vy = maxFall;

    let nextX = g.x + g.vx * motion.speed;
    let nextY = g.y + g.vy * motion.speed;

    // 5面の坂と面取り: この移動で最初に触れた岩が斜辺なら、その法線の向きで解く（決定10・6章）。
    // 平らな床の接地（vy = 0、vx に摩擦）と同じことを斜面の向きでしている。法線の速さが小さければ
    // 法線の成分を消して斜面に沿わせ、摩擦をかける。重力の斜面方向の成分が毎フレーム残るので、
    // 摩擦で頭打ちになる速さで坂を転がり落ちる
    const slope = map.slopeHitAlong(g.x, g.y, nextX, nextY);
    if (slope) {
        // d·s が v の法線の成分（s は正規化していない符号の組なので、法線方向の速さは |d|·√2）
        const d = (g.vx * slope.sx + g.vy * slope.sy) / 2;
        if (d < 0) {
            if (-d * Math.SQRT2 > 0.5) {
                g.vx -= (1 + GRENADE_BOUNCE) * d * slope.sx;
                g.vy -= (1 + GRENADE_BOUNCE) * d * slope.sy;
            } else {
                g.vx = (g.vx - d * slope.sx) * GRENADE_FRICTION;
                g.vy = (g.vy - d * slope.sy) * GRENADE_FRICTION;
            }
        }
        // 触れる直前の点から、新しい速度でこのフレームの残りを動かす（反射ビームと同じ考え）。
        // 触れた点に留めるだけだと、1px 刻みの探索の最初の点で触れたフレームは動けず、坂の上で
        // 止まったままになった（実測）。斜辺は岩に含まれるので、斜面に沿って動くと誤差で岩の
        // 縁に乗る。法線の向きへ SLOPE_CONTACT_GAP だけ浮かせておく
        const cx = slope.x + slope.sx * SLOPE_CONTACT_GAP, cy = slope.y + slope.sy * SLOPE_CONTACT_GAP;
        const bx = cx + g.vx * motion.speed, by = cy + g.vy * motion.speed;
        if (map.isSolidPoint(bx, by)) {
            g.x = map.isSolidPoint(cx, cy) ? slope.x : cx;
            g.y = map.isSolidPoint(cx, cy) ? slope.y : cy;
        } else {
            g.x = bx;
            g.y = by;
        }
        return;
    }

    // 横 → 縦の順に、軸ごとに跳ね返す
    if (map.isSolidPoint(nextX, g.y)) {
        bounceX(g);
        nextX = g.x + g.vx * motion.speed;
    }
    g.x = nextX;

    if (map.isSolidPoint(g.x, nextY)) {
        bounceY(g);
        nextY = g.y + g.vy * motion.speed;
    }
    g.y = nextY;
}

/** 横の壁での跳ね返り（速度を反転して減衰） */
function bounceX(g) {
    g.vx *= -GRENADE_BOUNCE;
}

/** 床か天井での跳ね返り。速ければ跳ね返り、遅ければ接地して転がりに摩擦をかける */
function bounceY(g) {
    if (Math.abs(g.vy) > 0.5) {
        g.vy *= -GRENADE_BOUNCE;
    } else {
        g.vy = 0;
        g.vx *= GRENADE_FRICTION;
    }
}

/**
 * 法線 (nx, ny)（外向きの単位ベクトル）の面での跳ね返り。stepGrenade の斜面の枝と同じ式:
 * 法線の向きの速さが 0.5 を超えれば GRENADE_BOUNCE 倍で反転、遅ければ法線の成分を消して
 * 面に沿わせ、GRENADE_FRICTION をかける（斜面を転がり落ちる）。面から離れる向きの速度には何もしない。
 * 平らな面（法線が軸に沿う）では、横・縦だけの跳ね返り（bounceX / bounceY）と同じ結果になる。
 * @param {{vx:number, vy:number}} g 書き換える
 */
export function bounceOffSurface(g, nx, ny) {
    const vn = g.vx * nx + g.vy * ny;
    if (vn >= 0) return;
    if (-vn > 0.5) {
        g.vx -= (1 + GRENADE_BOUNCE) * vn * nx;
        g.vy -= (1 + GRENADE_BOUNCE) * vn * ny;
    } else {
        g.vx = (g.vx - vn * nx) * GRENADE_FRICTION;
        g.vy = (g.vy - vn * ny) * GRENADE_FRICTION;
    }
}

/**
 * 町の建物・木・植物（Town.sweepProjectile）に当たったときの跳ね返り。地形と同じ式を通すので、
 * 岩に当たっても建物に当たっても同じ弾み方になる。
 * normal（かけらの並びから推定した面の向き。surfaceNormal）が使えるときはそれで反射する:
 * 木の三角形の斜めの面は、縦横の軸だけでは不自然に跳ねる（ユーザー指摘）。
 * 推定できない・面から離れる向きのとき（薄い壁の真ん中など）は、動いた軸で側面か上面かを見て反射する。
 * @param {{vx:number, vy:number}} g 書き換える
 * @param {boolean} hitX 横の動きで壁に入った（側面）
 * @param {boolean} hitY 縦の動きで壁に入った（上面・下面）。両方偽なら角なので両方とみなす
 * @param {[number, number] | null} normal 推定した外向きの法線
 */
export function bounceOffTown(g, hitX, hitY, normal = null) {
    if (normal && g.vx * normal[0] + g.vy * normal[1] < 0) {
        bounceOffSurface(g, normal[0], normal[1]);
        return;
    }
    if (!hitX && !hitY) { hitX = true; hitY = true; }
    const ax = hitX ? -Math.sign(g.vx) : 0;
    const ay = hitY ? -Math.sign(g.vy) : 0;
    const len = Math.hypot(ax, ay);
    if (len === 0) return;
    bounceOffSurface(g, ax / len, ay / len);
}
