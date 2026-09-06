// 水のテスト用の偽 map。grid・water・派生キャッシュを揃えて返す。
// 実装（Map クラス）は canvas を要求するので node --test では作れない。
// 問い合わせは Map.prototype と同じ意味になるよう waterQuery を通す。

import { MIN_WATER_MASS, TILE_SIZE } from '../../src/js/utils/Constants.js';
import {
    rebuildWaterCache, WATER_NONE, WATER_SURFACE, WATER_FALL,
} from '../../src/js/world/waterQuery.js';

/**
 * 文字の絵から偽 map を作る。'#'=岩 '.'=空 数字=水量(1..8)
 * 行頭の空白は捨てるので、テストの中でインデントして書ける。
 */
export function makeWaterMap(art) {
    const lines = art.trim().split('\n').map((s) => s.trim());
    const rows = lines.length;
    const cols = lines[0].length;
    const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
    const water = new Uint8Array(rows * cols);
    const waterCells = [];
    lines.forEach((ln, r) => [...ln].forEach((ch, c) => {
        if (ch === '#') grid[r][c] = 1;
        else if (ch >= '1' && ch <= '8') {
            water[r * cols + c] = Number(ch);
            waterCells.push([r, c]);
        }
    }));

    const waterKind = new Uint8Array(rows * cols);
    const waterSurfaceY = new Int16Array(rows * cols).fill(-1);

    const map = {
        rows, cols, grid, water, waterKind, waterSurfaceY, waterCells,
        width: cols * TILE_SIZE, height: rows * TILE_SIZE,
        waterSprings: [],
        isSolid(r, c) {
            if (r < 0 || r >= rows || c < 0 || c >= cols) return true;
            return grid[r][c] !== 0;
        },
        isWater(r, c) {
            if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
            return water[r * cols + c] >= MIN_WATER_MASS;
        },
        isWaterSurface(r, c) {
            if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
            return waterKind[r * cols + c] === WATER_SURFACE;
        },
        isWaterfallCell(r, c) {
            if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
            return waterKind[r * cols + c] === WATER_FALL;
        },
        getSurfaceY(r, c) {
            if (!map.isWater(r, c)) return -1;
            const k = r * cols + c;
            return waterKind[k] === WATER_SURFACE ? waterSurfaceY[k] : r * TILE_SIZE;
        },
        isWaterAtPixel(x, y) {
            const r = Math.floor(y / TILE_SIZE);
            const c = Math.floor(x / TILE_SIZE);
            if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
            const k = r * cols + c;
            if (waterKind[k] === WATER_NONE) return false;
            if (waterKind[k] === WATER_SURFACE) return y >= waterSurfaceY[k];
            return true;
        },
        isWaterfallAtPixel(x, y) {
            return map.isWaterfallCell(Math.floor(y / TILE_SIZE), Math.floor(x / TILE_SIZE));
        },
        /** grid や water を直に書き換えたあとに呼ぶ */
        refresh() {
            rebuildWaterCache({
                water, kind: waterKind, surfaceY: waterSurfaceY, rows, cols,
                isSolid: map.isSolid, dirtyCols: [...Array(cols).keys()],
            });
        },
        onWaterChanged() {},
    };
    map.refresh();
    return map;
}
