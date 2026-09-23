// ============================================
// waterQuery - 水量配列から「種別」と「液面の高さ」を導く（純関数）
// ============================================
//
// 「このセルは水か・水面か・滝か」は water[] から一意に決まるのに、以前は
// 問い合わせのたびにゼロから調べ直していた（滝判定が列を下へ走査し、液面が
// 行を左右に走査し、その中でまた滝判定を呼ぶ）。幅298タイルの水面で実測
// 22.4µs/回。エンティティごと・グレネードの軌道90ステップごとに呼ばれるので
// 毎フレーム数msを食っていた。
//
// ここで作る2本の配列に答えを焼いておき、水が変化した列だけ作り直す。
// 問い合わせ側は配列を1回読むだけになる。
//
// canvas も Map も参照しない純関数にしてあるのは、node --test でそのまま
// 検証できるようにするため。

import { MAX_WATER_MASS, MIN_WATER_MASS, TILE_SIZE } from '../utils/Constants.js';

export const WATER_NONE = 0;
export const WATER_BODY = 1;     // 水中（タイル全体が水）
export const WATER_SURFACE = 2;  // 液面を形成するセル
export const WATER_FALL = 3;     // 落下中（滝）

// surfaceY[k] の意味は「**そのセルにかかっている水塊の液面 Y(px)**」。無ければ -1。
// 水面セルだけでなく、その下の水中セルにも、液面がタイルより上に来るときは
// 真上の空セルにも同じ値を入れる。こうしないと、ひとつの水塊なのに列ごとに
// 塗りの上端が自分のタイルの上辺で頭打ちになり、**線は平らなのに塗りが段々に
// なる**（実機のスクリーンショットで指摘された。実測で線 73px に対し塗り 80px）。

/**
 * セルが落下中（滝）か。
 *
 * 「**満ちたセルは落ち着いた水であり、満ちたセルはその上の水を支える。
 * どちらも満ちていない縦の並びだけが、落下の途中の水柱**」という定義。
 *
 * 以前は「自分より下のどこかに空気がある」で判定していたため、湖底に穴が
 * 開くと水面までの列全部が滝と判定され、湖を貫く縦縞が出ていた。実際に
 * 3つのルールを走らせて「帯⇄満水」の往復回数（＝ちらつき）を数えた結果:
 *
 *   ルール                     湖底の爆破(120f)  宙に浮いた水柱  天井からの滝(300f)
 *   現行「下のどこかに空気」          49（縦縞バグ）     正しい          —
 *   A「直下が空気」                 11              取りこぼす      0
 *   B「直下が満水未満」             865（湖内に縞）    正しい          0
 *   C「自分も直下も満水未満」← これ    0              正しい          0
 */
export function isFallingCell(water, cols, isSolid, r, c) {
    const k = r * cols + c;
    const mass = water[k];
    if (mass < MIN_WATER_MASS || mass >= MAX_WATER_MASS) return false;
    if (isSolid(r + 1, c)) return false;
    return water[k + cols] < MAX_WATER_MASS;
}

/**
 * 岩に覆われたセルが「沈んでいる」か。覆っている岩を上へ抜けた先に水があれば沈んでいる。
 *
 * 同じ列しか見ないので、この答えが変わるときは必ずその列が dirty になる
 * （水量が動いた列は onWaterChanged、地形が変わった列は damageBlock が入れる）。
 * キャッシュとして安全に扱えるのはそのため。
 */
export function isSubmergedFromAbove(water, isSolid, cols, r, c) {
    let rr = r - 1;
    while (rr >= 0 && isSolid(rr, c)) rr--;
    if (rr < 0) return false;           // 岩がマップの天井まで続いている＝上に水は乗れない
    // 岩の上の水が半分以上あるときだけ沈んでいるとみなす。以前は1でもあれば沈んでいる
    // としていたので、岩の上面を流れる薄い水（滝が床に着いて落ち口へ流れていく水、
    // 水量1〜2）があるだけで、岩の真下のセルがタイル全体で塗られ、湖面より上に青い
    // 四角が浮いた（tools/render-water-scene.mjs で書き出して見つけた）
    return water[rr * cols + c] >= MAX_WATER_MASS / 2;
}

/**
 * 行 r の、(r, c) を含む「壁(isSolid(r,・))で区切られた連結区間」の中に、
 * **空気に face している水セル**（自分は水で、真上が岩でなく水でもない）があるか。
 *
 * 以前は「天井が岩でないセルが1つでもあるか」という地形だけの条件だった。
 * 地形だけなら水量が動いても答えが変わらず、キャッシュとして安全という利点が
 * あったが、条件が緩すぎて**深く沈んだ岩の下面に水面の線が出る**（実機の指摘）。
 * 区間の端が乾いた横穴に伸びているだけでも「天井が開いている」に当たるため。
 *
 * 実測（4面を6シード×2400フレーム、途中で爆破しながら、水塊の本当の液面と
 * 突き合わせて数えた。滝＝落下中の水柱は液面の候補から除く）:
 *
 *   条件                                   偽の液面(延べ/実セル)  取りこぼし
 *   旧「区間に岩でない天井がある」              493 / 63            0
 *   「区間に空気に face した水がある」だけ       80 / 20            0
 *   「覆う岩の上に水が無い」だけ                171 / 16            0
 *   両方 ← これ                               48 /  8            1
 *
 * 水量を読むので、隣の列の水が変わるとこの列の答えも変わりうる。dirty は列単位
 * なので、そのままでは「隣の列だけ作り直されて自分は古いまま」が起きる（実測で
 * 6シード×2400フレームに 109 セル、キャッシュと全列作り直しがずれた）。
 * そこで**探す範囲を左右 SEGMENT_LOOKUP_RANGE 列までに限り**、rebuildWaterCache
 * 側で dirty 列をその幅だけ広げて作り直す。これで「水が変わったのに作り直されない
 * 列」は構造的に存在しなくなる（tests/water-query.test.js が全列作り直しとの一致を縛る）。
 * 16 列に狭めても取りこぼしは増えない（実測: 無制限 48/8・±16 47/7・±8 47/7 だが
 * ±8 は取りこぼしが 1→26 に増える）。
 */
export const SEGMENT_LOOKUP_RANGE = 16;

function rowSegmentHasExposedWater(water, isSolid, r, c, cols) {
    if (r === 0) return true;
    const lo = Math.max(0, c - SEGMENT_LOOKUP_RANGE);
    const hi = Math.min(cols - 1, c + SEGMENT_LOOKUP_RANGE);
    let c0 = c;
    while (c0 - 1 >= lo && !isSolid(r, c0 - 1)) c0--;
    let c1 = c;
    while (c1 + 1 <= hi && !isSolid(r, c1 + 1)) c1++;
    for (let cc = c0; cc <= c1; cc++) {
        if (isSolid(r - 1, cc)) continue;
        if (water[r * cols + cc] < MIN_WATER_MASS) continue;      // 乾いた横穴は液面ではない
        if (water[(r - 1) * cols + cc] >= MIN_WATER_MASS) continue; // 上も水＝そこも沈んでいる
        return true;
    }
    return false;
}

/**
 * 1列ぶんの kind を決める。上から下へ1回走査する。
 * 水面かどうかは直上のセルの種別を読むので、この向きでなければならない。
 * @returns {Array<number>} この列で見つかった水面セルの行
 */
export function classifyWaterColumn({ water, kind, surfaceY, rows, cols, isSolid, c }) {
    const surfaceRows = [];
    for (let r = 0; r < rows; r++) {
        const k = r * cols + c;
        const mass = water[k];

        if (mass < MIN_WATER_MASS) {
            kind[k] = WATER_NONE;
            surfaceY[k] = -1;
            continue;
        }

        if (isFallingCell(water, cols, isSolid, r, c)) {
            kind[k] = WATER_FALL;
            surfaceY[k] = -1;
            continue;
        }

        // 水面か水中か。直上が岩なら基本は「天井に張り付いた水」で液面ではない
        // （満水ならタイル全体を塗るだけでよく、波を持たせる意味が無い）。
        // 岩の下でも水面として扱うのは、次の3つが揃ったときだけ:
        //   1. 満ちていない（満水なら液面はもっと上にある）
        //   2. 覆っている岩の上に水が乗っていない（乗っていれば沈んでいる。
        //      実機の指摘「水面下のはずなのにブロックの下面に水面が出る」）
        //   3. 同じ行の連結区間に、空気に face した水セルがある
        //      （地続きの本物の液面がすぐ隣に見えている。実機の指摘「浮いた岩の
        //      下だけ波の線が途切れる」。区間に1つも無いときは、量子化の残りかす
        //      のような孤立した浅い水を独立した波にしないため水面にしない）
        // 直上が水でも、その水が落下中（滝）なら、こちらが液面になる
        // ＝滝が水たまりへ落ちてくる境目。
        // 直上の種別は、上から走査しているので既に決まっている（kind[k - cols]）。
        // 以前は「直上が落下中か」を isFallingCell とは別の式で書き直していた
        // （展開すると同値だったが、定義が2つあると片方だけ直す事故が起きる。
        // 実際に別ブランチで isFallingCell だけに条件を足し、ずれを出した）
        let isSurface;
        if (r === 0) {
            isSurface = true;
        } else if (isSolid(r - 1, c)) {
            isSurface = mass < MAX_WATER_MASS
                && !isSubmergedFromAbove(water, isSolid, cols, r, c)
                && rowSegmentHasExposedWater(water, isSolid, r, c, cols);
        } else {
            const aboveKind = kind[k - cols];
            isSurface = aboveKind === WATER_NONE || aboveKind === WATER_FALL;
        }

        if (isSurface) {
            kind[k] = WATER_SURFACE;
            surfaceRows.push(r);
        } else {
            kind[k] = WATER_BODY;
            surfaceY[k] = -1;
        }
    }
    return surfaceRows;
}

/**
 * 隣の列 (r2, c2) の水面が、(r1, c1) と同じ水たまりの続きか。
 *
 * 水量は 8 段階に量子化されているので、ひとつの水たまりでも一番上の行が
 * 全幅を覆えないことがある（20 の水を 8 セルに配ると 3,3,3,3,2,2,2,2）。
 * すると水面が2つの行にまたがり、行ごとに平均すると**つながっているはずの
 * 液面に段差が出る**（実測で 46px と 48px に割れた）。だから1行の差までは
 * 同じ水たまりとして繋ぐ。
 *
 * ただし岩の縁を挟んで隣り合っただけの別々の水たまりを繋いではいけない。
 * 「深いほうの行で**両方の列とも水**」を条件にすると、あいだに岩があるときは
 * その行が岩になるので繋がらない。
 */
function sameBody(water, cols, r1, c1, r2, c2) {
    if (Math.abs(r1 - r2) > 1) return false;
    const deep = Math.max(r1, r2);
    return water[deep * cols + c1] >= MIN_WATER_MASS
        && water[deep * cols + c2] >= MIN_WATER_MASS;
}

/**
 * 水面セル (r, c) がつながっている水面のかたまりを集め、平均の液面 Y を全員に書く。
 *
 * 平均にするのは、水量がセルごとにバラついていても液面を水平に見せるため
 * （バラついたまま描くと水面がギザギザになる）。
 *
 * 左右へ「1本の経路」を辿るのではなく塗り広げ（幅優先）にしてあるのは、
 * どのセルから始めても必ず同じかたまりになるようにするため。経路を辿る形だと
 * 段差の分かれ道でどちらへ進むかが開始セルに依存し、種にした列によって液面が
 * 変わりうる。
 *
 * @returns {Array<[number, number]>} かたまりに含まれるセルの [行, 列]
 */
export function levelSurfaceSegment({ water, kind, surfaceY, rows, cols, isSolid, r, c }) {
    const cells = [];
    const seen = new Set([r * cols + c]);
    const queue = [[r, c]];

    while (queue.length) {
        const [cr, cc] = queue.pop();
        cells.push([cr, cc]);
        for (const dc of [-1, 1]) {
            const nc = cc + dc;
            if (nc < 0 || nc >= cols) continue;
            for (const nr of [cr - 1, cr, cr + 1]) {
                if (nr < 0 || nr >= rows) continue;
                const nk = nr * cols + nc;
                if (seen.has(nk)) continue;
                if (kind[nk] !== WATER_SURFACE) continue;
                if (!sameBody(water, cols, cr, cc, nr, nc)) continue;
                seen.add(nk);
                queue.push([nr, nc]);
            }
        }
    }

    let total = 0;
    for (const [sr, sc] of cells) {
        total += (sr + 1 - water[sr * cols + sc] / MAX_WATER_MASS) * TILE_SIZE;
    }
    // 整数に丸めるのは描画（fillRect）と当たり判定を1ドットもずらさないため。
    // 以前は描画側だけが Math.round していて、最大0.5px ずれていた
    const avg = Math.round(total / cells.length);

    for (const [sr, sc] of cells) {
        surfaceY[sr * cols + sc] = avg;

        // 下へ: 同じ水塊の水中セルにも液面を持たせる。これが無いと、水面が
        // 1段上にある列で「水中セルはタイル全部を塗る」ことになり、液面より
        // 上まで青くなる
        for (let rr = sr + 1; rr < rows; rr++) {
            const kk = rr * cols + sc;
            if (kind[kk] !== WATER_BODY) break;
            surfaceY[kk] = avg;
        }

        // 上へ: 液面がこのタイルより上にあるなら、真上の空セルにも持たせる。
        // これが無いと、水面が1段下にある列で塗りが液面まで届かない
        if (sr - 1 >= 0) {
            const ka = (sr - 1) * cols + sc;
            if (kind[ka] === WATER_NONE) {
                surfaceY[ka] = (avg < sr * TILE_SIZE && !isSolid(sr - 1, sc)) ? avg : -1;
            }
        }
    }

    return cells;
}

/**
 * dirty な列の kind と surfaceY を作り直す。
 * 液面のセグメントは dirty でない列へはみ出すことがあるが、そちらの kind は
 * 既に正しい（水量が変わっていない）ので、そのまま伸ばして構わない。
 */
export function rebuildWaterCache({ water, kind, surfaceY, rows, cols, isSolid, dirtyCols }) {
    // 岩の下のセルが水面かどうかは、同じ行の左右 SEGMENT_LOOKUP_RANGE 列までの
    // 水量にも依存する（rowSegmentHasExposedWater）。だから水量が変わった列だけ
    // 作り直すと、その範囲内の列が古いまま取り残される。作り直す列を左右へ
    // 広げておく（重複は Set が畳む。実測で全列作り直しとの差が 0 になる）
    const cols2 = new Set();
    for (const c of dirtyCols) {
        const lo = Math.max(0, c - SEGMENT_LOOKUP_RANGE);
        const hi = Math.min(cols - 1, c + SEGMENT_LOOKUP_RANGE);
        for (let cc = lo; cc <= hi; cc++) cols2.add(cc);
    }

    // まず kind を決め直す
    for (const c of cols2) {
        classifyWaterColumn({ water, kind, surfaceY, rows, cols, isSolid, c });
    }

    // 液面の平均を取り直す種を集める。dirty 列そのものに加えて**両隣**も見るのは、
    // セグメントが分裂したときを拾うため。ある列の水面が水面でなくなると、
    // そこを境に左右へ分かれた2本のセグメントは平均が変わるのに、その列には
    // もう水面セルが無いので、dirty 列だけを種にすると再平均が一度も走らない
    // （ランダムな水を30ステップ動かす突き合わせで実際に 257 vs 256 のずれが出た）。
    // 分裂は変化した列の場所でしか起きないので、1つ隣まで見れば足りる。
    const seedCols = new Set();
    for (const c of cols2) {
        if (c - 1 >= 0) seedCols.add(c - 1);
        seedCols.add(c);
        if (c + 1 < cols) seedCols.add(c + 1);
    }

    // 同じセグメントを何度も平均し直さないよう、片付いたセルを覚えておく
    const done = new Set();
    for (const c of seedCols) {
        for (let r = 0; r < rows; r++) {
            const k = r * cols + c;
            if (kind[k] !== WATER_SURFACE || done.has(k)) continue;
            const cells = levelSurfaceSegment({ water, kind, surfaceY, rows, cols, isSolid, r, c });
            for (const [sr, sc] of cells) done.add(sr * cols + sc);
        }
    }
}
