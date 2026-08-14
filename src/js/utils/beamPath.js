// ============================================
// beamPath - 反射ビームの純ロジック
// ============================================
//
// ビームの「見えている帯」と「当たる帯」は同じでなければならない。当たり判定が
// ビーム全体である以上、両者が1pxでも食い違えばそのまま理不尽さになる。
// そこで帯の切り出しをこの1つの関数に閉じ込め、描画も当たり判定もこれを呼ぶ。
//
// canvas もマップの実体も要らないので、node のテストで直接試せる。

/**
 * 通った経路から、先端側の一定の長さぶんを切り出して等分した線分の列を返す。
 *
 * @param {Array<{x:number,y:number}>} path 経路。**[0] が先端（新しい順）**
 * @param {number} tailLength 切り出す長さ(px)
 * @param {number} count 等分する数
 * @returns {Array<{x1:number,y1:number,x2:number,y2:number}>} 先端から後ろへ並ぶ線分
 */
export function beamSegments(path, tailLength, count) {
    if (!path || path.length < 2 || count < 1 || tailLength <= 0) return [];

    // 先端から遡って tailLength ぶんの折れ線を作る。経路が足りなければ
    // そこで打ち切る（撃った直後は帯が短い。伸びていく様子が見えるのが正しい）
    const poly = [path[0]];
    let remain = tailLength;
    for (let i = 1; i < path.length && remain > 0; i++) {
        const a = poly[poly.length - 1];
        const b = path[i];
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d <= 0) continue;
        if (d >= remain) {
            const t = remain / d;
            poly.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
            remain = 0;
        } else {
            poly.push(b);
            remain -= d;
        }
    }

    const usable = tailLength - remain;
    if (usable <= 0) return [];

    // 折れ線を弧長で等分する。折れ点をまたぐ節は、そこで曲がったまま出る
    const step = usable / count;
    const out = [];
    let segIdx = 0;   // poly の何本目の区間にいるか
    let segPos = 0;   // その区間の中で進んだ距離
    let cur = poly[0];

    for (let i = 0; i < count; i++) {
        const x1 = cur.x;
        const y1 = cur.y;
        let need = step;

        while (need > 0 && segIdx < poly.length - 1) {
            const a = poly[segIdx];
            const b = poly[segIdx + 1];
            const segLen = Math.hypot(b.x - a.x, b.y - a.y);
            if (segLen <= 0) { segIdx++; segPos = 0; continue; }

            const rest = segLen - segPos;
            if (rest > need) {
                segPos += need;
                const t = segPos / segLen;
                cur = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
                need = 0;
            } else {
                need -= rest;
                segIdx++;
                segPos = 0;
                cur = poly[segIdx];
            }
        }
        out.push({ x1, y1, x2: cur.x, y2: cur.y });
    }
    return out;
}
