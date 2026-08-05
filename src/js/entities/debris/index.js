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
    DEBRIS_SPIN_SCALE, DEBRIS_SPEED_JITTER,
} from '../../utils/Constants.js';
import { droneDebris } from './droneParts.js';
import { playerDebris } from './playerParts.js';
import { tankDebris } from './tankParts.js';
import { turretDebris } from './turretParts.js';
import { attackerDebris } from './attackerParts.js';

// 呼び出し側の利便のために再エクスポートする。
// ただし *Parts.js からは shapes.js を直接 import すること（循環参照になるため）。
export { segmentPart } from './shapes.js';

/** kind 文字列 → 機体スペック。各機体の die() が渡す文字列に対応する。 */
export const DEBRIS_SPECS = {
    drone: droneDebris,
    player: playerDebris,
    tank: tankDebris,
    turret: turretDebris,
    attacker: attackerDebris,
};

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
    const cx = entity.width / 2;
    const cy = entity.height / 2;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    const out = [];
    for (const part of parts) {
        // 実際の描画（例: EnemyDrone.draw()）は
        //   translate(center) → rotate(rotation) → scale(mirrored ? -1 : 1, 1)
        // の順でキャンバス変換を積む。座標変換としては点に対して
        // 「先に mirror → 次に rotate」の順で適用されるのと同じ（R(θ)·M）。
        // ここも同じ順序で合成しないと、mirror と rotation が同時に
        // 非ゼロのとき符号がずれる（R(θ)·M ≠ M·R(θ)）。

        // 1. 機体中心からの相対座標
        const dx = part.x - cx;
        const dy = part.y - cy;

        // 2. 向きの反転（先に mirror）
        const mdx = mirrored ? -dx : dx;

        // 3. 機体中心まわりの回転（ドローンの傾きなど。mirror の後に適用）
        let rx = mdx;
        let ry = dy;
        if (rotation !== 0) {
            rx = mdx * cos - dy * sin;
            ry = mdx * sin + dy * cos;
        }

        const worldX = entity.x + cx + rx;
        const worldY = entity.y + cy + ry;

        let angle = mirrored ? -(part.angle || 0) : (part.angle || 0);
        angle += rotation;

        // 4. 初速 = 慣性 + 機体中心からの放射 / weight + 散らし
        //    放射方向は上で mirror→rotate 済みの (rx, ry) をそのまま使う。
        const weight = part.weight || 1;
        const radialX = rx;
        const radialY = ry;
        const radialLen = Math.hypot(radialX, radialY) || 1;
        const power = spec.burst / weight;
        const vx = (entity.vx || 0)
            + (radialX / radialLen) * power
            + (Math.random() - 0.5) * DEBRIS_SPEED_JITTER;
        const vy = (entity.vy || 0)
            + (radialY / radialLen) * power
            + (Math.random() - 0.5) * DEBRIS_SPEED_JITTER;

        // 横へ勢いよく飛んだ破片ほど速く回る（慣性を視覚的に一貫させる）
        const spin = vx * DEBRIS_SPIN_SCALE * (Math.random() < 0.5 ? -1 : 1);

        out.push(new DebrisPart({
            x: worldX, y: worldY,
            w: part.w, h: part.h,
            color: part.color,
            angle, vx, vy, spin,
            holdFrames: spec.holdFrames,
            lifetime: DEBRIS_LIFETIME + Math.floor(Math.random() * DEBRIS_LIFETIME_JITTER),
            game: entity.game || null,
        }));
    }
    return out;
}
