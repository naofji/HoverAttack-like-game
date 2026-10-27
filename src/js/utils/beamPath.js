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
 * ビームを1フレーム進める。地形または水面にめり込むなら跳ね返す。
 *
 * 反射面は、5面の坂と面取りの斜辺（45度）か、縦か横の面。斜辺は map.slopeHitAlong が
 * 「この移動で最初に触れた岩が斜辺か」と、その法線の符号の組 (sx, sy) を答えるので、
 * 完全な反射 v − 2(v·n)n を符号で書いた `vx' = −vy·sx·sy, vy' = −vx·sx·sy`（成分の入れ替え）に
 * する。速さが浮動小数の誤差でずれない（何度跳ねても REFLECT_BEAM_SPEED のまま）。
 *
 * 斜辺でなければ x だけ動かした場合と y だけ動かした場合をそれぞれ試し、どちらが
 * めり込むかで面を判別する。レイキャストでタイル境界の正確な交点を出す案も
 * あったが、速度 5px/frame ではズレが目に見えず、コード量が3倍違う。
 * （タイル16px に対して 3.2倍の余裕があるので 1フレームで壁を飛び越すことはない。
 * 速度を上げるときはここの値も見直すこと）。形のあるタイルが無い面（5面以外）では
 * slopeHitAlong が常に null なので、こちらの手順だけを通る。
 *
 * 光（レーザー）は水面でも反射するため、固体地形（isSolidPoint）に加えて
 * 水面境界（isWaterAtPixel の境）も反射面として扱う。水面境界で反射した場合は
 * 戻り値に waterBounced: true を付与する。
 *
 * 跳ね返るときは**元の位置から新しい速度で**動かす。こうすると壁の中に
 * 入り込まないうえ、折れ点が「元の位置」になる（呼び出し側はそこを経路に
 * 積めばよい）。
 *
 * @param {{x:number,y:number,vx:number,vy:number}} beam 書き換えない
 * @param {{isSolidPoint:function, slopeHitAlong:function, popOutOfRock:function, isWaterAtPixel?:function}} map
 * @returns {{x:number,y:number,vx:number,vy:number,bounced:boolean,waterBounced:boolean}}
 */
export function stepBeam(beam, map) {
    const { vx, vy } = beam;
    // 壊れて形が作り直され、居る所が岩になったら、先に真上の空中へ出す（Map.popOutOfRock。
    // 岩の中からは反転しても抜けられず、反射の回数が尽きるまでその場に留まった）
    const popped = map.popOutOfRock(beam.x, beam.y);
    const x = beam.x, y = popped !== null ? popped : beam.y;
    const nx = x + vx;
    const ny = y + vy;

    const isWater = (px, py) => (map.isWaterAtPixel ? map.isWaterAtPixel(px, py) : false);
    const currentWater = isWater(x, y);

    const isBlocked = (px, py) => {
        if (map.isSolidPoint(px, py)) return true;
        if (map.isWaterAtPixel && (isWater(px, py) !== currentWater)) return true;
        return false;
    };

    // 反射後は元の位置から新しい速度で動かす。反転しても抜けられない（隙間に挟まった）ときは
    // 動かさない。速度は反転したままなので次のフレームで反対側へ抜ける。抜けられないまま回っても、
    // 反射回数と ticks（寿命）の上限がいずれ尽きて消える
    const moveFrom = (rvx, rvy, waterBounced) => {
        const bx = x + rvx;
        const by = y + rvy;
        if (isBlocked(bx, by)) return { x, y, vx: rvx, vy: rvy, bounced: true, waterBounced };
        return { x: bx, y: by, vx: rvx, vy: rvy, bounced: true, waterBounced };
    };

    if (!isBlocked(nx, ny)) {
        return { x: nx, y: ny, vx, vy, bounced: false, waterBounced: false };
    }

    // 斜辺を水面より先に見る（水面の境と斜辺が 5px 以内で重なる所はほぼ無い）
    const slope = map.slopeHitAlong(x, y, nx, ny);
    if (slope) {
        const flip = slope.sx * slope.sy;
        return moveFrom(-vy * flip, -vx * flip, false);
    }

    const hitX = isBlocked(nx, y);
    const hitY = isBlocked(x, ny);

    let rvx = hitX ? -vx : vx;
    let rvy = hitY ? -vy : vy;
    // どちらの軸も単独ではめり込まない＝角へ斜めから入った。両方を反転する
    if (!hitX && !hitY) { rvx = -vx; rvy = -vy; }

    const waterBounced = Boolean(
        map.isWaterAtPixel && (
            (hitY && !map.isSolidPoint(x, ny) && isWater(x, ny) !== currentWater) ||
            (hitX && !map.isSolidPoint(nx, y) && isWater(nx, y) !== currentWater) ||
            (!hitX && !hitY && !map.isSolidPoint(nx, ny) && isWater(nx, ny) !== currentWater)
        )
    );

    return moveFrom(rvx, rvy, waterBounced);
}
