// ============================================
// 水圧で運ぶ（連通管）テスト — waterSimulation のフェーズ3（waterPressure.js）
// ============================================
//
// 試験マップは「左の池・右の池・間に1枚の壁」。壁の一部を壊した直後の状態から、実物の
// stepWaterSimulation を Map.update と同じ間隔（WATER_FALL_INTERVAL に1回の落下）で回す。
// フェーズ3を単体で回すテストにしないのは、運ばないフレームでアクティブを保つ仕組みが
// フェーズ2との組み合わせでしか確かめられないため。
//
// 期待値は物理（連通管なら揃う・太さに比例・√で減速）から決めていて、実装から導いていない。
// 変更前の実装で 1・2 は赤かった（底だけ穴は左8段・右3段のまま動かなかった）。
//
// 設計: docs/superpowers/specs/2026-10-10-water-pressure-design.md

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepWaterSimulation } from '../src/js/world/waterSimulation.js';
import { MAX_WATER_MASS, WATER_FALL_INTERVAL } from '../src/js/utils/Constants.js';

/**
 * 左右の池。leftTop / rightTop はそれぞれの水面の行（その行から床の上までが満水）。
 * holeRows の行だけ壁を壊した状態で返す。active は Map.damageBlock と同じく穴の周り3x3。
 * prefill が真なら穴のセルも満水にする（壊した直後の過渡を除いて太さだけを比べるため）
 */
function basins({ leftTop, rightTop, holeRows, rows = 12, w = 5, prefill = false }) {
    const cols = 2 * w + 3;
    const wall = w + 1;
    const isSolid = (r, c) => r === rows - 1 || c === 0 || c === cols - 1 || (c === wall && !holeRows.includes(r));
    const water = new Uint8Array(rows * cols);
    for (let r = leftTop; r < rows - 1; r++) for (let c = 1; c < wall; c++) water[r * cols + c] = MAX_WATER_MASS;
    for (let r = rightTop; r < rows - 1; r++) for (let c = wall + 1; c < cols - 1; c++) water[r * cols + c] = MAX_WATER_MASS;
    if (prefill) for (const r of holeRows) water[r * cols + wall] = MAX_WATER_MASS;
    const active = new Set();
    for (const hr of holeRows) {
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) active.add((hr + dr) * cols + wall + dc);
    }
    return { water, rows, cols, w, wall, isSolid, active };
}

/** Map.update と同じ回し方で frames フレーム。onStep(frame, pressureMoved) を毎フレーム呼ぶ */
function run(s, frames, onStep) {
    let active = s.active;
    let timer = 0;
    for (let f = 0; f < frames; f++) {
        if (active.size === 0) { if (onStep) onStep(f, 0); continue; }
        timer++;
        const doFall = timer >= WATER_FALL_INTERVAL;
        if (doFall) timer = 0;
        const res = stepWaterSimulation({ water: s.water, rows: s.rows, cols: s.cols, isSolid: s.isSolid, activeCells: active, doFall });
        active = res.nextActiveCells;
        if (onStep) onStep(f, res.pressureMoved);
    }
    return active;
}

const sum = (s, c0, c1) => {
    let t = 0;
    for (let r = 0; r < s.rows; r++) for (let c = c0; c <= c1; c++) t += s.water[r * s.cols + c];
    return t;
};
const leftSum = (s) => sum(s, 1, s.wall - 1);
const rightSum = (s) => sum(s, s.wall + 1, s.cols - 2);
// 片側の水位（水量 ÷ 幅、1/8タイル単位）。左右は同じ幅なので水位の差 = 水量の差 ÷ 幅
const levelGap = (s) => Math.abs(leftSum(s) - rightSum(s)) / s.w;

test('連通管: 低い池の水面より下に穴が開くと、揃うまで流れる（総量は変わらない）', () => {
    const s = basins({ leftTop: 3, rightTop: 8, holeRows: [10] });
    const total = sum(s, 0, s.cols - 1);
    run(s, 3000);
    assert.equal(sum(s, 0, s.cols - 1), total, '水量が保存されていない');
    // 変更前は左 64・右 24（左8段・右3段）のまま動かなかった
    assert.ok(levelGap(s) <= 1, `左右の水位の差が残っている: 左 ${leftSum(s) / s.w} 右 ${rightSum(s) / s.w}`);
});

test('水没した穴: 流れ込んで穴が水面の下になった後も、揃うまで流れる', () => {
    // 行6の穴は右の水面（行8）より上なので最初は滝で流れ落ちる。右が行6まで満ちると穴が
    // 水没し、変更前はそこで止まって差が残った（左 46.6・右 39.8）
    const s = basins({ leftTop: 3, rightTop: 8, holeRows: [6] });
    run(s, 3000);
    assert.ok(levelGap(s) <= 1, `左右の水位の差が残っている: 左 ${leftSum(s) / s.w} 右 ${rightSum(s) / s.w}`);
});

test('揃った後は休む（アクティブが空になり、水圧の移動も止まる）', () => {
    const s = basins({ leftTop: 3, rightTop: 8, holeRows: [10] });
    let lastMove = -1;
    const active = run(s, 3000, (f, moved) => { if (moved > 0) lastMove = f; });
    assert.equal(active.size, 0, 'アクティブなセルが残っている');
    assert.ok(lastMove > 0 && lastMove < 2000, `水圧の移動が続いている（最後の移動: ${lastMove} フレーム）`);
});

test('太さで速さが決まる: 穴の太さ 1・2・4 で、揃いきるまでの時間がほぼ反比例する', () => {
    // 穴は全部、右の水面（行8）より下。穴のセルは満水にしておく（壊した直後は穴の不足ぶんが
    // 満ちかけの行として池を昇り、通り道を一時的に細くするので、太さだけを比べられない）。
    // 実測 575・287・143 フレーム（比 2.00・2.01）
    const finish = (holeRows) => {
        const s = basins({ leftTop: 1, rightTop: 8, holeRows, rows: 16, w: 8, prefill: true });
        let last = -1;
        run(s, 6000, (f, moved) => { if (moved > 0) last = f; });
        assert.ok(levelGap(s) <= 1, `太さ ${holeRows.length} で揃っていない`);
        return last;
    };
    const t1 = finish([14]);
    const t2 = finish([13, 14]);
    const t4 = finish([11, 12, 13, 14]);
    assert.ok(t1 / t2 > 1.7 && t1 / t2 < 2.3, `太さ1→2 の比が反比例から外れた: ${t1} / ${t2}`);
    assert.ok(t2 / t4 > 1.7 && t2 / t4 < 2.3, `太さ2→4 の比が反比例から外れた: ${t2} / ${t4}`);
});

test('水位差に応じて減速する: 1回に運ぶ量は差が縮むにつれて減り、最後は1単位', () => {
    // 穴1本なら1回に運ぶ量 = round(GAIN × √水位差)。水位差 7タイル（56）で 3、揃う直前は 1
    const s = basins({ leftTop: 1, rightTop: 8, holeRows: [14], rows: 16, w: 8, prefill: true });
    const seq = [];
    run(s, 6000, (f, moved) => { if (moved > 0) seq.push(moved); });
    assert.ok(seq.length > 10, '水圧の移動がほとんど起きていない');
    assert.ok(seq[0] >= 3, `最初の勢いが弱い: ${seq[0]}`);
    assert.equal(seq[seq.length - 1], 1, '揃う直前が1単位になっていない');
    for (let i = 1; i < seq.length; i++) {
        assert.ok(seq[i] <= seq[i - 1], `途中で速くなった: ${i} 回目 ${seq[i - 1]} → ${seq[i]}`);
    }
});

test('水面より上の穴（滝で流れ落ちる）には割り込まない', () => {
    // 穴（行5）は右の水面（行9）より上。今までどおりフェーズ1・2の滝で流れ、水圧は動かない。
    // 試作では、落ちている途中の満水セルや同じ池の乱れた水面を別の池と見て運んでしまった
    const s = basins({ leftTop: 3, rightTop: 9, holeRows: [5] });
    let moved = 0;
    run(s, 3000, (f, m) => { moved += m; });
    assert.equal(moved, 0, '滝で流れている最中に水圧で運んだ');
    assert.equal(leftSum(s), rightSum(s), '最終状態が変わった（左右とも5段になるはず）');
});

test('壁を全部壊したときにも割り込まない（今までどおり横の流れで揃う）', () => {
    const s = basins({ leftTop: 3, rightTop: 8, holeRows: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });
    let moved = 0;
    run(s, 3000, (f, m) => { moved += m; });
    assert.equal(moved, 0, '壁の全壊で水圧が動いた');
    assert.equal(leftSum(s), rightSum(s));
});

test('高い池の水面のすぐ上の空気で部屋がつながっていても、水面より下の穴から揃う', () => {
    // 壁の行2（左の水面 行3 のすぐ上）にも穴があり、左右の部屋は空気でつながっている。
    // 水は自分の水面より上の道は通れないので、この空気の道では流れず、行10の穴から水圧で
    // 揃うのが正しい。池分けで空気を辿る範囲を水面の1つ上の行から始めると、2つの池が
    // この道で同じ池にされて運ばれなかった（4面 seed 30 で実際にこの形だった。左 63.2・右 23.2）
    const s = basins({ leftTop: 3, rightTop: 8, holeRows: [2, 10] });
    run(s, 3000);
    assert.ok(levelGap(s) <= 1, `左右の水位の差が残っている: 左 ${leftSum(s) / s.w} 右 ${rightSum(s) / s.w}`);
});

// ---- 形を文字で描く試験マップ（以下の5件。テストがまだ触れていない入力の見張り） ----
// '#' 岩、'1'〜'8' 水量、'.' 空気。生成直後の Map と同じく、岩以外の全セルをアクティブにして始める

function fromAscii(lines) {
    const rows = lines.length, cols = lines[0].length;
    const solid = lines.map((l) => [...l].map((ch) => ch === '#'));
    const water = new Uint8Array(rows * cols);
    lines.forEach((l, r) => [...l].forEach((ch, c) => { if (/[1-8]/.test(ch)) water[r * cols + c] = Number(ch); }));
    const active = new Set();
    for (let k = 0; k < rows * cols; k++) if (!solid[Math.floor(k / cols)][k % cols]) active.add(k);
    return { rows, cols, water, isSolid: (r, c) => solid[r][c], active };
}

/** 列 [c0, c1] の水面の高さ（1/8タイル単位、下ほど小さい）。いちばん上の水のある行の平均水量で測る */
function surfaceH(s, c0, c1) {
    for (let r = 0; r < s.rows; r++) {
        let t = 0, n = 0;
        for (let c = c0; c <= c1; c++) {
            if (s.isSolid(r, c)) continue;
            t += s.water[r * s.cols + c];
            n++;
        }
        if (t > 0) return (s.rows - 1 - r) * MAX_WATER_MASS + t / n;
    }
    return 0;
}

test('3つの池が水面より下で1つにつながっていても、全部が同じ高さに揃う', () => {
    // 1ステップで扱うのは1つの塊につき1組（差が最も大きい組）なので、順に揃っていく
    const s = fromAscii([
        '###################',
        '#.....#.....#.....#',
        '#88888#.....#.....#',
        '#88888#.....#.....#',
        '#88888#88888#.....#',
        '#88888#88888#.....#',
        '#88888#88888#88888#',
        '#88888#88888#88888#',
        '#88888888888888888#',
        '###################',
    ]);
    const active = run(s, 4000);
    const [a, b, c] = [surfaceH(s, 1, 5), surfaceH(s, 7, 11), surfaceH(s, 13, 17)];
    assert.ok(Math.max(a, b, c) - Math.min(a, b, c) <= 1, `高さが揃っていない: ${a} ${b} ${c}`);
    assert.equal(active.size, 0);
});

test('片側に水が注ぎ続けても、行き来せずにもう片側へ分かれていく', () => {
    // 4面の水源（4フレームに1単位）が、下でつながった池の片側に注ぐ形（seed 8 で実際にある）。
    // 水位は「片側の水量 ÷ 幅」で比べる（左右は同じ幅）。surfaceH だと右の上空を落ちている
    // 水を水面と読んでしまう。試作の実測: 注いでいる間の差は最大 1.8 単位、止めた後は 1.6 で休む
    const s = fromAscii([
        '#############',
        '#.....#.....#',
        '#.....#.....#',
        '#.....#.....#',
        '#88888#88888#',
        '#88888#88888#',
        '#88888#88888#',
        '#88888888888#',
        '#############',
    ]);
    let active = s.active;
    let timer = 0;
    const vol = (c0, c1) => {
        let t = 0;
        for (let r = 0; r < s.rows; r++) for (let c = c0; c <= c1; c++) t += s.water[r * s.cols + c];
        return t / (c1 - c0 + 1);
    };
    let maxGap = 0;
    for (let f = 0; f < 2000; f++) {
        if (f < 1200 && f % WATER_FALL_INTERVAL === 0) {
            const k = 1 * s.cols + 9;   // 右の池の上空
            if (s.water[k] < MAX_WATER_MASS) { s.water[k]++; active.add(k); }
        }
        if (active.size > 0) {
            timer++;
            const doFall = timer >= WATER_FALL_INTERVAL;
            if (doFall) timer = 0;
            active = stepWaterSimulation({ water: s.water, rows: s.rows, cols: s.cols, isSolid: s.isSolid, activeCells: active, doFall }).nextActiveCells;
        }
        if (f > 100) maxGap = Math.max(maxGap, Math.abs(vol(1, 5) - vol(7, 11)));
    }
    assert.ok(maxGap <= 4, `注いでいる間に水位差が半タイルを超えた: ${maxGap}`);
    assert.ok(Math.abs(vol(1, 5) - vol(7, 11)) <= 2, `止めた後に差が残っている: ${vol(1, 5)} ${vol(7, 11)}`);
    assert.equal(active.size, 0, '止めた後に休まない');
});

test('厚い壁を貫く細長いトンネルでも揃う', () => {
    const s = fromAscii([
        '#################',
        '#.....#####.....#',
        '#88888#####.....#',
        '#88888#####.....#',
        '#88888#####.....#',
        '#88888#####88888#',
        '#88888#####88888#',
        '#88888.....88888#',
        '#################',
    ]);
    run(s, 4000);
    assert.ok(Math.abs(surfaceH(s, 1, 5) - surfaceH(s, 11, 15)) <= 1);
});

test('岩の天井の下の空気溜まりがあっても、行き来せずに休む', () => {
    // 左の池の行6・列1〜3 は岩の天井（行5）の下の空き。満ちかけの水面は天井の下でも受け口になる
    const s = fromAscii([
        '#############',
        '#.....#.....#',
        '#.....#.....#',
        '#.....#.....#',
        '#88888#.....#',
        '###88##88888#',
        '#...8#888888#',
        '#88888888888#',
        '#############',
    ]);
    const total = s.water.reduce((a, b) => a + b, 0);
    const active = run(s, 4000);
    assert.equal(active.size, 0, '休まない（行き来している）');
    assert.equal(s.water.reduce((a, b) => a + b, 0), total);
});

test('幅の違う池でも、揃うのは水量ではなく水位', () => {
    const s = fromAscii([
        '##############',
        '#..#.........#',
        '#88#.........#',
        '#88#.........#',
        '#88#.........#',
        '#88#888888888#',
        '#888888888888#',
        '##############',
    ]);
    run(s, 4000);
    assert.ok(Math.abs(surfaceH(s, 1, 2) - surfaceH(s, 4, 12)) <= 1, `水位が揃っていない: ${surfaceH(s, 1, 2)} ${surfaceH(s, 4, 12)}`);
});
