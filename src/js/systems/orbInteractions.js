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

import {
    PLAYER_MAX_SPEED, ORB_IMPACT_RESTITUTION, ORB_IMPACT_MIN_SPEED, ORB_IMPACT_DAMAGE_PER_SPEED, ORB_IMPACT_DAMAGE_MAX,
    ORB_HIT_COOLDOWN, ORB_KNOCK_VX, ORB_KNOCK_VY, ORB_PROJECTILE_IMPACT, ORB_BREAK_INCIDENCE_DEG,
    ORB_BLAST_RADIUS, ORB_BLAST_IMPULSE, ORB_SOUND_INTERVAL_MS, ORB_PUSH_STALL_FRAMES, ORB_PUSH_STALL_RATIO,
} from '../utils/Constants.js';
import { audioManager } from '../audio/AudioManager.js';
import {
    circleBoxContact, reflectVelocity, segmentCircleHit, projectileVelocity, setProjectileVelocity,
} from '../utils/orbPhysics.js';
import { bounceOffSurface } from '../utils/grenadePhysics.js';
import { collidesWithTerrain } from '../utils/Physics.js';
import { recordHit } from '../utils/hitPoint.js';
import { applyKnockback } from '../utils/Knockback.js';
import { playBeamHit } from '../entities/beamHit.js';

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
    for (const orb of orbs) {
        orb.update();
        if (orb.bounceSpeed > 0) playOrbImpactSound(orb.cx, orb.cy + orb.r);
    }
    for (let i = 0; i < orbs.length; i++) {
        for (let j = i + 1; j < orbs.length; j++) resolveOrbPair(orbs[i], orbs[j]);
    }
    // 動かない機体（砲台・基地）は最後に解く。押している自機が同じティックに Orb を押し込み直しても、
    // 最後は Orb が壁（動かない機体）の外に出ているように
    const bodies = orbBodies(game);
    const movers = bodies.filter((b) => !isStaticBody(b)), statics = bodies.filter(isStaticBody);
    for (const orb of orbs) {
        for (const body of movers) resolveOrbBody(game, orb, body);
        for (const body of statics) resolveOrbBody(game, orb, body);
        detonateTouchedMines(game, orb);
    }
    // 自機の弾（とグレネード）。敵の弾は CollisionManager が町のあとに1発ずつ掃く
    for (const p of game.projectiles || []) sweepProjectileAgainstOrbs(game, p);
}

/** 当たったあと弾を円の外へ出す距離（px）。円周ちょうどに置くと次のティックの線分の始点が円の中と読まれる */
const PROJECTILE_CLEARANCE = 0.5;
const BREAK_COS = Math.cos((ORB_BREAK_INCIDENCE_DEG * Math.PI) / 180);

/**
 * 1発の弾を、このティックに動いた線分で Orb に当てる（町の Town.sweepProjectile と同じく、ティックの頭の位置 _prevX から）。
 * 一番手前で当たった Orb について、ORB_PROJECTILE_IMPACT の規則で壊すか跳ね返す（設計 4.6）
 */
export function sweepProjectileAgainstOrbs(game, p) {
    const orbs = game.orbs || [];
    if (orbs.length === 0 || !p.alive || p.exploded) return;
    if (p.isBaseLaser) { absorbBaseLaser(game, p, orbs); return; }
    const spec = ORB_PROJECTILE_IMPACT[p.townKind];
    if (!spec) return;
    const v = projectileVelocity(p);
    const x0 = p._prevX !== undefined ? p._prevX : p.x - v.vx;
    const y0 = p._prevY !== undefined ? p._prevY : p.y - v.vy;
    let best = null, bestOrb = null;
    for (const orb of orbs) {
        const h = segmentCircleHit(x0, y0, p.x, p.y, orb.cx, orb.cy, orb.r);
        if (h && (!best || h.t < best.t)) { best = h; bestOrb = orb; }
    }
    if (!best) return;
    const nx = (best.x - bestOrb.cx) / bestOrb.r, ny = (best.y - bestOrb.cy) / bestOrb.r;
    const speed = Math.hypot(v.vx, v.vy);
    // 入射角の余弦 = 面の法線と、入ってきた向きの逆とのなす角の cos
    const cosIncidence = speed > 0 ? -(v.vx * nx + v.vy * ny) / speed : 1;
    // レーザー（反射ビーム）は吸収する。反射ビームが自機に当たったときと同じ派手な演出で消える（2026-11-03 ユーザー指定）。
    // 反射ビームは onTownWall を持たないので呼ばない（以前は呼んでいて、当たった瞬間に落ちるはずだった）
    if (spec.rule === 'absorb') {
        p.alive = false;
        playBeamHit(game, best.x, best.y);
        return;
    }
    if (spec.rule === 'angle' && cosIncidence > BREAK_COS) {
        p.onTownWall(best.x, best.y);
        return;
    }
    const ox = best.x + nx * PROJECTILE_CLEARANCE, oy = best.y + ny * PROJECTILE_CLEARANCE;
    if (p.townKind === 'grenade') {
        p.x = ox; p.y = oy;
        bounceOffSurface(p, nx, ny);
        return;
    }
    const vn = v.vx * nx + v.vy * ny;
    const rx = v.vx - 2 * vn * nx, ry = v.vy - 2 * vn * ny;
    p.x = ox; p.y = oy;
    setProjectileVelocity(p, rx, ry);
}

// 最後に「ゴン」を鳴らした時刻（実時間）。全部の Orb で共有する（5個が同時に転がっても濁らないように）
let lastSoundAt = -Infinity;

/** Orb の当たった音。ORB_SOUND_INTERVAL_MS に1回まで（ricochet.js の跳弾と同じ間引き） */
function playOrbImpactSound(x, y) {
    const now = Date.now();
    if (now - lastSoundAt < ORB_SOUND_INTERVAL_MS) return;
    lastSoundAt = now;
    audioManager.playWeapon('orbImpact', x, y);
}

/** Orb が触れた地雷を起爆する（地雷は触れると爆発するものなので、それに揃えた） */
function detonateTouchedMines(game, orb) {
    for (const mine of game.landmines || []) {
        if (mine.alive && circleBoxContact(orb.cx, orb.cy, orb.r, mine)) mine.detonate();
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

/**
 * 動かない機体か（砲台・基地。どちらも vx を持たず、重力でも動かない）。押し出すと床の外で宙に浮いた
 * （最終レビュー Important 2）。設計 4.5「止まっている砲台・基地のような動かないものは壁として跳ね返す」
 */
function isStaticBody(body) {
    return body.vx === undefined;
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
    if (impact(game, orb, body, hit)) return;
    if (isStaticBody(body)) {
        // 動かない機体は壁として扱う。機体は動かさず、Orb を外へ出して相手へ向かう速さを消す
        orb.x += hit.nx * hit.depth; orb.y += hit.ny * hit.depth;
        blockOrb(orb, hit.nx, hit.ny);
        return;
    }
    if (hit.ny > STAND_NY) {
        standOnOrb(game, orb, body);
    } else if (hit.ny < -STAND_NY) {
        const lift = liftSpeedOf(game, body, orb);
        if (lift > 0) { liftOrb(game, orb, body, lift); return; }
        // Orb が機体の上（敵の頭に乗った）。Orb を上へ出し、機体へ向かう速さを消す
        orb.x += hit.nx * hit.depth; orb.y += hit.ny * hit.depth;
        blockOrb(orb, hit.nx, hit.ny);
    } else {
        pushSideways(game, orb, body);
    }
}

/**
 * 速く当たったなら、ダメージ・ノックバック・反発を与えて真を返す。
 * 当たったかとダメージは **Orb 自身が相手へ向かう速さ** で決める。相対速度で見ると、自機が歩いて（1.75px/フレーム）
 * 止まっている Orb にぶつかっただけで閾値を超えてダメージが入った。反発は相対速度で解く（動いている相手にも正しく跳ね返る）。
 * 同じ相手には ORB_HIT_COOLDOWN のあいだ当てない（その間は押す・乗る・止められるの扱い）
 */
function impact(game, orb, body, hit) {
    // 法線は箱 → Orb。Orb が相手へ向かう速さはその逆向きの成分
    const approach = -(orb.vx * hit.nx + orb.vy * hit.ny);
    if (approach <= ORB_IMPACT_MIN_SPEED || orb.hitCooldown.has(body)) return false;
    const damage = Math.min(ORB_IMPACT_DAMAGE_MAX, Math.round(ORB_IMPACT_DAMAGE_PER_SPEED * orb.mass * approach));
    if (typeof body.takeDamage === 'function') {
        recordHit(body, orb.cx - hit.nx * orb.r, orb.cy - hit.ny * orb.r);
        body.takeDamage(damage);
    }
    orb.hitCooldown.set(body, ORB_HIT_COOLDOWN);
    playOrbImpactSound(orb.cx - hit.nx * orb.r, orb.cy - hit.ny * orb.r);
    // 相手の速度は当てる前に読む（ノックバックで書き換わる）。動かない相手（砲台など）は 0
    const bvx = body.vx || 0, bvy = body.vy || 0;
    const v = reflectVelocity(orb.vx - bvx, orb.vy - bvy, hit.nx, hit.ny, ORB_IMPACT_RESTITUTION);
    orb.vx = v.vx + bvx;
    orb.vy = v.vy + bvy;
    applyKnockback(body, body.x + body.width / 2 - orb.cx, ORB_KNOCK_VY, ORB_KNOCK_VX);
    // Orb を相手の外へ出す（相手は飛ばされるので動かさない）
    orb.x += hit.nx * hit.depth;
    orb.y += hit.ny * hit.depth;
    return true;
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
    // Orb の上に乗っている印。アタッカーの崖の判定は地形しか見ないので、Orb の上では前を崖と読んで毎フレーム向きを変え、
    // 降りられなくなった（attacker/collision.js が読んで消す）
    body.onOrb = true;
}

/**
 * 機体が下から Orb を持ち上げる速さ。上へ動いていなければ 0。
 * 横に押すとき（pushSpeedOf）と同じ重さの手応えにする（2026-11-03 ユーザー指定）: 自機は PLAYER_MAX_SPEED × pushScale を上限に、
 * 母艦は重いので自分の速さで、敵は速さ × pushScale。以前は Orb を重なりの深さだけ直に上へずらしていて、
 * 自機の上昇の速さ（ホバーで 1.8px/フレームほど）のまま上がり、横に押すとき（large で 0.525）より3倍以上速かった
 */
function liftSpeedOf(game, body, orb) {
    const up = -(body.vy || 0);
    if (up < PUSH_MIN_VX) return 0;
    if (body === game.player) return Math.min(up, PLAYER_MAX_SPEED) * orb.spec.pushScale;
    if (body === game.carrier) return up;
    return up * orb.spec.pushScale;
}

/**
 * 下から持ち上げる。Orb は直に動かさず、次の update で liftFrom の速さで上へ動かす（地形に当てるのは Orb の物理に任せる。
 * 直にずらしていた頃は天井の岩にめり込んだ）。機体は Orb の下面へ出す（横に押すとき機体を Orb の縁へ出すのと同じ。
 * 天井で Orb が止まれば機体もその下で止まる）。
 * 機体の vy は消さない（横に押すとき vx を消さないのと同じ）。Orb の速さまで落とすと、自機はバースト直後のホバーが
 * 効かないあいだに重力に負けて落ち、持ち上げ続けられなかった
 */
function liftOrb(game, orb, body, speed) {
    orb.liftFrom(speed);
    const qx = Math.max(body.x, Math.min(orb.cx, body.x + body.width));
    const dx = qx - orb.cx;
    const bottom = orb.cy + Math.sqrt(Math.max(0, orb.r * orb.r - dx * dx));
    const yBefore = body.y;
    body.y = bottom;
    // 下へ出した先が岩（床すれすれで持ち上げた）なら出さない。重なりは次のフレームに Orb が上がって解ける
    if (bodyInRock(game, body)) body.y = yBefore;
}

/** 横の接触。押す意図があれば Orb を押し、機体は Orb の縁へ出す */
function pushSideways(game, orb, body) {
    const dir = orb.cx >= body.x + body.width / 2 ? 1 : -1;
    const speed = pushSpeedOf(game, body, dir, orb);
    if (speed > 0) orb.pushFrom(dir, speed);
    if (speed > 0 && typeof body.onBlockedByOrb === 'function') watchPushStall(orb, body, dir, speed);
    // 押していない機体に Orb が寄ってきたら、そこで止める。法線は「機体 → Orb」の向き（dir, 0）。
    // 以前は (−dir, 0) を渡していて、寄ってくる Orb は止まらず機体を押し続け、離れていく Orb を止めていた（最終レビュー Important 1）
    else blockOrb(orb, dir, 0);
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

/** 押しの見張りで、押さないフレームがこれだけ続くまでは同じ区間とみなす。戦車はホバーで床から浮き沈みし、接地（＝押す）が1フレームおきに途切れる */
const PUSH_STALL_GAP = 3;

/**
 * 敵（onBlockedByOrb を持つ戦車・アタッカー）が押しても Orb が動かないかを見張る（2026-11-03 ユーザー指定）。
 * 押し始めから ORB_PUSH_STALL_FRAMES たっても、Orb が押す速さから見込む距離の ORB_PUSH_STALL_RATIO 倍も進んでいなければ、
 * 壁に当たったときと同じ反応をさせる。進んでいれば区間を始め直す。
 * 1フレームごとの移動では見ない: 壁際の Orb は押されては戻され 0.1px ほど前後に揺れ、進んだフレームが混じって数えが途切れた
 */
function watchPushStall(orb, body, dir, speed) {
    let w = orb.pushStall.get(body);
    if (!w || orb.age - w.lastAge > PUSH_STALL_GAP) w = { startCx: orb.cx, startAge: orb.age, lastAge: orb.age };
    w.lastAge = orb.age;
    orb.pushStall.set(body, w);
    const frames = orb.age - w.startAge;
    if (frames < ORB_PUSH_STALL_FRAMES) return;
    if ((orb.cx - w.startCx) * dir < speed * frames * ORB_PUSH_STALL_RATIO) {
        orb.pushStall.delete(body);
        body.onBlockedByOrb(dir);
        return;
    }
    orb.pushStall.set(body, { startCx: orb.cx, startAge: orb.age, lastAge: orb.age });
}

/** 法線 (nx, ny) は「相手 → Orb」の向き。Orb の速度のうち相手へ向かう成分（v·n < 0）だけを消す */
function blockOrb(orb, nx, ny) {
    const vn = orb.vx * nx + orb.vy * ny;
    if (vn < 0) { orb.vx -= vn * nx; orb.vy -= vn * ny; }
}

/**
 * 基地のレーザー（BaseLaser）。長さ width の光の帯で、x, y は帯の中心、dx, dy で進む。地形は素通りするが Orb には吸収される
 * （ORB_PROJECTILE_IMPACT.laser、ユーザー指定）。帯の全体（後端 → 先端）と、このティックの先端の動きのどちらかが
 * Orb に掛かれば消す。帯は 100px あり Orb（24px）より長いので、先端の動きだけを見ると帯の途中で重なったまま素通りする
 */
function absorbBaseLaser(game, laser, orbs) {
    if (!ORB_PROJECTILE_IMPACT.laser) return;
    const ux = Math.cos(laser.angle), uy = Math.sin(laser.angle), half = laser.width / 2;
    const tx = laser.x - ux * half, ty = laser.y - uy * half;   // 後端
    const hx = laser.x + ux * half, hy = laser.y + uy * half;   // 先端
    for (const orb of orbs) {
        const hit = segmentCircleHit(tx, ty, hx, hy, orb.cx, orb.cy, orb.r)
            || segmentCircleHit(hx - laser.dx, hy - laser.dy, hx, hy, orb.cx, orb.cy, orb.r)
            || (Math.hypot(tx - orb.cx, ty - orb.cy) < orb.r ? { x: tx, y: ty } : null);
        if (!hit) continue;
        laser.alive = false;
        playBeamHit(game, hit.x, hit.y);
        return;
    }
}

/**
 * 爆風で Orb を押す（SpawnEffects.spawnExplosion から。ミサイル・グレネード・機体の破壊・地雷の爆発が全部通る）。
 * 爆心から Orb の中心への向きに、ORB_BLAST_IMPULSE × (1 − 距離/半径) / 重さ を足す。敵の爆発でも動く
 * （Orb は誰の物でもない）。中心が爆心と同じなら真上へ
 */
export function pushOrbsByBlast(game, x, y) {
    for (const orb of game.orbs || []) {
        const dx = orb.cx - x, dy = orb.cy - y;
        const d = Math.hypot(dx, dy);
        if (d > ORB_BLAST_RADIUS) continue;
        const k = (ORB_BLAST_IMPULSE * (1 - d / ORB_BLAST_RADIUS)) / orb.mass;
        if (d < 1e-9) { orb.vy -= k; continue; }
        orb.vx += (dx / d) * k;
        orb.vy += (dy / d) * k;
    }
}
