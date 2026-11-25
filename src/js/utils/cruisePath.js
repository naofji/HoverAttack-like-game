// 敵基地の巡航ミサイル（7面）の経路探索。A* でタイルの経路を探し、ミサイルの幅ぶんの
// 通り道が見える所まで点を飛ばして（糸を引くように）まっすぐにする。
//
// もとは EnemyBase のメソッド（_findPathToTarget / _smoothPath / _hasLineOfSight）だった。
// 基地の状態は出発点の座標しか読んでいないので、map と座標だけを取る純粋関数として
// ここへ移した（2026-11-24、中身は1行も変えていない。tests/cruise-path.test.js が直接縛る）。
//
// 名前に注意: 視線の判定ではない。タレット・ドローンの視線（utils/Physics.js の hasLineOfSightBetween
// ＝箱の中心どうしの1本の線）と違い、こちらは進む向きの左右に 16px ずつの幅を持たせた
// 「ミサイルの胴体が角に擦らずに通れるか」なので hasClearCorridor と呼ぶ。
//
// 敵アタッカー（artillery）の撃ち出す向きを決める _findPathToTarget（attacker/movement.js）は
// 別物（300手で打ち切る幅優先探索で、平滑化もしない）。まとめると artillery の狙いが変わるので
// 分けたままにしてある。
import { TILE_SIZE } from './Constants.js';

/**
 * 出発点から相手までの経路。見つからない・同じタイルなら null。
 * 先頭の点は出発点そのもの、以降はタイルの中心。
 *
 * @param {object} map isSolid(r, c) / isSolidAtPixel(x, y) / pixelToTile(x, y) / rows / cols
 * @param {number} fromX 出発点（基地の中心）
 * @param {number} fromY
 * @param {number} toX 相手の中心
 * @param {number} toY
 * @returns {{x: number, y: number}[] | null}
 */
export function findCruisePath(map, fromX, fromY, toX, toY) {
    const TS = TILE_SIZE; // 16px per tile
    const start = map.pixelToTile(fromX, fromY);
    const end = map.pixelToTile(toX, toY);

    if (start.r === end.r && start.c === end.c) return null;

    // Octile distance heuristic (admissible for 8-directional movement)
    const hCost = (r, c) => {
        const dr = Math.abs(r - end.r);
        const dc = Math.abs(c - end.c);
        return 1.414 * Math.min(dr, dc) + Math.abs(dr - dc);
    };

    // --- Search area cropping (Optimization) ---
    // Limit search to a rectangle encompassing both points plus a margin.
    // This prevents the algorithm from exploring the entire map if blocked.
    const margin = 20;
    const minR = Math.max(0, Math.min(start.r, end.r) - margin);
    const maxR = Math.min(map.rows - 1, Math.max(start.r, end.r) + margin);
    const minC = Math.max(0, Math.min(start.c, end.c) - margin);
    const maxC = Math.min(map.cols - 1, Math.max(start.c, end.c) + margin);

    // --- A* with parent-pointer (no path-array copying per node) ---
    // Each node stores: r, c, g, h, f, parent
    const gScore = new Map();
    const parentMap = new Map();
    const startKey = `${start.r},${start.c}`;
    gScore.set(startKey, 0);
    parentMap.set(startKey, null);

    // Simple array-based priority queue (small maps make this fast enough)
    const openList = [{ r: start.r, c: start.c, g: 0, f: hCost(start.r, start.c) }];

    let iterations = 0;
    const maxIterations = 8000;
    let foundEnd = false;

    while (openList.length > 0 && iterations < maxIterations) {
        iterations++;
        // Pop the node with lowest f
        openList.sort((a, b) => a.f - b.f);
        const curr = openList.shift();
        const currKey = `${curr.r},${curr.c}`;

        // Skip stale entries
        if (curr.g > (gScore.get(currKey) ?? Infinity)) continue;

        if (curr.r === end.r && curr.c === end.c) {
            foundEnd = true;
            break;
        }

        const dirs = [
            { r: -1, c: 0, cost: 1 }, { r: 1, c: 0, cost: 1 }, { r: 0, c: -1, cost: 1 }, { r: 0, c: 1, cost: 1 },
            { r: -1, c: -1, cost: 1.414 }, { r: -1, c: 1, cost: 1.414 }, { r: 1, c: -1, cost: 1.414 }, { r: 1, c: 1, cost: 1.414 }
        ];

        for (const d of dirs) {
            const nr = curr.r + d.r;
            const nc = curr.c + d.c;

            // Cropping check
            if (nr < minR || nr > maxR || nc < minC || nc > maxC) continue;
            if (map.isSolid(nr, nc) && !(nr === end.r && nc === end.c)) continue;

            // Diagonal movement: both cardinal neighbors must be open (prevents corner-cutting)
            if (d.r !== 0 && d.c !== 0) {
                if (map.isSolid(curr.r + d.r, curr.c) || map.isSolid(curr.r, curr.c + d.c)) continue;
            }

            // Clearance penalty: tiered by distance to nearest wall
            // Tier 1: immediately adjacent (8-dir check) — very strongly discouraged
            // Tier 2: within 2 tiles — moderately discouraged
            // This forces the path to prefer the centre of open passages
            let clearancePenalty = 0;

            const adjToWall =
                map.isSolid(nr - 1, nc) || map.isSolid(nr + 1, nc) ||
                map.isSolid(nr, nc - 1) || map.isSolid(nr, nc + 1) ||
                map.isSolid(nr - 1, nc - 1) || map.isSolid(nr - 1, nc + 1) ||
                map.isSolid(nr + 1, nc - 1) || map.isSolid(nr + 1, nc + 1);

            if (adjToWall) {
                clearancePenalty = 4.0; // Very expensive – almost never preferred
            } else {
                // 2-tile radius check (cardinal + diagonal)
                const nearWall =
                    map.isSolid(nr - 2, nc) || map.isSolid(nr + 2, nc) ||
                    map.isSolid(nr, nc - 2) || map.isSolid(nr, nc + 2) ||
                    map.isSolid(nr - 2, nc - 1) || map.isSolid(nr - 2, nc + 1) ||
                    map.isSolid(nr + 2, nc - 1) || map.isSolid(nr + 2, nc + 1) ||
                    map.isSolid(nr - 1, nc - 2) || map.isSolid(nr - 1, nc + 2) ||
                    map.isSolid(nr + 1, nc - 2) || map.isSolid(nr + 1, nc + 2);
                if (nearWall) {
                    clearancePenalty = 1.5; // Mildly discouraged
                }
            }

            const newG = curr.g + d.cost + clearancePenalty;
            const nKey = `${nr},${nc}`;
            if (newG < (gScore.get(nKey) ?? Infinity)) {
                gScore.set(nKey, newG);
                parentMap.set(nKey, currKey);
                openList.push({ r: nr, c: nc, g: newG, f: newG + hCost(nr, nc) });
            }
        }
    }

    if (!foundEnd) return null;

    // Reconstruct grid path from parent pointers
    const gridPath = [];
    let key = `${end.r},${end.c}`;
    while (key !== null) {
        const [r, c] = key.split(',').map(Number);
        gridPath.unshift({ r, c });
        key = parentMap.get(key);
    }

    return smoothCruisePath(map, gridPath, fromX, fromY, TS);
}

/**
 * タイルの経路を、ミサイルの幅ぶんの通り道が見える所まで点を飛ばしてまっすぐにする
 * （String Pulling）。先頭は出発点そのもの（発射位置を正確にするため）。
 */
export function smoothCruisePath(map, gridPath, startX, startY, TS = TILE_SIZE) {
    if (!gridPath || gridPath.length === 0) return null;

    const HS = TS / 2; // half tile = 8px = tile center offset
    const smoothed = [];

    // First waypoint: exact base center (precise launch origin)
    smoothed.push({ x: startX, y: startY });

    let currentPt = { x: startX, y: startY };
    let currentIdx = 0;

    while (currentIdx < gridPath.length - 1) {
        let furthestVisible = currentIdx + 1;

        // Look ahead: skip as many waypoints as we can see in a straight line
        for (let i = currentIdx + 2; i < gridPath.length; i++) {
            const tx = gridPath[i].c * TS + HS;
            const ty = gridPath[i].r * TS + HS;
            if (hasClearCorridor(map, currentPt.x, currentPt.y, tx, ty)) {
                furthestVisible = i;
            } else {
                break; // Once blocked, no point checking further
            }
        }

        const t = gridPath[furthestVisible];
        currentPt = { x: t.c * TS + HS, y: t.r * TS + HS };
        smoothed.push(currentPt);
        currentIdx = furthestVisible;
    }

    return smoothed;
}

/**
 * (x0, y0) → (x1, y1) の線の中心と、進む向きの左右 16px の3本がどれも岩に当たらないか。
 * 8px おきに確かめる。
 */
export function hasClearCorridor(map, x0, y0, x1, y1) {
    const ddx = x1 - x0;
    const ddy = y1 - y0;
    const totalDist = Math.sqrt(ddx * ddx + ddy * ddy);
    if (totalDist === 0) return true;

    // Unit direction vector along the line
    const ux = ddx / totalDist;
    const uy = ddy / totalDist;

    // Perpendicular unit vector (90deg rotated) — this is the missile's "width" axis
    const perpX = -uy;
    const perpY = ux;

    // Clearance: one full TILE_SIZE (16px) — ensures missile body never clips corners
    const CLEARANCE = 16;

    // Step along the line every 8px for performance
    const stepSize = 8;
    const steps = Math.ceil(totalDist / stepSize);

    for (let i = 0; i <= steps; i++) {
        const t = Math.min(i * stepSize, totalDist);
        const cx = x0 + ux * t;
        const cy = y0 + uy * t;

        // Check center and both sides perpendicular to travel direction
        if (map.isSolidAtPixel(cx, cy) ||
            map.isSolidAtPixel(cx + perpX * CLEARANCE, cy + perpY * CLEARANCE) ||
            map.isSolidAtPixel(cx - perpX * CLEARANCE, cy - perpY * CLEARANCE)) {
            return false;
        }
    }
    return true;
}
