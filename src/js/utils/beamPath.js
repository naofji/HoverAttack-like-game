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
 * @param {number} count 等分する数。整数であること（呼び出し側の契約）
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
        // 経路中に同じ座標が続く場合は読み飛ばす（距離ゼロなので折れ線には寄与しない）
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

/**
 * ビームを1フレーム進める。地形にめり込むなら跳ね返す。
 *
 * 反射面の法線は「縦か横か」の2通りしかない（地形が軸並行のタイルだけなので）。
 * そこで x だけ動かした場合と y だけ動かした場合をそれぞれ試し、どちらが
 * めり込むかで面を判別する。レイキャストでタイル境界の正確な交点を出す案も
 * あったが、速度 4px/frame ではズレが目に見えず、コード量が3倍違う。
 *
 * 跳ね返るときは**元の位置から新しい速度で**動かす。こうすると壁の中に
 * 入り込まないうえ、折れ点が「元の位置」になる（呼び出し側はそこを経路に
 * 積めばよい）。
 *
 * @param {{x:number,y:number,vx:number,vy:number}} beam 書き換えない
 * @param {{isSolidAtPixel:function}} map
 * @returns {{x:number,y:number,vx:number,vy:number,bounced:boolean}}
 */
export function stepBeam(beam, map) {
    const { x, y, vx, vy } = beam;
    const nx = x + vx;
    const ny = y + vy;

    if (!map.isSolidAtPixel(nx, ny)) {
        return { x: nx, y: ny, vx, vy, bounced: false };
    }

    const hitX = map.isSolidAtPixel(nx, y);
    const hitY = map.isSolidAtPixel(x, ny);

    let rvx = hitX ? -vx : vx;
    let rvy = hitY ? -vy : vy;
    // どちらの軸も単独ではめり込まない＝角へ斜めから入った。両方を反転する
    if (!hitX && !hitY) { rvx = -vx; rvy = -vy; }

    const bx = x + rvx;
    const by = y + rvy;
    // 反転しても抜けられない（隙間に挟まった）ときは動かさない。速度は反転
    // したままなので次のフレームで反対側へ抜ける。抜けられないまま回っても、
    // 反射回数と距離の上限がいずれ尽きて消える
    if (map.isSolidAtPixel(bx, by)) {
        return { x, y, vx: rvx, vy: rvy, bounced: true };
    }
    return { x: bx, y: by, vx: rvx, vy: rvy, bounced: true };
}
