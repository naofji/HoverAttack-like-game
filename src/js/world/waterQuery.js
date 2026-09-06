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
 * 1列ぶんの kind を決める。
 * 判定はすべて O(1) なので走査の向きは問わない（上から下へ1回）。
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

        // 水面か水中か。直上が岩なら「天井に張り付いた水」で液面ではない。
        // 直上が水でも、その水が落下中（滝）なら、こちらが液面になる
        // ＝滝が水たまりへ落ちてくる境目。旧 isWaterSurface と同じ扱い
        let isSurface;
        if (r === 0) {
            isSurface = true;
        } else if (isSolid(r - 1, c)) {
            isSurface = false;
        } else {
            const above = water[k - cols];
            const aboveIsWater = above >= MIN_WATER_MASS;
            const aboveIsFalling = aboveIsWater && above < MAX_WATER_MASS && mass < MAX_WATER_MASS;
            isSurface = !aboveIsWater || aboveIsFalling;
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
    // まず kind を決め直す。ここは水量が変わった列だけでよい
    for (const c of dirtyCols) {
        classifyWaterColumn({ water, kind, surfaceY, rows, cols, isSolid, c });
    }

    // 液面の平均を取り直す種を集める。dirty 列そのものに加えて**両隣**も見るのは、
    // セグメントが分裂したときを拾うため。ある列の水面が水面でなくなると、
    // そこを境に左右へ分かれた2本のセグメントは平均が変わるのに、その列には
    // もう水面セルが無いので、dirty 列だけを種にすると再平均が一度も走らない
    // （ランダムな水を30ステップ動かす突き合わせで実際に 257 vs 256 のずれが出た）。
    // 分裂は変化した列の場所でしか起きないので、1つ隣まで見れば足りる。
    const seedCols = new Set();
    for (const c of dirtyCols) {
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
