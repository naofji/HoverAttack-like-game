// ============================================
// waterSimulation - 水流シミュレーション（水槽・行単位レベリングモデル）
// ============================================
//
// 1タイルを 0..MAX_WATER_MASS (8) の水量で管理する。
// 「まず横方向に広がり、壁に当たって満たされたところで上方向に重なっていく」
// 理想的な物理挙動を、以下の2フェーズで実現する：
//
// 1. 垂直落下（重力・滝）:
//    直下が空洞（満水未満）なら、重力に従って直下へ落下する。
//
// 2. 横方向優先の水槽レベリング & 流出:
//    直下が床または満水のセル群（同一行の連結区間）を走査する。
//    - 区間内に落ち口（段差・穴など下に落ちられるセル）がある場合:
//      水は落ち口に向かって水平に流れる。
//    - 落ち口がない場合（＝底が完全に塞がれた容器・水たまりの層）:
//      その層全体に水量を均等配分する（完全水平レベリング）。
//      水位が上がるのは、その層が満ちて落ちられなくなった水がフェーズ1で
//      上の行に積み上がる結果であって、この層の処理が押し上げるのではない。
//
// アクティブなセルのみを追跡するため、水が静止すれば計算量は自動的にゼロになる。

import { MAX_WATER_MASS, MIN_WATER_MASS, WATER_MAX_FALL_FLOW, WATER_MAX_SPREAD_FLOW } from '../utils/Constants.js';

/**
 * 1ステップの水流計算（行単位水槽レベリングモデル）。
 *
 * @param {Object} params
 * @param {Uint8Array} params.water 水量配列 (0..MAX_WATER_MASS)。直接更新される。
 * @param {number} params.rows
 * @param {number} params.cols
 * @param {function(number, number): boolean} params.isSolid セルが固体（壁）か
 * @param {Set<number>|Array<number>} params.activeCells 現在水流がアクティブなセル (r * cols + c)
 * @returns {{ changedCells: Array<[number, number]>, nextActiveCells: Set<number> }}
 */
export function stepWaterSimulation({ water, rows, cols, isSolid, activeCells, doFall = true }) {
    const nextActiveCells = new Set();
    const changedSet = new Set();

    // フェーズ2で「動きのある区間」を探す種。行ごとの列の一覧で、前のフレームからの
    // アクティブと、このフレームで変化したセルの周り（markChanged が足す）の両方が入る
    const seedsByRow = new Map();
    const addSeed = (r, c) => {
        let list = seedsByRow.get(r);
        if (!list) seedsByRow.set(r, list = []);
        list.push(c);
    };

    const markChanged = (r, c) => {
        const key = r * cols + c;
        changedSet.add(key);
        // 周囲3x3を次回アクティブに追加
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const nr = r + dr;
                const nc = c + dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                    if (!isSolid(nr, nc)) {
                        const nk = nr * cols + nc;
                        if (!nextActiveCells.has(nk)) {
                            nextActiveCells.add(nk);
                            addSeed(nr, nc);
                        }
                    }
                }
            }
        }
    };

    if (!activeCells || activeCells.size === 0) {
        return { changedCells: [], nextActiveCells };
    }

    // 処理対象セルを下層（rが大きい）から順にソート
    const cellsToProcess = Array.from(activeCells)
        .map((k) => ({ r: Math.floor(k / cols), c: k % cols, k }))
        .sort((a, b) => b.r - a.r);
    for (const { r, c } of cellsToProcess) addSeed(r, c);

    // ----------------------------------------------------
    // フェーズ1: 垂直落下（重力・滝）
    // ----------------------------------------------------
    if (doFall) {
        for (const { r, c, k } of cellsToProcess) {
            let mass = water[k];
            if (mass === 0 || isSolid(r, c)) continue;

            if (r + 1 < rows && !isSolid(r + 1, c)) {
                const downKey = (r + 1) * cols + c;
                const downMass = water[downKey];
                if (downMass < MAX_WATER_MASS) {
                    const flow = Math.min(mass, MAX_WATER_MASS - downMass, WATER_MAX_FALL_FLOW);
                    if (flow > 0) {
                        water[k] -= flow;
                        water[downKey] += flow;
                        markChanged(r, c);
                        markChanged(r + 1, c);
                    }
                }
            }
        }
    }

    // ----------------------------------------------------
    // フェーズ2: 横方向優先の水槽レベリング & 流出
    // ----------------------------------------------------
    // アクティブなセルが存在する行（下から上へ処理）
    const activeRows = Array.from(new Set(cellsToProcess.map((c) => c.r)))
        .sort((a, b) => b - a);

    // 落ち口の最寄り探索用。区間の中の位置で引く（行ごとに使い回す）
    const nearLeft = new Int32Array(cols);
    const nearRight = new Int32Array(cols);

    // どの行の処理でその列を区間に含めたか（同じ区間を2度処理しないため）
    const coveredRow = new Int32Array(cols).fill(-1);

    for (const r of activeRows) {
        // 行 r の「動きのある区間」だけを処理する。種の列から左右の壁まで広げたものが
        // 区間。以前は「アクティブなセルがある行」の全区間をマップの端から端まで
        // 走査していた（コメントの「アクティブなセルを含む区間」と食い違っていた）。
        //
        // 種には、前のフレームからのアクティブに加えて、**このフレームで既に変化した
        // セルの周り**も入る。フェーズ1でたった今落ちてきた水や、先に処理した下の行で
        // 落ち口が開いた区間がそれで、前のフレームのアクティブだけを見ると横へ
        // 流れ出すのが1フレーム遅れる（実測で水量が変わった）。
        //
        // 同じ行の区間どうしは壁で隔てられていて互いの水量も落ち口も読まないので、
        // 処理する順序は結果に影響しない（trace-water.mjs で全区間走査と一致を確認）。
        // 処理中にこの行へ足された種は、いま処理した区間の中にしか落ちない
        // （区間の両端の外は壁で、markChanged は壁を種にしない）ので、既に済んでいる
        const seeds = seedsByRow.get(r);
        const rowBase = r * cols;
        for (let i = 0; i < seeds.length; i++) {
            const c0 = seeds[i];
            if (coveredRow[c0] === r || isSolid(r, c0)) continue;

            // 区間の探索 [segStart .. segEnd]
            let segStart = c0;
            while (segStart - 1 >= 0 && !isSolid(r, segStart - 1)) segStart--;
            let segEnd = c0;
            while (segEnd + 1 < cols && !isSolid(r, segEnd + 1)) segEnd++;

            let sumMass = 0;
            for (let sc = segStart; sc <= segEnd; sc++) {
                coveredRow[sc] = r;
                sumMass += water[rowBase + sc];
            }
            if (sumMass === 0) continue;

            // 区間内の各セルについて、直下に落ちられるか（落ち口か）判定し、
            // 各セルから見た左右それぞれの最寄りの落ち口を1回ずつの走査で求める
            let hasDrain = false;
            let last = -1;
            for (let sc = segStart; sc <= segEnd; sc++) {
                if (r + 1 < rows && !isSolid(r + 1, sc) && water[rowBase + cols + sc] < MAX_WATER_MASS) {
                    last = sc;
                    hasDrain = true;
                }
                nearLeft[sc] = last;
            }
            if (hasDrain) {
                last = -1;
                for (let sc = segEnd; sc >= segStart; sc--) {
                    if (nearLeft[sc] === sc) last = sc;
                    nearRight[sc] = last;
                }
            }

            if (hasDrain) {
                // ケースA: 区間内に落ち口（滝・穴）がある場合
                // 水は最も近い落ち口へ向かって横に流れる（直下落下はフェーズ1で実行済み）。
                // 等距離なら左の落ち口を選ぶ（以前の「左から見て最初に見つかった最短」と同じ）
                for (let sc = segStart; sc <= segEnd; sc++) {
                    const mass = water[rowBase + sc];
                    if (mass === 0) continue;

                    const L = nearLeft[sc];
                    const R = nearRight[sc];
                    let closestDrain;
                    if (L < 0) closestDrain = R;
                    else if (R < 0) closestDrain = L;
                    else closestDrain = (sc - L <= R - sc) ? L : R;

                    if (closestDrain === sc) continue;
                    const targetCol = closestDrain < sc ? sc - 1 : sc + 1;
                    const targetKey = rowBase + targetCol;
                    const targetMass = water[targetKey];
                    if (targetMass < MAX_WATER_MASS) {
                        const flow = Math.min(mass, MAX_WATER_MASS - targetMass, WATER_MAX_SPREAD_FLOW);
                        if (flow > 0) {
                            water[rowBase + sc] -= flow;
                            water[targetKey] += flow;
                            markChanged(r, sc);
                            markChanged(r, targetCol);
                        }
                    }
                }
            } else {
                // ケースB: 落ち口がない（＝底が完全に塞がれた水槽・水たまりの層）
                // この層の全セルに水量を均等に配分する！
                //
                // 以前ここに「区間の容量を超えたぶんを上の行へ持ち上げる」処理が
                // あったが、water[] は1セル MAX_WATER_MASS が上限なので sumMass が
                // 容量（len * MAX_WATER_MASS）を超えることはあり得ず、到達不能だった。
                // 水位が上がるのは、下の行が満ちて落ちられなくなった水がフェーズ1で
                // 積み上がる自然な結果である
                const len = segEnd - segStart + 1;
                const base = Math.floor(sumMass / len);
                const rem = sumMass % len;

                // 余りは均等に配る
                for (let i = 0; i < len; i++) {
                    const sc = segStart + i;
                    const targetMass = base + (i < rem ? 1 : 0);
                    if (water[rowBase + sc] !== targetMass) {
                        water[rowBase + sc] = targetMass;
                        markChanged(r, sc);
                    }
                }
            }
        }
    }

    if (!doFall) {
        // 落下処理をスキップしたフレームでは、まだ直下に落ちられる水セルをアクティブに保持し休眠を防ぐ
        for (const { r, c, k } of cellsToProcess) {
            if (water[k] > 0 && r + 1 < rows && !isSolid(r + 1, c) && water[(r + 1) * cols + c] < MAX_WATER_MASS) {
                nextActiveCells.add(k);
            }
        }
    }

    const changedCells = Array.from(changedSet).map((k) => [Math.floor(k / cols), k % cols]);
    return { changedCells, nextActiveCells };
}

/**
 * 取りこぼされた「幅1タイルの縦穴」の入口を見つける（純関数）。
 *
 * この反応式シミュレーションは、水量が動いたセルの周囲しか再びアクティブに
 * しない。幅1タイルの縦穴は両脇が壁の「独立した1マス区間」になり、フェーズ2
 * （横方向の水位平準化）では隣の水たまりから水を受け取れず、フェーズ1
 * （真上から落ちる）でしか埋まらない。その真上のセルがアクティブに変化する
 * 瞬間に居合わせられなかった縦穴は、隣の水たまりが先に落ち着いてしまうと
 * 二度と再挑戦されずに乾いたまま取り残される（実機のスクリーンショットで
 * 報告されたバグ）。
 *
 * 「両脇が壁」だけを条件にしているのは、湖面の真上の開けた空気（左右に壁が
 * 無い、正しく乾いている場所）まで拾うと、呼ぶたびにほぼ全マップを
 * 再アクティブ化してしまい、反応式にした意味が無くなるため。
 *
 * @returns {number[]} 見つかった入口セルの key (r*cols+c) の配列
 */
export function findStuckDryPockets({ water, rows, cols, isSolid }) {
    const found = [];
    for (let r = 1; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (isSolid(r, c)) continue;
            const k = r * cols + c;
            if (water[k] >= MIN_WATER_MASS) continue;

            const leftSolid = c - 1 < 0 || isSolid(r, c - 1);
            const rightSolid = c + 1 >= cols || isSolid(r, c + 1);
            if (!leftSolid || !rightSolid) continue;

            if (water[k - cols] >= MIN_WATER_MASS) found.push(k);
        }
    }
    return found;
}
