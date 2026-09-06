// ============================================
// waterSimulation - セル・オートマトン水流ロジック
// ============================================
//
// 1タイルを 0..MAX_WATER_MASS (8) の水量で管理し、重力と圧力平衡に従って
// 水量をセル間で移動させる。
//
// 1. 垂直落下（重力）: 直下が空洞で満水未満なら限界まで流す。
// 2. 斜め滑落（階段・スロープ）: 直下が床なら、斜め下へ滑り落ちる。
// 3. 水平拡散（圧力平衡）: 直下・斜め下に流せない場合、左右の空洞と水量を均等化する。
//
// アクティブなセルのみを追跡するため、水が静止すれば計算量は自動的にゼロになる。

import { MAX_WATER_MASS } from '../utils/Constants.js';

/**
 * 1ステップのセル・オートマトン水流計算。
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

    for (const { r, c, k } of cellsToProcess) {
        let mass = water[k];
        if (mass === 0) continue;
        if (isSolid(r, c)) continue;

        // 1. 垂直落下（重力）
        if (r + 1 < rows && !isSolid(r + 1, c)) {
            const downKey = (r + 1) * cols + c;
            const downMass = water[downKey];
            if (downMass < MAX_WATER_MASS) {
                const flow = Math.min(mass, MAX_WATER_MASS - downMass);
                if (flow > 0) {
                    water[k] -= flow;
                    water[downKey] += flow;
                    mass -= flow;
                    markChanged(r, c);
                    markChanged(r + 1, c);
                }
            }
        }

        if (mass === 0) continue;

        // 2. 斜め滑落（階段・角）: 直下が固体または満水の場合
        const downSolid = r + 1 >= rows || isSolid(r + 1, c);
        const downFull = r + 1 < rows && water[(r + 1) * cols + c] >= MAX_WATER_MASS;
        if (downSolid || downFull) {
            const canLeft = r + 1 < rows && c > 0 && !isSolid(r + 1, c - 1) && !isSolid(r, c - 1);
            const canRight = r + 1 < rows && c + 1 < cols && !isSolid(r + 1, c + 1) && !isSolid(r, c + 1);

            const leftCap = canLeft ? MAX_WATER_MASS - water[(r + 1) * cols + (c - 1)] : 0;
            const rightCap = canRight ? MAX_WATER_MASS - water[(r + 1) * cols + (c + 1)] : 0;

            if (leftCap > 0 && rightCap > 0) {
                const half = Math.min(mass, Math.ceil(mass / 2));
                const flowL = Math.min(half, leftCap);
                const flowR = Math.min(mass - flowL, rightCap);
                if (flowL > 0) {
                    water[k] -= flowL;
                    water[(r + 1) * cols + (c - 1)] += flowL;
                    mass -= flowL;
                    markChanged(r, c);
                    markChanged(r + 1, c - 1);
                }
                if (flowR > 0) {
                    water[k] -= flowR;
                    water[(r + 1) * cols + (c + 1)] += flowR;
                    mass -= flowR;
                    markChanged(r, c);
                    markChanged(r + 1, c + 1);
                }
            } else if (leftCap > 0) {
                const flow = Math.min(mass, leftCap);
                water[k] -= flow;
                water[(r + 1) * cols + (c - 1)] += flow;
                mass -= flow;
                markChanged(r, c);
                markChanged(r + 1, c - 1);
            } else if (rightCap > 0) {
                const flow = Math.min(mass, rightCap);
                water[k] -= flow;
                water[(r + 1) * cols + (c + 1)] += flow;
                mass -= flow;
                markChanged(r, c);
                markChanged(r + 1, c + 1);
            }
        }

        if (mass === 0) continue;

        // 3. 水平拡散（圧力平衡）
        if (downSolid || downFull) {
            const canL = c > 0 && !isSolid(r, c - 1);
            const canR = c + 1 < cols && !isSolid(r, c + 1);

            const massL = canL ? water[r * cols + (c - 1)] : MAX_WATER_MASS;
            const massR = canR ? water[r * cols + (c + 1)] : MAX_WATER_MASS;

            const diffL = canL ? mass - massL : 0;
            const diffR = canR ? mass - massR : 0;

            if (diffL >= 2 && diffR >= 2) {
                const flowL = Math.floor(diffL / 2);
                const flowR = Math.floor(diffR / 2);
                const totalFlow = Math.min(mass, flowL + flowR);
                const actualL = Math.min(flowL, Math.floor(totalFlow / 2));
                const actualR = Math.min(flowR, totalFlow - actualL);
                if (actualL > 0) {
                    water[k] -= actualL;
                    water[r * cols + (c - 1)] += actualL;
                    mass -= actualL;
                    markChanged(r, c);
                    markChanged(r, c - 1);
                }
                if (actualR > 0) {
                    water[k] -= actualR;
                    water[r * cols + (c + 1)] += actualR;
                    mass -= actualR;
                    markChanged(r, c);
                    markChanged(r, c + 1);
                }
            } else if (diffL >= 2) {
                const flow = Math.min(mass, Math.floor(diffL / 2));
                if (flow > 0) {
                    water[k] -= flow;
                    water[r * cols + (c - 1)] += flow;
                    mass -= flow;
                    markChanged(r, c);
                    markChanged(r, c - 1);
                }
            } else if (diffR >= 2) {
                const flow = Math.min(mass, Math.floor(diffR / 2));
                if (flow > 0) {
                    water[k] -= flow;
                    water[r * cols + (c + 1)] += flow;
                    mass -= flow;
                    markChanged(r, c);
                    markChanged(r, c + 1);
                }
            }
        }
    }

    const changedCells = Array.from(changedSet).map((k) => [Math.floor(k / cols), k % cols]);
    return { changedCells, nextActiveCells };
}
