// EnemySpider の破片パーツ定義。
// 描画（EnemySpider.draw）は箱の中心を原点に、張り付く面を「下」へ回して描いているので、
// ここでは +SPIDER_SIZE/2 して箱の左上原点へ揃えてある（ドローンと同じ流儀）。
// 向きの反転は進む向き、回転は張り付いている面が持つ（どちらも EnemySpider が計算する）。

// 脚の色。脚は線で描くので fillRect の対応が無く、一致テストはこの色のパーツを除いて比べる
export const SPIDER_LEG_COLOR = '#22262E';
export const SPIDER_BODY_COLOR = '#3A4150';
export const SPIDER_PLATE_COLOR = '#5A6578';
export const SPIDER_EYE_COLOR = '#FF3344';

export const spiderDebris = {
    holdFrames: 0,   // 雑魚なのでタメなしで即分解する（ドローンと同じ）
    burst: 2.2,
    mirrored: (e) => e._drawMirrored(),
    rotation: (e) => e._drawRotation(),
    parts: [
        // 胴
        { x: 7, y: 4, w: 10, h: 6, color: SPIDER_BODY_COLOR, weight: 1.4 },
        // 背の装甲板
        { x: 7, y: 1, w: 8, h: 2, color: SPIDER_PLATE_COLOR, weight: 0.6 },
        // 目
        { x: 10.5, y: 4, w: 3, h: 2, color: SPIDER_EYE_COLOR, weight: 0.4 },
        // 脚の先 4 本
        { x: 1, y: 12, w: 2, h: 4, color: SPIDER_LEG_COLOR, weight: 0.3 },
        { x: 4.5, y: 12, w: 2, h: 4, color: SPIDER_LEG_COLOR, weight: 0.3 },
        { x: 9.5, y: 12, w: 2, h: 4, color: SPIDER_LEG_COLOR, weight: 0.3 },
        { x: 13, y: 12, w: 2, h: 4, color: SPIDER_LEG_COLOR, weight: 0.3 },
    ],
};
