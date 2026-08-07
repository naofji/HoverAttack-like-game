// ============================================
// Debris Factory - パーツ定義からワールド座標の破片を作る
// ============================================
// パーツ定義の座標系は全機体で統一されている:
//   原点 = 機体バウンディングボックス左上 (entity.x, entity.y)
//   向き = 右向き (facingRight = true) のときの見た目
//   x, y = パーツの中心（左上ではない）
// ローカル→ワールドの変換は、この1ファイルだけが知っている。

import { DebrisPart } from '../DebrisPart.js';
import {
    DEBRIS_LIFETIME, DEBRIS_LIFETIME_JITTER,
    DEBRIS_SPIN_TORQUE, DEBRIS_SPEED_JITTER,
    DEBRIS_SPLIT_PIECES, DEBRIS_SPLIT_MIN_SIZE, DEBRIS_SPLIT_RATIO_JITTER,
    DEBRIS_SLAT_CHANCE, DEBRIS_SLAT_SPIN_BOOST, DEBRIS_ISOTROPIC_MIX,
    DEBRIS_UPWARD_BIAS, DEBRIS_SPEED_VARY,
    DEBRIS_SPLIT_SPREAD, DEBRIS_SPLIT_SPREAD_JITTER,
    DEBRIS_SPLIT_JITTER, DEBRIS_SPLIT_SPIN_JITTER,
} from '../../utils/Constants.js';
import { droneDebris } from './droneParts.js';
import { playerDebris } from './playerParts.js';
import { tankDebris } from './tankParts.js';
import { turretDebris } from './turretParts.js';
import { attackerDebris } from './attackerParts.js';
import { carrierDebris } from './carrierParts.js';

/** kind 文字列 → 機体スペック。各機体の die() が渡す文字列に対応する。 */
export const DEBRIS_SPECS = {
    drone: droneDebris,
    player: playerDebris,
    tank: tankDebris,
    turret: turretDebris,
    attacker: attackerDebris,
    carrier: carrierDebris,
};

/**
 * ローカル座標を「箱の中心を原点とし、反転と回転を適用した」相対座標へ移す。
 * 実際の描画は translate(center) → rotate → scale(-1,1) の順にキャンバス変換を
 * 積むので、点への適用は「先に mirror → 次に rotate」になる。
 */
function transformLocal(lx, ly, cx, cy, mirrored, rotation) {
    const dx = lx - cx;
    const dy = ly - cy;
    const mdx = mirrored ? -dx : dx;
    if (rotation === 0) return { x: mdx, y: dy };
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return { x: mdx * cos - dy * sin, y: mdx * sin + dy * cos };
}

/** 被弾位置が記録されているか。 */
function hasHitPoint(entity) {
    return Number.isFinite(entity.lastHitX) && Number.isFinite(entity.lastHitY);
}

/** ローカル座標を、反転・回転を適用したうえでワールド座標へ移す。 */
function localToWorld(local, entity, cx, cy, mirrored, rotation) {
    const t = transformLocal(local.cx, local.cy, cx, cy, mirrored, rotation);
    return { x: entity.x + cx + t.x, y: entity.y + cy + t.y };
}

/**
 * パーツの面積重心を返す。パーツが箱の中心に対して偏って配置されている機体で、
 * 放射方向が片側へ寄るのを防ぐ。パーツが無ければ箱の中心へ落とす。
 */
function partsCentroid(parts, entity) {
    let area = 0;
    let sx = 0;
    let sy = 0;
    for (const p of parts) {
        const a = p.w * p.h;
        area += a;
        sx += p.x * a;
        sy += p.y * a;
    }
    if (area <= 0) return { cx: entity.width / 2, cy: entity.height / 2 };
    return { cx: sx / area, cy: sy / area };
}

/** 既定の向き判定。facingRight を持たない機体はスペック側で上書きする。 */
const defaultMirrored = (e) => e.facingRight === false;
const defaultRotation = () => 0;

/**
 * 機体から破片の配列を組み立てる。
 * 可動部を持つ機体は getDebrisParts() を実装し、死亡時点のポーズを
 * 焼き込んだパーツ配列を返す。持たない機体はスペックの静的テーブルを使う。
 * @returns {DebrisPart[]}
 */
export function buildDebris(entity, kind) {
    const spec = DEBRIS_SPECS[kind];
    if (!spec) return [];

    const parts = (typeof entity.getDebrisParts === 'function')
        ? entity.getDebrisParts()
        : spec.parts;
    if (!parts || parts.length === 0) return [];

    const mirrored = (spec.mirrored || defaultMirrored)(entity);
    const rotation = (spec.rotation || defaultRotation)(entity);

    // 反転・回転の軸は箱の中心。描画側（各機体の draw）と同じでなければならない。
    const cx = entity.width / 2;
    const cy = entity.height / 2;

    // 「どこから吹き飛ぶか」＝爆心。被弾位置が分かっていればそこを使う。
    // 実際に当たった場所から散るほうが自然で、破片の長軸が爆心方向と平行に
    // なりにくいぶん、トルクによる回転も立ちやすい（下の torqueSpinFactor 参照）。
    //
    // 分からない場合はパーツの面積重心へ落とす。箱の中心ではない理由は、
    // 母艦が drawY = y - 8 でずらして描くため全パーツが箱の中心より上にあり、
    // 箱の中心を使うと放射が上向きに偏るため（実測で上63% / 下37%）。
    const burstWorld = hasHitPoint(entity)
        ? { x: entity.lastHitX, y: entity.lastHitY }
        : localToWorld(partsCentroid(parts, entity), entity, cx, cy, mirrored, rotation);
    const out = [];
    for (const part of parts) {
        // 実際の描画（例: EnemyDrone.draw()）は
        //   translate(center) → rotate(rotation) → scale(mirrored ? -1 : 1, 1)
        // の順でキャンバス変換を積む。座標変換としては点に対して
        // 「先に mirror → 次に rotate」の順で適用されるのと同じ（R(θ)·M）。
        // ここも同じ順序で合成しないと、mirror と rotation が同時に
        // 非ゼロのとき符号がずれる（R(θ)·M ≠ M·R(θ)）。

        const { x: rx, y: ry } = transformLocal(part.x, part.y, cx, cy, mirrored, rotation);
        const worldX = entity.x + cx + rx;
        const worldY = entity.y + cy + ry;

        let angle = mirrored ? -(part.angle || 0) : (part.angle || 0);
        angle += rotation;

        // 4. 初速 = 慣性 + 機体中心からの放射 / weight + 散らし
        //    放射方向は上で mirror→rotate 済みの (rx, ry) をそのまま使う。
        const weight = part.weight || 1;
        const radX = worldX - burstWorld.x;
        const radY = worldY - burstWorld.y;
        const radialLen = Math.hypot(radX, radY) || 1;
        const power = spec.burst / weight;

        // 放射方向だけだと機体の輪郭に沿って平たく広がる（横長の母艦なら横一直線）。
        // 等方なランダム方向を混ぜて球状に散らし、さらに上向きの偏りを足す。
        // 爆発で吹き上がるので、上へ飛ぶ破片が多いほうが自然。
        const mix = DEBRIS_ISOTROPIC_MIX;
        const randAngle = Math.random() * Math.PI * 2;
        let dirX = (radX / radialLen) * (1 - mix) + Math.cos(randAngle) * mix;
        let dirY = (radY / radialLen) * (1 - mix) + Math.sin(randAngle) * mix - DEBRIS_UPWARD_BIAS;
        const dirLen = Math.hypot(dirX, dirY) || 1;
        dirX /= dirLen;
        dirY /= dirLen;

        // 破片ごとに速さを変える。全部同じだと爆発が「面」で広がって見える。
        const speed = power * (1 + (Math.random() - 0.5) * DEBRIS_SPEED_VARY);

        const vx = (entity.vx || 0)
            + dirX * speed
            + (Math.random() - 0.5) * DEBRIS_SPEED_JITTER;
        const vy = (entity.vy || 0)
            + dirY * speed
            + (Math.random() - 0.5) * DEBRIS_SPEED_JITTER;

        // 5. パーツをさらに 2x2 に割る。4片は元パーツの速度をそのまま共有し、
        //    パーツ中心から外向きへわずかに開くだけなので、飛び始めは元の
        //    かたちを保ったまま、飛びながら徐々にばらけて見える。
        pushSubdivided(out, {
            worldX, worldY, w: part.w, h: part.h,
            color: part.color, angle, vx, vy,
            burstX: burstWorld.x,
            burstY: burstWorld.y,
            holdFrames: spec.holdFrames,
            game: entity.game || null,
        });
    }
    return out;
}

/**
 * 破片が受けるトルクの向きと強さを返す（-1 〜 +1）。
 *
 * 爆風が細長い破片を押すとき、破片の軸が爆心方向に対して傾いていると
 * 力の作用線が重心を通らずトルクが生じる。その大きさは軸と爆心方向のなす角 θ に
 * 対して sin(2θ) に比例し、θ=45° で最大、0°（軸が爆心を向く）と 90°（垂直）で
 * ゼロになる。
 *
 * 符号はそのまま「爆心から遠いほうの端点が遠ざかる向き」になる。
 * 導出: 遠い端点を A とすると A は軸方向 d（d·u > 0、u は爆心から破片への単位ベクトル）
 * の側にある。ctx.rotate と同じ向きに角速度 ω で回すと A の速度は ω·perp(d) に比例し、
 * これが u と同じ向きを持つ条件が sign(ω) = sign(d×u)。
 * |sin(2θ)| = 2|d·u||d×u| なので、2(d×u)(d·u) が大きさと符号を同時に満たす。
 *
 * @param {number} mx 破片の中心 - 爆心（x成分）
 * @param {number} my 同（y成分）
 * @param {number} ax 破片の長辺の向き（単位ベクトル x）
 * @param {number} ay 同 y。向きは A/B どちらを指していてもよい（結果は同じ）
 * @returns {number} sin(2θ) 相当。正負が回転の向き
 */
export function torqueSpinFactor(mx, my, ax, ay) {
    const len = Math.hypot(mx, my);
    if (len < 1e-9) return 0;          // 爆心と重なっていれば向きが定まらない
    const ux = mx / len;
    const uy = my / len;

    // 軸は線分であって矢印ではない。爆心から見て外向きに取り直す
    let dx = ax;
    let dy = ay;
    if (dx * ux + dy * uy < 0) {
        dx = -dx;
        dy = -dy;
    }

    const cos = dx * ux + dy * uy;     // 0以上になった
    const cross = dx * uy - dy * ux;
    return 2 * cross * cos;            // = sin(2θ)、符号は遠い端点が遠のく向き
}

/**
 * 矩形を「いちばん面積の大きい片の長い辺を、ランダムな比率で2つに割る」を
 * 繰り返して砕く（ギロチン分割）。均等な格子と違って大きさがまちまちになり、
 * かつ分割片は元の矩形を隙間なく・重なりなく埋める（面積の合計が保存される）。
 *
 * 辺が DEBRIS_SPLIT_MIN_SIZE の2倍未満になった片はそれ以上割らないので、
 * 小さなパーツ（バイザーなど）が視認できない点まで砕けることはない。
 *
 * @param {number} w 元の矩形の幅
 * @param {number} h 元の矩形の高さ
 * @returns {Array<{cx:number,cy:number,w:number,h:number}>} 矩形中心を原点とした分割片
 */
export function splitRect(w, h) {
    const pieces = [{ cx: 0, cy: 0, w, h }];

    while (pieces.length < DEBRIS_SPLIT_PIECES) {
        // まだ割れる片のうち、いちばん面積の大きいものを選ぶ
        let target = -1;
        let largest = 0;
        for (let i = 0; i < pieces.length; i++) {
            const r = pieces[i];
            if (Math.max(r.w, r.h) < DEBRIS_SPLIT_MIN_SIZE * 2) continue;
            const area = r.w * r.h;
            if (area > largest) {
                largest = area;
                target = i;
            }
        }
        if (target < 0) break;   // これ以上割れない

        const r = pieces.splice(target, 1)[0];

        // 切るたびに軸を選ぶ。長い辺を割れば正方形へ寄り、短い辺を割れば細長くなる。
        // ここをパーツ単位で決めると、そのパーツの破片が全部同じ形になってしまう。
        const longAxisIsX = r.w >= r.h;
        const wantSlat = Math.random() < DEBRIS_SLAT_CHANCE;
        let alongX = wantSlat ? !longAxisIsX : longAxisIsX;
        // 選んだ軸が割れないほど短ければ、もう一方に回す
        if ((alongX ? r.w : r.h) < DEBRIS_SPLIT_MIN_SIZE * 2) alongX = !alongX;

        const len = alongX ? r.w : r.h;

        // 分割位置。どちら側も MIN_SIZE を下回らないよう内側へ寄せる
        const minT = DEBRIS_SPLIT_MIN_SIZE / len;
        let t = 0.5 + (Math.random() - 0.5) * DEBRIS_SPLIT_RATIO_JITTER;
        t = Math.max(minT, Math.min(1 - minT, t));

        const a = len * t;
        const b = len - a;
        if (alongX) {
            pieces.push({ cx: r.cx - r.w / 2 + a / 2, cy: r.cy, w: a, h: r.h });
            pieces.push({ cx: r.cx + r.w / 2 - b / 2, cy: r.cy, w: b, h: r.h });
        } else {
            pieces.push({ cx: r.cx, cy: r.cy - r.h / 2 + a / 2, w: r.w, h: a });
            pieces.push({ cx: r.cx, cy: r.cy + r.h / 2 - b / 2, w: r.w, h: b });
        }
    }

    return pieces;
}

/**
 * 1つのパーツをギロチン分割して破片として push する。
 * 分割片のローカルオフセットはパーツの回転角ぶん回してからワールドに置くので、
 * 傾いたパーツもその向きのまま割れる。
 *
 * 分割片がまったく同じ動きをすると全パーツが同じ開き方になって単調に見えるため、
 * 開く強さ・等方な散らし・角速度を分割片ごとに乱数でずらす。散らしは速度と
 * 角速度にだけ乗せ、初期位置には乗せない（飛び出しの瞬間は元のパーツのかたちを
 * 保ち、飛びながらばらけて見せるため）。
 */
function pushSubdivided(out, p) {
    const cos = Math.cos(p.angle);
    const sin = Math.sin(p.angle);

    for (const piece of splitRect(p.w, p.h)) {
        // 細長い破片ほどよく回る。形から決めるので、切り方を先に固定しなくてよい。
        const elongation = Math.max(piece.w, piece.h) / Math.min(piece.w, piece.h);
        const spinBoost = 1 + (DEBRIS_SLAT_SPIN_BOOST - 1)
            * Math.min(1, (elongation - 1) / 3);
        // パーツの向きに合わせてオフセットを回す
        const rx = piece.cx * cos - piece.cy * sin;
        const ry = piece.cx * sin + piece.cy * cos;

        // 開く方向はパーツ中心から見た外向き。分割片がちょうど中心に乗った
        // 場合（割れなかったパーツなど）はゼロ除算を避けて開かせない。
        const len = Math.hypot(rx, ry);
        const ux = len > 0 ? rx / len : 0;
        const uy = len > 0 ? ry / len : 0;

        // 開く強さを片ごとにばらつかせる。負にはしないので、平均としては
        // 必ず外向きに開く（= 元のかたちが保たれたまま散る）。
        const spread = DEBRIS_SPLIT_SPREAD
            * (1 + (Math.random() - 0.5) * DEBRIS_SPLIT_SPREAD_JITTER);

        // 回転は爆風のトルクから決める。破片の長辺が爆心方向に対して傾いている
        // ほど（45度で最大）強く回り、爆心から遠いほうの端点が遠のく向きになる。
        const px = p.worldX + rx;
        const py = p.worldY + ry;
        const alongX = piece.w >= piece.h;
        const axisX = alongX ? cos : -sin;      // 長辺の向きをパーツの回転ぶん回す
        const axisY = alongX ? sin : cos;
        const torque = torqueSpinFactor(px - p.burstX, py - p.burstY, axisX, axisY);

        // トルクがゼロになる向き（軸が爆心方向と平行／垂直）でも完全に止まって
        // 見えないよう、わずかなランダム成分を残す。
        const spin = torque * DEBRIS_SPIN_TORQUE * spinBoost
            + (Math.random() - 0.5) * DEBRIS_SPLIT_SPIN_JITTER;

        out.push(new DebrisPart({
            x: px,
            y: py,
            w: piece.w, h: piece.h,
            color: p.color,
            angle: p.angle,
            vx: p.vx + ux * spread + (Math.random() - 0.5) * DEBRIS_SPLIT_JITTER,
            vy: p.vy + uy * spread + (Math.random() - 0.5) * DEBRIS_SPLIT_JITTER,
            spin,
            holdFrames: p.holdFrames,
            lifetime: DEBRIS_LIFETIME + Math.floor(Math.random() * DEBRIS_LIFETIME_JITTER),
            game: p.game,
        }));
    }
}

/**
 * particles 配列に含まれる DebrisPart の同時存在数を上限内へ収める。
 * 古い破片（配列の先頭側）から落とし、破片以外のパーティクルには触れない。
 * 破壊的に particles を書き換える（main.js の spawnDebris がそのまま使う）。
 * @param {Array} particles
 * @param {number} max
 */
export function trimDebris(particles, max) {
    let excess = particles.filter((p) => p instanceof DebrisPart).length - max;
    if (excess <= 0) return;
    for (let i = 0; i < particles.length && excess > 0; i++) {
        if (particles[i] instanceof DebrisPart) {
            particles.splice(i, 1);
            i--;
            excess--;
        }
    }
}
