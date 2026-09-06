// ============================================
// 7面の要塞区画（純関数。grid を書き換える）
// ============================================
//
// 洞窟を掘り終えたあとに矩形の区画を選び、その中を人工物の規則で書き潰す。
// 「洞窟を改造して作った要塞」なので、区画の外は洞窟のまま残す。
// 乱数は派生ストリーム（game.rng を消費しない＝週の決定性を壊さない）。
//
// 設計: docs/superpowers/specs/2026-09-06-stage7-fortress-design.md

import {
    BLOCK_EMPTY, BLOCK_HARD, BLOCK_METAL, HARD_BLOCK_HP, METAL_BLOCK_HP,
} from '../utils/Constants.js';

/** 閉区間の矩形 { r0, r1, c0, c1 } 同士が重なるか。水・雪の除外矩形と同じ形。 */
export function rectsOverlap(a, b) {
    return !(a.r1 < b.r0 || a.r0 > b.r1 || a.c1 < b.c0 || a.c0 > b.c1);
}

function insideRect(rect, r, c) {
    return r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1;
}

/**
 * 区画の矩形を選ぶ。部屋の中心を中心に取り、盤面からはみ出すもの・除外矩形と
 * 重なるもの・既に置いた区画と重なるものを弾く。
 *
 * count は**上限**であって下限ではない。候補が尽きたら置けた数で終わる
 * （水のプールと同じ扱い。無理に詰めると重なりを許すことになる）。
 */
export function pickFortressZones({
    rows, cols, rooms, excludeRects = [], rng,
    count, wMin, wRange, hMin, hRange, margin,
}) {
    const candidates = rooms.filter(
        (room) => !excludeRects.some((rect) => insideRect(rect, room.centerR, room.centerC)),
    );
    const zones = [];
    let tries = 0;
    while (zones.length < count && tries < count * 20) {
        tries++;
        if (candidates.length === 0) break;
        const room = candidates[Math.floor(rng.next() * candidates.length)];
        const w = wMin + Math.floor(rng.next() * (wRange + 1));
        const h = hMin + Math.floor(rng.next() * (hRange + 1));
        const c0 = room.centerC - Math.floor(w / 2);
        const r0 = room.centerR - Math.floor(h / 2);
        const zone = { r0, r1: r0 + h - 1, c0, c1: c0 + w - 1 };
        if (zone.r0 < margin || zone.c0 < margin) continue;
        if (zone.r1 >= rows - margin || zone.c1 >= cols - margin) continue;
        if (excludeRects.some((rect) => rectsOverlap(zone, rect))) continue;
        if (zones.some((z) => rectsOverlap(zone, z))) continue;
        zones.push(zone);
    }
    return zones;
}

/**
 * 外壁の4つの帯。**互いに重ならないように排他的に定義する。**
 * 角の扱いをここ1箇所で決めておかないと、「弱点は右だけ」が言えなくなる。
 * 角は 左上・右上＝上帯、左下＝左帯、右下＝下帯。**右帯にだけ硬い岩が来る。**
 */
export function zoneBands(zone, thickness) {
    const T = thickness;
    return {
        top:    { r0: zone.r0,         r1: zone.r0 + T - 1, c0: zone.c0,         c1: zone.c1 },
        left:   { r0: zone.r0 + T,     r1: zone.r1,         c0: zone.c0,         c1: zone.c0 + T - 1 },
        bottom: { r0: zone.r1 - T + 1, r1: zone.r1,         c0: zone.c0 + T,     c1: zone.c1 },
        right:  { r0: zone.r0 + T,     r1: zone.r1 - T,     c0: zone.c1 - T + 1, c1: zone.c1 },
    };
}

function fillRect(grid, blockHP, rect, block, hp) {
    for (let r = rect.r0; r <= rect.r1; r++) {
        for (let c = rect.c0; c <= rect.c1; c++) {
            grid[r][c] = block;
            blockHP[r][c] = hp;
        }
    }
}

/**
 * 外壁を書く。上・左・下は金属（HP 6）、右だけ硬い岩（HP 3）。
 *
 * 厚さ2層あるので、金属は 6x2 = 12発、硬い岩は 3x2 = 6発。**壊せないブロックを
 * 使わずに「正面は実質難攻不落、基地側の背面だけが弱点」を作れる**のが要点
 * （実機の指摘）。全部掘れるので、要塞がマップを分断する危険が原理的に無い。
 */
export function buildZoneWalls(grid, blockHP, zone, thickness) {
    const bands = zoneBands(zone, thickness);
    fillRect(grid, blockHP, bands.top, BLOCK_METAL, METAL_BLOCK_HP);
    fillRect(grid, blockHP, bands.left, BLOCK_METAL, METAL_BLOCK_HP);
    fillRect(grid, blockHP, bands.bottom, BLOCK_METAL, METAL_BLOCK_HP);
    fillRect(grid, blockHP, bands.right, BLOCK_HARD, HARD_BLOCK_HP);
}

/**
 * 区画の中を階層構造にする。
 *
 * **縦横同じピッチの格子にしてはいけない。** このゲームは横視点なので、格子は
 * 「真上から見た間取り図」に見えてしまう（実機の指摘）。横に長い階を縦に積み、
 * 階をつなぐ縦のシャフトを掘って、建物の断面に見せる。
 *
 * 手順: 内側を全部空洞にする → 階の境目に床を敷く → 床にシャフトの穴を開ける。
 *
 * 床は硬い岩（3発）。シャフトを使うのが速いが、掘って階を抜くこともできる。
 * 掘れないと窮屈になり、掘るのが速いとシャフトの意味が無くなる、その中間。
 *
 * シャフトは階ごとに位置をずらす。上から下まで一直線に落ちられないようにして、
 * 各階を横断させる。
 *
 * @returns {{floors:{r0:number,r1:number}[], shafts:{r:number,c:number,w:number}[]}}
 *   floors は各階の空間（上端・下端の行）。開口とバリアの置き場所に使う
 */
export function buildZoneInterior(grid, blockHP, zone, { thickness, ceilingH, floorH, shaftW, rng }) {
    const T = thickness;
    const r0 = zone.r0 + T, r1 = zone.r1 - T;
    const c0 = zone.c0 + T, c1 = zone.c1 - T;

    fillRect(grid, blockHP, { r0, r1, c0, c1 }, BLOCK_EMPTY, 0);

    // 階を上から積む。最後の階は端数を吸収して少し高く／低くなる
    const floors = [];
    let top = r0;
    while (top + ceilingH - 1 <= r1) {
        floors.push({ r0: top, r1: top + ceilingH - 1 });
        top += ceilingH + floorH;
    }
    // 最下階は**必ず**内側の下端まで伸ばす。端数を空きスペースとして残すと、
    // 床に置いたつもりのお宝が宙に浮く（実際にテストで捕まえた）。
    // 最下階が少し高くなるが、吹き抜けの1階に見えるので都合がよい
    if (floors.length > 0) floors[floors.length - 1].r1 = r1;

    // 階と階の間に床を敷く。金属（6発）— 硬い岩（3発）だと掘って抜くほうが速く、
    // シャフトの意味が薄かった。厚さは FORTRESS_FLOOR_H が決める
    for (let i = 0; i + 1 < floors.length; i++) {
        fillRect(grid, blockHP,
            { r0: floors[i].r1 + 1, r1: floors[i + 1].r0 - 1, c0, c1 }, BLOCK_METAL, METAL_BLOCK_HP);
    }

    // 床ごとにシャフトを1本。位置は階ごとにずらす（真下に落ち続けられないように）
    const shafts = [];
    const innerW = c1 - c0 + 1;
    for (let i = 0; i + 1 < floors.length; i++) {
        // 左右を交互に寄せたうえで、帯の中で乱数を振る。交互にするのは、
        // 乱数だけだと偶然真上に並ぶことがあるため
        const leftHalf = i % 2 === 0;
        const span = Math.max(1, Math.floor(innerW / 2) - shaftW);
        const base = leftHalf ? c0 : c0 + Math.floor(innerW / 2);
        const sc = Math.min(c1 - shaftW + 1, base + Math.floor(rng.next() * span));
        fillRect(grid, blockHP,
            { r0: floors[i].r1 + 1, r1: floors[i + 1].r0 - 1, c0: sc, c1: sc + shaftW - 1 }, BLOCK_EMPTY, 0);
        shafts.push({ r: floors[i].r1 + 1, c: sc, w: shaftW });
    }

    return { floors, shafts };
}

/**
 * 外壁の2辺（上・左）に開口を開け、区画の外の空洞へつなぐ。
 *
 * **入り口は左上に固める**（実機の指摘）。階ごとにばらけると探しづらいので、
 * 左の開口は必ず**最上階**に、しかも**その階の床の上**に開ける。床から
 * gateSize ぶんなので「扉」に見える。階の高さぶん（5タイル）開けていた頃は
 * 「壁が崩れている」ようにも見えた。上の開口は最上階へ落ちる縦穴。
 */
export function openZoneGates(grid, blockHP, zone, {
    thickness, floors, gateSize, rng, tunnelMax, rows, cols,
}) {
    const T = thickness;
    const gates = [];

    // 左辺: 最上階の床の上に gateSize ぶん。乱数は使わない（必ず左上）
    if (floors.length > 0) {
        const top = floors[0];
        const r0 = Math.max(top.r0, top.r1 - gateSize + 1);
        fillRect(grid, blockHP,
            { r0, r1: top.r1, c0: zone.c0, c1: zone.c0 + T - 1 }, BLOCK_EMPTY, 0);
        gates.push({ r: r0, c: zone.c0, side: 'left', w: top.r1 - r0 + 1 });
    }
    // 上辺: 最上階へ落ちる縦穴。左寄りに置いて、左の入り口と近づける
    if (floors.length > 0) {
        const innerC0 = zone.c0 + T;
        const innerW = (zone.c1 - T) - innerC0 + 1;
        // 左半分の中で振る。右端に出ると「左上の入り口」がぼやける
        const span = Math.max(1, Math.floor(innerW / 2) - gateSize);
        const cc = innerC0 + Math.floor(rng.next() * span);
        fillRect(grid, blockHP,
            { r0: zone.r0, r1: zone.r0 + T - 1, c0: cc, c1: cc + gateSize - 1 }, BLOCK_EMPTY, 0);
        gates.push({ r: zone.r0, c: cc, side: 'top', w: gateSize });
    }

    for (const gate of gates) digTunnelFromGate(grid, blockHP, zone, gate, tunnelMax, rows, cols);
    return gates;
}

/** 開口から外向きに、最初の空洞に当たるまで幅 gate.w のトンネルを掘る。 */
function digTunnelFromGate(grid, blockHP, zone, gate, tunnelMax, rows, cols) {
    const horizontal = gate.side === 'left';
    for (let i = 1; i <= tunnelMax; i++) {
        const r = horizontal ? gate.r : zone.r0 - i;
        const c = horizontal ? zone.c0 - i : gate.c;
        if (r < 1 || c < 1 || r >= rows - 1 || c >= cols - 1) return;
        let hitEmpty = false;
        for (let k = 0; k < gate.w; k++) {
            const rr = horizontal ? r + k : r;
            const cc = horizontal ? c : c + k;
            if (rr < 1 || cc < 1 || rr >= rows - 1 || cc >= cols - 1) continue;
            if (grid[rr][cc] === BLOCK_EMPTY) hitEmpty = true;
            grid[rr][cc] = BLOCK_EMPTY;
            blockHP[rr][cc] = 0;
        }
        if (hitEmpty) return;
    }
}

/**
 * 区画を選び、外壁・格子・開口を書き、印を返す。Map から呼ばれる唯一の入口。
 */
export function carveFortressZones({
    grid, blockHP, rows, cols, rooms, excludeRects, rng,
    count, wMin, wRange, hMin, hRange, margin,
    thickness, ceilingH, floorH, shaftW, gateSize, tunnelMax,
    treasureCount, garrisonTurrets, garrisonTanks, barrierClearance,
    guardType, guardInset,
}) {
    const picked = pickFortressZones({
        rows, cols, rooms, excludeRects, rng, count, wMin, wRange, hMin, hRange, margin,
    });
    const marks = new Uint8Array(rows * cols);
    const zones = [];
    for (const zone of picked) {
        buildZoneWalls(grid, blockHP, zone, thickness);
        const { floors, shafts } = buildZoneInterior(
            grid, blockHP, zone, { thickness, ceilingH, floorH, shaftW, rng },
        );
        const openings = openZoneGates(grid, blockHP, zone, {
            thickness, floors, gateSize, rng, tunnelMax, rows, cols,
        });
        // 印は区画の中の「空でない」タイルだけ。空洞には描くものが無い
        for (let r = zone.r0; r <= zone.r1; r++) {
            for (let c = zone.c0; c <= zone.c1; c++) {
                if (grid[r][c] !== BLOCK_EMPTY) marks[r * cols + c] = 1;
            }
        }
        const contents = planZoneContents(zone, floors, shafts, openings, {
            thickness, treasureCount, garrisonTurrets, garrisonTanks, barrierClearance,
            guardType, guardInset, rng,
        });
        zones.push({ ...zone, openings, floors, shafts, ...contents });
    }
    return { zones, marks };
}

/**
 * 区画の中身（お宝・バリアの置き場所・守備隊）を決める。地形は書き換えない。
 *
 * - **お宝**は最下階の右端に並べる。左上から来て右下の基地へ向かうので、
 *   右奥が「一番遠い」＝踏み込んだご褒美になる
 * - **バリア**は階ごとに1本。上下のユニットを壊すと消える（実体は段C）。
 *   シャフトの真上／真下に置くと落ちてきた瞬間に接触するので、2タイル空ける
 * - **守備隊**は各階の床の上と天井に置く。既存の湧きに足すだけ
 */
export function planZoneContents(zone, floors, shafts, openings, {
    thickness, treasureCount, garrisonTurrets, garrisonTanks, barrierClearance,
    guardType, guardInset, rng,
}) {
    const T = thickness;
    const c0 = zone.c0 + T, c1 = zone.c1 - T;
    const bottom = floors[floors.length - 1];

    // お宝: 最下階の床の上、右端から2タイルおきに左へ並べる。
    // 稀少なオーバードライブを一番奥（右）に置く
    const treasures = [];
    for (let i = 0; i < treasureCount; i++) {
        const c = c1 - 1 - i * 2;
        if (c <= c0) break;
        treasures.push({ r: bottom.r1, c, kind: i === 0 ? 'overdrive' : 'repair' });
    }

    // 入り口とその守衛が立つ列。バリアはここを避ける（入り口の真上にバリアが
    // あると、入った瞬間に接触するうえ守衛がバリアに埋まる）
    const left = openings.find((g) => g.side === 'left');
    const guardCol = left ? zone.c0 + T + guardInset : null;

    // バリア: 階ごとに1本。シャフトと入り口から離す。
    // 最下階だけは宝より手前（左）に置く（宝が「バリアの奥」になるように）
    const barriers = [];
    for (const floor of floors) {
        const isTreasureFloor = floor === bottom;
        const limit = isTreasureFloor && treasures.length
            ? Math.min(...treasures.map((t) => t.c)) - 2
            : c1 - 1;
        let c = -1;
        for (let tries = 0; tries < 30 && c < 0; tries++) {
            const cand = c0 + 1 + Math.floor(rng.next() * Math.max(1, limit - c0 - 1));
            const nearShaft = shafts.some((s) => cand >= s.c - 1 && cand <= s.c + s.w);
            const nearGate = guardCol != null && Math.abs(cand - guardCol) <= barrierClearance;
            if (!nearShaft && !nearGate) c = cand;
        }
        // 逃げ道。置ける列が無ければ右端寄りへ（左端は入り口があるので避ける）
        if (c < 0) c = Math.max(c0 + 1, limit - 1);
        barriers.push({ c, top: floor.r0, bottom: floor.r1 });
    }

    // 守備隊: 階ごとに床と天井へ交互に置く。区画あたりの合計は定数で決める。
    // **バリアの列とその左右は避ける** — バリアの中に砲台が居ると、開ける前に
    // 一方的に撃たれるうえ、撃ち返した弾はバリアに吸われて届かない（実機の指摘）
    const clearOfBarriers = (c) => !barriers.some(
        (b) => Math.abs(b.c - c) <= barrierClearance,
    );
    const pickColumn = () => {
        for (let tries = 0; tries < 20; tries++) {
            const c = c0 + 2 + Math.floor(rng.next() * Math.max(1, c1 - c0 - 4));
            if (clearOfBarriers(c)) return c;
        }
        return null;   // 置ける列が無ければ諦める（無理に置くとバリアに埋まる）
    };
    const turrets = [];
    const tanks = [];
    for (let i = 0; i < garrisonTurrets; i++) {
        const floor = floors[i % floors.length];
        const c = pickColumn();
        if (c == null) continue;
        turrets.push({ r: i % 2 === 0 ? floor.r1 : floor.r0, c, isCeiling: i % 2 !== 0 });
    }
    for (let i = 0; i < garrisonTanks; i++) {
        const floor = floors[(i + 1) % floors.length];
        const c = pickColumn();
        if (c == null) continue;
        tanks.push({ r: floor.r1, c });
    }

    // 入り口の守衛。開口の上端（天井付け）と下端（床置き）に1基ずつ。
    // 5ブロックの開口は「壁が崩れている」ようにも見えるので、門番を置いて
    // 「守られた入り口」だと読ませる（実機の指摘）
    if (left) {
        turrets.push({ r: left.r, c: guardCol, isCeiling: true, type: guardType });
        turrets.push({ r: left.r + left.w - 1, c: guardCol, isCeiling: false, type: guardType });
    }

    return { treasures, barriers, garrison: { turrets, tanks } };
}
