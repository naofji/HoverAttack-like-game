// 水のテスト用の map。grid・water・派生キャッシュを揃えて返す。
// Map のコンストラクタは地形生成と canvas を要求するので node --test では
// そのまま作れない。そこで**コンストラクタだけを飛ばして** Map.prototype を
// 持たせ、問い合わせ（isWaterAtPixel / getSurfaceY など）は本物のメソッドを通す。
//
// 以前は問い合わせを手で写していて、getSurfaceY と isWaterAtPixel が本物と
// 違う答えを返していた（本物は液面のかかった水量0のセルも水として扱う）。
// 写しが本物とずれると、テストは本番で通らない経路を確かめることになる。

import { MIN_WATER_MASS, TILE_SIZE } from '../../src/js/utils/Constants.js';
import { Map as GameMap } from '../../src/js/world/Map.js';

/**
 * 文字の絵から map を作る。'#'=岩 '.'=空 数字=水量(1..8)
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
            if (Number(ch) >= MIN_WATER_MASS) waterCells.push([r, c]);
        }
    }));

    const map = Object.create(GameMap.prototype);
    Object.assign(map, {
        envKind: 'water',
        rows, cols, grid, water, waterCells,
        waterKind: new Uint8Array(rows * cols),
        waterSurfaceY: new Int16Array(rows * cols).fill(-1),
        dirtyWaterCols: new Set(),
        activeWaterCells: new Set(),
        width: cols * TILE_SIZE, height: rows * TILE_SIZE,
        waterSprings: [],
    });
    /** grid や water を直に書き換えたあとに呼ぶ */
    map.refresh = () => {
        for (let c = 0; c < cols; c++) map.dirtyWaterCols.add(c);
        map._rebuildWaterCacheIfDirty();
    };
    map.refresh();
    return map;
}
