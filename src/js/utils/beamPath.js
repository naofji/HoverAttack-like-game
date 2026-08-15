// ============================================
// beamPath - 反射ビームの純ロジック
// ============================================
//
// ビームの帯は「節を積み上げ、節ごとに寿命で消える」形にしてある。
// 固定長で切り出す方式だと、節が反射の折れ点をまたぐと角をショートカットする
// 直線になり、反射のたびに帯が角でがたついて見えた。節を積み上げる形にして、
// 反射の瞬間に節を閉じれば、その問題が消える。
//
// canvas もマップの実体も要らないので、node のテストで直接試せる。

/**
 * 節を1フレームぶん歳を取らせる。寿命が尽きた節は落とす。
 *
 * 帯の長さは「節の寿命 × 速度」で決まる。固定の長さで切り出していた頃は、
 * 節が反射の折れ点をまたぐと角をショートカットする直線になり、反射のたびに
 * 帯が角でがたついて見えた。節を積み上げる形にして、反射の瞬間に節を閉じれば
 * その問題が消える。
 *
 * 引数は書き換えない（呼び出し側が前のフレームの節を持ち続けられるように）。
 *
 * @param {Array<{life:number}>} segments
 * @returns {Array} 新しい配列。中の節も新しいオブジェクト
 */
export function ageSegments(segments) {
    const out = [];
    for (const s of segments) {
        const life = s.life - 1;
        if (life > 0) out.push({ ...s, life });
    }
    return out;
}

/**
 * ビームを1フレーム進める。地形にめり込むなら跳ね返す。
 *
 * 反射面の法線は「縦か横か」の2通りしかない（地形が軸並行のタイルだけなので）。
 * そこで x だけ動かした場合と y だけ動かした場合をそれぞれ試し、どちらが
 * めり込むかで面を判別する。レイキャストでタイル境界の正確な交点を出す案も
 * あったが、速度 5px/frame ではズレが目に見えず、コード量が3倍違う。
 * （タイル16px に対して 3.2倍の余裕があるので 1フレームで壁を飛び越すことはない。
 * 速度を上げるときはここの値も見直すこと）
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
    // 反射回数と ticks（寿命）の上限がいずれ尽きて消える
    if (map.isSolidAtPixel(bx, by)) {
        return { x, y, vx: rvx, vy: rvy, bounced: true };
    }
    return { x: bx, y: by, vx: rvx, vy: rvy, bounced: true };
}
