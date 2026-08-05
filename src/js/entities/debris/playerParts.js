// Player の破片パーツ定義。
// 座標は Player._drawBody / _drawSingleLeg / _drawBazooka の
// ローカル座標（機体左上原点・右向き）にそのまま対応する。
// 頭部とバイザーは1パーツにまとめてある（別々に飛ぶと顔が割れて見えるため）。

import { segmentPart } from './shapes.js';

/**
 * しゃがみ/ホバーで動かない部品。x, y はパーツ中心。
 * Player._drawBody() の fillRect と同じ crouchOffset を使って、
 * しゃがみ中・ドッキング中は胴体一式を脚と同じだけ下げる
 * （しゃがまないと頭部・胴体・バックパック・スラスターが直立時の位置のまま浮いてしまう）。
 * @returns {Array}
 */
export function playerBodyParts(player) {
    const isCrouched = player.crouching || player.docked;
    const crouchOffset = isCrouched ? 8 : 0;   // Player.draw() が _drawBody に渡す crouchOffset と同じ
    return [
        { x: 10, y: crouchOffset + 2.5, w: 8, h: 5, color: '#CCCCCC', weight: 1.0 },                                          // 頭部
        { x: 10, y: 4 + crouchOffset + (isCrouched ? 4 : 6), w: 10, h: isCrouched ? 8 : 12, color: '#E8E8E8', weight: 1.6 },  // 胴体
        { x: 4, y: 5 + crouchOffset + (isCrouched ? 3 : 4), w: 4, h: isCrouched ? 6 : 8, color: '#AAAAAA', weight: 1.0 },     // バックパック
        { x: 4, y: (isCrouched ? 10 : 12) + crouchOffset + 1, w: 4, h: 2, color: '#FF6600', weight: 0.5 },                    // スラスター
    ];
}

/**
 * 死亡時の脚のポーズを破片にする。
 * 関節座標の計算そのものは Player._collectLegPoses() が持っており、
 * ここは受け取った座標を線分パーツへ落とすだけ。
 * @returns {Array} パーツ4個（各脚の腿と脛）
 */
export function playerLegParts(player) {
    const out = [];
    for (const pose of player._collectLegPoses()) {
        const legColor = pose.isNear ? '#DDDDDD' : '#AAAAAA';
        const footColor = pose.isNear ? '#888888' : '#666666';
        out.push(segmentPart(pose.hipX, pose.hipY, pose.kneeX, pose.kneeY, pose.lineWidth, legColor, 0.9));
        out.push(segmentPart(pose.kneeX, pose.kneeY, pose.footX, pose.footY, pose.lineWidth, footColor, 0.7));
    }
    return out;
}

/**
 * 武装を、死亡時の狙い角度のまま2パーツで飛ばす。
 * しゃがみ中は武装が描かれていないので何も返さない。
 */
export function playerWeaponParts(player) {
    const isCrouched = player.crouching || player.docked;
    if (isCrouched) return [];

    const crouchOffset = 0;
    const angle = player._aimAngle(crouchOffset);
    // _drawBazooka / _drawMachineGun の回転中心（ローカル座標）
    const pivotX = player.width / 2 + 2;
    const pivotY = 6 + crouchOffset;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    /** 武装ローカル座標のパーツを、回転中心まわりに回して機体ローカルへ移す。 */
    const rotated = (lx, ly, w, h, color, weight) => ({
        x: pivotX + (lx * cos - ly * sin),
        y: pivotY + (lx * sin + ly * cos),
        w, h, color, weight, angle,
    });

    if (player.currentWeapon === 'missile') {
        return [
            rotated(3, 0, 22, 4, '#666666', 0.8),   // 砲身
            rotated(13, 0, 4, 6, '#444444', 0.6),   // マズル
        ];
    }
    return [
        rotated(1.5, 0.5, 7, 5, '#777777', 0.8),    // 機関部
        rotated(8, 0, 6, 2, '#666666', 0.5),        // 銃身
    ];
}

export const playerDebris = {
    holdFrames: 5,   // 自機の破壊は重い出来事なので、はっきりタメる
    burst: 2.6,
};
