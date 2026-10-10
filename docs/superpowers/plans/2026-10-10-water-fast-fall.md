# 水を速く落とす＋流れの記録で滝を判定する 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落下を毎フレームにして水の塊が階段・棚で浮いたり居座ったりしないようにし、そのせいで点線になる細い滝を「流れの記録」で1本につなぐ。

**Architecture:** シミュレーションの落下（フェーズ1）が、量1で落ちたセルに4フレームの記録を残す（新規 `waterStream.js`）。滝の判定 `isFallingCell` はその記録を読み、空のセルでも滝とみなす。判定は1か所のままなので、描画・押し流し・波紋・泡は何も変えずに追従する。水圧は専用の間隔で今の速さを保つ。最後に `waterfallRuns.js` の継ぎはぎを測って要らないものを外す。

**Tech Stack:** バニラ ES modules、`node --test`、依存なし。

**Spec:** `docs/superpowers/specs/2026-10-10-water-fast-fall-design.md`

## Global Constraints

- ブランチは `feat/water-fast-fall`。**`git add -A` / `git add .` は禁止**。変更したファイルを明示して add する（`src/js/main.js` の `debugStartMission: 3` は意図的に未コミット。この計画では `main.js` を触らない）。`git checkout` / `restore` / `stash` も使わない
- コメントは日本語で「なぜそうしたか」と実測値を書く。マジックナンバーは `src/js/utils/Constants.js` に置く
- `WATER_FALL_INTERVAL` = 1、`WATER_MAX_FALL_FLOW` = 2（据え置き）、`WATER_PRESSURE_INTERVAL` = 4、`WATER_STREAM_HOLD_FRAMES` = 4、`WATER_STREAM_MAX_FLOW` = 1
- 湧き水（`WATER_SPRING_INTERVAL` = 4、`WATER_SPRING_MASS` = 1）は変えない
- 新しいテストは、わざと壊して赤くなることを確かめる（各タスクの「壊して確かめる」ステップ）。期待値を実装から導かない
- ソース文字列を grep するテストは書かない
- 既知の失敗 `湧き位置は重複しない（同じ場所に2体湧くと初期状態も重なる）`（面7、main でも落ちる）は触らない。「全テスト」の期待値は常に「これ1件だけ失敗」
- 乱数（`Math.random`・`game.rng`）を使わない（週次の決定性）

## Review Focus

1. **記録が切れたのに種別キャッシュが古いまま** — 水量が動かない列で記録だけ切れると dirty にならず、滝が消えずに残る。Task 4 の「記録が切れたフレームも全列作り直しと一致」で縛る
2. **塊の通り道に滝の尾** — 量の絞りを忘れる・2 以上でも記録すると、落ちた塊の上に帯が残る。Task 3 の縦穴テストで縛る
3. **水圧が4倍速くなる** — `doPressure` を渡し忘れると既定値 `doFall` が毎フレーム真になる。既存の水圧テストは4倍速でも通る（計画作成時に確認済み）ので、Task 4 の Map 経由のテストで縛る
4. **手で組んだ map に記録の配列が無い** — `makeWaterMap` などが配列を持たないと `Map.update` が落ちる。黙って飛ばすフォールバックは書かず、ヘルパーに配列を足す（Task 4）
5. **記録のある空のセルが泡にもなる** — 空気・真上が滝でない水・真下が水、を満たすと、滝なのに泡で塗られる。Task 3 で「滝のマスは泡にしない」を縛る

---

## ファイル構成

| ファイル | 役割 | タスク |
|---|---|---|
| `tools/measure-water.mjs`（変更） | 描いた帯の点滅 `runFlicker`、浮いた満水 `floatingFull`、`floatingHeads` の数え方の修正 | 1 |
| `src/js/world/waterStream.js`（新規） | 流れの記録の書き込み `recordFall` と減衰 `decayStream`（純関数） | 2 |
| `src/js/utils/Constants.js`（変更） | 新しい定数3つ、落下の間隔 1、湧き水のコメント | 2, 4 |
| `src/js/world/waterSimulation.js`（変更） | フェーズ1で記録を書く、`doPressure` 引数 | 2 |
| `src/js/world/waterQuery.js`（変更） | `isFallingCell` / `classifyWaterColumn` / `rebuildWaterCache` が記録を読む、泡から滝を除く | 3 |
| `tests/helpers/water-reference.js`（変更） | 参照実装も記録を読む | 3 |
| `src/js/world/Map.js`（変更） | 記録の配列、減衰と通知、水圧のタイマー | 4 |
| `tests/helpers/water-map.js`（変更） | 記録の配列を持たせる | 4 |
| `src/js/world/environment/waterfallRuns.js`（変更） | 不要になった継ぎはぎを外す | 5 |
| `tests/water-stream.test.js`（新規） | 記録の単体・シミュレーション・判定のテスト | 2, 3 |

---

### Task 1: 測る道具を先に用意し、今の値を記録する

物理を変える前の値（比較の基準）を取る。描いた滝の帯そのものの点滅を数える指標が今は無い。

**Files:**
- Modify: `tools/measure-water.mjs`

**Interfaces:**
- Produces: `node tools/measure-water.mjs` の `perSeed[*]` と `total` に `runFlicker`・`floatingFull` が増える。`floatingHeads` は数え方が変わる

- [ ] **Step 1: 冒頭のコメントに指標を足す**

`tools/measure-water.mjs` の「測るもの」の一覧の `floatingHeads` の行を置き換え、2行足す:

```js
//   floatingHeads … 真上が岩でも水でも滝でもない滝セル（宙に浮いた滝の始まり）の延べ数。
//                   以前は「真上の水量が0」で数えていたが、流れの記録で空のセルも滝になる
//                   （waterStream.js）と、細い滝の途中が全部数えられて意味を失う
//   runFlicker    … 実際に描く滝の帯（collectWaterfallRuns）が覆うセルと寄せ（左/中央/右）の、
//                   1フレームでの入れ替わりの延べ数。種別の点滅（flicker）は描画の継ぎはぎで
//                   隠れるので、見える点滅はこちらで測る
//   floatingFull  … 満水で、真下が岩でなく水量0のセル（宙に浮いた満水の四角）の延べ数
```

- [ ] **Step 2: import を足す**

`const { WATER_FALL } = await import('../src/js/world/waterQuery.js');` の直後に:

```js
const { collectWaterfallRuns } = await import('../src/js/world/environment/waterfallRuns.js');
```

- [ ] **Step 3: 数える処理を足す**

`let flicker = 0, floatingHeads = 0;` を次に置き換える:

```js
    let flicker = 0, floatingHeads = 0, runFlicker = 0, floatingFull = 0;
    let prevBand = new Uint8Array(rows * cols);
```

`floatingHeads++` の行を含むループ（`const fall = new Uint8Array(rows * cols);` から `prevFall = fall;` まで）を次に置き換える:

```js
        const fall = new Uint8Array(rows * cols);
        for (let k = 0; k < rows * cols; k++) {
            if (map.waterKind[k] !== WATER_FALL) continue;
            fall[k] = 1;
            const r = Math.floor(k / cols), c = k % cols;
            if (r > 0 && !map.isSolid(r - 1, c) && map.water[k - cols] === 0
                && map.waterKind[k - cols] !== WATER_FALL) floatingHeads++;
        }
        for (let k = 0; k < rows * cols; k++) if (fall[k] !== prevFall[k]) flicker++;
        prevFall = fall;

        if (measure) {
            for (let k = 0; k < (rows - 1) * cols; k++) {
                if (map.water[k] < 8) continue;
                const r = Math.floor(k / cols), c = k % cols;
                if (!map.isSolid(r + 1, c) && map.water[k + cols] === 0) floatingFull++;
            }
            const band = new Uint8Array(rows * cols);
            for (const run of collectWaterfallRuns(map, 0, cols - 1, 0, rows - 1)) {
                const v = run.align === 'left' ? 2 : run.align === 'right' ? 3 : 1;
                for (let r = run.headR; r <= run.footR; r++) band[r * cols + run.c] = v;
            }
            for (let k = 0; k < rows * cols; k++) if (band[k] !== prevBand[k]) runFlicker++;
            prevBand = band;
        }
```

`stats` の `floatingHeads,` の行の後に `runFlicker,` と `floatingFull,` を足す。

`out.total = { ... }` の行の直後に:

```js
out.total.runFlicker = Object.values(out.perSeed).reduce((a, s) => a + s.runFlicker, 0);
out.total.floatingFull = Object.values(out.perSeed).reduce((a, s) => a + s.floatingFull, 0);
```

- [ ] **Step 4: 今の値を取る**

Run: `node tools/measure-water.mjs > /tmp/claude-measure-base.json && node -e 'console.log(JSON.stringify(require("/tmp/claude-measure-base.json").total))'`
（`/tmp` が使えなければスクラッチパッドに置く。約30秒）
Expected: `massViolations: 0`、`flicker: 43995`（計画作成時の値）、`runFlicker` は計画作成時の試作で 16,909。`floatingFull` は 682 前後（試作の数え方は同じ）。値が大きく違ったら止めて原因を調べる

- [ ] **Step 5: コミット（値をメッセージに残す）**

```bash
git add tools/measure-water.mjs
git commit -m "tools: 水の測定に描いた滝の帯の点滅と浮いた満水の数を足す

変更前の基準（4面・6シード×2400フレーム）: flicker <値> / runFlicker <値> /
floatingFull <値> / floatingHeads <値>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 流れの記録（`waterStream.js`）と、シミュレーションが記録を書く・水圧を切り離す

**Files:**
- Create: `src/js/world/waterStream.js`
- Create: `tests/water-stream.test.js`
- Modify: `src/js/utils/Constants.js:1170-1182`（落下・水圧の定数の並び）
- Modify: `src/js/world/waterSimulation.js:44`（引数）、`:91-104`（フェーズ1）、`:249-258`（フェーズ3）
- Test: `tests/water-pressure.test.js`（`doPressure` のテストを1件足す）

**Interfaces:**
- Produces:
  - `recordFall(hold: Uint8Array, live: Set<number>, from: number, to: number, flow: number): void` — `flow <= WATER_STREAM_MAX_FLOW` のときだけ `hold[from] = hold[to] = WATER_STREAM_HOLD_FRAMES` にし、両方を `live` に足す
  - `decayStream(hold: Uint8Array, live: Set<number>): number[]` — `live` の全セルを1減らし、0 になったセルを `live` から外して配列で返す
  - `stepWaterSimulation({ ..., doFall = true, doPressure = doFall, streamHold = null, streamLive = null })` — `streamHold` を渡すと落下で `recordFall` を呼ぶ。水圧はフェーズ3で `doPressure` のときだけ運ぶ
  - 定数 `WATER_STREAM_HOLD_FRAMES = 4`、`WATER_STREAM_MAX_FLOW = 1`、`WATER_PRESSURE_INTERVAL = 4`

- [ ] **Step 1: 定数を足す**

`src/js/utils/Constants.js` の `export const WATER_MAX_SPREAD_FLOW = 4;` の行の直後に:

```js
// 細い流れの記録（world/waterStream.js）。落下が毎フレームだと、湧き水の粒（4フレームおきに水量1）は
// 1マス/フレームで落ち、粒と粒のあいだが3マス空く。セルの中身だけで滝を判定すると点線になって
// 点滅した（4面・6シード×2400フレームで、滝⇄滝以外の入れ替わり 43,995 → 820,474）。
// 量1で落ちたセルに記録を残し、そのあいだは空でも滝とみなす（試作で 2,770 まで減った）。
// 保持 4・5・6 で点滅は 2,774・2,778・2,780 と差が無い。記録が長いほど流れが止んだ後も滝が
// 残るので、最短の 4（＝湧き水の周期。次の粒が通るまで残る長さ）
export const WATER_STREAM_HOLD_FRAMES = 4;
// 記録するのは1回に落ちた量がこれ以下のときだけ。塊は2ずつ落ちるので、絞らないと塊の通り道に
// 滝の尾が残った（幅3の縦穴を落ちる塊の上に、延べ195セル×フレーム）。絞っても細い流れの点滅は
// 2,774 → 2,770 で変わらない（細い流れはどれも量1で落ちる）
export const WATER_STREAM_MAX_FLOW = 1;
```

`export const WATER_PRESSURE_MAX_FLOW = 4;` の行の直後に:

```js
// 水圧で運ぶ間隔（フレーム）。以前は落下と同じフレーム（WATER_FALL_INTERVAL = 4 に1回）に運んでいて、
// GAIN などはその速さで実機確認した（「いい感じ」）。落下を毎フレームにしたとき水圧まで4倍速く
// ならないよう、間隔を切り離して 4 のまま保つ
export const WATER_PRESSURE_INTERVAL = 4;
```

`WATER_PRESSURE_GAIN` の上のコメント「1ステップ（WATER_FALL_INTERVAL に1回）あたり」を「1ステップ（WATER_PRESSURE_INTERVAL に1回）あたり」に直す。

- [ ] **Step 2: 記録の単体テストを書く（失敗する）**

`tests/water-stream.test.js` を作る:

```js
// ============================================
// 流れの記録（waterStream.js）と、それを書くシミュレーション・読む判定のテスト
// ============================================
//
// 落下が毎フレームになると、細い滝は水量1の粒が3マスおきに並んだものになる。
// 「細い流れがついさっき通ったセル」を記録し、空でも滝とみなして1本につなぐ。
// 設計: docs/superpowers/specs/2026-10-10-water-fast-fall-design.md

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordFall, decayStream } from '../src/js/world/waterStream.js';
import { stepWaterSimulation } from '../src/js/world/waterSimulation.js';
import { WATER_STREAM_HOLD_FRAMES, WATER_STREAM_MAX_FLOW } from '../src/js/utils/Constants.js';

test('細い流れ（量 WATER_STREAM_MAX_FLOW 以下）は、落ちた元と先の両方に記録を残す', () => {
    const hold = new Uint8Array(10);
    const live = new Set();
    recordFall(hold, live, 2, 7, WATER_STREAM_MAX_FLOW);
    assert.equal(hold[2], WATER_STREAM_HOLD_FRAMES);
    assert.equal(hold[7], WATER_STREAM_HOLD_FRAMES);
    assert.deepEqual([...live].sort((a, b) => a - b), [2, 7]);
});

test('塊（量が WATER_STREAM_MAX_FLOW を超える落下）は記録しない', () => {
    const hold = new Uint8Array(10);
    const live = new Set();
    recordFall(hold, live, 2, 7, WATER_STREAM_MAX_FLOW + 1);
    assert.deepEqual([...hold], new Array(10).fill(0));
    assert.equal(live.size, 0);
});

test('記録は1フレームに1ずつ減り、0 になったフレームにだけそのセルを返す', () => {
    const hold = new Uint8Array(10);
    const live = new Set();
    recordFall(hold, live, 2, 7, 1);
    for (let f = 1; f < WATER_STREAM_HOLD_FRAMES; f++) {
        assert.deepEqual(decayStream(hold, live), [], `${f} フレーム目にはまだ切れない`);
    }
    assert.deepEqual(decayStream(hold, live).sort((a, b) => a - b), [2, 7]);
    assert.equal(live.size, 0);
    assert.equal(hold[2], 0);
    assert.deepEqual(decayStream(hold, live), [], '切れた後は何も返さない');
});

test('記録が残っているうちにまた流れが通れば、残りは満タンに戻る', () => {
    const hold = new Uint8Array(10);
    const live = new Set();
    recordFall(hold, live, 2, 7, 1);
    decayStream(hold, live);
    decayStream(hold, live);
    recordFall(hold, live, 2, 7, 1);
    assert.equal(hold[2], WATER_STREAM_HOLD_FRAMES);
});

/** 列1だけが空いた縦穴。行 rows-1 が床 */
function shaft(rows) {
    const cols = 3;
    const isSolid = (r, c) => r < 0 || r >= rows - 1 || c !== 1;
    return { rows, cols, isSolid, water: new Uint8Array(rows * cols) };
}

test('stepWaterSimulation: 量1が落ちたら、落ちた元と先に記録を残す', () => {
    const s = shaft(7);
    s.water[1 * s.cols + 1] = 1;
    const hold = new Uint8Array(s.rows * s.cols);
    const live = new Set();
    stepWaterSimulation({
        ...s, activeCells: new Set([1 * s.cols + 1]), doFall: true, streamHold: hold, streamLive: live,
    });
    assert.equal(s.water[2 * s.cols + 1], 1, '前提: 1マス落ちた');
    assert.equal(hold[1 * s.cols + 1], WATER_STREAM_HOLD_FRAMES);
    assert.equal(hold[2 * s.cols + 1], WATER_STREAM_HOLD_FRAMES);
});

test('stepWaterSimulation: 満水のセルが2ずつ落ちるときは記録しない', () => {
    const s = shaft(7);
    s.water[1 * s.cols + 1] = 8;
    const hold = new Uint8Array(s.rows * s.cols);
    const live = new Set();
    stepWaterSimulation({
        ...s, activeCells: new Set([1 * s.cols + 1]), doFall: true, streamHold: hold, streamLive: live,
    });
    assert.equal(s.water[2 * s.cols + 1], 2, '前提: 2 落ちた');
    assert.equal(live.size, 0);
});
```

- [ ] **Step 3: 失敗を確かめる**

Run: `npm test -- tests/water-stream.test.js`
Expected: FAIL（`Cannot find module .../waterStream.js`）

- [ ] **Step 4: `waterStream.js` を書く**

`src/js/world/waterStream.js`:

```js
// ============================================
// waterStream - 細い流れの記録（純関数）
// ============================================
//
// 落下が毎フレームだと、湧き水の粒（4フレームおきに水量1）は1マス/フレームで落ち、
// 粒と粒のあいだが3マス空く。セルの中身だけで滝を判定すると、細い滝が点線になって点滅した。
// 「細い流れがついさっきここを落ちた」をセルごとに残りフレーム数で持ち、そのあいだは
// 空のセルでも滝とみなす（waterQuery.js の isFallingCell）。
//
// 書くのはシミュレーションの落下（waterSimulation.js のフェーズ1）だけ。減らすのは Map.update で、
// 切れたセルは onWaterChanged で種別キャッシュに知らせる（水量が変わらなくても種別が変わるので）。
// 乱数は使わない（週次の決定性）。

import { WATER_STREAM_HOLD_FRAMES, WATER_STREAM_MAX_FLOW } from '../utils/Constants.js';

/**
 * from から to へ flow だけ落ちたことを記録する。量が WATER_STREAM_MAX_FLOW を超える落下（塊）は
 * 記録しない — 塊の通り道に滝の尾が残るため（Constants.js の WATER_STREAM_MAX_FLOW）。
 * @param {Uint8Array} hold セルごとの残りフレーム数
 * @param {Set<number>} live hold が 0 でないセル (r * cols + c)
 */
export function recordFall(hold, live, from, to, flow) {
    if (flow > WATER_STREAM_MAX_FLOW) return;
    hold[from] = WATER_STREAM_HOLD_FRAMES;
    live.add(from);
    hold[to] = WATER_STREAM_HOLD_FRAMES;
    live.add(to);
}

/**
 * 記録を1フレーム進める。0 になったセルを live から外して返す（呼び手が種別キャッシュに知らせる）。
 * @returns {number[]} 記録が切れたセル (r * cols + c)
 */
export function decayStream(hold, live) {
    const expired = [];
    for (const k of live) {
        hold[k]--;
        if (hold[k] === 0) {
            live.delete(k);
            expired.push(k);
        }
    }
    return expired;
}
```

- [ ] **Step 5: シミュレーションに記録と `doPressure` を足す**

`src/js/world/waterSimulation.js`:

import に足す（既存の import 群の並びに合わせる）:

```js
import { recordFall } from './waterStream.js';
```

関数の宣言を置き換える:

```js
export function stepWaterSimulation({
    water, rows, cols, isSolid, activeCells, doFall = true, doPressure = doFall,
    streamHold = null, streamLive = null,
}) {
```

宣言の上の JSDoc（あれば）に引数の説明を足す。無ければ宣言の直前に:

```js
/**
 * 1フレームぶん水を動かす。
 * doFall: 落下（フェーズ1）を行うフレームか。doPressure: 水圧（フェーズ3）で運ぶフレームか。
 * 水圧は落下と別の間隔（WATER_PRESSURE_INTERVAL）で回す。省略時は doFall と同じ（既存のテストの呼び方）。
 * streamHold / streamLive: 渡すと、細い流れの落下を記録する（waterStream.js）
 */
```

フェーズ1の `water[downKey] += flow;` の直後に:

```js
                    if (streamHold) recordFall(streamHold, streamLive, k, downKey, flow);
```

フェーズ3の `doTransfer: doFall,` を `doTransfer: doPressure,` に置き換え、その上のコメント「運ぶのは落下と同じフレームだけ。」を「運ぶのは doPressure のフレームだけ（WATER_PRESSURE_INTERVAL に1回）。」に直す。

- [ ] **Step 6: 水圧を運ばないフレームのテストを足す**

`tests/water-pressure.test.js` の末尾に:

```js
test('doPressure が偽のフレームは、落下があっても水圧では運ばない（間隔を落下から切り離す）', () => {
    // 落下を毎フレームにしても、水圧の速さは実機で確認した WATER_PRESSURE_INTERVAL に1回のまま保つ
    const s = basins({ leftTop: 2, rightTop: 7, holeRows: [10], prefill: true });
    const before = sum(s, 1, s.w);
    const res = stepWaterSimulation({
        water: s.water, rows: s.rows, cols: s.cols, isSolid: s.isSolid, activeCells: s.active,
        doFall: true, doPressure: false,
    });
    assert.equal(res.pressureMoved, 0);
    assert.equal(sum(s, 1, s.w), before, '左の池から水が出ていった');
    const res2 = stepWaterSimulation({
        water: s.water, rows: s.rows, cols: s.cols, isSolid: s.isSolid, activeCells: res.nextActiveCells,
        doFall: true, doPressure: true,
    });
    assert.ok(res2.pressureMoved > 0, '前提: doPressure なら運ぶ');
});
```

- [ ] **Step 7: 通ることを確かめる**

Run: `npm test -- tests/water-stream.test.js tests/water-pressure.test.js tests/water-simulation.test.js`
Expected: すべて PASS

- [ ] **Step 8: 壊して確かめる**

それぞれ1つずつ壊し、対応するテストが赤くなることを見てから戻す（戻した後に再実行して緑）:
- `recordFall` の `if (flow > WATER_STREAM_MAX_FLOW) return;` を消す → 「塊は記録しない」「満水のセルが2ずつ落ちるときは記録しない」が FAIL
- `decayStream` の `hold[k] === 0` を `hold[k] <= 1` にする → 「1ずつ減り」が FAIL
- `doTransfer: doPressure` を `doTransfer: doFall` に戻す → 「doPressure が偽のフレーム」が FAIL
- `if (streamHold) recordFall(...)` を消す → 「量1が落ちたら」が FAIL

- [ ] **Step 9: 全テスト**

Run: `npm test`
Expected: 既知の1件（面7の湧き位置）だけ FAIL

- [ ] **Step 10: コミット**

```bash
git add src/js/world/waterStream.js tests/water-stream.test.js src/js/utils/Constants.js src/js/world/waterSimulation.js tests/water-pressure.test.js
git commit -m "feat: 細い流れの落下を記録し、水圧を落下とは別の間隔で運べるようにする

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 滝の判定が流れの記録を読む

**Files:**
- Modify: `src/js/world/waterQuery.js:28-58`（`isFallingCell`）、`:129-145`（`classifyWaterColumn`）、`isFoamAt`、`rebuildWaterCache`
- Modify: `tests/helpers/water-reference.js`（`isFalling` / `referenceKindAt` / `referenceFoamAll`）
- Modify: `tests/water-query.test.js`（記録ありの突き合わせを1件足す）
- Test: `tests/water-stream.test.js`（判定・尾・泡）

**Interfaces:**
- Consumes: `recordFall` / `decayStream`、`stepWaterSimulation({ streamHold, streamLive })`（Task 2）
- Produces:
  - `isFallingCell(water, rows, cols, isSolid, r, c, hold = null): boolean`
  - `classifyWaterColumn({ water, kind, surfaceY, rows, cols, isSolid, c, hold = null })`
  - `rebuildWaterCache({ ..., hold = null })` — `classifyWaterColumn` へそのまま渡す
  - 参照実装は `ctx.hold`（無ければ記録なし）を読む

- [ ] **Step 1: 判定のテストを書く（失敗する）**

`tests/water-stream.test.js` の import に足す:

```js
import { rebuildWaterCache, WATER_FALL, WATER_NONE } from '../src/js/world/waterQuery.js';
```

末尾に:

```js
/** 文字の絵から水の配列を作る。'#'=岩 '.'=空 数字=水量。hold は別の絵で、数字=残りフレーム */
function fromArt(art, holdArt = null) {
    const lines = art.trim().split('\n').map((s) => s.trim());
    const rows = lines.length, cols = lines[0].length;
    const solid = new Uint8Array(rows * cols);
    const water = new Uint8Array(rows * cols);
    lines.forEach((ln, r) => [...ln].forEach((ch, c) => {
        if (ch === '#') solid[r * cols + c] = 1;
        else if (ch >= '1' && ch <= '8') water[r * cols + c] = Number(ch);
    }));
    const hold = new Uint8Array(rows * cols);
    if (holdArt) {
        holdArt.trim().split('\n').map((s) => s.trim()).forEach((ln, r) => [...ln].forEach((ch, c) => {
            if (ch >= '1' && ch <= '9') hold[r * cols + c] = Number(ch);
        }));
    }
    const isSolid = (r, c) => r < 0 || r >= rows || c < 0 || c >= cols || solid[r * cols + c] === 1;
    const kind = new Uint8Array(rows * cols);
    const surfaceY = new Int16Array(rows * cols).fill(-1);
    const paintTopY = new Int16Array(rows * cols).fill(-1);
    const foam = new Uint8Array(rows * cols);
    const foamCells = new Set();
    const ctx = { rows, cols, water, isSolid, hold, kind, surfaceY, paintTopY, foam, foamCells };
    rebuildWaterCache({ ...ctx, dirtyCols: [...Array(cols).keys()] });
    return ctx;
}

test('空のセルでも、流れの記録が残っていて真下が水を支えないなら滝', () => {
    // 列2: 水量1の粒が行1と行4にあり、あいだの行2・3は空だが流れが通ったばかり
    const t = fromArt(`
        #####
        ##1##
        ##.##
        ##.##
        ##1##
        ##.##
        #####
    `, `
        .....
        ..4..
        ..3..
        ..2..
        ..4..
        .....
        .....
    `);
    for (const r of [1, 2, 3, 4]) {
        assert.equal(t.kind[r * t.cols + 2], WATER_FALL, `行${r} が滝でない`);
    }
    assert.equal(t.kind[5 * t.cols + 2], WATER_NONE, '記録の無い空のセルは水なしのまま');
});

test('記録があっても、真下が岩か満水なら滝ではない（床の上・湖面の上）', () => {
    // (1,1) の真下は岩、(1,3) の真下は満水
    const t = fromArt(`
        #####
        #...#
        ##.8#
        #####
    `, `
        .....
        .4.4.
        .....
        .....
    `);
    assert.equal(t.kind[1 * t.cols + 1], WATER_NONE);
    assert.equal(t.kind[1 * t.cols + 3], WATER_NONE);
});

test('記録があっても満水のセルは滝ではない（落ち着いた水）', () => {
    const t = fromArt(`
        ###
        #8#
        #.#
        ###
    `, `
        ...
        .4.
        ...
        ...
    `);
    assert.notEqual(t.kind[1 * t.cols + 1], WATER_FALL);
});

test('記録のある滝のマスは泡にしない（真上が滝でない水・真下が水でも）', () => {
    // (2,1) は空で記録あり、真上 (1,1) は満水（滝でない水）、真下 (3,1) は水量3（支えない）。
    // 記録が無ければ泡のマスになる形
    const t = fromArt(`
        ###
        #8#
        #.#
        #3#
        #.#
        ###
    `, `
        ...
        ...
        .4.
        ...
        ...
        ...
    `);
    const k = 2 * t.cols + 1;
    assert.equal(t.kind[k], WATER_FALL, '前提: 滝');
    assert.equal(t.foam[k], 0);
    assert.equal(t.foamCells.has(k), false);
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npm test -- tests/water-stream.test.js`
Expected: 「空のセルでも、流れの記録が残っていて」が FAIL（行2・3が水なし）、「泡にしない」が FAIL（前提: 滝）。他の2件は今でも PASS する（記録を読まないので空のセルは水なし）

- [ ] **Step 3: `isFallingCell` に記録を足す**

`src/js/world/waterQuery.js` の `isFallingCell` を置き換える。直前の長い JSDoc はそのまま残し、末尾の段落（「代わりに、棚から棚へ…滝の点滅が16〜19倍になった」）を次に差し替える:

```js
 * 代わりに、棚から棚へ階段状に流れ落ちる途中の満水のセルは、滝ではなく水面の四角に見えた
 * （2026-10-10 実機の指摘）。落下が横の流れより8倍遅かったことから来ていて、落下を毎フレームに
 * して減らした（浮いた満水の四角 682→206）。
 *
 * 落下が毎フレームになると、細い滝は水量1の粒が3マスおきに並んだものになる。そこで hold
 * （waterStream.js の流れの記録）が残っているセルは、空でも滝とみなす。満水・真下が支える、の
 * 条件は同じなので、湖の中や床の上の空のセルは記録があっても滝にならない。
 * hold を省略すると中身だけで判定する（記録を持たないテスト・道具の呼び方）
 */
export function isFallingCell(water, rows, cols, isSolid, r, c, hold = null) {
    const k = r * cols + c;
    const mass = water[k];
    if (mass >= MAX_WATER_MASS) return false;
    if (mass < MIN_WATER_MASS) {
        if (!hold || hold[k] === 0 || isSolid(r, c)) return false;
    }
    return !supportsWater(water, rows, cols, isSolid, r + 1, c);
}
```

- [ ] **Step 4: `classifyWaterColumn` の順番を変え、`hold` を通す**

`classifyWaterColumn` の宣言を `export function classifyWaterColumn({ water, kind, surfaceY, rows, cols, isSolid, c, hold = null }) {` にし、ループの先頭の

```js
        if (mass < MIN_WATER_MASS) {
            kind[k] = WATER_NONE;
            surfaceY[k] = -1;
            continue;
        }

        if (isFallingCell(water, rows, cols, isSolid, r, c)) {
            kind[k] = WATER_FALL;
            surfaceY[k] = -1;
            continue;
        }
```

を次に置き換える:

```js
        // 滝を先に見る。流れの記録があれば空のセルも滝になる（isFallingCell）
        if (isFallingCell(water, rows, cols, isSolid, r, c, hold)) {
            kind[k] = WATER_FALL;
            surfaceY[k] = -1;
            continue;
        }

        if (mass < MIN_WATER_MASS) {
            kind[k] = WATER_NONE;
            surfaceY[k] = -1;
            continue;
        }
```

`rebuildWaterCache` の宣言の引数に `hold = null` を足し（`repaint` の後）、JSDoc に
`@param {Uint8Array|null} [p.hold] 流れの記録（waterStream.js）。省略すると中身だけで滝を判定する` を足し、
`classifyWaterColumn({ water, kind, surfaceY, rows, cols, isSolid, c });` を
`classifyWaterColumn({ water, kind, surfaceY, rows, cols, isSolid, c, hold });` にする。

- [ ] **Step 5: 泡から滝のマスを除く**

`isFoamAt` の `if (r === 0 || water[k] >= MIN_WATER_MASS || isSolid(r, c)) return false;` を次に置き換え、JSDoc の箇条書きの最後に1行足す:

```js
    if (r === 0 || water[k] >= MIN_WATER_MASS || isSolid(r, c) || kind[k] === WATER_FALL) return false;
```

```js
 *   - 流れの記録で滝になった空のセル（waterStream.js）は泡にしない。滝の帯で描くので
```

- [ ] **Step 6: 参照実装に記録を足す**

`tests/helpers/water-reference.js` の `isFalling` を置き換える（実装を import しない。別の書き方で同じ規則）:

```js
// 流れの記録（ctx.hold）が残っている空のセルも、真下が支えなければ滝（waterStream.js）
const isFalling = (ctx, r, c) => {
    const k = r * ctx.cols + c;
    const held = !!ctx.hold && ctx.hold[k] > 0 && !ctx.isSolid(r, c);
    if (!isWater(ctx, r, c) && !held) return false;
    const mass = ctx.water[k];
    if (mass >= MAX_WATER_MASS) return false;
    if (r + 1 >= ctx.rows) return false;
    if (ctx.isSolid(r + 1, c)) return false;
    return ctx.water[(r + 1) * ctx.cols + c] < MAX_WATER_MASS;
};
```

`referenceKindAt` を置き換える:

```js
export function referenceKindAt(ctx, r, c) {
    if (isFalling(ctx, r, c)) return WATER_FALL;
    if (!isWater(ctx, r, c)) return WATER_NONE;
    if (isSurface(ctx, r, c)) return WATER_SURFACE;
    return WATER_BODY;
}
```

`referenceFoamAll` の `if (ctx.isSolid(r, c) || isWater(ctx, r, c)) continue;` を
`if (ctx.isSolid(r, c) || isWater(ctx, r, c) || isFalling(ctx, r, c)) continue;` にし、JSDoc に「流れの記録で滝になった空のセルは泡にしない」を足す。

`isSurface` の `if (r > 0 && isWater(ctx, r - 1, c) && !isFalling(ctx, r - 1, c)) return false;` は変えない（真上が記録だけの滝なら水ではないので液面になる。実装の「真上が滝なら液面」と同じ答え）。

- [ ] **Step 7: 記録ありの突き合わせを足す**

`tests/water-query.test.js` の `randomWorld(seed)` の `return { rows, cols, water, isSolid };` の前に記録を足せるようにする。関数を `function randomWorld(seed, { withHold = false } = {})` にし、`return` の直前に:

```js
    // 流れの記録（waterStream.js）。空のセルにも水のあるセルにも、ばらばらに残りフレームを置く
    const hold = withHold ? new Uint8Array(rows * cols) : null;
    if (hold) {
        for (let k = 0; k < rows * cols; k++) {
            if (!solid[k] && rng() < 0.2) hold[k] = 1 + Math.floor(rng() * 4);
        }
    }
```

`return { rows, cols, water, isSolid, hold };` にする。

`ランダムな地形と水量 40通りで、キャッシュが参照実装と全セル一致する` の直後に:

```js
test('流れの記録があっても、キャッシュが参照実装と全セル一致する', () => {
    for (let seed = 1; seed <= 40; seed++) {
        const ctx = randomWorld(seed, { withHold: true });
        assertMatchesReference(ctx, buildCache(ctx), `seed ${seed}（記録あり）`);
    }
});
```

（`buildCache` は `{ ...ctx }` を `rebuildWaterCache` に渡しているので `hold` もそのまま渡る。`hold: null` は記録なしと同じ）

- [ ] **Step 8: 塊の尾のテストを足す**

`tests/water-stream.test.js` の import の `rebuildWaterCache` の並びに `classifyWaterColumn` を足し、末尾に:

```js
test('塊が縦穴を落ちても、その上に滝の尾が残らない（記録は細い流れだけ）', () => {
    // 幅 W の縦穴に満水の塊（4段）を置いて落とす。毎フレーム、各列で一番上の水より上に滝のセルが
    // あれば尾。量で絞らないと、W=3 で延べ195セル×フレームの尾が出た（計画作成時の試作）
    for (const W of [1, 3, 5]) {
        const rows = 24, cols = W + 2;
        const isSolid = (r, c) => r < 0 || r >= rows - 1 || c <= 0 || c >= cols - 1;
        const water = new Uint8Array(rows * cols);
        const kind = new Uint8Array(rows * cols);
        const surfaceY = new Int16Array(rows * cols).fill(-1);
        const hold = new Uint8Array(rows * cols);
        const live = new Set();
        let active = new Set();
        for (let r = 1; r <= 4; r++) for (let c = 1; c <= W; c++) { water[r * cols + c] = 8; active.add(r * cols + c); }
        let tail = 0;
        for (let f = 1; f <= 80; f++) {
            decayStream(hold, live);
            active = stepWaterSimulation({
                water, rows, cols, isSolid, activeCells: active, doFall: true, streamHold: hold, streamLive: live,
            }).nextActiveCells;
            for (let c = 0; c < cols; c++) classifyWaterColumn({ water, kind, surfaceY, rows, cols, isSolid, c, hold });
            for (let c = 1; c <= W; c++) {
                let top = 0;
                while (top < rows && water[top * cols + c] === 0) top++;
                for (let r = 0; r < top; r++) if (kind[r * cols + c] === WATER_FALL) tail++;
            }
        }
        assert.equal(tail, 0, `幅 ${W}: 塊の上に滝の尾 ${tail} セル×フレーム`);
    }
});
```

- [ ] **Step 9: 通ることを確かめる**

Run: `npm test -- tests/water-stream.test.js tests/water-query.test.js tests/waterfall-runs.test.js tests/environment-water-draw.test.js`
Expected: すべて PASS

- [ ] **Step 10: 壊して確かめる**

1つずつ壊して赤を見てから戻す:
- `isFallingCell` の `if (!hold || hold[k] === 0 || isSolid(r, c)) return false;` を `return false;` だけにする → 「空のセルでも」が FAIL、「記録があっても参照実装と一致」が FAIL
- `isFallingCell` の `if (mass >= MAX_WATER_MASS) return false;` を消す → 「記録があっても満水のセルは滝ではない」が FAIL（ほかに既存の満水テストも落ちてよい）
- `isFoamAt` の `|| kind[k] === WATER_FALL` を消す → 「泡にしない」と「参照実装と一致（記録あり）」が FAIL
- `Constants.js` の `WATER_STREAM_MAX_FLOW` を 2 にする → 「塊の尾」が FAIL
- `classifyWaterColumn` の順番を元に戻す（水量0の判定を先に） → 「空のセルでも」が FAIL

- [ ] **Step 11: 全テスト**

Run: `npm test`
Expected: 既知の1件だけ FAIL

- [ ] **Step 12: コミット**

```bash
git add src/js/world/waterQuery.js tests/helpers/water-reference.js tests/water-query.test.js tests/water-stream.test.js
git commit -m "feat: 流れの記録が残る空のセルも滝と判定する

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Map に配線し、落下を毎フレームにする

**Files:**
- Modify: `src/js/world/Map.js`（フィールド :137 付近、`_generateWater` :396 付近、`_rebuildWaterCacheIfDirty` :1135、`update()` :1440-1500、import）
- Modify: `src/js/utils/Constants.js`（`WATER_FALL_INTERVAL` 4→1、`WATER_SPRING_INTERVAL` のコメント）
- Modify: `tests/helpers/water-map.js`、`tests/water-springs.test.js`（`primeWaterCache`、点線のテストの置き換え、新しいテスト）、`tests/water-pressure.test.js`（`run()` と注ぎ込みのループ）、`tests/water-active-invariant.test.js`
- Modify: `src/js/world/waterQuery.js`・`src/js/world/environment/waterfallRuns.js`・`src/js/world/Map.js` の「4フレームに1回」を前提にしたコメント

**Interfaces:**
- Consumes: `decayStream`、`stepWaterSimulation({ doPressure, streamHold, streamLive })`、`rebuildWaterCache({ hold })`
- Produces: `map.waterStreamHold: Uint8Array`、`map.waterStreamLive: Set<number>`（水のある面だけ。無い面は `null`）、`map.waterPressureTimer`

- [ ] **Step 1: テストのヘルパーに記録の配列を足す**

`tests/helpers/water-map.js` の `Object.assign(map, {...})` の `waterFoamCells: new Set(),` の後に:

```js
        waterStreamHold: new Uint8Array(rows * cols),
        waterStreamLive: new Set(),
```

`tests/water-springs.test.js` の `primeWaterCache` の `map.waterFoamCells = new Set();` の後に:

```js
    map.waterStreamHold = new Uint8Array(n);
    map.waterStreamLive = new Set();
```

- [ ] **Step 2: Map 経由のテストを書く（失敗する）**

`tests/water-springs.test.js` の `test('水源から落ちる水は隙間なく連なる（滝が点線に見えない）', ...)` を**丸ごと**次の2件に置き換える:

```js
test('水源から落ちる水は、毎フレーム口から下まで滝として1本につながる（点線にならない）', () => {
    // 実機の指摘「FallingWater が途切れ途切れ」。湧き水は WATER_SPRING_INTERVAL に1回・水量1で、
    // 落下が毎フレームだと粒は1マス/フレームで落ち、粒のあいだが空く。中身だけで判定すると
    // 滝が点線になる。流れの記録（waterStream.js）で、空のセルも滝としてつなぐ。
    // 本物の Map.update（湧き水→記録の減衰→シミュレーション→キャッシュ）を通して確かめる
    const map = makeWaterMap(`
        ###########
        #####.#####
        #####.#####
        #####.#####
        #####.#####
        #####.#####
        #####.#####
        #####.#####
        #####.#####
        #####.#####
        #####.#####
        #####.#####
        #.........#
        #.........#
        #.........#
        ###########
    `);
    map.waterSprings = [{ r: 1, c: 5, timer: 0 }];
    for (let f = 1; f <= 300; f++) {
        map.update();
        if (f < 60) continue;   // 先頭が下まで届くのを待つ
        const gaps = [];
        for (let r = 2; r <= 10; r++) if (!map.isWaterfallCell(r, 5)) gaps.push(r);
        assert.deepEqual(gaps, [], `frame ${f}: 滝でない行 ${gaps.join(',')}（点線に見える）`);
    }
});

test('落下は毎フレーム起きる（水の塊が階段や棚で浮いたまま居座らない）', async () => {
    // 落下が横の流れ（毎フレーム最大4）より遅いと、水が落ちきる前に横へ広がって宙に浮いた四角に
    // なる（2026-10-10 実機の指摘）。4面の実測で浮いた満水の四角 682→206
    const { WATER_MAX_FALL_FLOW } = await import('../src/js/utils/Constants.js');
    const map = makeWaterMap(`
        ###
        #8#
        #.#
        #.#
        ###
    `);
    map.activeWaterCells.add(1 * map.cols + 1);
    map.update();
    assert.equal(map.water[2 * map.cols + 1], WATER_MAX_FALL_FLOW, '1フレーム目で落ちていない');
});
```

`tests/water-springs.test.js` の末尾に:

```js
test('流れの記録が切れて種別が変わったフレームも、種別キャッシュは全列作り直しと一致する', async () => {
    // 記録が切れても水量は変わらないので、Map が onWaterChanged で知らせないと、その列は
    // dirty にならず「滝」のまま残る。水量1の粒を1つだけ落とし、着いた後に記録が切れる場面
    const { rebuildWaterCache } = await import('../src/js/world/waterQuery.js');
    const map = makeWaterMap(`
        #####
        ##1##
        ##.##
        ##.##
        ##.##
        ##.##
        ##.##
        #...#
        #####
    `);
    map.activeWaterCells.add(1 * map.cols + 2);
    const n = map.rows * map.cols;
    let sawExpiry = false;
    for (let f = 1; f <= 30; f++) {
        const liveBefore = map.waterStreamLive.size;
        map.update();
        map.isWaterfallCell(0, 0);   // 問い合わせでキャッシュを作り直させる
        if (liveBefore > 0 && map.waterStreamLive.size < liveBefore) sawExpiry = true;
        const kind = new Uint8Array(n);
        const surfaceY = new Int16Array(n).fill(-1);
        rebuildWaterCache({
            water: map.water, kind, surfaceY, rows: map.rows, cols: map.cols,
            isSolid: map._waterSolidFn(), dirtyCols: [...Array(map.cols).keys()], hold: map.waterStreamHold,
        });
        for (let k = 0; k < n; k++) {
            assert.equal(map.waterKind[k], kind[k],
                `frame ${f}: (${Math.floor(k / map.cols)},${k % map.cols}) の種別が古い`);
        }
    }
    assert.ok(sawExpiry, '前提: 記録が切れるフレームがあった');
});

test('水圧は WATER_PRESSURE_INTERVAL に1回しか運ばない（落下を速めても連通管の速さは同じ）', async () => {
    // 水面より下でだけつながった左右の池。左の池の水量は水圧でしか変わらない（穴は満水、
    // 左の各行は満水か、区間の中で均されるだけ）。変わったフレームどうしの間隔を数える
    const { WATER_PRESSURE_INTERVAL } = await import('../src/js/utils/Constants.js');
    const map = makeWaterMap(`
        #############
        #88888#.....#
        #88888#.....#
        #88888#88888#
        #88888888888#
        #############
    `);
    for (let k = 0; k < map.water.length; k++) if (map.water[k] > 0) map.activeWaterCells.add(k);
    const left = () => {
        let t = 0;
        for (let r = 0; r < map.rows; r++) for (let c = 1; c <= 5; c++) t += map.water[r * map.cols + c];
        return t;
    };
    const changed = [];
    let prev = left();
    for (let f = 1; f <= 40; f++) {
        map.update();
        const now = left();
        if (now !== prev) changed.push(f);
        prev = now;
    }
    assert.ok(changed.length >= 2, `前提: 水圧で運ばれていない（${changed.join(',')}）`);
    for (let i = 1; i < changed.length; i++) {
        assert.ok(changed[i] - changed[i - 1] >= WATER_PRESSURE_INTERVAL,
            `水圧が ${changed[i - 1]} と ${changed[i]} フレーム目に続けて運んだ`);
    }
});
```

- [ ] **Step 3: 失敗を確かめる**

Run: `npm test -- tests/water-springs.test.js`
Expected: 「毎フレーム口から下まで」FAIL（落下が4フレームに1回なので届かない、または記録が無い）、「落下は毎フレーム」FAIL（0 のまま）、「記録が切れて」FAIL（`map.waterStreamLive` が使われず `sawExpiry` が偽）、「水圧は…1回しか」は今の実装では落下と同じ4フレームおきなので PASS してよい（Step 6 の壊し方で縛る）

- [ ] **Step 4: Map に配線する**

`src/js/world/Map.js`:

import に足す（`waterSimulation.js` の import の近く）:

```js
import { decayStream } from './waterStream.js';
```

Constants の import の並びに `WATER_PRESSURE_INTERVAL` を足す。

コンストラクタの `this.waterFoamCells = null; ...` の行の後に:

```js
        this.waterStreamHold = null; // Uint8Array。細い流れが落ちてからの残りフレーム数（waterStream.js）
        this.waterStreamLive = null; // Set。waterStreamHold が 0 でないセル (r * cols + c)
```

`_generateWater` の `this.waterFoamCells = new Set();` の後に:

```js
        this.waterStreamHold = new Uint8Array(this.rows * this.cols);
        this.waterStreamLive = new Set();
```

`_rebuildWaterCacheIfDirty` の `repaint: this.waterRepaintCells,` の後に:

```js
            hold: this.waterStreamHold,
```

`update()` の `if (this.activeWaterCells.size > 0) {` の直前に:

```js
            // 流れの記録を1フレーム進める。切れたセルは水量が変わらなくても種別が変わる
            // （空の滝 → 水なし）ので、onWaterChanged で種別キャッシュに知らせる。
            // 知らせないと、その列は dirty にならず滝のまま残る
            if (this.waterStreamLive.size > 0) {
                const expired = decayStream(this.waterStreamHold, this.waterStreamLive);
                if (expired.length > 0) {
                    this.onWaterChanged(expired.map((k) => [Math.floor(k / this.cols), k % this.cols]));
                }
            }
```

`if (this.activeWaterCells.size > 0) {` の中を次に置き換える:

```js
                this.waterFallTimer = (this.waterFallTimer || 0) + 1;
                const doFall = (this.waterFallTimer >= WATER_FALL_INTERVAL);
                if (doFall) {
                    this.waterFallTimer = 0;
                }
                // 水圧は落下と別の間隔で運ぶ（WATER_PRESSURE_INTERVAL のコメント）
                this.waterPressureTimer = (this.waterPressureTimer || 0) + 1;
                const doPressure = (this.waterPressureTimer >= WATER_PRESSURE_INTERVAL);
                if (doPressure) {
                    this.waterPressureTimer = 0;
                }
                const res = stepWaterSimulation({
                    water: this.water,
                    rows: this.rows,
                    cols: this.cols,
                    isSolid: this._waterSolidFn(),
                    activeCells: this.activeWaterCells,
                    doFall,
                    doPressure,
                    streamHold: this.waterStreamHold,
                    streamLive: this.waterStreamLive,
                });
                this.activeWaterCells = res.nextActiveCells;
                if (res.changedCells.length > 0) {
                    this.onWaterChanged(res.changedCells);
                }
```

- [ ] **Step 5: 落下を毎フレームにする**

`src/js/utils/Constants.js` の

```js
export const WATER_MAX_FALL_FLOW = 2;   // 1垂直落下ステップあたりの最大流量（ゆっくり落下）
export const WATER_FALL_INTERVAL = 4;   // 垂直落下の実行間隔（フレーム数。4フレームに1回実行でゆっくり落下）
```

を次に置き換える:

```js
// 落下。以前は 4フレームに1回・最大2 で、横の流れ（毎フレーム最大4）の 1/8 しかなく、水の塊が
// 落ちきる前に横へ広がって宙に浮いた四角になり、階段や棚に居座った（2026-10-10 実機の指摘）。
// 4面・6シード×2400フレームの実測で、浮いた満水の四角は 4f/2: 682、毎フレーム/2: 206、
// 毎フレーム/4: 208、毎フレーム/8: 171。効くのは間隔で量ではないので、量は 2 のまま
export const WATER_MAX_FALL_FLOW = 2;   // 1回の落下で下のセルへ移せる最大量
export const WATER_FALL_INTERVAL = 1;   // 落下の間隔（フレーム）
```

`WATER_SPRING_INTERVAL` の上のコメント（「湧き出る周期は WATER_FALL_INTERVAL と同じにする。…」の段落）を次に置き換える:

```js
// 湧き出る周期と量。湖の満ちる速さ（面のバランス）を決めるので、落下を毎フレームにしたときも
// 変えていない（ユーザー判断 2026-10-10）。粒は4フレームおきに出て1マス/フレームで落ちるので
// 中身だけ見ると3マスおきの点線になるが、滝としては流れの記録（waterStream.js）でつながる
```

- [ ] **Step 6: 通ることを確かめ、壊して確かめる**

Run: `npm test -- tests/water-springs.test.js tests/water-stream.test.js`
Expected: すべて PASS

1つずつ壊して赤を見てから戻す:
- `Map.update` の `onWaterChanged(expired...)` の行を消す → 「記録が切れて」が FAIL
- `doPressure,` を消す（既定値 `doFall` が毎フレーム真になる） → 「水圧は…1回しか」が FAIL
- `streamHold: this.waterStreamHold,` を消す → 「毎フレーム口から下まで」が FAIL
- `WATER_STREAM_HOLD_FRAMES` を 2 にする → 「毎フレーム口から下まで」が FAIL
- `WATER_FALL_INTERVAL` を 4 に戻す → 「落下は毎フレーム」が FAIL

- [ ] **Step 7: 落下の間隔で回している既存のテストを本番と同じ回し方にする**

`tests/water-pressure.test.js`:
- import を `import { MAX_WATER_MASS, WATER_FALL_INTERVAL, WATER_PRESSURE_INTERVAL } from '../src/js/utils/Constants.js';` にする
- 冒頭コメントの「Map.update と同じ間隔（WATER_FALL_INTERVAL に1回の落下）で回す」を「Map.update と同じ間隔（落下は WATER_FALL_INTERVAL、水圧は WATER_PRESSURE_INTERVAL に1回）で回す」にする
- `run()` の中を次にする:

```js
function run(s, frames, onStep) {
    let active = s.active;
    let fallTimer = 0, pressureTimer = 0;
    for (let f = 0; f < frames; f++) {
        if (active.size === 0) { if (onStep) onStep(f, 0); continue; }
        fallTimer++;
        const doFall = fallTimer >= WATER_FALL_INTERVAL;
        if (doFall) fallTimer = 0;
        pressureTimer++;
        const doPressure = pressureTimer >= WATER_PRESSURE_INTERVAL;
        if (doPressure) pressureTimer = 0;
        const res = stepWaterSimulation({ water: s.water, rows: s.rows, cols: s.cols, isSolid: s.isSolid, activeCells: active, doFall, doPressure });
        active = res.nextActiveCells;
        if (onStep) onStep(f, res.pressureMoved);
    }
    return active;
}
```

- 注ぎ込みのテスト（`if (f < 1200 && f % WATER_FALL_INTERVAL === 0) {` のあるループ）を、注ぐ周期は湧き水と同じ4フレームのまま、回し方を `run()` と同じにする:

```js
    let fallTimer = 0, pressureTimer = 0;
    ...
        if (f < 1200 && f % 4 === 0) {   // 湧き水と同じ4フレームおき（WATER_SPRING_INTERVAL）
            ...
        }
        if (active.size > 0) {
            fallTimer++;
            const doFall = fallTimer >= WATER_FALL_INTERVAL;
            if (doFall) fallTimer = 0;
            pressureTimer++;
            const doPressure = pressureTimer >= WATER_PRESSURE_INTERVAL;
            if (doPressure) pressureTimer = 0;
            active = stepWaterSimulation({ water: s.water, rows: s.rows, cols: s.cols, isSolid: s.isSolid, activeCells: active, doFall, doPressure }).nextActiveCells;
        }
```

（`let timer = 0;` は消す）

`tests/water-active-invariant.test.js`: `doFall: step % WATER_FALL_INTERVAL === 0` の3か所を `doFall: step % 4 === 0` にし、import から `WATER_FALL_INTERVAL` を外す。冒頭コメントの「落下しないフレーム（doFall=false）は…」の行の後に1行足す:

```js
//     （本番は落下が毎フレームだが、間隔は調整のつまみとして残っているので、落下しないフレームの
//      経路をここで回し続ける。WATER_FALL_INTERVAL に合わせると 1 で一度も通らなくなる）
```

`tests/water-springs.test.js` の「水源が足した水も、そのフレームのうちに種別キャッシュへ反映される」のコメント中の「（落下は WATER_FALL_INTERVAL に1回）」は「（以前は落下が4フレームに1回だった）」に直す。

- [ ] **Step 8: 「4フレームに1回」を前提にしたコメントを直す**

Run: `grep -rn "4フレームに1回\|4 フレームに 1 回\|WATER_FALL_INTERVAL" src`
見つかった箇所のうち、落下の速さを事実として述べているものを「以前は4フレームに1回だった」形に直す。少なくとも次の3か所:
- `src/js/world/waterQuery.js` の `isFoamAt` の JSDoc「落下（4フレームに1回・最大2）は横の流れ（毎フレーム最大4）の1/8しかないので」→「落下が横の流れの1/8しかなかったころ（2026-10-10 まで4フレームに1回）は」。泡のマスは落下を速めた後も残る（浮いた四角 206）ので、機能は消さない
- `src/js/world/environment/waterfallRuns.js` の238行あたり「落下が4フレームに1回なので、上端のセル…」と299行あたり「水量1の塊が4フレームおきに運ばれてくるだけなので」→ 今の事実（湧き水の粒が4フレームおきに来る）に合わせる。この2か所は Task 5 で消すかもしれないが、残る場合に備えてここで直す
- `src/js/world/Map.js` の水源の処理のコメント「そのフレームで水が流れない（落下は WATER_FALL_INTERVAL に1回）と」→「以前は落下が4フレームに1回で、そのフレームで水が流れないと」

- [ ] **Step 9: 全テスト**

Run: `npm test`
Expected: 既知の1件だけ FAIL。他に落ちたら、落下が速くなったことで前提が崩れたテストかどうかを読んで判断する。前提が崩れただけなら、物理から期待値を決め直してコメントに理由を書く（実装の出力を写さない）。挙動が壊れているなら止めて報告

- [ ] **Step 10: 測る**

Run: `node tools/measure-water.mjs > /tmp/claude-measure-task4.json && node -e 'console.log(JSON.stringify(require("/tmp/claude-measure-task4.json").total))'`
Expected: `massViolations: 0`、`floatingFull` が Task 1 の基準より大きく減る（試作で 682→206）、`flicker` が基準以下（試作で 2,770）。`runFlicker` を記録する（Task 5 の基準）

- [ ] **Step 11: コミット**

```bash
git add src/js/world/Map.js src/js/utils/Constants.js src/js/world/waterQuery.js src/js/world/environment/waterfallRuns.js tests/helpers/water-map.js tests/water-springs.test.js tests/water-pressure.test.js tests/water-active-invariant.test.js
git commit -m "feat: 水を毎フレーム落とし、細い滝は流れの記録で1本につなぐ

4面・6シード×2400フレーム: floatingFull <基準>→<値> / flicker <基準>→<値> /
runFlicker <基準>→<値> / massViolations 0

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

（`src/js/main.js` を add しないこと。`git status --short` で ` M src/js/main.js` が残っていることを確認する）

---

### Task 5: `waterfallRuns.js` の継ぎはぎを測って外す

セルが一瞬空になる前提で足した3つ。記録で空のセルも滝になったので、要らなくなったかもしれない。**1つずつ外して `runFlicker` を測り、増えなければ外したままにする。** 細い流れの中でも、湧き水ではなく横の流れから落ち際へ届く水は粒の間隔が湧き水と違うので、残るものがあってよい。

**Files:**
- Modify: `src/js/world/environment/waterfallRuns.js:228-235`（継ぎ目）、`:238-250`（上端の遡り）、`:290` と `:294-333`（`addDrainSpills`）
- Modify: `tests/waterfall-runs.test.js`（外したものを縛っていたテスト）

**Interfaces:**
- Consumes: Task 4 の `map.waterStreamHold`（テストで空のセルに記録を置く）
- Produces: `collectWaterfallRuns(map, c0, c1, r0, r1)` の戻り値の形は変えない

判断の決まり（3つとも同じ）:
- 外して `node tools/measure-water.mjs` の `total.runFlicker` が Task 4 の値の **+1% 以内**なら外したまま。超えたら戻し、コメントに「記録を入れた後も要る。外すと runFlicker <値>→<値>」と書く
- 外したら `node tools/render-water-scene.mjs --spring 0 --frames 3000 --out <scratchpad>/a.png` と `--spring 1`、それぞれ `--frames 3001`・`3002` も書き出し、Task 4 の時点の同じ画像と見比べて、滝に切れ目が出ていないことを見る（Read ツールで PNG を開く）

- [ ] **Step 1: Task 4 の時点の画像を書き出す**

Run（スクラッチパッドに置く）:
```bash
for s in 0 1; do for f in 3000 3001 3002; do node tools/render-water-scene.mjs --spring $s --frames $f --out <scratchpad>/t4_s${s}_${f}.png; done; done
```

- [ ] **Step 2: 継ぎ目を越える処理を外して測る**

`collectWaterfallRuns` の下へ辿るループ:

```js
            for (;;) {
                if (footR + 1 < map.rows && map.isWaterfallCell(footR + 1, c)) { footR++; continue; }
                if (footR + 2 < map.rows && !map.isWater(footR + 1, c) && !map.isSolid(footR + 1, c)
                    && map.isWaterfallCell(footR + 2, c)) { footR += 2; continue; }
                break;
            }
```

の2行目（`footR + 2` の条件）と、上の「途中の1セルだけの空き（水量1の塊の継ぎ目）は越えて1本にする」のコメントを消す。測って画像を見て、決まりに従う。

外したままにするなら、`tests/waterfall-runs.test.js` の `2. 列の途中の1セルの空き（水量1の塊の継ぎ目）は越えて1本の滝にする` を、空きのセルに記録を置いた形に書き換える。テストの中で map を作った直後に:

```js
  // 落下が毎フレームになってからは、粒の継ぎ目の空のセルは流れの記録（waterStream.js）で滝になる。
  // 描画の側で空きを越える処理は要らなくなった（外して runFlicker <値>→<値>）
  map.waterStreamHold[<空きの行> * map.cols + <列>] = 4;
  map.refresh();
```

を足し（行と列はそのテストの絵の空きのセル）、テスト名を `2. 列の途中で一瞬空になったセルも、流れの記録があれば1本の滝になる` にする。期待（区間が1本）は変えない。記録の行を消すとテストが赤くなることを確かめる。

Run: `npm test -- tests/waterfall-runs.test.js` → PASS

- [ ] **Step 3: 上端を1つ遡る処理を外して測る**

```js
            let head = describeHead(map, headR, c);
            if (head.source === 'air' && headR - 1 >= 0 && !map.isWater(headR - 1, c)) {
                const above = describeHead(map, headR - 1, c);
                if (above.source !== 'air') {
                    headR -= 1;
                    head = above;
                }
            }
```

を `const head = describeHead(map, headR, c);` だけにし、上のコメント（「細い流れは水量1の塊が並んだもので…空いた1セルぶんだけ遡って判定し直す」）を消す。測って画像を見て、決まりに従う。

外したままにするなら、この処理を縛っているテストを `grep -n "遡\|上端" tests/waterfall-runs.test.js tests/water-springs.test.js` で探す。見つかったテストは Step 2 と同じく、空のセルに記録を置いて同じ期待で通る形に書き換える。見つからなければ書き換えは要らない。

Run: `npm test -- tests/waterfall-runs.test.js tests/water-springs.test.js` → PASS

- [ ] **Step 4: `addDrainSpills` を外して測る**

`collectWaterfallRuns` の末尾の `addDrainSpills(map, runs);` を消す（関数本体は測り終えるまで残す）。測って画像を見て、決まりに従う。

外したままにするなら、`addDrainSpills` 関数と JSDoc を消し、`tests/waterfall-runs.test.js` の `床の水が流れ込む落ち口は、その瞬間セルが空でも滝として描く（落ち際が点滅しない）` と `縁まで満ちた水たまりに落ちた水は、あふれて落ち口まで床を流れ、その落ち際も点滅しない` を読む。どちらも「落ち口のセルが空」の絵なので、Step 2 と同じく落ち口の空のセル（列 `drainC` の行 `row`〜下）に記録を置いて、同じ期待で通る形に書き換える。期待が「区間が上へ伸びて1本」なら、記録の置き方で同じ区間になることを確かめる。

**注意:** `addDrainSpills` は床の水（`sheet`）の行き先から滝を導いていて、湧き水ではなく床を横へ流れてくる水を受ける。横の流れの粒の間隔は記録の 4 フレームに収まらないことがあるので、ここは残る可能性が高い。残すなら JSDoc の「4フレームおきに運ばれてくるだけなので」を、測った事実（外すと runFlicker がどれだけ増えたか）に書き直す。

Run: `npm test -- tests/waterfall-runs.test.js` → PASS

- [ ] **Step 5: 全テストと最終の測定**

Run: `npm test`
Expected: 既知の1件だけ FAIL

Run: `node tools/measure-water.mjs > /tmp/claude-measure-task5.json && node -e 'console.log(JSON.stringify(require("/tmp/claude-measure-task5.json").total))'`
Expected: `runFlicker` が Task 4 の値の +1% 以内、`massViolations: 0`

- [ ] **Step 6: コミット**

```bash
git add src/js/world/environment/waterfallRuns.js tests/waterfall-runs.test.js tests/water-springs.test.js
git commit -m "refactor: 流れの記録で要らなくなった滝の描画の継ぎはぎを外す

外したもの・残したものと runFlicker: <各ステップの結果>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

（何も外せなかった場合も、書き直したコメントだけをコミットする）

---

### Task 6: 仕上げ（見た目の書き出し・記録・引き渡し）

**Files:**
- Modify: `docs/superpowers/specs/2026-10-10-water-fast-fall-design.md`（末尾に「結果」節）

- [ ] **Step 1: 書き出して見る**

合成の階段（スクリーンショットの場面）に近い実物の場面として、`node tools/render-water-scene.mjs --spring 0 --frames 3000 --w 480 --h 480 --scale 2 --out <scratchpad>/final_s0.png` と `--spring 1` を書き出し、Read で開いて、細い滝が点線になっていない・床の水と落ち際がつながっていることを見る。

- [ ] **Step 2: 設計書に結果を足す**

設計書の末尾に `## 結果（実装後の実測）` を足し、Task 1・4・5 の `measure-water` の total（`flicker` / `runFlicker` / `floatingFull` / `floatingHeads` / `massViolations` / `stepUsP95Max` / `rebuildUsP95Max`）を表にし、Task 5 で外したもの・残したものを書く。

- [ ] **Step 3: 全テスト**

Run: `npm test`
Expected: 既知の1件だけ FAIL

- [ ] **Step 4: コミット**

```bash
git add docs/superpowers/specs/2026-10-10-water-fast-fall-design.md
git commit -m "docs: 水を速く落とす変更の実測結果

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: ユーザーに引き渡す**

実機確認はユーザーが行う（サーバーは起動しない）。**ハードリロード（Cmd+Shift+R）が要る**ことを伝え、次の表を示す:

| 見る点 | 調整の定数（`src/js/utils/Constants.js`） |
|---|---|
| 水の塊が階段・棚で浮いたり居座ったりしない | `WATER_FALL_INTERVAL`・`WATER_MAX_FALL_FLOW` |
| 湧き水の細い滝が途切れない・点滅しない | `WATER_STREAM_HOLD_FRAMES` |
| 塊が落ちた後に滝の尾が残らない | `WATER_STREAM_MAX_FLOW` |
| 連通管（水面より下でつながった池）の速さが前と同じ | `WATER_PRESSURE_INTERVAL` |
| 穴を開けた湖の抜ける速さ（約4倍速くなった） | `WATER_FALL_INTERVAL`・`WATER_MAX_FALL_FLOW` |

`main` へのマージはユーザーの実機確認の後。マージは checkout を使わず `git push origin HEAD:main` と `git update-ref refs/heads/main HEAD`（main が HEAD の祖先であることを `git merge-base --is-ancestor origin/main HEAD` で確かめてから）。
