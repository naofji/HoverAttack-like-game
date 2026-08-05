// EnemyDrone の破片パーツ定義。
// 元の描画は機体中心を原点にしているので、ここでは +12/+8 して
// バウンディングボックス左上原点（24x16）へ揃えてある。
// 向きの反転は patrolDir、機体の傾きは tiltAngle が持つ。

export const droneDebris = {
    holdFrames: 0,   // 雑魚なのでタメなしで即分解する
    burst: 2.2,
    mirrored: (e) => e.patrolDir < 0,
    rotation: (e) => e.tiltAngle || 0,
    parts: [
        // 中央コア
        { x: 12, y: 8, w: 12, h: 8, color: '#445566', weight: 1.6 },
        // 前後アーム
        { x: 22, y: 7.5, w: 8, h: 3, color: '#8899AA', weight: 0.7 },
        { x: 2, y: 7.5, w: 8, h: 3, color: '#8899AA', weight: 0.7 },
        // 前後モーターポッド
        { x: 26, y: 7, w: 4, h: 6, color: '#334455', weight: 0.9 },
        { x: -2, y: 7, w: 4, h: 6, color: '#334455', weight: 0.9 },
        // アイ
        { x: 16, y: 10, w: 5, h: 5, color: '#FFCC00', weight: 0.5 },
        // 機銃
        { x: 13, y: 13.5, w: 6, h: 3, color: '#222222', weight: 0.6 },
    ],
};
