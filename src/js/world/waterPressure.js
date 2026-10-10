// ============================================
// waterPressure - 水圧で運ぶ（連通管）。水シミュレーションのフェーズ3
// ============================================
//
// セル・オートマトン（waterSimulation.js）の水は「下へ落ちる」と「同じ行の区間で
// 横に広がる」しかしないので、満水のセルどうしが押し合って水を運ぶことがない。
// 低い池の水面より下に穴が開いた連通管の形だと、1滴も動かなかった（2026-10-10 実測、
// 左8段・右3段のまま）。ここでは満水セルの中を通る経路で、高い水面から低い水面へ水を運ぶ。
//
// 速さは「接続部の太さ × √水位差」。太さは、満水の塊の中で取れる頂点の重ならない経路の
// 本数として数える（各セル容量1の最大流。メンガーの定理でいちばん細いところのセル数に等しい）。
// √ はトリチェリの定理（流速 ∝ √水位差）に合わせたもので、揃う直前ほど遅くなる。
//
// 描画・液面のキャッシュには触らない。運んだセルは markChanged で通知し、既存の
// changedCells → Map.onWaterChanged の経路に乗せる。液面の値（waterSurfaceY）を池全体で
// 1つにする案は 9/21 に波・岩の下の塗り・水しぶきを壊して差し戻した（memory:
// hoverattack-water-surface-locality）。揃えるのは値ではなく水量。
//
// 設計: docs/superpowers/specs/2026-10-10-water-pressure-design.md

import {
    MAX_WATER_MASS, WATER_PRESSURE_GAIN, WATER_PRESSURE_MIN_DIFF, WATER_PRESSURE_MAX_FLOW,
} from '../utils/Constants.js';
import { supportsWater } from './waterRules.js';

const FULL = MAX_WATER_MASS;

// 呼ばれるたびにマップ全体ぶんの配列を作らないよう、大きさが同じ間は使い回す。
// どれも「この呼び出しの通し番号」を書き込んで印にするので、消し直す必要がない
let scratchSize = 0;
let compStamp = null;    // 満水セル → どの呼び出しのどの塊で辿ったか
let nodeIndex = null;    // セル → 塊の中での番号（最大流のノード）
let basinStamp = null;   // セル → 池分けの塗り広げで辿った番号
let basinOf = null;      // セル → 池の番号
let callCount = 0;       // 呼び出しの通し番号（compStamp の印）
let basinCount = 0;      // 池分けの通し番号（basinStamp の印）

function ensureScratch(n) {
    if (scratchSize === n) return;
    scratchSize = n;
    compStamp = new Int32Array(n);
    nodeIndex = new Int32Array(n);
    basinStamp = new Int32Array(n);
    basinOf = new Int32Array(n);
    callCount = 0;
    basinCount = 0;
}

/**
 * 水圧による移動を1ステップぶん行う（doTransfer が偽なら差が残っているかを確かめるだけ）。
 *
 * @param {Object} p
 * @param {Uint8Array} p.water 水量配列。doTransfer のとき直接更新される
 * @param {number} p.rows
 * @param {number} p.cols
 * @param {function(number, number): boolean} p.isSolid
 * @param {Iterable<number>} p.seeds このフレームのアクティブなセル (r * cols + c)
 * @param {boolean} p.doTransfer 運ぶフレームか（落下と同じ WATER_FALL_INTERVAL に1回）
 * @param {function(number, number): void} p.markChanged 水量を変えたセルを知らせる
 * @param {function(number): void} p.keepActive 差が残っている水面を次のフレームもアクティブに残す
 * @returns {number} 運んだ水量の合計（テストが発生源で数えるため）
 */
export function stepWaterPressure({ water, rows, cols, isSolid, seeds, doTransfer, markChanged, keepActive }) {
    ensureScratch(rows * cols);
    const callStamp = ++callCount;

    // 通り道にする満水セル。下が岩か満水で支えられているものだけ。滝として落ちている途中の
    // 満水セルまで数えると、水面より上の穴から滝で流れ落ちている最中にも、その滝の上の
    // 空セルを「低い受け口」とみなして運んでしまった（試作で実測、フェーズ2の流れに割り込む）
    const isFullCell = (k) => {
        if (water[k] !== FULL) return false;
        const r = Math.floor(k / cols), c = k % cols;
        if (isSolid(r, c)) return false;
        return supportsWater(water, rows, cols, isSolid, r + 1, c);
    };

    let moved = 0;
    for (const k0 of seeds) {
        // 種から満水の塊の入口を探す。満水ならそのセル、水面（または満水の上の空セル）なら直下
        let start = -1;
        if (isFullCell(k0)) start = k0;
        else if (k0 + cols < rows * cols && isFullCell(k0 + cols)) start = k0 + cols;
        if (start < 0 || compStamp[start] === callStamp) continue;
        moved += processComponent(start);
    }
    return moved;

    /** 満水の塊を1つ処理する */
    function processComponent(start) {
        // ---- 塊を辿る ----
        const nodes = [start];
        compStamp[start] = callStamp;
        for (let i = 0; i < nodes.length; i++) {
            const k = nodes[i];
            const r = Math.floor(k / cols), c = k % cols;
            if (r > 0) visit(k - cols);
            if (r + 1 < rows) visit(k + cols);
            if (c > 0) visit(k - 1);
            if (c + 1 < cols) visit(k + 1);
        }
        function visit(nk) {
            if (compStamp[nk] !== callStamp && isFullCell(nk)) {
                compStamp[nk] = callStamp;
                nodes.push(nk);
            }
        }

        // ---- 塊に乗っている水面を集める ----
        // node: 経路の入口/出口になる塊のセル。take: 取り出すセル（水面の水がある行）。
        // put: 入れるセル（満水でない。満水の水面なら1つ上の空セル）
        const surfaces = [];
        let bandTop = rows, bandBottom = -1;
        for (const k of nodes) {
            const a = k - cols;
            if (a < 0) continue;
            const ra = Math.floor(a / cols), ca = a % cols;
            if (isSolid(ra, ca)) continue;   // 天井の下で満水: 自由水面ではない
            const wa = water[a];
            let s = null;
            if (wa === 0) {
                // 満水の水面: 取り出すのはこのセル、入れるのは真上の空セル
                s = { node: k, take: k, put: a, H: (rows - 1 - ra) * FULL };
            } else if (wa < FULL) {
                // 満水でない水面セル（真上に水があるなら、まだ落ちてくる途中なので水面ではない）
                if (ra > 0 && !isSolid(ra - 1, ca) && water[a - cols] > 0) continue;
                s = { node: k, take: a, put: a, H: (rows - 1 - ra) * FULL + wa };
            }
            if (!s) continue;
            surfaces.push(s);
            bandTop = Math.min(bandTop, Math.floor(s.take / cols));
            bandBottom = Math.max(bandBottom, ra);
        }

        // 満水セルの横隣の水面。行き止まりのトンネルの先から上へ伸びる幅1の縦穴のように、
        // 塊の端のセルが満水にならず、その真上が受け口にならない形がある — フェーズ2は均しの
        // 余りを区間の中央から配るので、トンネルの行の不足1単位は必ず端（縦穴の真下）に残り、
        // 7 のまま塊に入らない。真上だけから集めていた版では縦穴に1滴も上がらなかった
        // （レビューで、トンネルの長さ・水量を振った 40/40 で再現）。
        // 条件: 満水でない・下が岩か満水で支えられている・真上に水が無い・**その行の区間に
        // 落ち口が無い**。最後の条件が無いと、水面より上の穴から滝で流れ落ちている途中の
        // セル（穴の中の満ちかけのセル）まで受け口になり、フェーズ2の流れに割り込んだ
        const putCells = new Set(surfaces.map((x) => x.put));
        const drainOfSeg = new Map();
        const segHasDrain = (r, c) => {
            let s0 = c;
            while (s0 - 1 >= 0 && !isSolid(r, s0 - 1)) s0--;
            const key = r * cols + s0;
            if (drainOfSeg.has(key)) return drainOfSeg.get(key);
            let drain = false;
            for (let x = s0; x < cols && !isSolid(r, x); x++) {
                if (!supportsWater(water, rows, cols, isSolid, r + 1, x)) { drain = true; break; }
            }
            drainOfSeg.set(key, drain);
            return drain;
        };
        // 塊のセルは毎フレーム全部見るので、ほとんどの隣（満水か岩）を最初の1回の比較で落とす
        const addSide = (k, r, cn) => {
            const n = r * cols + cn;
            if (water[n] >= FULL || isSolid(r, cn) || putCells.has(n)) return;
            if (!supportsWater(water, rows, cols, isSolid, r + 1, cn)) return;
            if (r > 0 && !isSolid(r - 1, cn) && water[n - cols] > 0) return;
            if (segHasDrain(r, cn)) return;
            putCells.add(n);
            surfaces.push({ node: k, take: n, put: n, H: (rows - 1 - r) * FULL + water[n] });
            bandTop = Math.min(bandTop, r);
            bandBottom = Math.max(bandBottom, r);
        };
        for (const k of nodes) {
            const r = Math.floor(k / cols), c = k % cols;
            if (c > 0) addSide(k, r, c - 1);
            if (c + 1 < cols) addSide(k, r, c + 1);
        }
        if (surfaces.length < 2) return 0;

        // ---- 水面を池に分ける ----
        // 2つの水面のあいだを、満水でないセル（空気・満ちかけの水・落ちている途中の水）だけを
        // 通って行き来できるなら同じ池。行き来できる道があるなら水はその道を普通に流れる
        // （フェーズ1・2の仕事）ので、水圧では運ばない。
        //
        // 辿るのは [いちばん高い水面の水がある行, いちばん低い水面の入れ先の行] だけ。
        // 水は自分の水面より上の道は通れない — 範囲を水面の1つ上の空セルの行から始めたら、
        // 4面 seed 30 の2つの池（水面 行109 と 行111）が、高い池の水面より上（行108）の
        // 空気でつながって同じ池にされ、水面より下を掘り抜いても運ばれなかった。
        // 洞窟の上の方の空気まで含めると、別々の部屋の池が天井の上でつながるのも同じ理由。
        //
        // 満水の水面（入れ先が範囲の上にはみ出す）は水のセルから辿り始める。満水のセルは
        // 塗り広げで通れないが、辿っている途中で別の水面の出発点（隣の満水の水面のセル）に
        // 行き当たったらその水面とつなぐので、横に並んだ満水の水面は1つの池にまとまる
        //
        // 試作では「水面の行の区間（壁で区切られた横の並び）」で池を分けたが、ちょうど満水の
        // 列と満ちかけの列、しぶきで乱れた水面などが別の池に見え、水面より上の穴から滝で
        // 流れ落ちている最中の池の中で運んでしまった（2026-10-10 実測）
        const parent = surfaces.map((_, i) => i);
        const find = (i) => {
            while (parent[i] !== i) i = parent[i] = parent[parent[i]];
            return i;
        };
        const union = (i, j) => {
            const a = find(i), b = find(j);
            if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
        };
        const basinStampNow = ++basinCount;
        const regionOwner = [];   // 塗り広げの番号 → 最初にそこへ着いた水面
        for (let i = 0; i < surfaces.length; i++) {
            const s = surfaces[i];
            // 入れ先が範囲に入っていれば入れ先から、満水の水面で入れ先が範囲の上なら水のセルから
            const start = Math.floor(s.put / cols) >= bandTop ? s.put : s.take;
            if (basinStamp[start] === basinStampNow) { union(i, regionOwner[basinOf[start]]); continue; }
            const region = regionOwner.length;
            regionOwner.push(i);
            const queue = [start];
            basinStamp[start] = basinStampNow;
            basinOf[start] = region;
            const spread = (nk) => {
                if (basinStamp[nk] === basinStampNow) {
                    // 別の水面の出発点（満水のセル）に行き当たったらつなぐ
                    if (basinOf[nk] !== region) union(i, regionOwner[basinOf[nk]]);
                    return;
                }
                if (isSolid(Math.floor(nk / cols), nk % cols) || isFullCell(nk)) return;
                basinStamp[nk] = basinStampNow;
                basinOf[nk] = region;
                queue.push(nk);
            };
            for (let qi = 0; qi < queue.length; qi++) {
                const q = queue[qi];
                const r = Math.floor(q / cols), c = q % cols;
                if (r > bandTop) spread(q - cols);
                if (r < bandBottom) spread(q + cols);
                if (c > 0) spread(q - 1);
                if (c + 1 < cols) spread(q + 1);
            }
        }
        surfaces.forEach((s, i) => { s.basin = find(i); });

        // ---- 池ごとの高さ ----
        const hiOf = new Map(), loOf = new Map();
        for (const s of surfaces) {
            if (!hiOf.has(s.basin) || hiOf.get(s.basin) < s.H) hiOf.set(s.basin, s.H);
            if (!loOf.has(s.basin) || loOf.get(s.basin) > s.H) loOf.set(s.basin, s.H);
        }
        // 最も差の大きい「別の池どうし」の組。池の数は数個なので総当たりでよい。
        // 差が同じなら番号の小さい池を選ぶ（Map の順序に頼らず決定的にする）
        let srcBasin = -1, dstBasin = -1, best = -Infinity;
        for (const [sa, h] of hiOf) {
            for (const [sb, l] of loOf) {
                if (sa === sb) continue;
                const d = h - l;
                if (d > best || (d === best && (sa < srcBasin || (sa === srcBasin && sb < dstBasin)))) {
                    best = d; srcBasin = sa; dstBasin = sb;
                }
            }
        }
        if (best < WATER_PRESSURE_MIN_DIFF) return 0;
        const srcLevel = hiOf.get(srcBasin), dstLevel = loOf.get(dstBasin);
        const sources = surfaces.filter((s) => s.basin === srcBasin && s.H >= dstLevel + WATER_PRESSURE_MIN_DIFF);
        const sinks = surfaces.filter((s) => s.basin === dstBasin && s.H <= srcLevel - WATER_PRESSURE_MIN_DIFF);

        if (!doTransfer) {
            // 運ばないフレーム: 差が残っているので、両側の水面を次のフレームもアクティブに残す。
            // これが無いと、運んだ直後の非落下フレームでフェーズ2が何も変えなかったとき
            // アクティブが空になり、1回運んだきり止まる
            for (const s of sources) keepActive(s.take);
            for (const s of sinks) keepActive(s.put);
            return 0;
        }

        // ---- 太さ（最大流、各セル容量1） ----
        const paths = countDisjointPaths(nodes, sources, sinks);
        if (paths === 0) return 0;

        // ---- 運ぶ ----
        // 運ぶ総量は「経路の本数 × round(GAIN × √水位差)」。経路はどの水面から取るかまでは
        // 決めない — 経路の端の水面セルの水量で頭打ちにすると、取り出す水面が浅いだけで
        // 太い穴が遅くなった（試作で、太さ 1・2・4 で半分揃うまで 239・151・75 フレーム。
        // この形にして 207・103・51）。
        // 実際の出し入れは、高い池のいちばん高い水面から取り、低い池のいちばん低い水面へ
        // 入れるのを1単位ずつ繰り返す。差が MIN_DIFF を割ったら止める（逆転させない）
        let perPath = Math.round(WATER_PRESSURE_GAIN * Math.sqrt(best));
        perPath = Math.min(Math.max(perPath, 1), WATER_PRESSURE_MAX_FLOW);
        const budget = paths * perPath;
        let total = 0;
        for (; total < budget; total++) {
            let s = null, d = null;
            for (const x of sources) if (water[x.take] > 0 && (!s || x.H > s.H)) s = x;
            for (const x of sinks) if (water[x.put] < FULL && (!d || x.H < d.H)) d = x;
            if (!s || !d || s.H - d.H < WATER_PRESSURE_MIN_DIFF) break;
            water[s.take]--;
            water[d.put]++;
            s.H--;
            d.H++;
            markChanged(Math.floor(s.take / cols), s.take % cols);
            markChanged(Math.floor(d.put / cols), d.put % cols);
        }
        return total;
    }

    /**
     * 塊の中で、出し口の水面から受け口の水面への頂点の重ならない経路を何本取れるかを数える
     * （ノード分割＋BFS の増加路）。メンガーの定理により、これは接続部のいちばん細い
     * ところのセル数に等しい（池の幅の方が狭ければ幅で頭打ち）。
     */
    function countDisjointPaths(nodes, sources, sinks) {
        const n = nodes.length;
        for (let i = 0; i < n; i++) nodeIndex[nodes[i]] = i;
        // ノード: in(i) = 2i, out(i) = 2i+1, S = 2n, T = 2n+1。辺はすべて容量1
        const S = 2 * n, T = 2 * n + 1, V = 2 * n + 2;
        const head = new Int32Array(V).fill(-1);
        const to = [], cap = [], nxt = [];
        const addEdge = (u, v) => {
            to.push(v); cap.push(1); nxt.push(head[u]); head[u] = to.length - 1;
            to.push(u); cap.push(0); nxt.push(head[v]); head[v] = to.length - 1;
        };
        for (let i = 0; i < n; i++) {
            addEdge(2 * i, 2 * i + 1);
            const k = nodes[i];
            const r = Math.floor(k / cols), c = k % cols;
            if (r > 0 && compStamp[k - cols] === callStamp) addEdge(2 * i + 1, 2 * nodeIndex[k - cols]);
            if (r + 1 < rows && compStamp[k + cols] === callStamp) addEdge(2 * i + 1, 2 * nodeIndex[k + cols]);
            if (c > 0 && compStamp[k - 1] === callStamp) addEdge(2 * i + 1, 2 * nodeIndex[k - 1]);
            if (c + 1 < cols && compStamp[k + 1] === callStamp) addEdge(2 * i + 1, 2 * nodeIndex[k + 1]);
        }
        for (const s of sources) addEdge(S, 2 * nodeIndex[s.node]);
        for (const d of sinks) addEdge(2 * nodeIndex[d.node] + 1, T);

        let flow = 0;
        const prevEdge = new Int32Array(V);
        const queue = new Int32Array(V);
        for (;;) {
            prevEdge.fill(-1);
            prevEdge[S] = -2;
            let qh = 0, qt = 0;
            queue[qt++] = S;
            while (qh < qt && prevEdge[T] === -1) {
                const u = queue[qh++];
                for (let e = head[u]; e !== -1; e = nxt[e]) {
                    if (cap[e] > 0 && prevEdge[to[e]] === -1) {
                        prevEdge[to[e]] = e;
                        queue[qt++] = to[e];
                    }
                }
            }
            if (prevEdge[T] === -1) return flow;
            for (let v = T; v !== S; v = to[prevEdge[v] ^ 1]) {
                cap[prevEdge[v]] -= 1;
                cap[prevEdge[v] ^ 1] += 1;
            }
            flow++;
        }
    }
}
