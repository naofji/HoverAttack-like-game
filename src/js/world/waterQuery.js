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
import { supportsWater } from './waterRules.js';

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
 *
 * 「直下が支えない」はシミュレーションと同じ supportsWater で読む。違うのは満水の
 * セルを除くところだけで、これは上の表の B と C の差そのもの（意図した食い違い）。
 * 代わりに、棚から棚へ階段状に流れ落ちる途中の満水のセル（真下は落ちた水がすぐ横へ
 * 流れ去るのでほぼ空気）は、滝ではなく水面の四角に見える（2026-10-10 実機の指摘。
 * 20週×撃ち抜き12回で延べ498セル・最長60フレーム、すべて水量8）。落下が横の流れより
 * 8倍遅いことから来ていて、落下を速めると消えるが滝の点滅が16〜19倍になった
 */
export function isFallingCell(water, rows, cols, isSolid, r, c) {
    const mass = water[r * cols + c];
    if (mass < MIN_WATER_MASS || mass >= MAX_WATER_MASS) return false;
    return !supportsWater(water, rows, cols, isSolid, r + 1, c);
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

        if (isFallingCell(water, rows, cols, isSolid, r, c)) {
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
 * @param {function(number): void|null} [p.touch] 渡されたら、surfaceY の値を変える直前に
 *   そのセルで呼ぶ（rebuildWaterCache が、作り直した列の外で液面が変わったセルを拾うため）
 * @returns {Array<[number, number]>} かたまりに含まれるセルの [行, 列]
 */
export function levelSurfaceSegment({ water, kind, surfaceY, rows, cols, isSolid, r, c, touch = null }) {
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
        if (touch && surfaceY[sr * cols + sc] !== avg) touch(sr * cols + sc);
        surfaceY[sr * cols + sc] = avg;

        // 下へ: 同じ水塊の水中セルにも液面を持たせる。これが無いと、水面が
        // 1段上にある列で「水中セルはタイル全部を塗る」ことになり、液面より
        // 上まで青くなる
        for (let rr = sr + 1; rr < rows; rr++) {
            const kk = rr * cols + sc;
            if (kind[kk] !== WATER_BODY) break;
            if (touch && surfaceY[kk] !== avg) touch(kk);
            surfaceY[kk] = avg;
        }

        // 上へ: 液面がこのタイルより上にあるなら、真上の空セルにも持たせる。
        // これが無いと、水面が1段下にある列で塗りが液面まで届かない
        if (sr - 1 >= 0) {
            const ka = (sr - 1) * cols + sc;
            if (kind[ka] === WATER_NONE) {
                const ya = (avg < sr * TILE_SIZE && !isSolid(sr - 1, sc)) ? avg : -1;
                if (touch && surfaceY[ka] !== ya) touch(ka);
                surfaceY[ka] = ya;
            }
        }
    }

    return cells;
}

/**
 * セル (r, c) の塗りの上端 Y（前景の水をここから下へ塗る。岩の背後もこれを読む）。無ければ -1。
 * kind・surfaceY が決まったあとに呼ぶ。
 *
 * - 岩・滝: -1。滝は1本の流れとして毎フレーム帯で描く（waterfallRuns.js）ので塗らないし、
 *   帯は細いので岩の背後を埋める根拠にもしない
 * - 液面がかかっている: 液面そのもの（タイルより上でもそのまま。切り取りは描く側）
 * - 液面を持たない水（天井付き＝水中セル、または浮いた岩の真下）: 満水ならタイル全体、
 *   満ちていないなら実際の水量ぶんだけ浅く。常にタイル全体で塗ると、浅い湖に浮いた岩の
 *   真下だけ水面より高く塗られて「水面が岩に吸い付いて」見えた（実機の指摘）。
 *   ただし**沈んでいる**セル（覆う岩の上にも水がある）はタイル全体。水量の量子化で 8 に
 *   1つ足りないだけのことが多く、水量ぶんだけ塗ると岩の真下に細い透明な帯が残る
 *
 * 以前はこれを描画側（environment/water.js の waterTopY / ceiledWaterTopY）が毎回計算して
 * いて、どのセルの塗りが変わったかも描画側が推測していた（水量が変わったセルの上下1行と
 * 同じ行の水面）。液面の平均が遠くまで動く・岩の上の水で沈み判定が変わる、といった形を
 * 推測が取りこぼし、古い塗りの不具合が3回出た。値をここに焼いて前後を比べれば漏れない。
 *
 * 残っている穴: 岩に囲まれた1マスの横穴が湖の深さにあると、水量が 7 で止まったまま
 * 「上はずっと岩＝沈んでいない」と判定され、タイルの上に 2px の透明な帯が残る
 * （実測: 3000フレームで 8px ぶん1か所）。直すには液面を横方向にも塗り広げる必要がある
 */
function paintTopAt(water, kind, surfaceY, cols, isSolid, r, c) {
    const k = r * cols + c;
    const level = surfaceY[k];
    const mass = water[k];
    if (level < 0 && mass < MIN_WATER_MASS) return -1;   // 大半を占める空気のセルはここで終わる
    if (kind[k] === WATER_FALL || isSolid(r, c)) return -1;
    if (level >= 0) return level;
    if (mass >= MAX_WATER_MASS || isSubmergedFromAbove(water, isSolid, cols, r, c)) return r * TILE_SIZE;
    return (r + 1) * TILE_SIZE - Math.round((mass / MAX_WATER_MASS) * TILE_SIZE);
}

/**
 * (r, c) が泡のマスか: 空気で、真上が「滝でない水」、真下が水か岩（マップの底も岩とみなす）。
 * kind が決まったあとに呼ぶ。
 *
 * 落下（4フレームに1回・最大2）は横の流れ（毎フレーム最大4）の1/8しかないので、棚から棚へ
 * 流れ落ちる水は、満水のセルの真下がほとんどいつも空気という階段になる（落ちた水がすぐ横へ流れ去る）。
 * 満水のセルは種別では水面なので（isFallingCell の表のルール C）、宙に浮いた水の四角が水面の線つきで
 * 市松模様に並んで見えた（2026-10-10 実機の指摘）。その隙間を泡の多い水として塗る。
 * 種別は変えない — 当たり判定・水しぶきなど種別の読み手は今のまま（泡のマスは空気）。
 *
 * 20週×撃ち抜き12回（28,800フレーム）の実測:
 *   - 宙に浮いた満水の四角 延べ498。真下の隙間の下が水のもの 201、岩のもの 293
 *     （棚の床に落ちた水が横へ流れ去った跡）。真下を「水か岩」にして 494 を埋める
 *   - 真上が滝の空気（落ちる水滴と水滴の切れ目）は延べ12,480。これを泡にすると細い滝が泡の四角の
 *     列になるので外す
 *   - 真上が滝でない水の空気は、真上が必ず支えの無い満水のセル＝流れの途中なので、どれも数フレームで
 *     消える。泡かどうかの入れ替わりは28,800フレームで延べ360回
 */
function isFoamAt(water, kind, rows, cols, isSolid, r, c) {
    const k = r * cols + c;
    if (r === 0 || water[k] >= MIN_WATER_MASS || isSolid(r, c)) return false;
    const a = k - cols;
    if (water[a] < MIN_WATER_MASS || kind[a] === WATER_FALL || isSolid(r - 1, c)) return false;
    return r + 1 >= rows || isSolid(r + 1, c) || water[k + cols] >= MIN_WATER_MASS;
}

/**
 * 行 r のセルの塗りの上端 y のうち、描画に効く部分。読むのは自分の塗り（行 r のタイルで
 * 切り取る）と、8近傍の岩の背後の塗り（行 r-1..r+1 の岩のタイルで切り取る）なので、
 * 行 r-1 の上辺から行 r+1 の下辺までで頭打ちにする。深い水中セルの液面がはるか上で
 * 動いても描画は変わらないので、塗り直しの対象から外すのに使う。
 * 最初は自分のタイル（行 r）だけで切り取っていて、滝の受け口の水面の液面が1つ上の行の
 * 中で動いたとき、斜め上の岩の背後が 2px 古いまま残った（20週×撃ち抜き12回で2件）
 */
function paintedTop(y, r) {
    if (y < 0) return -1;
    return Math.max((r - 1) * TILE_SIZE, Math.min((r + 2) * TILE_SIZE, y));
}

/**
 * dirty な列の kind と surfaceY（と、渡されていれば paintTopY・foam）を作り直す。
 * 液面のセグメントは dirty でない列へはみ出すことがあるが、そちらの kind は
 * 既に正しい（水量が変わっていない）ので、そのまま伸ばして構わない。
 *
 * paintTopY は塗りの上端（paintTopAt）。repaint も渡すと、作り直しで**塗りが変わる
 * セル**をそこへ足す。描画キャッシュはこの一覧だけを塗り直す。
 * 計算し直すのは、作り直した列の全セルと、液面の区間がはみ出した先で液面が変わった
 * セル。塗りの上端が変わりうるのはそこだけ — 水量・種別・液面は作り直した列の中でしか
 * 変わらず（はみ出した先は液面だけ）、沈み判定は同じ列の上の水しか読まない。
 * 水量0のまま液面の高さだけで塗っている空セル（満水の水面の真上）も、ここで前後を
 * 比べるので拾える。以前は拾えず、水圧で池の水が一気に移った後に水面の上へ平らな水の
 * 四角が残った（実機の指摘。4面 seed 30 で掘り抜くと24マス）
 *
 * foam は泡のマス（isFoamAt）、foamCells はその一覧。泡のマスの塗りの上端はタイルの上辺で、
 * キャッシュの絵はそれ以外で泡に左右されない（粒は描画が毎フレーム描く）ので、塗り直しの判定には
 * 入れない。一覧は描画が泡の粒を生む場所を、マップ全体を走査せずに知るため（同時に多くて7マス）。
 * 泡は同じ列の上下しか読まないので、作り直した列だけで足りる（はみ出した先は液面しか変わらない）
 *
 * @param {Int16Array|undefined} [p.paintTopY] 塗りの上端。描画しないテストでは省略できる
 * @param {Uint8Array|undefined} [p.foam] 泡のマス（1/0）。paintTopY を渡すときは必ず一緒に渡す
 * @param {Set<number>|undefined} [p.foamCells] 泡のマスの一覧 (r * cols + c)。foam と一緒に保つ
 * @param {Set<number>|undefined} [p.repaint] 塗り直しの要るセル (r * cols + c) を足す先
 */
export function rebuildWaterCache({ water, kind, surfaceY, paintTopY, foam, foamCells, rows, cols, isSolid, dirtyCols, repaint }) {
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

    // 作り直した列の外で液面を書き換えたセル（区間のはみ出した先）。塗りの上端を計算し直す
    const spilled = [];
    const touch = paintTopY
        ? (k) => { if (!cols2.has(k % cols)) spilled.push(k); }
        : null;

    // 同じセグメントを何度も平均し直さないよう、片付いたセルを覚えておく
    const done = new Set();
    for (const c of seedCols) {
        for (let r = 0; r < rows; r++) {
            const k = r * cols + c;
            if (kind[k] !== WATER_SURFACE || done.has(k)) continue;
            const cells = levelSurfaceSegment({ water, kind, surfaceY, rows, cols, isSolid, r, c, touch });
            for (const [sr, sc] of cells) done.add(sr * cols + sc);
        }
    }

    if (!paintTopY) return;
    // 前の値は paintTopY 自身に残っているので、上書きする前に比べるだけでよい。
    // spilled に同じセルが2度入っても、2度目は前の値と同じなので何も足さない
    const update = (k, r, c) => {
        // 泡になれるのは空気のマスだけ。池の水のマスまで関数を呼ぶと作り直しが +13% になった
        const f = water[k] === 0 && isFoamAt(water, kind, rows, cols, isSolid, r, c) ? 1 : 0;
        const top = f ? r * TILE_SIZE : paintTopAt(water, kind, surfaceY, cols, isSolid, r, c);
        if (repaint && paintedTop(top, r) !== paintedTop(paintTopY[k], r)) repaint.add(k);
        paintTopY[k] = top;
        if (f !== foam[k] && foamCells) {
            if (f) foamCells.add(k); else foamCells.delete(k);
        }
        foam[k] = f;
    };
    // 空気のまま（水も液面も無く、前も塗っていない）で、真上が水でも滝でもないセルは、塗りの上端も -1、
    // 泡でもないままなので関数を呼ばずに飛ばす。作り直す列の大半はこれで、近道なしだと作り直しが +50%
    // （6シード合計の中央値 970→1,470µs）だった。真上の水を見ないと、真上に水が来て泡になるセルを飛ばす。
    // 真上の水量は1つ前の周回で読んだものを持ち越す（空気のマスごとに読み直すと作り直しが +7%）
    for (const c of cols2) {
        let wAbove = 0;
        for (let r = 0, k = c; r < rows; r++, k += cols) {
            const w = water[k];
            if (w === 0 && wAbove === 0 && paintTopY[k] === -1 && surfaceY[k] === -1) { wAbove = w; continue; }
            update(k, r, c);
            wAbove = w;
        }
    }
    for (const k of spilled) update(k, (k / cols) | 0, k % cols);
}
