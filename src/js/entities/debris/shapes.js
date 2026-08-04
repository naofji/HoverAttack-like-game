// 破片パーツの形状ヘルパー。
// パーツ定義の座標系は「機体バウンディングボックス左上原点・右向き」で、
// x, y はパーツの中心を指す。

/**
 * 線分を「回転した細長い矩形」として表すパーツを作る。
 * 脚のようにストロークで描かれている部品を破片へ落とし込むのに使う。
 * @returns {{x:number,y:number,w:number,h:number,color:string,weight:number,angle:number}}
 */
export function segmentPart(x1, y1, x2, y2, thickness, color, weight = 1) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return {
        x: (x1 + x2) / 2,
        y: (y1 + y2) / 2,
        w: Math.hypot(dx, dy),
        h: thickness,
        color,
        weight,
        angle: Math.atan2(dy, dx),
    };
}
