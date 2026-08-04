// EnemyTank の破片パーツ定義。可動部は無く、向きの反転のみ。
// 座標は EnemyTank.draw() の fillRect をそのまま中心指定へ直したもの。

export const tankDebris = {
    holdFrames: 2,
    burst: 2.0,
    parts: [
        { x: 8, y: 5.5, w: 14, h: 7, color: '#CCAA00', weight: 1.8 },  // 車体
        { x: 8, y: 3.5, w: 12, h: 3, color: '#DDBB22', weight: 0.7 },  // 車体上面
        { x: 11, y: 2, w: 6, h: 4, color: '#2266AA', weight: 1.1 },    // 砲塔
        { x: 16, y: 2, w: 4, h: 2, color: '#445566', weight: 0.5 },    // 砲身
        { x: 8, y: 10.5, w: 16, h: 3, color: '#334455', weight: 1.4 }, // ホバースカート
    ],
};
