# 水圧で運ぶ（連通管）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 4面の水で、低い池の水面より下でつながった池どうしの水位を、接続部の太さ × √水位差の速さで揃える。

**Architecture:** `stepWaterSimulation` のフェーズ2の後にフェーズ3（新規 `src/js/world/waterPressure.js` の純関数 `stepWaterPressure`）を足す。支えられた満水セルの塊の中で、高い池の水面から低い池の水面への頂点の重ならない経路の本数（最大流）を数え、本数 × `round(GAIN × √Δ)` 単位を高い水面から低い水面へ1単位ずつ移す。変わるのは `water[]` だけで、通知は既存の `markChanged` → `changedCells` → `Map.onWaterChanged` の経路に乗る。描画・液面キャッシュ・`Map.js` は触らない。

**Tech Stack:** バニラ ES modules、`node --test`（DOM も AudioContext も無い）。

**Spec:** `docs/superpowers/specs/2026-10-10-water-pressure-design.md`

**試作について:** 本計画のコードとテストは、計画を書く前にスクラッチのリポジトリ複製で動かして確かめてある（全テスト通過、わざと壊す9通りすべてで赤くなることを確認済み）。期待される出力の数値はその実測値。

## Global Constraints

- **`git add -A` / `git add .` は使わない。** 変更したファイルを名前で add する。`src/js/main.js` の `debugStartMission: 6` はユーザーが意図的に未コミットで置いている。**`git checkout` / `git restore` / `git stash` も使わない**（main.js の未コミットの行が消える）
- ブランチは `git switch -c feat/water-pressure` で切る（作業ツリーに触らないので main.js の行は残る）
- コメントは日本語で「なぜそうしたか」を書く。数値には根拠（実測値）を残す
- 調整用の数値は `src/js/utils/Constants.js` に置く。実装側に直書きしない
- `Map.js`・`waterQuery.js`・`src/js/world/environment/` は触らない（memory: hoverattack-water-surface-locality。液面の値を池全体で1つにする案は 9/21 に3つの退行を出して差し戻した）
- 水量 `water[]` を書いたセルは必ず `markChanged` を通す（memory: lazy-cache-every-writer-notifies）
- ソース文字列を grep するテストは書かない。運んだ量は `stepWaterSimulation` の戻り値 `pressureMoved` で発生源で数える
- サーバーは起動しない。実機確認はユーザーが行い、ハードリロード（Cmd+Shift+R）が要ることを伝える
- `tests/enemy-spawn-determinism.test.js` の「湧き位置は重複しない（面7: 戦車）」は **2026-10-10 時点の main で既に落ちている**。今回の変更とは無関係なので、全テストではこの1件だけが落ちるのが正しい

## Review Focus

仕様書から導かれるが、仕様書のテスト項目には無い入力。どれも Task 1 のテストに1件ずつ入れてある（試作で全部確認済み）。

- 3つ以上の池が水面より下で1つにつながっている → 全部が同じ高さに揃う（1ステップで1組ずつ）
- 下でつながった池の片側に水源が注ぎ続ける（seed 8 で実際にある）→ 行き来せず、差は半タイル以内、止めれば休む
- 厚い壁を貫く細長いトンネル → 太さ1の穴と同じく揃う
- 岩の天井の下の空気溜まり → 埋まって休む（行き来しない）
- 幅の違う池 → 揃うのは水量ではなく水位

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| `src/js/world/waterPressure.js`（新規） | フェーズ3本体。`export function stepWaterPressure({ water, rows, cols, isSolid, seeds, doTransfer, markChanged, keepActive }): number` |
| `src/js/world/waterSimulation.js` | フェーズ2の後で `stepWaterPressure` を呼ぶ。戻り値に `pressureMoved: number` を足す |
| `src/js/utils/Constants.js` | `WATER_PRESSURE_GAIN` / `WATER_PRESSURE_MIN_DIFF` / `WATER_PRESSURE_MAX_FLOW` |
| `tests/water-pressure.test.js`（新規） | 13件 |
| `docs/superpowers/specs/2026-10-10-water-pressure-design.md` | Task 2 で実装後の実測を追記 |

---

### Task 1: 水圧のフェーズ（テスト13件＋実装）

**Files:**
- Create: `src/js/world/waterPressure.js`
- Create: `tests/water-pressure.test.js`
- Modify: `src/js/world/waterSimulation.js`（冒頭コメント・import・JSDoc・早期 return・フェーズ2の後・最後の return）
- Modify: `src/js/utils/Constants.js:1172` の直後（`WATER_MAX_SPREAD_FLOW` の行の次）

**Interfaces:**
- Consumes: `MAX_WATER_MASS`, `WATER_FALL_INTERVAL`（既存の定数）
- Produces:
  - `stepWaterPressure({ water: Uint8Array, rows: number, cols: number, isSolid: (r, c) => boolean, seeds: Iterable<number>, doTransfer: boolean, markChanged: (r, c) => void, keepActive: (k: number) => void }): number` — 運んだ水量の合計
  - `stepWaterSimulation(...)` の戻り値が `{ changedCells, nextActiveCells, pressureMoved: number }` になる（早期 return でも `pressureMoved: 0`）
  - 定数 `WATER_PRESSURE_GAIN = 0.35`, `WATER_PRESSURE_MIN_DIFF = 2`, `WATER_PRESSURE_MAX_FLOW = 4`

- [ ] **Step 1: ブランチを切り、変更前の実測を取っておく**

```bash
git switch -c feat/water-pressure
git status --short          # " M src/js/main.js" だけが出ること
node tools/measure-water.mjs > /private/tmp/claude-501/-Users-nao-Library-CloudStorage-GoogleDrive-nfujii-npr-gmail-com--------Google-AI-Studio-proj-HoverAttack/d23034ec-4e92-46ba-b0d9-57e8b5b38c74/scratchpad/m-before.json
node tools/trace-water.mjs > /private/tmp/claude-501/-Users-nao-Library-CloudStorage-GoogleDrive-nfujii-npr-gmail-com--------Google-AI-Studio-proj-HoverAttack/d23034ec-4e92-46ba-b0d9-57e8b5b38c74/scratchpad/t-before.json
```

（`/private/tmp/claude-501/-Users-nao-Library-CloudStorage-GoogleDrive-nfujii-npr-gmail-com--------Google-AI-Studio-proj-HoverAttack/d23034ec-4e92-46ba-b0d9-57e8b5b38c74/scratchpad` はこのセッションのスクラッチパッド。別のセッションで実行するなら、そのセッションのスクラッチパッドに読み替える。以下同じ）

- [ ] **Step 2: テストを書く**

`tests/water-pressure.test.js` を次の内容で作る。

````js
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
````

- [ ] **Step 3: テストが落ちることを確かめる**

Run: `node --test tests/water-pressure.test.js`
Expected: 13件中 12件 FAIL。通るのは「岩の天井の下の空気溜まりがあっても、行き来せずに休む」だけ（今の実装でも休むので正しい — このテストは後で `MIN_DIFF` を 1 にしたときに赤くなる見張り）。「水面より上の穴」「壁の全壊」は `pressureMoved` が `undefined` で合計が `NaN` になって落ちる。

- [ ] **Step 4: 定数を足す**

`src/js/utils/Constants.js` の

```js
export const WATER_MAX_SPREAD_FLOW = 4; // 1ステップあたりの最大水平流出量（初期のスムーズな流出速度）
```

の直後に次を挿入する。

```js
// 水圧（連通管、world/waterPressure.js）。水面より下でつながった池どうしで、高い方から低い方へ
// 1ステップ（WATER_FALL_INTERVAL に1回）あたり「接続部の太さ（セル数）× round(GAIN × √水位差)」を運ぶ。
// 水位差は 1/8タイル単位。GAIN の初期値は、水位差4タイル（√32 ≈ 5.7）で 1経路あたり 2単位/4フレーム
// ＝ 0.5単位/フレームになるように選んだ。水面より上の穴1段から滝で流れ落ちる速さ（実測 0.52単位/
// フレーム、2026-10-10）とほぼ同じで、水面の上の穴と下の穴とで流れる速さの感覚が揃う。実機未確認
export const WATER_PRESSURE_GAIN = 0.35;
// これ未満の水位差では運ばない。1単位運ぶと差は2縮むので、2未満で運ぶと逆転して行き来する
export const WATER_PRESSURE_MIN_DIFF = 2;
// 1経路・1ステップあたりの上限（WATER_MAX_SPREAD_FLOW と同じ）。太い穴を開けた直後の勢いの頭打ち
export const WATER_PRESSURE_MAX_FLOW = 4;
```

- [ ] **Step 5: `src/js/world/waterPressure.js` を作る**

````js
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
        return r + 1 >= rows || isSolid(r + 1, c) || water[k + cols] === FULL;
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
        // 満水の水面（入れ先が範囲の上にはみ出す）は水のセルから辿り始める。満水どうしの
        // 水面は互いにつながらず別々の池に見えるが、高さが同じなので運ばれない。1回運べば
        // 満ちかけになって空気の塗り広げでまとまる（横に隣り合う水面をつなぐ処理も試したが、
        // 効くのが最初の1回だけで結果を変えなかったので置いていない）
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
````

- [ ] **Step 6: `src/js/world/waterSimulation.js` からフェーズ3を呼ぶ**

6-1. 冒頭コメントの、フェーズ2の説明の最後の行

```js
//      上の行に積み上がる結果であって、この層の処理が押し上げるのではない。
//
```

を次に置き換える（フェーズ3の説明を足す）。

```js
//      上の行に積み上がる結果であって、この層の処理が押し上げるのではない。
//
// 3. 水圧（連通管）: waterPressure.js
//    満水セルの中を通って、高い水面から低い水面へ運ぶ。フェーズ1・2は「落ちる」と
//    「同じ行で横に広がる」しかしないので、低い池の水面より下でつながった池どうしは
//    これが無いと水位が揃わない（2026-10-10 実測、1滴も動かなかった）。
//
```

6-2. import の行の直後に足す。

```js
import { stepWaterPressure } from './waterPressure.js';
```

6-3. JSDoc の

```js
 * @returns {{ changedCells: Array<[number, number]>, nextActiveCells: Set<number> }}
```

を次に置き換える。

```js
 * @returns {{ changedCells: Array<[number, number]>, nextActiveCells: Set<number>, pressureMoved: number }}
 *   pressureMoved はフェーズ3（水圧）が運んだ水量の合計
```

6-4. 早期 return

```js
        return { changedCells: [], nextActiveCells };
```

を次に置き換える。

```js
        return { changedCells: [], nextActiveCells, pressureMoved: 0 };
```

6-5. フェーズ2のループが終わった直後、`if (!doFall) {` の**手前**に挿入する。

```js
    // ----------------------------------------------------
    // フェーズ3: 水圧（連通管）
    // ----------------------------------------------------
    // 運ぶのは落下と同じフレームだけ。運ばないフレームは差が残っているかだけ確かめ、
    // 残っていれば両側の水面をアクティブに残す（下の !doFall 節と同じく休眠を防ぐ）
    const pressureMoved = stepWaterPressure({
        water, rows, cols, isSolid,
        seeds: cellsToProcess.map((x) => x.k),
        doTransfer: doFall,
        markChanged,
        keepActive: (k) => nextActiveCells.add(k),
    });

```

6-6. 最後の return

```js
    return { changedCells, nextActiveCells };
```

を次に置き換える。

```js
    return { changedCells, nextActiveCells, pressureMoved };
```

- [ ] **Step 7: テストが通ることを確かめる**

Run: `node --test tests/water-pressure.test.js`
Expected: `ℹ pass 13` / `ℹ fail 0`

- [ ] **Step 8: わざと壊して赤くなることを確かめる**

1つずつ Edit で書き換えて `node --test tests/water-pressure.test.js` を走らせ、**書き換えを Edit で元に戻してから**次へ進む（`git checkout` は使わない）。期待値は試作の実測。

| # | ファイル | 書き換え（前 → 後） | 赤くなるテスト |
|---|---|---|---|
| 1 | waterSimulation.js | `doTransfer: doFall,` → `doTransfer: false,` と `keepActive: (k) => nextActiveCells.add(k),` → `keepActive: () => {},` | 12件（空気溜まり以外の全部） |
| 2 | waterPressure.js | `if (prevEdge[T] === -1) return flow;` → `if (prevEdge[T] === -1 \|\| flow >= 1) return flow;` | 太さで速さが決まる |
| 3 | waterPressure.js | `let perPath = Math.round(WATER_PRESSURE_GAIN * Math.sqrt(best));` → `let perPath = 2;` | 水位差に応じて減速する |
| 4 | waterPressure.js | `!doTransfer` 節の `for (const s of sources) keepActive(s.take);` と `for (const s of sinks) keepActive(s.put);` の2行を消す | 連通管・水没した穴・太さ・減速・高い池の水面のすぐ上の空気 |
| 5 | waterPressure.js | `return r + 1 >= rows \|\| isSolid(r + 1, c) \|\| water[k + cols] === FULL;` → `return true;` | 壁を全部壊したとき |
| 6 | waterPressure.js | `if (basinOf[nk] !== region) union(i, regionOwner[basinOf[nk]]);` を消す | 水面より上の穴 |
| 7 | waterPressure.js | `bandTop = Math.min(bandTop, Math.floor(s.take / cols));` → `bandTop = Math.min(bandTop, ra);` | 高い池の水面のすぐ上の空気 |
| 8 | waterPressure.js | `if (r > bandTop) spread(q - cols);` → `if (r > 0) spread(q - cols);` | 高い池の水面のすぐ上の空気 |
| 9 | Constants.js | `WATER_PRESSURE_MIN_DIFF = 2` → `1` | 空気溜まり・揃った後は休む |

どれかが赤くならなかったら、テストより先に「その壊し方で差が出る状態が試験マップにあるか」を疑う（memory: mutation-must-be-able-to-fail）。全部戻したら `git diff --stat` で、変更が Step 4〜6 のぶんだけであることを確かめる。

- [ ] **Step 9: 全テスト**

Run: `npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)|^✖"`
Expected: `ℹ fail 1`。落ちるのは「湧き位置は重複しない（同じ場所に2体湧くと初期状態も重なる）」だけ（main で既に落ちている。Global Constraints 参照）。それ以外が落ちたら止まって原因を調べる。

- [ ] **Step 10: コミット**

```bash
git add src/js/world/waterPressure.js src/js/world/waterSimulation.js src/js/utils/Constants.js tests/water-pressure.test.js
git status --short          # main.js が " M"（未ステージ）のまま残っていること
git commit -m "feat: 水面より下でつながった池を水圧で揃える（太さ×√水位差の速さ）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 実マップでの実測と記録

**Files:**
- Modify: `docs/superpowers/specs/2026-10-10-water-pressure-design.md`（末尾に「実装後の実測」節）
- 一時スクリプト（リポジトリに入れない）: `/private/tmp/claude-501/-Users-nao-Library-CloudStorage-GoogleDrive-nfujii-npr-gmail-com--------Google-AI-Studio-proj-HoverAttack/d23034ec-4e92-46ba-b0d9-57e8b5b38c74/scratchpad/idle30.mjs`, `/private/tmp/claude-501/-Users-nao-Library-CloudStorage-GoogleDrive-nfujii-npr-gmail-com--------Google-AI-Studio-proj-HoverAttack/d23034ec-4e92-46ba-b0d9-57e8b5b38c74/scratchpad/dig30.mjs`

**Interfaces:**
- Consumes: Task 1 の `stepWaterSimulation(...).pressureMoved`、`Map.damageBlock(r, c, damage)`、`Map.update()`

- [ ] **Step 1: `measure-water` を変更前と比べる**

```bash
node tools/measure-water.mjs > /private/tmp/claude-501/-Users-nao-Library-CloudStorage-GoogleDrive-nfujii-npr-gmail-com--------Google-AI-Studio-proj-HoverAttack/d23034ec-4e92-46ba-b0d9-57e8b5b38c74/scratchpad/m-after.json
node -e "
const a=require('/private/tmp/claude-501/-Users-nao-Library-CloudStorage-GoogleDrive-nfujii-npr-gmail-com--------Google-AI-Studio-proj-HoverAttack/d23034ec-4e92-46ba-b0d9-57e8b5b38c74/scratchpad/m-before.json'), b=require('/private/tmp/claude-501/-Users-nao-Library-CloudStorage-GoogleDrive-nfujii-npr-gmail-com--------Google-AI-Studio-proj-HoverAttack/d23034ec-4e92-46ba-b0d9-57e8b5b38c74/scratchpad/m-after.json');
console.log('before', JSON.stringify(a.total)); console.log('after ', JSON.stringify(b.total));
for (const k of Object.keys(a.perSeed)) console.log(k, 'p50', a.perSeed[k].stepUs.p50, '->', b.perSeed[k].stepUs.p50, 'p95', a.perSeed[k].stepUs.p95, '->', b.perSeed[k].stepUs.p95, 'max', a.perSeed[k].stepUs.max, '->', b.perSeed[k].stepUs.max);"
```

Expected（試作の値。時間は機械の混み具合で揺れるので、2本を並列に走らせない）: `massViolations` 0 → 0、`flicker` 44,718 → 約 43,989、`mirrorDiff` 358 → 約 352、`update` の中央値 +4〜20µs・95% +4〜52µs。**保存違反が0でなければ止まる。**

- [ ] **Step 2: `trace-water` で差が出ることを記録する**

```bash
node tools/trace-water.mjs > /private/tmp/claude-501/-Users-nao-Library-CloudStorage-GoogleDrive-nfujii-npr-gmail-com--------Google-AI-Studio-proj-HoverAttack/d23034ec-4e92-46ba-b0d9-57e8b5b38c74/scratchpad/t-after.json
node tools/trace-water.mjs --compare /private/tmp/claude-501/-Users-nao-Library-CloudStorage-GoogleDrive-nfujii-npr-gmail-com--------Google-AI-Studio-proj-HoverAttack/d23034ec-4e92-46ba-b0d9-57e8b5b38c74/scratchpad/t-before.json /private/tmp/claude-501/-Users-nao-Library-CloudStorage-GoogleDrive-nfujii-npr-gmail-com--------Google-AI-Studio-proj-HoverAttack/d23034ec-4e92-46ba-b0d9-57e8b5b38c74/scratchpad/t-after.json | tail -3
```

Expected: `N checkpoint(s) differ`（爆破と水源で圧力差ができるので差が出るのは想定どおり）。N を記録するだけで、一致は求めない。

- [ ] **Step 3: 実マップ30週で、水源を止めれば水圧が動かないことを確かめる**

`/private/tmp/claude-501/-Users-nao-Library-CloudStorage-GoogleDrive-nfujii-npr-gmail-com--------Google-AI-Studio-proj-HoverAttack/d23034ec-4e92-46ba-b0d9-57e8b5b38c74/scratchpad/idle30.mjs` を作る（`REPO` はリポジトリの絶対パス）。

```js
const REPO = '/Users/nao/Library/CloudStorage/GoogleDrive-nfujii.npr@gmail.com/マイドライブ/Google AI Studio/proj_HoverAttack';
const noop = () => ({ addColorStop() {} });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => noop, set: () => true }) }) };
const { SeededRNG } = await import(`${REPO}/src/js/utils/SeededRNG.js`);
const { Map: GameMap } = await import(`${REPO}/src/js/world/Map.js`);
const { stepWaterSimulation } = await import(`${REPO}/src/js/world/waterSimulation.js`);
const { WATER_FALL_INTERVAL } = await import(`${REPO}/src/js/utils/Constants.js`);
let total = 0;
for (let seed = 1; seed <= 30; seed++) {
    const game = { rng: new SeededRNG(seed) };
    const map = new GameMap(game, 3);
    game.map = map;
    let active = new Set();
    for (let k = 0; k < map.water.length; k++) if (map.water[k] > 0) active.add(k);
    let moved = 0;
    for (let step = 1; step <= 2400 && active.size > 0; step++) {
        const res = stepWaterSimulation({ water: map.water, rows: map.rows, cols: map.cols,
            isSolid: (r, c) => map.isSolid(r, c), activeCells: active, doFall: step % WATER_FALL_INTERVAL === 0 });
        active = res.nextActiveCells;
        moved += res.pressureMoved;
    }
    if (moved) console.log('seed', seed, 'moved', moved);
    total += moved;
}
console.log('水源なし30マップの水圧の移動の合計', total);
```

Run: `node /private/tmp/claude-501/-Users-nao-Library-CloudStorage-GoogleDrive-nfujii-npr-gmail-com--------Google-AI-Studio-proj-HoverAttack/d23034ec-4e92-46ba-b0d9-57e8b5b38c74/scratchpad/idle30.mjs`
Expected: `水源なし30マップの水圧の移動の合計 0`

- [ ] **Step 4: seed 30 で池の間を掘り抜く**

`/private/tmp/claude-501/-Users-nao-Library-CloudStorage-GoogleDrive-nfujii-npr-gmail-com--------Google-AI-Studio-proj-HoverAttack/d23034ec-4e92-46ba-b0d9-57e8b5b38c74/scratchpad/dig30.mjs` を作る。

```js
const REPO = '/Users/nao/Library/CloudStorage/GoogleDrive-nfujii.npr@gmail.com/マイドライブ/Google AI Studio/proj_HoverAttack';
const noop = () => ({ addColorStop() {} });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => noop, set: () => true }) }) };
const { SeededRNG } = await import(`${REPO}/src/js/utils/SeededRNG.js`);
const { Map: GameMap } = await import(`${REPO}/src/js/world/Map.js`);
const game = { rng: new SeededRNG(30) };
const m = new GameMap(game, 3);
game.map = m; game.camera = { x: 0, y: 0 }; game.canvas = { width: 1366, height: 768 };
m.waterSprings = [];   // 水源の水が混ざらないように
const C = m.cols;
const show = () => { for (let r = 105; r <= 120; r++) { let t = ''; for (let c = 28; c <= 56; c++) t += m.isSolid(r, c) ? '#' : (m.water[r * C + c] || '.'); console.log('  ' + r + ' ' + t); } };
const topRow = (c0, c1) => { for (let r = 0; r < m.rows; r++) for (let c = c0; c <= c1; c++) if (m.water[r * C + c] > 0) return r; return -1; };
for (let f = 0; f < 60; f++) m.update();
console.log('掘る前  池A 水面の行', topRow(3, 38), ' 池B 水面の行', topRow(44, 74)); show();
for (const [r, c] of [[111, 39], [111, 40], [111, 41], [111, 42]]) m.damageBlock(r, c, 999);
for (let f = 0; f < 3000; f++) m.update();
console.log('3000フレーム後  池A 水面の行', topRow(3, 38), ' 池B 水面の行', topRow(44, 74)); show();
```

Run: `node /private/tmp/claude-501/-Users-nao-Library-CloudStorage-GoogleDrive-nfujii-npr-gmail-com--------Google-AI-Studio-proj-HoverAttack/d23034ec-4e92-46ba-b0d9-57e8b5b38c74/scratchpad/dig30.mjs`
Expected: 掘る前は池A 行109・池B 行111。3000フレーム後は**両方とも行110**。（参考: main のままだと池A は行109 のまま動かない。高い池の水面のすぐ上（行108）で部屋が空気でつながっているため、Task 1 の「高い池の水面のすぐ上の空気」テストがこの形の再現）

- [ ] **Step 5: 実測を仕様書に追記してコミット**

`docs/superpowers/specs/2026-10-10-water-pressure-design.md` の末尾に `## 実装後の実測（YYYY-MM-DD）` 節を足し、Step 1〜4 の数値（保存違反・点滅・左右の食い違い・`update` の中央値/95%/最大・trace の差の数・30マップの合計・seed 30 の掘る前後の行）を書く。

```bash
git add docs/superpowers/specs/2026-10-10-water-pressure-design.md
git commit -m "docs: 水圧で揃える変更の実装後の実測を記録する

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: memory を更新する**

- `hoverattack-phase-plan.md` の冒頭に「現在地（日付・水圧で連通管、ブランチ feat/water-pressure、実機未確認）」を足す。中身は、何を足したか・main との関係・実機確認がまだであること
- `hoverattack-water-surface-locality.md` の末尾に1行: 「水域の水位を揃える」は 2026-10-10 に `waterPressure.js`（水量だけを動かすフェーズ3）で実装した、と [[hoverattack-phase-plan]] へのリンク

- [ ] **Step 7: ユーザーへの引き渡し**

ハードリロード（Cmd+Shift+R）が要ることと、次の対応表を伝える。マージ（main への取り込み）はユーザーの判断を待つ（memory: never-git-add-all の「マージも checkout 無しで」）。

| 実機で見るところ | 効く定数（`Constants.js`） |
|---|---|
| 池の水面より下の壁を撃ち抜いたとき、揃うまでの速さ（試作で幅5・穴1本・差5段が約4.7秒） | `WATER_PRESSURE_GAIN`（0.35） |
| 大きな穴を開けた直後の勢い | `WATER_PRESSURE_MAX_FLOW`（4） |
| 揃った後に水面がちらつかないか・差が残っていないか | `WATER_PRESSURE_MIN_DIFF`（2） |
| 水源が注ぐ池が、下でつながった隣の池と一緒に上がるか（seed 8 のような形） | 同上 |
