// Carrier（母艦）の破片パーツ定義。可動部は無い。
// 描画が drawY = y - 8 として上へずらしているため、Y はすべて -8 済み。
// 下部船体は左右2片に割り、船が中央から裂けるように見せる。

export const carrierDebris = {
    holdFrames: 6,   // 母艦の喪失はゲーム的に最も重い。しっかりタメる
    burst: 2.8,
    mirrored: () => false,   // 母艦は左右反転しない
    parts: [
        // 下部船体（左右2片）
        { x: 18, y: 14, w: 28, h: 16, color: '#1a3a6a', weight: 2.2 },
        { x: 46, y: 14, w: 28, h: 16, color: '#1a3a6a', weight: 2.2 },
        // 上部船体（赤）
        { x: 32, y: 4, w: 48, h: 8, color: '#AA2222', weight: 1.8 },
        // 発着デッキ
        { x: 32, y: -1.5, w: 32, h: 5, color: '#CC9900', weight: 1.2 },
        // コックピット窓
        { x: 32, y: 4, w: 8, h: 4, color: '#00AAFF', weight: 0.6 },
        // エンジンポッド
        { x: 4, y: 15, w: 8, h: 10, color: '#2255AA', weight: 1.4 },
        { x: 60, y: 15, w: 8, h: 10, color: '#2255AA', weight: 1.4 },
    ],
};
