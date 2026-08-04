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

// 呼び出し側の利便のために再エクスポートする。
// ただし *Parts.js からは shapes.js を直接 import すること（循環参照になるため）。
export { segmentPart } from './shapes.js';

/** kind 文字列 → 機体スペック。各機体の die() が渡す文字列に対応する。 */
export const DEBRIS_SPECS = {
    drone: droneDebris,
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
        // 1. 機体中心まわりの回転（ドローンの傾きなど）
        let lx = part.x;
        let ly = part.y;
        if (rotation !== 0) {
            const dx = lx - cx;
            const dy = ly - cy;
            lx = cx + (dx * cos - dy * sin);
            ly = cy + (dx * sin + dy * cos);
        }

        // 2. 向きの反転
        const worldX = entity.x + (mirrored ? entity.width - lx : lx);
        const worldY = entity.y + ly;

        let angle = (part.angle || 0) + rotation;
        if (mirrored) angle = -angle;

        // 3. 初速 = 慣性 + 機体中心からの放射 / weight + 散らし
        const weight = part.weight || 1;
        const radialX = (mirrored ? -(lx - cx) : (lx - cx));
        const radialY = ly - cy;
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
