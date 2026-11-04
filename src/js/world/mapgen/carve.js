// ============================================
// Map の生成 - 洞窟を掘る（部屋・トンネル・平滑化・浮き足場・硬い岩）
// ============================================
//
// **game.rng を最も多く消費する層。** 部屋をつなぐトンネルの幅と曲がり方、浮き足場の
// 置き場所と幅、硬い岩の抽選（通常の岩のタイル1つに1回、確率に関係なく必ず引く）がここで乱数を引く。
// 週次の決定性はこの順と回数で決まるので、中身も呼ぶ順（Map.js の _generate()）も変えないこと。
//
// _carveArea と _carveMainPath はどこからも呼ばれておらず、_carveTunnel はその _carveMainPath から
// 呼ばれるだけ＝3つとも実行されない（2026-11-04 に tools/trace-map.mjs --coverage で確かめた）。層分けは移動だけと決めたので消さずに置いてある。
//
// **Map.prototype へ Object.assign で混ぜる前提**のオブジェクトリテラルで、`this` は
// Map のインスタンスを指す（理由は world/mapRender.js の冒頭）。Map.js を import しないこと。

import {
    BLOCK_EMPTY, BLOCK_NORMAL, BLOCK_HARD, HARD_BLOCK_CHANCE_BY_STAGE, HARD_BLOCK_HP,
} from '../../utils/Constants.js';
import { BORDER_THICKNESS } from './common.js';

export const MapCarve = {
    _generatePlatforms() {
        // Look for wide vertical open spaces and place horizontal platforms
        for (let r = BORDER_THICKNESS + 3; r < this.rows - BORDER_THICKNESS - 4; r++) {
            for (let c = BORDER_THICKNESS + 3; c < this.cols - BORDER_THICKNESS - 7; c++) {
                // Check if current tile is empty, and there's plenty of space above/below it (7x7 area)
                if (this._isAreaEmpty(r - 3, c, 7, 7)) {
                    // With a low probability, generate a floating platform here
                    if (this.game.rng.next() < 0.06) { // Sparse platforms
                        const platWidth = 4 + Math.floor(this.game.rng.next() * 6); // width 4 to 9
                        const platHeight = 1; // thickness 1 (thinner)

                        for (let pr = r; pr < r + platHeight; pr++) {
                            for (let pc = c; pc < c + platWidth; pc++) {
                                // Double check boundaries
                                if (pr < this.rows - BORDER_THICKNESS && pc < this.cols - BORDER_THICKNESS) {
                                    this.grid[pr][pc] = BLOCK_NORMAL;
                                    this.blockHP[pr][pc] = 1;
                                }
                            }
                        }
                        // Skip ahead so we don't immediately generate another overlapping platform
                        c += platWidth + 2;
                    }
                }
            }
        }
    },

    _isAreaEmpty(startR, startC, height, width) {
        for (let r = startR; r < startR + height; r++) {
            for (let c = startC; c < startC + width; c++) {
                if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
                if (this.grid[r][c] !== BLOCK_EMPTY) return false;
            }
        }
        return true;
    },

    _isBorder(r, c) {
        return r < BORDER_THICKNESS || r >= this.rows - BORDER_THICKNESS ||
            c < BORDER_THICKNESS || c >= this.cols - BORDER_THICKNESS;
    },

    _carveRoom(startC, startR, width, height) {
        for (let r = startR; r < startR + height; r++) {
            for (let c = startC; c < startC + width; c++) {
                if (r >= BORDER_THICKNESS && r < this.rows - BORDER_THICKNESS &&
                    c >= BORDER_THICKNESS && c < this.cols - BORDER_THICKNESS) {
                    this.grid[r][c] = BLOCK_EMPTY;
                    this.blockHP[r][c] = 0;
                }
            }
        }
    },

    _carveEllipse(centerR, centerC, radiusR, radiusC) {
        for (let r = centerR - radiusR; r <= centerR + radiusR; r++) {
            for (let c = centerC - radiusC; c <= centerC + radiusC; c++) {
                if (r >= BORDER_THICKNESS && r < this.rows - BORDER_THICKNESS &&
                    c >= BORDER_THICKNESS && c < this.cols - BORDER_THICKNESS) {
                    // Ellipse equation: (x-h)^2/a^2 + (y-k)^2/b^2 <= 1
                    const normalizedDist = Math.pow((c - centerC) / radiusC, 2) + Math.pow((r - centerR) / radiusR, 2);
                    if (normalizedDist <= 1) {
                        this.grid[r][c] = BLOCK_EMPTY;
                        this.blockHP[r][c] = 0;
                    }
                }
            }
        }
    },

    _connectRooms() {
        // Simple MST-like connection: connect each room to its nearest unconnected neighbor
        const unconnected = [...this.rooms];
        const connected = [];

        // Start with the first room (start area)
        connected.push(unconnected.shift());

        while (unconnected.length > 0) {
            let bestDist = Infinity;
            let bestFrom = null;
            let bestToIdx = -1;

            for (let i = 0; i < connected.length; i++) {
                for (let j = 0; j < unconnected.length; j++) {
                    const roomA = connected[i];
                    const roomB = unconnected[j];
                    const distSq = Math.pow(roomA.centerC - roomB.centerC, 2) + Math.pow(roomA.centerR - roomB.centerR, 2);
                    if (distSq < bestDist) {
                        bestDist = distSq;
                        bestFrom = roomA;
                        bestToIdx = j;
                    }
                }
            }

            const bestTo = unconnected.splice(bestToIdx, 1)[0];

            // Carve a tunnel between bestFrom and bestTo
            // Varying tunnel width between 6 and 11 for massive connecting halls
            const tunnelWidth = 6 + Math.floor(this.game.rng.next() * 6);
            this._carveTunnelPath(bestFrom.centerR, bestFrom.centerC, bestTo.centerR, bestTo.centerC, tunnelWidth);

            connected.push(bestTo);
        }
    },

    _carveTunnelPath(r1, c1, r2, c2, width) {
        // Manhattan-style L-shaped tunnels look more like an ant nest than direct diagonals
        const midC = c1;
        const midR = r2;

        // Vertical then Horizontal (or vice versa)
        if (this.game.rng.next() < 0.5) {
            this._carveTunnelLine(r1, c1, r2, c1, width); // Vertical
            this._carveTunnelLine(r2, c1, r2, c2, width); // Horizontal
        } else {
            this._carveTunnelLine(r1, c1, r1, c2, width); // Horizontal
            this._carveTunnelLine(r1, c2, r2, c2, width); // Vertical
        }
    },

    _carveTunnelLine(r1, c1, r2, c2, width) {
        const startR = Math.min(r1, r2);
        const endR = Math.max(r1, r2);
        const startC = Math.min(c1, c2);
        const endC = Math.max(c1, c2);

        for (let r = startR; r <= endR; r++) {
            for (let c = startC; c <= endC; c++) {
                this._carveBrush(r, c, width);
            }
        }
    },

    _carveBrush(centerR, centerC, size) {
        const offset = Math.floor(size / 2);
        for (let dr = -offset; dr <= offset; dr++) {
            for (let dc = -offset; dc <= offset; dc++) {
                const r = centerR + dr;
                const c = centerC + dc;
                if (r >= BORDER_THICKNESS && r < this.rows - BORDER_THICKNESS &&
                    c >= BORDER_THICKNESS && c < this.cols - BORDER_THICKNESS) {
                    this.grid[r][c] = BLOCK_EMPTY;
                    this.blockHP[r][c] = 0;
                }
            }
        }
    },

    _smoothStep() {
        // Standard cellular automata smoothing rule
        const newGrid = [];
        const newHP = [];
        for (let r = 0; r < this.rows; r++) {
            newGrid[r] = [];
            newHP[r] = [];
            for (let c = 0; c < this.cols; c++) {
                if (this._isBorder(r, c)) {
                    newGrid[r][c] = this.grid[r][c];
                    newHP[r][c] = this.blockHP[r][c];
                    continue;
                }
                const neighbors = this._countNeighbors(r, c);
                // "B5678/S45678" style rules: become wall if many wall neighbors, otherwise empty.
                if (neighbors >= 5) {
                    newGrid[r][c] = BLOCK_NORMAL;
                    newHP[r][c] = 1;
                } else if (neighbors <= 3) {
                    newGrid[r][c] = BLOCK_EMPTY;
                    newHP[r][c] = 0;
                } else {
                    newGrid[r][c] = this.grid[r][c];
                    newHP[r][c] = this.blockHP[r][c];
                }
            }
        }
        this.grid = newGrid;
        this.blockHP = newHP;
    },

    _countNeighbors(r, c) {
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = r + dr;
                const nc = c + dc;
                if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) {
                    count++;
                } else if (this.grid[nr][nc] !== BLOCK_EMPTY) {
                    count++;
                }
            }
        }
        return count;
    },

    _carveArea(startC, startR, width, height) {
        for (let r = startR; r < startR + height && r < this.rows - BORDER_THICKNESS; r++) {
            for (let c = startC; c < startC + width && c < this.cols - BORDER_THICKNESS; c++) {
                if (r >= BORDER_THICKNESS && c >= BORDER_THICKNESS) {
                    this.grid[r][c] = BLOCK_EMPTY;
                    this.blockHP[r][c] = 0;
                }
            }
        }
    },

    _carveMainPath() {
        let r = 5;
        let c = 5;
        const targetR = this.rows - 8;
        const targetC = this.cols - 8;

        while (r < targetR || c < targetC) {
            this._carveTunnel(r, c, 3);
            const rand = this.game.rng.next();
            if (c < targetC && (rand < 0.5 || r >= targetR)) {
                c += 1;
            } else if (r < targetR) {
                r += 1;
            }
        }
        this._carveTunnel(r, c, 3);
    },

    _carveTunnel(r, c, size) {
        for (let dr = -1; dr < size; dr++) {
            for (let dc = -1; dc < size; dc++) {
                const nr = r + dr;
                const nc = c + dc;
                if (nr >= BORDER_THICKNESS && nr < this.rows - BORDER_THICKNESS &&
                    nc >= BORDER_THICKNESS && nc < this.cols - BORDER_THICKNESS) {
                    this.grid[nr][nc] = BLOCK_EMPTY;
                    this.blockHP[nr][nc] = 0;
                }
            }
        }
    },

    _placeHardBlocks() {
        // 面ごとの割合。パレット・環境と同じく剰余で丸める（debugStartMission で面数を超えうる）。
        // rng.next() は if の外に出さない代わりに、確率に関係なく必ず1タイル1回引く形を保つこと。
        // 消費数が割合で変わると、後続のスポーン決定がずれて週次の決定性が壊れる。
        const row = HARD_BLOCK_CHANCE_BY_STAGE[this.missionLevel % HARD_BLOCK_CHANCE_BY_STAGE.length];
        // 行が [左端, 右端] の対なら列で線形に補間する（7面。右へ進むほど固くなる）
        const span = this.cols - 1 - BORDER_THICKNESS * 2;
        const chanceAt = Array.isArray(row)
            ? (c) => row[0] + (row[1] - row[0]) * ((c - BORDER_THICKNESS) / span)
            : () => row;
        for (let r = BORDER_THICKNESS; r < this.rows - BORDER_THICKNESS; r++) {
            for (let c = BORDER_THICKNESS; c < this.cols - BORDER_THICKNESS; c++) {
                // rng.next() は if の外に出さない代わりに、確率に関係なく必ず1タイル1回引く
                if (this.grid[r][c] === BLOCK_NORMAL && this.game.rng.next() < chanceAt(c)) {
                    this.grid[r][c] = BLOCK_HARD;
                    this.blockHP[r][c] = HARD_BLOCK_HP;
                }
            }
        }
    },
};
