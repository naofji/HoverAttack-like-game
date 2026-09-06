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
//      その層が満水（各セル MAX_WATER_MASS）になった時のみ、上の行へ水位が上がる。
//
// アクティブなセルのみを追跡するため、水が静止すれば計算量は自動的にゼロになる。

import { MAX_WATER_MASS } from '../utils/Constants.js';

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
export function stepWaterSimulation({ water, rows, cols, isSolid, activeCells }) {
    const nextActiveCells = new Set();
    const changedSet = new Set();

    const markChanged = (r, c) => {
        const key = r * cols + c;
        changedSet.add(key);
        // 周囲3x3を次回アクティブに追加
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const nr = r + dr;
                const nc = c + dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                    nextActiveCells.add(nr * cols + nc);
                }
            }
        }
    };

    // 処理対象のセル。下から上へ処理すると、落下がスムーズに連鎖する
    const cellsToProcess = Array.from(activeCells)
        .map((k) => ({ r: Math.floor(k / cols), c: k % cols, k }))
        .sort((a, b) => b.r - a.r);

    // ----------------------------------------------------
    // フェーズ1: 垂直落下（重力・滝）
    // ----------------------------------------------------
    for (const { r, c, k } of cellsToProcess) {
        let mass = water[k];
        if (mass === 0 || isSolid(r, c)) continue;

        if (r + 1 < rows && !isSolid(r + 1, c)) {
            const downKey = (r + 1) * cols + c;
            const downMass = water[downKey];
            if (downMass < MAX_WATER_MASS) {
                const flow = Math.min(mass, MAX_WATER_MASS - downMass);
                if (flow > 0) {
                    water[k] -= flow;
                    water[downKey] += flow;
                    markChanged(r, c);
                    markChanged(r + 1, c);
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

    const processedSegments = new Set();

    for (const r of activeRows) {
        // 行 r において、アクティブなセルを含む連結空洞区間を探す
        for (let c = 0; c < cols; c++) {
            if (isSolid(r, c)) continue;

            // 区間の探索 [segStart .. segEnd]
            const segStart = c;
            while (c + 1 < cols && !isSolid(r, c + 1)) {
                c++;
            }
            const segEnd = c;

            const segKey = `${r}:${segStart}:${segEnd}`;
            if (processedSegments.has(segKey)) continue;
            processedSegments.add(segKey);

            // この区間に水が存在するか確認
            let hasWater = false;
            let sumMass = 0;
            const segCols = [];
            for (let sc = segStart; sc <= segEnd; sc++) {
                segCols.push(sc);
                const m = water[r * cols + sc];
                if (m > 0) {
                    hasWater = true;
                    sumMass += m;
                }
            }
            if (!hasWater) continue;

            // 区間内の各セルについて、直下に落ちられるか（落ち口か）判定
            const drainCols = [];
            for (const sc of segCols) {
                if (r + 1 < rows && !isSolid(r + 1, sc)) {
                    const downMass = water[(r + 1) * cols + sc];
                    if (downMass < MAX_WATER_MASS) {
                        drainCols.push(sc);
                    }
                }
            }

            if (drainCols.length > 0) {
                // ケースA: 区間内に落ち口（滝・穴）がある場合
                // 水は落ち口へ向かって横に流れる
                for (const sc of segCols) {
                    let mass = water[r * cols + sc];
                    if (mass === 0) continue;

                    // 直下が落ち口なら、フェーズ1で落ちられなかった分（または同ステップ）直下へ
                    if (r + 1 < rows && !isSolid(r + 1, sc)) {
                        const downKey = (r + 1) * cols + sc;
                        const downMass = water[downKey];
                        if (downMass < MAX_WATER_MASS) {
                            const flow = Math.min(mass, MAX_WATER_MASS - downMass);
                            if (flow > 0) {
                                water[r * cols + sc] -= flow;
                                water[downKey] += flow;
                                mass -= flow;
                                markChanged(r, sc);
                                markChanged(r + 1, sc);
                            }
                        }
                    }
                    if (mass === 0) continue;

                    // 最も近い落ち口へ向かって隣のセルへ流す
                    let closestDrain = drainCols[0];
                    let minDist = Math.abs(sc - closestDrain);
                    for (const dc of drainCols) {
                        const dist = Math.abs(sc - dc);
                        if (dist < minDist) {
                            minDist = dist;
                            closestDrain = dc;
                        }
                    }

                    if (closestDrain < sc) {
                        // 左へ流す
                        const targetCol = sc - 1;
                        const targetKey = r * cols + targetCol;
                        const targetMass = water[targetKey];
                        if (targetMass < MAX_WATER_MASS) {
                            const flow = Math.min(mass, MAX_WATER_MASS - targetMass, Math.max(1, Math.floor(mass / 2)));
                            if (flow > 0) {
                                water[r * cols + sc] -= flow;
                                water[targetKey] += flow;
                                markChanged(r, sc);
                                markChanged(r, targetCol);
                            }
                        }
                    } else if (closestDrain > sc) {
                        // 右へ流す
                        const targetCol = sc + 1;
                        const targetKey = r * cols + targetCol;
                        const targetMass = water[targetKey];
                        if (targetMass < MAX_WATER_MASS) {
                            const flow = Math.min(mass, MAX_WATER_MASS - targetMass, Math.max(1, Math.floor(mass / 2)));
                            if (flow > 0) {
                                water[r * cols + sc] -= flow;
                                water[targetKey] += flow;
                                markChanged(r, sc);
                                markChanged(r, targetCol);
                            }
                        }
                    }
                }
            } else {
                // ケースB: 落ち口がない（＝底が完全に塞がれた水槽・水たまりの層）
                // この層の全セルに水量を均等に配分する！
                const len = segCols.length;
                const capacity = len * MAX_WATER_MASS;
                const fillMass = Math.min(sumMass, capacity);
                const excessMass = sumMass - fillMass;

                const base = Math.floor(fillMass / len);
                const rem = fillMass % len;

                // 余りは均等に配る
                for (let i = 0; i < len; i++) {
                    const sc = segCols[i];
                    const targetMass = base + (i < rem ? 1 : 0);
                    const oldMass = water[r * cols + sc];
                    if (oldMass !== targetMass) {
                        water[r * cols + sc] = targetMass;
                        markChanged(r, sc);
                    }
                }

                // 余剰水がある場合（この行が完全に満杯になった場合）、上の行へ持ち上げる
                if (excessMass > 0 && r > 0) {
                    let leftOver = excessMass;
                    for (const sc of segCols) {
                        if (isSolid(r - 1, sc)) continue;
                        const upKey = (r - 1) * cols + sc;
                        const upMass = water[upKey];
                        const canTake = MAX_WATER_MASS - upMass;
                        const flow = Math.min(leftOver, canTake);
                        if (flow > 0) {
                            water[upKey] += flow;
                            leftOver -= flow;
                            markChanged(r - 1, sc);
                        }
                        if (leftOver === 0) break;
                    }
                }
            }
        }
    }

    const changedCells = Array.from(changedSet).map((k) => [Math.floor(k / cols), k % cols]);
    return { changedCells, nextActiveCells };
}
