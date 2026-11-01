// ============================================
// Orb（2面の転がる鉱物）と、機体・弾・地雷・爆風との当たり
// ============================================
//
// 設計: docs/superpowers/specs/2026-11-01-stage2-orb-design.md
// Orb 本体（entities/Orb.js）は地形との物理だけを持つ。ほかの物との当たりはここに集める
// （機体・弾ごとのファイルに散らすと、Orb の規則が何か所にも書かれて食い違うため）。
// game を受け取る関数にしているのは utils/blastDamage.js と同じ作法（Game の mixin ではない）。
//
// 機体の側は Orb を知らない。押す・乗る・止められるは、機体が動いた後にここで機体を Orb の外へ出して表す
// （母艦を押すときと同じく、押したぶんは次のフレームに Orb が動く）。

import { PLAYER_MAX_SPEED, ORB_IMPACT_RESTITUTION } from '../utils/Constants.js';
import { circleBoxContact } from '../utils/orbPhysics.js';
import { collidesWithTerrain } from '../utils/Physics.js';

/** 乗っているとみなす法線の縦の成分（箱 → Orb が下向き＝機体が上）。45度より上から触れていれば乗る */
const STAND_NY = 0.7;
/** 押していると読む横の速さの下限（px/フレーム）。止まりかけの機体が触れただけで押さない */
const PUSH_MIN_VX = 0.05;

/**
 * 1ティックぶん。敵の更新の直後、弾と敵の当たり（collisionManager）の前に呼ぶ（main.js の _simulationTick）。
 * @param {object} game orbs を持つ
 */
export function updateOrbs(game) {
    const orbs = game.orbs || [];
    if (orbs.length === 0) return;
    for (const orb of orbs) orb.update();
    for (let i = 0; i < orbs.length; i++) {
        for (let j = i + 1; j < orbs.length; j++) resolveOrbPair(orbs[i], orbs[j]);
    }
    const bodies = orbBodies(game);
    for (const orb of orbs) {
        for (const body of bodies) resolveOrbBody(game, orb, body);
    }
}

/** Orb と当たる機体。自機（ドッキング中は母艦の中なので除く）・母艦・敵 */
export function orbBodies(game) {
    const list = [];
    const p = game.player;
    if (p && p.alive && !p.docked) list.push(p);
    if (game.carrier && game.carrier.alive) list.push(game.carrier);
    for (const e of game.enemies || []) if (e.alive) list.push(e);
    return list;
}

/**
 * Orb どうし。重なりを重さの逆比で分け、法線方向の相対速度を反発係数で跳ね返す（運動量は保つ）
 */
export function resolveOrbPair(a, b) {
    const dx = b.cx - a.cx, dy = b.cy - a.cy;
    const d = Math.hypot(dx, dy);
    const overlap = a.r + b.r - d;
    if (overlap <= 0) return;
    const nx = d > 1e-9 ? dx / d : 1, ny = d > 1e-9 ? dy / d : 0;
    const total = a.mass + b.mass;
    a.x -= nx * overlap * (b.mass / total); a.y -= ny * overlap * (b.mass / total);
    b.x += nx * overlap * (a.mass / total); b.y += ny * overlap * (a.mass / total);
    const vrel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (vrel >= 0) return;
    const j = (-(1 + ORB_IMPACT_RESTITUTION) * vrel) / (1 / a.mass + 1 / b.mass);
    a.vx -= (j / a.mass) * nx; a.vy -= (j / a.mass) * ny;
    b.vx += (j / b.mass) * nx; b.vy += (j / b.mass) * ny;
}

/** 機体が岩に入っているか（機体ごとの判定があればそれを使う） */
function bodyInRock(game, body) {
    return typeof body._collidesWithMap === 'function' ? body._collidesWithMap() : collidesWithTerrain(body, game.map);
}

/**
 * 機体が dir（機体 → Orb の横の向き）へ押そうとしているなら、その速さ。押していなければ 0。
 * 自機は左右の入力で進んでいるときだけ（被弾で飛ばされてぶつかっただけでは押さない。母艦を押すときと同じ）。
 * 母艦は重いので押し負けず、自分の速さで押す。敵は接地して歩いているときだけ
 */
function pushSpeedOf(game, body, dir, orb) {
    if (body === game.player) return body.heldDir === dir ? PLAYER_MAX_SPEED * orb.spec.pushScale : 0;
    if (Math.sign(body.vx) !== dir || Math.abs(body.vx) < PUSH_MIN_VX) return 0;
    if (body === game.carrier) return Math.abs(body.vx);
    return (body.onGround || body.grounded) ? Math.abs(body.vx) * orb.spec.pushScale : 0;
}

/**
 * 1つの Orb と1つの機体。上から触れていれば機体を Orb の上に乗せ、下から触れていれば Orb を機体の上に
 * 載せ、横なら機体を Orb の外へ出す（押す意図があれば Orb を押す）。
 * 機体を出した先が岩なら、機体の横の移動を取り消す（Orb と壁に挟まって岩に入らない）
 */
export function resolveOrbBody(game, orb, body) {
    const hit = circleBoxContact(orb.cx, orb.cy, orb.r, body);
    if (!hit) return;
    if (hit.ny > STAND_NY) {
        standOnOrb(game, orb, body);
    } else if (hit.ny < -STAND_NY) {
        // Orb が機体の上（敵の頭に乗った）。Orb を上へ出し、機体へ向かう速さを消す
        orb.x += hit.nx * hit.depth; orb.y += hit.ny * hit.depth;
        blockOrb(orb, hit.nx, hit.ny);
    } else {
        pushSideways(game, orb, body);
    }
}

/** 機体を Orb の上に乗せる。足の幅のうち Orb の中心に一番近い列で、円の上面に合わせる */
function standOnOrb(game, orb, body) {
    const qx = Math.max(body.x, Math.min(orb.cx, body.x + body.width));
    const dx = qx - orb.cx;
    const top = orb.cy - Math.sqrt(Math.max(0, orb.r * orb.r - dx * dx));
    const yBefore = body.y;
    body.y = top - body.height;
    // 頭が天井に入るなら乗せない（敵の頭・母艦の甲板と同じ規則）
    if (bodyInRock(game, body)) { body.y = yBefore; return; }
    if (body.vy > 0) body.vy = 0;
    body.onGround = true;
}

/** 横の接触。押す意図があれば Orb を押し、機体は Orb の縁へ出す */
function pushSideways(game, orb, body) {
    const dir = orb.cx >= body.x + body.width / 2 ? 1 : -1;
    const speed = pushSpeedOf(game, body, dir, orb);
    if (speed > 0) orb.pushFrom(dir, speed);
    else blockOrb(orb, -dir, 0);   // 押していない機体に Orb が寄ってきたら、そこで止める
    // 機体の縁を、その高さでの円の横の端に合わせる
    const qy = Math.max(body.y, Math.min(orb.cy, body.y + body.height));
    const dy = qy - orb.cy;
    const half = Math.sqrt(Math.max(0, orb.r * orb.r - dy * dy));
    const xBefore = body.x;
    body.x = dir > 0 ? orb.cx - half - body.width : orb.cx + half;
    // 機体の vx は消さない。自機は毎フレーム入力で、敵は AI で決め直し、母艦は押し続けるのに要る
    // （消すと母艦も歩く敵も一度触れただけで止まって押せなかった）
    if (!bodyInRock(game, body)) return;
    // 出した先が岩（Orb と壁に挟まった）。このフレームの横の移動を取り消す（Player._undoPushIntoRock と同じ考え）
    body.x = body._frameStartX !== undefined ? body._frameStartX : xBefore;
    if (bodyInRock(game, body)) body.x = xBefore;
    body.vx = 0;
}

/** Orb の速度のうち、法線 (nx, ny)（Orb から離れる向きの逆＝相手へ向かう向きの反対）へ向かう成分を消す */
function blockOrb(orb, nx, ny) {
    const vn = orb.vx * nx + orb.vy * ny;
    if (vn < 0) { orb.vx -= vn * nx; orb.vy -= vn * ny; }
}
