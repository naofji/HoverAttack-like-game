// EnemyAttacker の破片パーツ定義。
// 胴体は draw() の型別分岐に、脚は _collectLegPoses() が返す関節座標に対応する。
// 座標は機体左上原点・右向き（16x24）。

import { segmentPart } from './shapes.js';

/**
 * 型別の胴体・頭部・装甲・砲。crouchOffset は draw() が全体を下げる量。
 * @returns {Array}
 */
export function attackerBodyParts(attacker) {
    const cfg = attacker.config;
    const type = cfg.name;
    const dy = (attacker.crouching || attacker.burstCount > 0) ? 4 : 0;
    const at = (x, y, w, h, color, weight) => ({ x, y: y + dy, w, h, color, weight });

    if (type === 'heavy') {
        return [
            at(6, 4, 6, 4, cfg.backpackColor, 0.9),   // 肩装甲
            at(10, 10.5, 12, 13, cfg.bodyColor, 1.8), // 胴体
            at(10.5, 2, 9, 6, cfg.headColor, 1.1),    // 頭部
            at(12, 2, 4, 2, cfg.visorColor, 0.4),     // バイザー
            at(17, 10, 6, 4, '#666666', 0.8),         // 主砲
            at(19.5, 10, 3, 4, '#999999', 0.5),       // 砲口
        ];
    }
    if (type === 'rival') {
        return [
            at(10, 10, 8, 12, cfg.bodyColor, 1.5),
            at(10, 2.5, 6, 5, cfg.headColor, 1.0),
            at(11, -2, 2, 2, cfg.headColor, 0.4),     // ホーン
            at(12, -0.5, 2, 3, cfg.headColor, 0.4),
            at(11.5, 2, 3, 2, cfg.visorColor, 0.4),
            at(17, 7, 8, 2, '#777777', 0.6),          // 砲身
            at(3.5, 8.5, 5, 5, cfg.backpackColor, 0.9),
        ];
    }
    if (type === 'artillery') {
        return [
            at(10.5, 10.5, 11, 11, cfg.bodyColor, 1.7),
            at(10.5, 3.5, 7, 5, cfg.headColor, 1.0),
            at(12.5, 3, 3, 2, cfg.visorColor, 0.4),
            at(20, 9, 12, 2, '#555555', 0.7),         // 長砲身
            at(25, 9, 2, 4, '#888888', 0.4),
            segmentPart(3, 4 + dy, 6, -4 + dy, 1.5, cfg.exhaustColor, 0.4), // アンテナ
        ];
    }
    return [
        at(10, 10, 10, 12, cfg.bodyColor, 1.6),
        at(10, 2.5, 8, 5, cfg.headColor, 1.0),
        at(11.5, 2.5, 3, 3, cfg.visorColor, 0.4),
        at(4, 9, 4, 8, cfg.backpackColor, 0.9),
        at(4, 13, 4, 2, cfg.exhaustColor, 0.4),
        at(15.5, 8, 5, 2, '#777777', 0.6),
        at(18, 8, 2, 2, '#999999', 0.4),
    ];
}

/**
 * 死亡時の脚のポーズを破片にする。
 * 関節座標の計算そのものは EnemyAttacker._collectLegPoses() が持っており、
 * ここは受け取った座標を線分パーツへ落とすだけ。
 */
export function attackerLegParts(attacker) {
    const cfg = attacker.config;
    const poses = attacker._collectLegPoses();
    const out = [];
    for (const pose of poses) {
        const legColor = pose.isNear ? cfg.bodyColor : cfg.headColor;
        const footColor = pose.isNear ? cfg.headColor : cfg.bodyColor;
        out.push(segmentPart(pose.hipX, pose.hipY, pose.kneeX, pose.kneeY, pose.lineWidth, legColor, 0.9));
        out.push(segmentPart(pose.kneeX, pose.kneeY, pose.footX, pose.footY, pose.lineWidth, footColor, 0.7));
    }
    return out;
}

export const attackerDebris = {
    holdFrames: 4,
    burst: 2.4,
    parts: [],   // 全パーツが型とポーズに依存するので getDebrisParts() から供給する
};
