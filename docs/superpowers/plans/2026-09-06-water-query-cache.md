# 水の問い合わせ層のキャッシュ化と滝判定の修正 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「このセルは水か・水面か・滝か」を毎回ゼロから調べ直している問い合わせ層を派生キャッシュに置き換え、あわせて湖を貫く縦縞の原因である滝判定を局所ルールに直す。

**Architecture:** `water[]`（水量）はそのまま残し、そこから導かれる `waterKind`（種別）と `waterSurfaceY`（液面 Y）の2本の配列をキャッシュする。分類の計算は canvas に依存しない純関数として `src/js/world/waterQuery.js` に切り出し、`Map` はその呼び出しと dirty 列の管理だけを持つ。シミュレーション（`waterSimulation.js` の流れの計算）には触らない。

**Tech Stack:** バニラ ES modules、ビルド工程なし。テストは `node --test`（DOM も AudioContext も無い）。

**Spec:** `docs/superpowers/specs/2026-09-06-water-query-cache-design.md`

## Global Constraints

- `src/js/utils/Constants.js` がゲームバランスと演出の数値の唯一の置き場。マジックナンバーを実装側に直書きしない。今回**新しい調整用定数は追加しない**（判定ルールの変更のみ）
- コメントは日本語で、「なぜそうしたか」を書く。数値を決めたら根拠（実測値）を残す
- **`git add -A` / `git add .` は使わない。変更したファイルを明示して add する。** `src/js/main.js` にはユーザーがデバッグ用に立てている `debugStartMission: 3` が意図的に未コミットのまま置かれている（本番値は 0）。この計画では `main.js` を一切触らないので、`main.js` を `git add` してはならない
- **ソース文字列を grep するテストは書かない**（到達不能でも通ってしまう）
- 既存の水量の定数: `MAX_WATER_MASS = 8`、`MIN_WATER_MASS = 1`、`TILE_SIZE = 16`
- `waterKind` の値: `0`=水なし / `1`=水中 / `2`=水面 / `3`=滝
- 滝の判定ルール（採用したルールC）: `mass >= MIN && mass < MAX && !isSolid(r+1,c) && water[下] < MAX`
- コミットメッセージの末尾に必ず付ける:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_0141FA4BzStkStuX4aRVE1FN
  ```

## 仕様からの2点の詳細化

設計書を書いたあとに実装の都合で決めたこと。設計書の意図は変えていない。

1. **再構築のタイミングは「遅延」にする。** 設計書 §3 は「`Map.update()` の末尾で作り直す」と書いたが、ブロック破壊は `update()` の外（衝突処理の中）でも起きるため、その間キャッシュが古くなる。問い合わせの先頭に `if (this.dirtyWaterCols.size) this._rebuildWaterCache();` を置き、**変化後の最初の問い合わせで作り直す**。`Set.size` の判定は実質ゼロコストで、呼ばれる順序に関係なく正しくなる。
2. **`waterSurfaceRow(r,c)` は現状のまま残す。** 設計書 §4 は「ついでに配列参照に置き換える」と書いたが、この関数は滝判定を含まない単純な上向き走査で、呼ばれるのも水面をまたいだ瞬間（しぶき）と `EnemyDrone` の着水だけ。今回のボトルネックではないので触らず、変更範囲を小さく保つ。

## File Structure

| ファイル | 役割 |
|---|---|
| **新規** `src/js/world/waterQuery.js` | 水量配列から `waterKind` / `waterSurfaceY` を作る純関数。canvas も Map も要らないので `node --test` で直接テストできる |
| **新規** `tests/helpers/water-map.js` | テスト用の水マップを作るヘルパー。grid・water・キャッシュを揃えた偽 map を返す。既存テストの書き換え量を抑えるため |
| **新規** `tests/helpers/water-reference.js` | 現行の遅い実装の写し（滝判定だけルールC）。キャッシュの答え合わせ用 |
| **新規** `tests/water-query.test.js` | 純関数のテストと、参照実装との突き合わせ、縦縞の回帰テスト |
| 変更 `src/js/world/Map.js` | 配列の確保、dirty 列の管理、遅延再構築、問い合わせ5本の置き換え、`getWaterSurfaceSegment` の削除 |
| 変更 `src/js/world/environment/water.js` | `getWaterSurfaceSegment` をやめて `waterKind` / `waterSurfaceY` を直に読む。モック用フォールバック分岐を削除 |
| 変更 `src/js/world/waterPools.js` | `fillDestroyedCells()` を削除 |
| 変更 `src/js/world/waterSimulation.js` | 到達不能な「余剰を上の行へ持ち上げる」枝を削除 |
| 変更 `tests/water-springs.test.js` | `Map.prototype` を bind している5箇所をヘルパー経由に |
| 変更 `tests/environment-water-draw.test.js` | モックに `waterKind` / `waterSurfaceY` を持たせる |
| **削除** `tests/water-flood.test.js` | `fillDestroyedCells` 専用のテスト |

---

### Task 1: 分類の純関数（`waterQuery.js`）

**Files:**
- Create: `src/js/world/waterQuery.js`
- Test: `tests/water-query.test.js`

**Interfaces:**
- Consumes: `MAX_WATER_MASS`, `MIN_WATER_MASS`, `TILE_SIZE`（`src/js/utils/Constants.js`）
- Produces:
  - `WATER_NONE = 0`, `WATER_BODY = 1`, `WATER_SURFACE = 2`, `WATER_FALL = 3`（named export の定数）
  - `isFallingCell(water, cols, rows, isSolid, r, c) -> boolean`
  - `classifyWaterColumn({ water, kind, surfaceY, rows, cols, isSolid, c }) -> Array<number>`（その列で見つかった水面セルの行の配列）
  - `rebuildWaterCache({ water, kind, surfaceY, rows, cols, isSolid, cols: dirtyCols }) -> void` ※引数名は下のコード参照

- [ ] **Step 1: 失敗するテストを書く**

`tests/water-query.test.js` を新規作成:

```js
import test from 'node:test';
import assert from 'node:assert';
import {
    WATER_NONE, WATER_BODY, WATER_SURFACE, WATER_FALL,
    rebuildWaterCache,
} from '../src/js/world/waterQuery.js';
import { MAX_WATER_MASS, TILE_SIZE } from '../src/js/utils/Constants.js';

/** 文字の絵から水マップを作る。'#'=岩 '.'=空 数字=水量 */
function fromArt(art) {
    const lines = art.trim().split('\n').map((s) => s.trim());
    const rows = lines.length;
    const cols = lines[0].length;
    const solid = new Uint8Array(rows * cols);
    const water = new Uint8Array(rows * cols);
    lines.forEach((ln, r) => [...ln].forEach((ch, c) => {
        if (ch === '#') solid[r * cols + c] = 1;
        else if (ch >= '1' && ch <= '8') water[r * cols + c] = Number(ch);
    }));
    const isSolid = (r, c) =>
        (r < 0 || r >= rows || c < 0 || c >= cols) ? true : solid[r * cols + c] === 1;
    const kind = new Uint8Array(rows * cols);
    const surfaceY = new Int16Array(rows * cols).fill(-1);
    rebuildWaterCache({
        water, kind, surfaceY, rows, cols, isSolid,
        dirtyCols: [...Array(cols).keys()],
    });
    return { rows, cols, water, kind, surfaceY, isSolid };
}

test('満水の湖: 一番上の行だけが水面で、中は水中。滝はひとつも無い', () => {
    const m = fromArt(`
        ##########
        #........#
        #88888888#
        #88888888#
        ##########
    `);
    const at = (r, c) => m.kind[r * m.cols + c];
    assert.equal(at(2, 3), WATER_SURFACE, '行2 は空気の直下なので水面');
    assert.equal(at(3, 3), WATER_BODY, '行3 は上が水なので水中');
    assert.equal(at(1, 3), WATER_NONE, '行1 は水が無い');
    for (let r = 0; r < m.rows; r++) {
        for (let c = 0; c < m.cols; c++) {
            assert.notEqual(m.kind[r * m.cols + c], WATER_FALL, `(${r},${c}) が滝になっている`);
        }
    }
});

test('落下中の水柱: 満水未満が縦に並んだところだけが滝。床の直上は水面', () => {
    const m = fromArt(`
        ##########
        #...4....#
        #...4....#
        #...4....#
        ##########
    `);
    const at = (r, c) => m.kind[r * m.cols + c];
    assert.equal(at(1, 4), WATER_FALL, '(1,4) は自分も直下も満水未満なので滝');
    assert.equal(at(2, 4), WATER_FALL, '(2,4) も滝');
    assert.equal(at(3, 4), WATER_SURFACE, '(3,4) は直下が床なので滝ではなく水面');
});

test('天井に張り付いた水は水面ではない（水中扱い）', () => {
    const m = fromArt(`
        ##########
        #####8####
        #####8####
        ##########
    `);
    assert.equal(m.kind[1 * m.cols + 5], WATER_BODY, '直上が岩なので水面にしない');
});

test('水面の Y は行セグメント全体の平均で、セグメント全員に同じ値が入る', () => {
    // 行2 に 8,8,4,4 の水面。平均 rawY = ((3-1)+(3-1)+(3-0.5)+(3-0.5))/4 * 16
    const m = fromArt(`
        ######
        #....#
        #8844#
        #8888#
        ######
    `);
    const expected = Math.round(((3 - 1) + (3 - 1) + (3 - 0.5) + (3 - 0.5)) / 4 * TILE_SIZE);
    for (let c = 1; c <= 4; c++) {
        assert.equal(m.kind[2 * m.cols + c], WATER_SURFACE, `(2,${c}) は水面`);
        assert.equal(m.surfaceY[2 * m.cols + c], expected,
            `(2,${c}) の液面はセグメント平均 ${expected} であるべき`);
    }
});

test('岩で仕切られた2つの水たまりは別のセグメントとして平均される', () => {
    const m = fromArt(`
        ########
        #......#
        #44#88.#
        #88#88.#
        ########
    `);
    const left = m.surfaceY[2 * m.cols + 1];
    const right = m.surfaceY[2 * m.cols + 4];
    assert.equal(m.surfaceY[2 * m.cols + 2], left, '左の水たまりは同じ液面');
    assert.equal(m.surfaceY[2 * m.cols + 5], right, '右の水たまりは同じ液面');
    assert.notEqual(left, right, '岩で仕切られているので液面は別々になるはず');
});

test('滝のセルと水なしのセルの surfaceY は -1', () => {
    const m = fromArt(`
        ######
        #..4.#
        #..4.#
        ######
    `);
    assert.equal(m.surfaceY[1 * m.cols + 3], -1, '滝は液面を持たない');
    assert.equal(m.surfaceY[1 * m.cols + 1], -1, '水なしは液面を持たない');
});
```

- [ ] **Step 2: 落ちることを確認する**

```bash
npm test -- tests/water-query.test.js
```

期待: `Cannot find module '../src/js/world/waterQuery.js'` で全件失敗。

- [ ] **Step 3: `waterQuery.js` を実装する**

`src/js/world/waterQuery.js` を新規作成:

```js
// ============================================
// waterQuery - 水量配列から「種別」と「液面の高さ」を導く（純関数）
// ============================================
//
// 「このセルは水か・水面か・滝か」は water[] から一意に決まるのに、以前は
// 問い合わせのたびにゼロから調べ直していた（滝判定が列を下へ走査し、液面が
// 行を左右に走査し、その中でまた滝判定を呼ぶ）。幅298タイルの水面で実測
// 22.4µs/回。エンティティごと・グレネードの軌道90ステップごとに呼ばれるので
// 毎フレーム数msを食っていた。
//
// ここで作る2本の配列に答えを焼いておき、水が変化した列だけ作り直す。
// 問い合わせ側は配列を1回読むだけになる。
//
// canvas も Map も参照しない純関数にしてあるのは、node --test でそのまま
// 検証できるようにするため。

import { MAX_WATER_MASS, MIN_WATER_MASS, TILE_SIZE } from '../utils/Constants.js';

export const WATER_NONE = 0;
export const WATER_BODY = 1;     // 水中（タイル全体が水）
export const WATER_SURFACE = 2;  // 液面を形成するセル
export const WATER_FALL = 3;     // 落下中（滝）

/**
 * セルが落下中（滝）か。
 *
 * 「**満ちたセルは落ち着いた水であり、満ちたセルはその上の水を支える。
 * どちらも満ちていない縦の並びだけが、落下の途中の水柱**」という定義。
 *
 * 以前は「自分より下のどこかに空気がある」で判定していたため、湖底に穴が
 * 開くと水面までの列全部が滝と判定され、湖を貫く縦縞が出ていた。実際に
 * 3つのルールを走らせて「帯⇄満水」の往復回数（＝ちらつき）を数えた結果:
 *
 *   ルール                     湖底の爆破(120f)  宙に浮いた水柱  天井からの滝(300f)
 *   現行「下のどこかに空気」          49（縦縞バグ）     正しい          —
 *   A「直下が空気」                 11              取りこぼす      0
 *   B「直下が満水未満」             865（湖内に縞）    正しい          0
 *   C「自分も直下も満水未満」← これ    0              正しい          0
 */
export function isFallingCell(water, cols, isSolid, r, c) {
    const k = r * cols + c;
    const mass = water[k];
    if (mass < MIN_WATER_MASS || mass >= MAX_WATER_MASS) return false;
    if (isSolid(r + 1, c)) return false;
    return water[k + cols] < MAX_WATER_MASS;
}

/**
 * 1列ぶんの kind を決める。
 * 判定はすべて O(1) なので走査の向きは問わない（上から下へ1回）。
 * @returns {Array<number>} この列で見つかった水面セルの行
 */
export function classifyWaterColumn({ water, kind, surfaceY, rows, cols, isSolid, c }) {
    const surfaceRows = [];
    for (let r = 0; r < rows; r++) {
        const k = r * cols + c;
        const mass = water[k];

        if (mass < MIN_WATER_MASS) {
            kind[k] = WATER_NONE;
            surfaceY[k] = -1;
            continue;
        }

        if (isFallingCell(water, cols, isSolid, r, c)) {
            kind[k] = WATER_FALL;
            surfaceY[k] = -1;
            continue;
        }

        // 水面か水中か。直上が岩なら「天井に張り付いた水」で液面ではない。
        // 直上が水でも、その水が落下中（滝）なら、こちらが液面になる
        // ＝滝が水たまりへ落ちてくる境目。旧 isWaterSurface と同じ扱い
        let isSurface;
        if (r === 0) {
            isSurface = true;
        } else if (isSolid(r - 1, c)) {
            isSurface = false;
        } else {
            const above = water[k - cols];
            const aboveIsWater = above >= MIN_WATER_MASS;
            const aboveIsFalling = aboveIsWater && above < MAX_WATER_MASS && mass < MAX_WATER_MASS;
            isSurface = !aboveIsWater || aboveIsFalling;
        }

        if (isSurface) {
            kind[k] = WATER_SURFACE;
            surfaceRows.push(r);
        } else {
            kind[k] = WATER_BODY;
            surfaceY[k] = -1;
        }
    }
    return surfaceRows;
}

/**
 * 水面セル (r, c) を含む行セグメントを左右に伸ばし、平均の液面 Y を全員に書く。
 * 平均にするのは、水量がセルごとにバラついていても液面を水平に見せるため
 * （バラついたまま描くと水面がギザギザになる）。
 * @returns {[number, number]} セグメントの [左端の列, 右端の列]
 */
export function levelSurfaceSegment({ water, kind, surfaceY, cols, r, c }) {
    let c0 = c;
    while (c0 - 1 >= 0 && kind[r * cols + (c0 - 1)] === WATER_SURFACE) c0--;
    let c1 = c;
    while (c1 + 1 < cols && kind[r * cols + (c1 + 1)] === WATER_SURFACE) c1++;

    let total = 0;
    for (let sc = c0; sc <= c1; sc++) {
        total += (r + 1 - water[r * cols + sc] / MAX_WATER_MASS) * TILE_SIZE;
    }
    // 整数に丸めるのは描画（fillRect）と当たり判定を1ドットもずらさないため。
    // 以前は描画側だけが Math.round していて、最大0.5px ずれていた
    const avg = Math.round(total / (c1 - c0 + 1));
    for (let sc = c0; sc <= c1; sc++) surfaceY[r * cols + sc] = avg;

    return [c0, c1];
}

/**
 * dirty な列の kind と surfaceY を作り直す。
 * 液面のセグメントは dirty でない列へはみ出すことがあるが、そちらの kind は
 * 既に正しい（水量が変わっていない）ので、そのまま伸ばして構わない。
 */
export function rebuildWaterCache({ water, kind, surfaceY, rows, cols, isSolid, dirtyCols }) {
    const surfaceCells = [];
    for (const c of dirtyCols) {
        for (const r of classifyWaterColumn({ water, kind, surfaceY, rows, cols, isSolid, c })) {
            surfaceCells.push([r, c]);
        }
    }
    // 同じセグメントを何度も平均し直さないよう、片付いた列を覚えておく
    const done = new Set();
    for (const [r, c] of surfaceCells) {
        if (done.has(r * cols + c)) continue;
        const [c0, c1] = levelSurfaceSegment({ water, kind, surfaceY, cols, r, c });
        for (let sc = c0; sc <= c1; sc++) done.add(r * cols + sc);
    }
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npm test -- tests/water-query.test.js
```

期待: 6件すべて PASS。

- [ ] **Step 5: 壊して落ちることを確認する（mutation check）**

`isFallingCell` の `mass >= MAX_WATER_MASS` の行を一時的に消す（＝ルールB にする）。

```bash
npm test -- tests/water-query.test.js
```

期待: 「満水の湖」のテストが FAIL する。確認したら**必ず元に戻す**。

- [ ] **Step 6: コミット**

```bash
git add src/js/world/waterQuery.js tests/water-query.test.js
git commit -m "$(cat <<'EOF'
feat: 水の種別と液面を導く純関数（waterQuery）

water[] から waterKind / waterSurfaceY を作る。滝の判定は「自分も直下も
満水未満」（ルールC）。3案を実際に走らせて、湖底の爆破でのちらつきが
現行49・A11・B865 に対し C は 0 だったので選んだ。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0141FA4BzStkStuX4aRVE1FN
EOF
)"
```

---

### Task 2: 参照実装との突き合わせテスト

現行の遅い実装を「答え」として残し、`waterQuery` がそれと一致することをランダムな地形で確かめる。これがこのタスク全体の安全網になるので、`Map` に手を入れる前に用意する。

**Files:**
- Create: `tests/helpers/water-reference.js`
- Modify: `tests/water-query.test.js`（末尾に追記）

**Interfaces:**
- Consumes: Task 1 の `rebuildWaterCache`, `WATER_*`
- Produces: `referenceKindAt(ctx, r, c) -> number`, `referenceSurfaceY(ctx, r, c) -> number`（`ctx` は `{water, rows, cols, isSolid}`）

- [ ] **Step 1: 参照実装を書く**

`tests/helpers/water-reference.js` を新規作成:

```js
// 現行（キャッシュ導入前）の遅い実装の写し。キャッシュの答え合わせ専用。
// 滝の判定だけは新しいルールC に差し替えてある（旧ルールは湖を貫く縦縞を
// 出すバグそのものなので、答えとして使えない）。
//
// ここを実装から import してはいけない。実装と同じコードを見てしまうと
// 「実装から期待値を導く」ことになり、テストが恒真になる。

import { MAX_WATER_MASS, MIN_WATER_MASS, TILE_SIZE } from '../../src/js/utils/Constants.js';
import { WATER_NONE, WATER_BODY, WATER_SURFACE, WATER_FALL } from '../../src/js/world/waterQuery.js';

const isWater = (ctx, r, c) => {
    if (r < 0 || r >= ctx.rows || c < 0 || c >= ctx.cols) return false;
    return ctx.water[r * ctx.cols + c] >= MIN_WATER_MASS;
};

const isFalling = (ctx, r, c) => {
    if (!isWater(ctx, r, c)) return false;
    const mass = ctx.water[r * ctx.cols + c];
    if (mass >= MAX_WATER_MASS) return false;
    if (ctx.isSolid(r + 1, c)) return false;
    if (r + 1 >= ctx.rows) return false;
    return ctx.water[(r + 1) * ctx.cols + c] < MAX_WATER_MASS;
};

// 旧 Map.isWaterSurface をそのまま写したもの
const isSurface = (ctx, r, c) => {
    if (!isWater(ctx, r, c)) return false;
    if (isFalling(ctx, r, c)) return false;
    if (r > 0 && isWater(ctx, r - 1, c) && !isFalling(ctx, r - 1, c)) return false;
    if (r > 0 && ctx.isSolid(r - 1, c)) return false;
    return true;
};

export function referenceKindAt(ctx, r, c) {
    if (!isWater(ctx, r, c)) return WATER_NONE;
    if (isFalling(ctx, r, c)) return WATER_FALL;
    if (isSurface(ctx, r, c)) return WATER_SURFACE;
    return WATER_BODY;
}

// 旧 Map.getWaterSurfaceSegment + getSurfaceY をそのまま写したもの
export function referenceSurfaceY(ctx, r, c) {
    if (!isSurface(ctx, r, c)) return -1;
    const seg = [c];
    for (let cc = c - 1; cc >= 0 && isSurface(ctx, r, cc); cc--) seg.push(cc);
    for (let cc = c + 1; cc < ctx.cols && isSurface(ctx, r, cc); cc++) seg.push(cc);
    let total = 0;
    for (const sc of seg) {
        total += (r + 1 - ctx.water[r * ctx.cols + sc] / MAX_WATER_MASS) * TILE_SIZE;
    }
    return Math.round(total / seg.length);
}
```

- [ ] **Step 2: 突き合わせテストを書く**

`tests/water-query.test.js` の末尾に追記:

```js
import { referenceKindAt, referenceSurfaceY } from './helpers/water-reference.js';
import { rebuildWaterCache as rebuild } from '../src/js/world/waterQuery.js';
import { stepWaterSimulation } from '../src/js/world/waterSimulation.js';

/** 種を決めた線形合同法。node --test に乱数を持ち込まないため */
function makeRng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function randomWorld(seed) {
    const rng = makeRng(seed);
    const rows = 20, cols = 24;
    const solid = new Uint8Array(rows * cols);
    const water = new Uint8Array(rows * cols);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const edge = (r === 0 || r === rows - 1 || c === 0 || c === cols - 1);
            if (edge || rng() < 0.22) solid[r * cols + c] = 1;
        }
    }
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (solid[r * cols + c]) continue;
            if (rng() < 0.45) water[r * cols + c] = 1 + Math.floor(rng() * MAX_WATER_MASS);
        }
    }
    const isSolid = (r, c) =>
        (r < 0 || r >= rows || c < 0 || c >= cols) ? true : solid[r * cols + c] === 1;
    return { rows, cols, water, isSolid };
}

function buildCache(ctx) {
    const kind = new Uint8Array(ctx.rows * ctx.cols);
    const surfaceY = new Int16Array(ctx.rows * ctx.cols).fill(-1);
    rebuild({ ...ctx, kind, surfaceY, dirtyCols: [...Array(ctx.cols).keys()] });
    return { kind, surfaceY };
}

function assertMatchesReference(ctx, cache, label) {
    for (let r = 0; r < ctx.rows; r++) {
        for (let c = 0; c < ctx.cols; c++) {
            const k = r * ctx.cols + c;
            assert.equal(cache.kind[k], referenceKindAt(ctx, r, c),
                `${label}: kind が (${r},${c}) で食い違う`);
            assert.equal(cache.surfaceY[k], referenceSurfaceY(ctx, r, c),
                `${label}: surfaceY が (${r},${c}) で食い違う`);
        }
    }
}

test('ランダムな地形と水量 40通りで、キャッシュが参照実装と全セル一致する', () => {
    for (let seed = 1; seed <= 40; seed++) {
        const ctx = randomWorld(seed);
        assertMatchesReference(ctx, buildCache(ctx), `seed ${seed}`);
    }
});

test('水を動かしたあとも、変化した列だけ作り直せば参照実装と一致する', () => {
    for (let seed = 1; seed <= 20; seed++) {
        const ctx = randomWorld(seed);
        const cache = buildCache(ctx);

        let active = new Set();
        for (let i = 0; i < ctx.rows * ctx.cols; i++) if (ctx.water[i] > 0) active.add(i);

        for (let step = 0; step < 30 && active.size; step++) {
            const res = stepWaterSimulation({
                water: ctx.water, rows: ctx.rows, cols: ctx.cols,
                isSolid: ctx.isSolid, activeCells: active, doFall: true,
            });
            active = res.nextActiveCells;
            const dirty = new Set(res.changedCells.map(([, c]) => c));
            rebuild({ ...ctx, kind: cache.kind, surfaceY: cache.surfaceY, dirtyCols: dirty });
            assertMatchesReference(ctx, cache, `seed ${seed} step ${step}`);
        }
    }
});
```

- [ ] **Step 3: テストが通ることを確認する**

```bash
npm test -- tests/water-query.test.js
```

期待: 8件すべて PASS。

**もし「変化した列だけ作り直せば一致する」が落ちたら**、それは `changedCells` が
取りこぼしている（＝差分更新が成立しない）ということなので、`Map` 側は
「dirty があれば全列を作り直す」に倒すこと。落ちなければ列単位の差分更新でよい。

- [ ] **Step 4: 壊して落ちることを確認する（mutation check）**

`waterQuery.js` の `levelSurfaceSegment` で `Math.round(total / (c1 - c0 + 1))` を
`Math.round(total / (c1 - c0 + 1)) + 1` にする。

```bash
npm test -- tests/water-query.test.js
```

期待: 突き合わせの2件が FAIL。確認したら**必ず元に戻す**。

- [ ] **Step 5: コミット**

```bash
git add tests/helpers/water-reference.js tests/water-query.test.js
git commit -m "$(cat <<'EOF'
test: 現行実装を参照実装として残し、キャッシュと突き合わせる

ランダムな地形と水量40通り、および水を30ステップ動かした各時点で、
全セルの kind と surfaceY が一致することを縛る。列単位の差分更新が
取りこぼさないことの証明も兼ねる。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0141FA4BzStkStuX4aRVE1FN
EOF
)"
```

---

### Task 3: 縦縞の回帰テスト

**Files:**
- Modify: `tests/water-query.test.js`（末尾に追記）

**Interfaces:**
- Consumes: Task 1 の `rebuildWaterCache`, `WATER_FALL`

- [ ] **Step 1: 回帰テストを書く**

`tests/water-query.test.js` の末尾に追記:

```js
test('湖底のブロックを壊しても、湖の内部に滝（縦縞）が現れない', () => {
    // 以前は滝判定が「自分より下のどこかに空気がある」だったため、湖底に
    // 穴が開いた瞬間、水が1ドットも動いていないのに、その列が水面まで
    // 全部「滝」と判定されて 8px の細帯で描かれていた（湖を貫く縦縞）。
    const rows = 12, cols = 14;
    const solid = new Uint8Array(rows * cols);
    for (let c = 0; c < cols; c++) { solid[c] = 1; solid[(rows - 1) * cols + c] = 1; }
    for (let r = 0; r < rows; r++) { solid[r * cols] = 1; solid[r * cols + cols - 1] = 1; }
    for (let c = 1; c < cols - 1; c++) solid[7 * cols + c] = 1;  // 湖底

    const water = new Uint8Array(rows * cols);
    for (let r = 2; r <= 6; r++) {
        for (let c = 1; c < cols - 1; c++) water[r * cols + c] = MAX_WATER_MASS;
    }
    const isSolid = (r, c) =>
        (r < 0 || r >= rows || c < 0 || c >= cols) ? true : solid[r * cols + c] === 1;

    const kind = new Uint8Array(rows * cols);
    const surfaceY = new Int16Array(rows * cols).fill(-1);
    const all = [...Array(cols).keys()];
    rebuildWaterCache({ water, kind, surfaceY, rows, cols, isSolid, dirtyCols: all });

    // 湖底 (7, 6) を破壊
    solid[7 * cols + 6] = 0;
    rebuildWaterCache({ water, kind, surfaceY, rows, cols, isSolid, dirtyCols: all });

    for (let r = 2; r <= 6; r++) {
        for (let c = 1; c < cols - 1; c++) {
            assert.notEqual(kind[r * cols + c], WATER_FALL,
                `(${r},${c}) が滝と判定された（湖を貫く縦縞の再発）`);
        }
    }

    // 水面が縦縞で分断されていないこと＝行2 の液面が全列で同じ値
    const y = surfaceY[2 * cols + 1];
    for (let c = 1; c < cols - 1; c++) {
        assert.equal(surfaceY[2 * cols + c], y,
            `水面が (2,${c}) で分断され、液面がずれている`);
    }
});
```

- [ ] **Step 2: テストが通ることを確認する**

```bash
npm test -- tests/water-query.test.js
```

期待: 9件すべて PASS。

- [ ] **Step 3: 壊して落ちることを確認する（mutation check）**

`waterQuery.js` の `isFallingCell` を、一時的に旧ルール（下向き走査）に戻す:

```js
export function isFallingCell(water, cols, isSolid, r, c) {
    const k = r * cols + c;
    if (water[k] < MIN_WATER_MASS) return false;
    if (isSolid(r + 1, c)) return false;
    if (water[k + cols] < MIN_WATER_MASS) return true;
    let downR = r + 1;
    while (!isSolid(downR, c)) {
        if (water[downR * cols + c] < MIN_WATER_MASS) return true;
        downR++;
    }
    return false;
}
```

```bash
npm test -- tests/water-query.test.js
```

期待: 「湖底のブロックを壊しても…」が FAIL する。これがバグの再現。
確認したら**必ず元に戻す**。

- [ ] **Step 4: コミット**

```bash
git add tests/water-query.test.js
git commit -m "$(cat <<'EOF'
test: 湖底を壊しても湖の内部に縦縞が出ないことを縛る

旧ルール（自分より下のどこかに空気）に戻すと落ちることを確認済み。
水面の液面が分断されずに1本になることも同時に縛る。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0141FA4BzStkStuX4aRVE1FN
EOF
)"
```

---

### Task 4: `Map` にキャッシュを載せる

**Files:**
- Modify: `src/js/world/Map.js`
  - 133-136 行付近（フィールドの宣言）
  - 377-399 行（`_generateWater`）
  - 990-1032 行（`damageBlock`）
  - 1084-1088 行（`onWaterChanged`）
  - 1225-1370 行（問い合わせ群）
  - 1382-1435 行（`update`）
- Test: `tests/water-query.test.js`（既存。Map の変更で壊れないことの確認に使う）

**Interfaces:**
- Consumes: Task 1 の `rebuildWaterCache`, `WATER_NONE`, `WATER_BODY`, `WATER_SURFACE`, `WATER_FALL`
- Produces:
  - `map.waterKind: Uint8Array`, `map.waterSurfaceY: Int16Array`（`water.js` が直に読む）
  - `map._markWaterDirty(cells)`, `map._rebuildWaterCacheIfDirty()`
  - `isWaterSurface(r,c)` / `isWaterfallCell(r,c)` / `getSurfaceY(r,c)` / `isWaterAtPixel(x,y)` / `isWaterfallAtPixel(x,y)` は**シグネチャも戻り値の意味も従来どおり**

- [ ] **Step 1: import とフィールドを足す**

`src/js/world/Map.js` の import に追加（40-41 行の `waterPools` / `waterSimulation` の import の隣）:

```js
import {
    rebuildWaterCache, WATER_NONE, WATER_BODY, WATER_SURFACE, WATER_FALL,
} from './waterQuery.js';
```

133-136 行のフィールド宣言を差し替え:

```js
        this.water = null;          // Uint8Array(rows*cols)。0..MAX_WATER_MASS。水の無い面は null のまま
        this.waterKind = null;      // Uint8Array。0=水なし 1=水中 2=水面 3=滝。water[] から導く要約
        this.waterSurfaceY = null;  // Int16Array。水面セルの液面 Y(px)。それ以外 -1
        this.dirtyWaterCols = new Set(); // 作り直しが要る列。問い合わせの手前でまとめて処理する
        this.waterCells = [];       // 生成直後の一覧（決定性テストと描画キャッシュの初期化用）
        this.activeWaterCells = new Set(); // 現在水流シミュレーションがアクティブなセル
```

`this.waterSurface = null;` の行は**削除する**（生成時に書くだけで一度も読まれていなかった）。

- [ ] **Step 2: `_generateWater` で配列を確保して1回作り直す**

385-393 行を差し替え:

```js
        this.water = new Uint8Array(this.rows * this.cols);
        this.waterKind = new Uint8Array(this.rows * this.cols);
        this.waterSurfaceY = new Int16Array(this.rows * this.cols).fill(-1);
        this.dirtyWaterCols = new Set();
        this.activeWaterCells = new Set();
        for (const pool of pools) {
            for (const [r, c] of pool.cells) {
                this.water[r * this.cols + c] = MAX_WATER_MASS;
                this.waterCells.push([r, c]);
            }
        }
```

`_generateWater()` の末尾（`this.waterSprings = ...` の直後）に追加:

```js
        // 生成直後は全列を作り直して初期状態を揃える。実測 235.7µs（1回だけ）
        for (let c = 0; c < this.cols; c++) this.dirtyWaterCols.add(c);
        this._rebuildWaterCacheIfDirty();
```

- [ ] **Step 3: dirty の記録と作り直しを足す**

`onWaterChanged`（1084 行）を差し替え:

```js
    /** 流入で水が増えたとき。派生キャッシュを dirty にし、描画キャッシュ（環境側）に伝える。 */
    onWaterChanged(cells) {
        this._markWaterDirty(cells);
        const env = this.game && this.game.env;
        if (env && env.renderer && env.renderer.invalidate) env.renderer.invalidate(cells);
    }

    /** 変化したセルの「列」を覚えておく。作り直しは列単位で行う */
    _markWaterDirty(cells) {
        if (!this.water) return;
        for (const [, c] of cells) this.dirtyWaterCols.add(c);
    }

    /**
     * dirty な列の waterKind / waterSurfaceY を作り直す。
     *
     * update() の末尾ではなく問い合わせの手前で呼ぶのは、ブロック破壊が
     * update() の外（衝突処理の中）でも起きるため。Set.size の判定は
     * 実質ゼロコストなので、呼ばれる順序に関係なく正しくなるほうを取った。
     */
    _rebuildWaterCacheIfDirty() {
        if (!this.water || this.dirtyWaterCols.size === 0) return;
        rebuildWaterCache({
            water: this.water,
            kind: this.waterKind,
            surfaceY: this.waterSurfaceY,
            rows: this.rows,
            cols: this.cols,
            isSolid: this._waterIsSolid || (this._waterIsSolid = (r, c) => this.isSolid(r, c)),
            dirtyCols: this.dirtyWaterCols,
        });
        this.dirtyWaterCols.clear();
    }
```

`damageBlock`（1000-1011 行）の水まわりのブロックに、dirty の記録を足す。
**地形が変わると水量が変わらなくてもセルの種別が変わる**（直下が岩でなくなる）ため、
`onWaterChanged` 任せにはできない:

```js
            // 破壊されたブロックの周囲をアクティブ化し、水流セル・オートマトンで自然に流れ込ませる
            if (this.water) {
                if (!this.activeWaterCells) this.activeWaterCells = new Set();
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        const nr = r + dr, nc = c + dc;
                        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
                            this.activeWaterCells.add(nr * this.cols + nc);
                        }
                    }
                }
                // 地形が変わると水量が変わらなくても種別が変わる（直下が岩でなくなる、
                // 天井が抜けて水面になる）ので、この列は必ず作り直す
                for (let dc = -1; dc <= 1; dc++) {
                    const nc = c + dc;
                    if (nc >= 0 && nc < this.cols) this.dirtyWaterCols.add(nc);
                }
            }
```

- [ ] **Step 4: 問い合わせを配列参照に置き換える**

1225-1370 行の水の問い合わせ群を、以下で置き換える。
`isWater` / `waterSurfaceRow` / `pixelToTile` は**そのまま残す**。
`getWaterSurfaceSegment` は**削除する**。

```js
    isWater(r, c) {
        if (!this.water) return false;
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
        return this.water[r * this.cols + c] >= MIN_WATER_MASS;
    }

    /** セルが水面（水たまりの液面）を形成しているか */
    isWaterSurface(r, c) {
        if (!this.waterKind) return false;
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
        this._rebuildWaterCacheIfDirty();
        return this.waterKind[r * this.cols + c] === WATER_SURFACE;
    }

    /** セルが落下中の滝（水流）の中にあるか */
    isWaterfallCell(r, c) {
        if (!this.waterKind) return false;
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
        this._rebuildWaterCacheIfDirty();
        return this.waterKind[r * this.cols + c] === WATER_FALL;
    }

    /** セル (r, c) における水面の Y 座標 (px)。セグメント全体の平均。水面でなければタイル上辺 */
    getSurfaceY(r, c) {
        if (!this.water) return -1;
        if (!this.isWater(r, c)) return -1;
        this._rebuildWaterCacheIfDirty();
        const k = r * this.cols + c;
        if (this.waterKind[k] !== WATER_SURFACE) return r * TILE_SIZE;
        return this.waterSurfaceY[k];
    }

    isWaterAtPixel(x, y) {
        if (!this.water) return false;
        const r = Math.floor(y / TILE_SIZE);
        const c = Math.floor(x / TILE_SIZE);
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
        this._rebuildWaterCacheIfDirty();
        const k = r * this.cols + c;
        const kind = this.waterKind[k];
        if (kind === WATER_NONE) return false;
        // 水面のタイルだけは、液面より下かどうかを見る（タイルの途中に境目がある）
        if (kind === WATER_SURFACE) return y >= this.waterSurfaceY[k];
        return true;
    }

    /** ピクセル座標が落下中の滝（水流）の中にあるか */
    isWaterfallAtPixel(x, y) {
        if (!this.water) return false;
        const r = Math.floor(y / TILE_SIZE);
        const c = Math.floor(x / TILE_SIZE);
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
        this._rebuildWaterCacheIfDirty();
        return this.waterKind[r * this.cols + c] === WATER_FALL;
    }
```

- [ ] **Step 5: 使わなくなった import を消す**

`Map.js` の import から、どこからも参照されなくなったものを外す。
`grep -n "fillDestroyedCells\|MIN_WATER_MASS\|MAX_WATER_MASS" src/js/world/Map.js` で確認してから消す。

- [ ] **Step 6: テストを流す**

```bash
npm test 2>&1 | tail -20
```

期待: `tests/water-springs.test.js` と `tests/environment-water-draw.test.js` は
**この時点では落ちてよい**（Task 5・6 で追随させる）。それ以外が緑であること。
落ちたファイル名を控えておく。

- [ ] **Step 7: コミット**

```bash
git add src/js/world/Map.js
git commit -m "$(cat <<'EOF'
perf: 水の問い合わせを派生キャッシュの配列参照にする

waterKind / waterSurfaceY を water[] と並べて持ち、変化した列だけ
作り直す。isWaterAtPixel などの O(cols×rows) の走査が消える
（幅298の水面で実測 22.4µs/回 → 配列1回読み）。

地形が変わると水量が変わらなくても種別が変わるため、damageBlock でも
列を dirty にする。作り直しを update() の末尾ではなく問い合わせの手前に
置いたのは、ブロック破壊が update() の外でも起きるから。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0141FA4BzStkStuX4aRVE1FN
EOF
)"
```

---

### Task 5: 描画側（`water.js`）をキャッシュに載せ替える

**Files:**
- Modify: `src/js/world/environment/water.js`
  - 232-249 行（`invalidate` の中の `getWaterSurfaceSegment` 利用）
  - 326-380 行（`drawOverWorld` の水面セグメント収集とフォールバック分岐）
- Create: `tests/helpers/water-map.js`
- Modify: `tests/environment-water-draw.test.js`

**Interfaces:**
- Consumes: Task 4 の `map.waterKind`, `map.waterSurfaceY`, `WATER_SURFACE`
- Produces: `makeWaterMap({ art }) -> mock map`（`tests/helpers/water-map.js`）

- [ ] **Step 1: テスト用ヘルパーを作る**

`tests/helpers/water-map.js` を新規作成:

```js
// 水のテスト用の偽 map。grid・water・派生キャッシュを揃えて返す。
// 実装（Map クラス）は canvas を要求するので node --test では作れない。
// 問い合わせは Map.prototype と同じ意味になるよう waterQuery を通す。

import { MAX_WATER_MASS, MIN_WATER_MASS, TILE_SIZE } from '../../src/js/utils/Constants.js';
import { rebuildWaterCache, WATER_SURFACE, WATER_FALL, WATER_NONE } from '../../src/js/world/waterQuery.js';

/** 文字の絵から偽 map を作る。'#'=岩 '.'=空 数字=水量(1..8) */
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
```

- [ ] **Step 2: `water.js` の `invalidate` から `getWaterSurfaceSegment` を外す**

232-249 行の水面セグメント収集を差し替える。液面はもう `waterSurfaceY` に
入っているので、セグメントを組み立て直す必要はなく、**同じ行で `waterKind` が
水面のあいだ左右へ伸ばすだけ**でよい:

```js
                // 水面セルなら、同じ行の水面が続く範囲も塗り直す。液面はセグメント
                // 全体の平均なので、1セルの水量が変わると仲間全員の見た目が変わる
                for (const nr of [r - 1, r, r + 1]) {
                    if (nr < 0 || nr >= map.rows) continue;
                    if (!map.isWaterSurface(nr, c)) continue;
                    for (let cc = c - 1; cc >= 0 && map.isWaterSurface(nr, cc); cc--) {
                        toRepaint.add(nr * map.cols + cc);
                    }
                    for (let cc = c + 1; cc < map.cols && map.isWaterSurface(nr, cc); cc++) {
                        toRepaint.add(nr * map.cols + cc);
                    }
                }
```

- [ ] **Step 3: `drawOverWorld` の水面セグメント収集を書き換え、フォールバック分岐を消す**

326-380 行を差し替える。**フォールバック分岐（`else` 以下の簡易モック用の経路）は
まるごと削除する** — 経路が2本あると片方が試されないまま腐るため:

```js
            // 画面内の水面セグメントを集める。waterKind が水面のあいだ横へ伸ばすだけ
            const startCol = Math.max(0, Math.floor(camX / TILE_SIZE) - 1);
            const endCol = Math.min(map.cols - 1, Math.ceil((camX + CANVAS_WIDTH) / TILE_SIZE) + 1);
            const startRow = Math.max(0, Math.floor((camY - 16) / TILE_SIZE));
            const endRow = Math.min(map.rows - 1, Math.ceil((camY + CANVAS_HEIGHT + 16) / TILE_SIZE));

            const segments = [];
            const visited = new Set();
            for (let r = startRow; r <= endRow; r++) {
                for (let c = startCol; c <= endCol; c++) {
                    if (visited.has(r * map.cols + c)) continue;
                    if (!map.isWaterSurface(r, c)) continue;
                    let c0 = c;
                    while (c0 - 1 >= 0 && map.isWaterSurface(r, c0 - 1)) c0--;
                    let c1 = c;
                    while (c1 + 1 < map.cols && map.isWaterSurface(r, c1 + 1)) c1++;
                    for (let cc = c0; cc <= c1; cc++) visited.add(r * map.cols + cc);
                    segments.push({ r, c0, c1 });
                }
            }

            // 各セグメントを平均水位で水平に描く（液面は waterSurfaceY に焼いてある）
            ctx.strokeStyle = WATER_SURFACE_COLOR;
            ctx.lineWidth = WATER_SURFACE_LINE_WIDTH;
            ctx.beginPath();
            for (const seg of segments) {
                const avgY = map.getSurfaceY(seg.r, seg.c0);
                const x0 = seg.c0 * TILE_SIZE;
                const x1 = (seg.c1 + 1) * TILE_SIZE;
                for (let x = x0; x <= x1; x += 8) {
                    const y = avgY + surfaceOffset(x, this.t, this.ripples);
                    if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
```

- [ ] **Step 4: `environment-water-draw.test.js` をヘルパー経由にする**

`tests/environment-water-draw.test.js` の 18-27 行あたりで自作しているモックを、
`makeWaterMap` に置き換える。**アサーションは変えない**（変えると何を守っていたか
分からなくなる）。液面の期待値だけ、丸めが入ったぶんずれる可能性があるので、
落ちたら実際の値を確かめてから直し、**なぜ変わったかをコメントに残す**。

- [ ] **Step 5: テストを流す**

```bash
npm test -- tests/environment-water-draw.test.js tests/water-query.test.js
```

期待: どちらも PASS。

- [ ] **Step 6: 壊して落ちることを確認する（mutation check）**

`water.js` の `drawOverWorld` で `const avgY = map.getSurfaceY(seg.r, seg.c0);` を
`const avgY = seg.r * TILE_SIZE;` にする。

```bash
npm test -- tests/environment-water-draw.test.js
```

期待: 水面の線の位置を見ているテストが FAIL。確認したら**必ず元に戻す**。

- [ ] **Step 7: コミット**

```bash
git add src/js/world/environment/water.js tests/helpers/water-map.js tests/environment-water-draw.test.js
git commit -m "$(cat <<'EOF'
refactor: 水の描画を waterKind / waterSurfaceY に載せ替える

getWaterSurfaceSegment をやめ、水面が続くあいだ横へ伸ばすだけにした。
簡易モック用のフォールバック分岐は削除（経路が2本あると片方が試されない
まま腐るため）。テスト用の偽 map は tests/helpers/water-map.js に集約。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0141FA4BzStkStuX4aRVE1FN
EOF
)"
```

---

### Task 6: 既存テストの追随（`water-springs.test.js`）

**Files:**
- Modify: `tests/water-springs.test.js`（84 行、419-422 行、および `createWaterRenderer` に渡すモック）

**Interfaces:**
- Consumes: Task 5 の `makeWaterMap`

- [ ] **Step 1: 現状の失敗を確認する**

```bash
npm test -- tests/water-springs.test.js 2>&1 | tail -30
```

落ちているテスト名を控える。

- [ ] **Step 2: `Map.prototype` の bind をヘルパーに置き換える**

84 行と 419-422 行は、プレーンなオブジェクトに `Map.prototype` のメソッドを
bind している。これらは `this.waterKind` を読むようになったので動かない。
`makeWaterMap` で作った偽 map に置き換える。

`tests/water-springs.test.js:399` の「落下中の水（滝）は水面と判定されない」は
次の絵で同じ状況を作れる（(2,4)〜(4,4) に mass=4、(5,4) が床）:

```js
const map = makeWaterMap(`
    ..........
    ..........
    ....4.....
    ....4.....
    ....4.....
    ##########
    ##########
    ##########
    ##########
    ##########
`);
```

**アサーションは変えない。** ルールC は
「(2,4)=滝、(3,4)=滝、(4,4)=滝でない・水面」を満たすので、そのまま通るはず。

71 行の `isWaterfallAtPixel` のテストも同様に `makeWaterMap` で組み直す。
こちらは水が (2,5)=8、(3,5)=4、(7,5)=8 で床が r>=8 という状況。
**ルールC では (2,5) は mass=8 なので滝ではなくなる**ため、
このテストの期待値は変わる。変えるときは「なぜ変わったか」をテスト名と
コメントに書く（旧ルールは湖を貫く縦縞の原因だったこと）。

- [ ] **Step 3: `createWaterRenderer` に渡すモックを揃える**

153 / 183 / 218 / 252 / 312 / 350 / 434 / 469 行のテストが自作のモックを
`createWaterRenderer` に渡している。`waterKind` / `waterSurfaceY` を持たない
モックは水面を1つも描かなくなるので、`makeWaterMap` に寄せる。

469 行のテストのように `isWaterfallCell: (r, c) => r === 3 && c === 4` と
**判定そのものを差し替えている**ものは、`makeWaterMap` の戻り値に対して
同じ差し替えを行えばよい（`map.isWaterfallCell = (r, c) => ...`）。

- [ ] **Step 4: テストを流す**

```bash
npm test -- tests/water-springs.test.js
```

期待: 全件 PASS。

- [ ] **Step 5: 全体を流す**

```bash
npm test 2>&1 | tail -12
```

期待: `tests/water-flood.test.js` 以外は緑（それは Task 7 で消す）。

- [ ] **Step 6: コミット**

```bash
git add tests/water-springs.test.js
git commit -m "$(cat <<'EOF'
test: water-springs を偽 map ヘルパーに寄せ、滝判定の変更に追随する

Map.prototype を bind していた箇所は waterKind を読むようになったため
動かない。makeWaterMap で同じ状況を組み直した。isWaterfallAtPixel の
テストは、満水セルが滝でなくなるルール変更のぶん期待値を更新した。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0141FA4BzStkStuX4aRVE1FN
EOF
)"
```

---

### Task 7: 死にコードの掃除

**Files:**
- Modify: `src/js/world/waterPools.js`（`fillDestroyedCells` を削除）
- Modify: `src/js/world/waterSimulation.js`（216 行付近の到達不能な枝を削除）
- Modify: `src/js/world/Map.js`（水源の停止ガードにコメント）
- Delete: `tests/water-flood.test.js`

- [ ] **Step 1: `fillDestroyedCells` が本当にどこからも呼ばれていないことを確認する**

```bash
grep -rn "fillDestroyedCells" src/ tests/ tools/
```

期待: `src/js/world/waterPools.js` の定義と `tests/water-flood.test.js` だけ。
`src/js/` の他のファイルから呼ばれていたら**削除せず、その旨を報告して止まる**。

- [ ] **Step 2: 削除する**

- `src/js/world/waterPools.js` から `fillDestroyedCells` 関数をまるごと削除する
  （直前の JSDoc コメントも一緒に）
- `tests/water-flood.test.js` を削除する
- `waterPools.js` の import から、使わなくなった `MAX_WATER_MASS` を外す
  （`grep -n "MAX_WATER_MASS" src/js/world/waterPools.js` で確認してから）

```bash
git rm tests/water-flood.test.js
```

- [ ] **Step 3: `waterSimulation.js` の到達不能な枝を削除する**

`src/js/world/waterSimulation.js` の「余剰水がある場合（この行が完全に満杯に
なった場合）、上の行へ持ち上げる」ブロック（`if (excessMass > 0 && r > 0) { ... }`）
を削除する。`excessMass` の計算と `fillMass` も不要になるので整理し、
ケースB の冒頭コメントに理由を残す:

```js
                // ケースB: 落ち口がない（＝底が完全に塞がれた水槽・水たまりの層）
                // この層の全セルに水量を均等に配分する。
                //
                // 以前ここに「区間の容量を超えたぶんを上の行へ持ち上げる」処理が
                // あったが、water[] は1セル MAX_WATER_MASS が上限なので
                // sumMass が容量を超えることはあり得ず、到達不能だった。
                // 水位が上がるのは、上の行へ水が落ちてこないぶんが積み上がる
                // フェーズ1の自然な結果である
```

ファイル冒頭のモデル説明（19行目付近の「その層が満水になった時のみ、上の行へ
水位が上がる」）も、実態に合わせて直す。

- [ ] **Step 4: 水源の停止ガードにコメントを足す**

`src/js/world/Map.js` の `update()` の水源の処理（1386-1389 行付近）に、
**条件が構造的に成立しないことを明記する**。挙動は変えない
（「マップがゆっくり水没してよい」という判断のため）:

```js
                for (const sp of this.waterSprings) {
                    // この2つのガードはどちらも構造的に成立しない。sp.r は生成時に
                    // 決まって以後変わらず、sp.r-1 は水源の定義（天井直下の空洞）から
                    // 必ず岩なので water[] は常に 0。つまり**水源は止まらない**。
                    // これは意図した挙動で、面がゆっくり水没していくのは仕様。
                    // 止めたくなったら、実際の水位（水面の行）を見る条件に書き直すこと
                    if (sp.r <= WATER_SPRING_STOP_ROW) continue;
                    if (sp.r > 0 && this.water[(sp.r - 1) * this.cols + sp.c] >= MAX_WATER_MASS) continue;
```

- [ ] **Step 5: 全テストを流す**

```bash
npm test 2>&1 | tail -12
```

期待: 全件 PASS（`tests/water-flood.test.js` のぶん、件数が減る）。

- [ ] **Step 6: コミット**

```bash
git add src/js/world/waterPools.js src/js/world/waterSimulation.js src/js/world/Map.js
git commit -m "$(cat <<'EOF'
chore: 水まわりの死にコードを掃除する

- fillDestroyedCells: production から呼ばれていない（500bd20 で撤廃済み）。
  テストだけが import していた
- waterSimulation の「余剰を上の行へ持ち上げる」枝: water[] は1セル
  MAX_WATER_MASS が上限なので sumMass が容量を超えず、到達不能だった
- 水源の停止ガード2つは構造的に成立しない。挙動は変えず、意図的に
  止めていないことをコメントに明記した

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0141FA4BzStkStuX4aRVE1FN
EOF
)"
```

---

### Task 8: 仕上げの確認とユーザーへの引き渡し

- [ ] **Step 1: 全テストを流す**

```bash
npm test 2>&1 | tail -12
```

期待: `fail 0`。件数は変更前の 1944 から、削除したぶんと追加したぶんで動く。

- [ ] **Step 2: 未コミットの変更が `main.js` の1行だけであることを確認する**

```bash
git status --short
git diff src/js/main.js
```

期待: `M src/js/main.js` のみで、差分は `debugStartMission` の1行だけ。
**それ以外が出たら、意図しない変更なので調べる。**

- [ ] **Step 3: 実機確認の依頼をまとめる**

ユーザーに以下を伝える。

- **ハードリロード（Cmd+Shift+R）が要る**（`index.html` が `main.js?v=1.0` で
  キャッシュを効かせているため、忘れると「効いていない」と誤解される）
- 見ていただく点:
  1. **軽くなったか** — 4面で敵が多い場面、特に**グレネードを長押しして軌道を
     出しながら**水辺で動いたときのカクつき
  2. **縦縞が消えたか** — 湖底のブロックをグレネードで壊したとき。湖を貫く縦の筋と、
     水面の線が途切れて揺れる現象が出ないこと
  3. **滝の見た目が変わっていないか** — 天井の水源から落ちる滝は変更前と同じに
     見えるはず
- 調整用の定数は今回追加していない（判定ルールの変更のみ）
- 次の段の候補: 滝の太さを水量に比例させる（指摘4）、横方向の拡散の調整弁（指摘2）、
  滝が点線に見える問題

---

## Self-Review

**Spec coverage:**

| 設計書の節 | 対応するタスク |
|---|---|
| §1 データ構造（`waterKind` / `waterSurfaceY`、`waterSurface` 廃止） | Task 4 Step 1-2 |
| §2 滝の判定をルールC に | Task 1 Step 3（`isFallingCell`） |
| §3 更新の仕掛け（dirty 列、`onWaterChanged` に相乗り） | Task 4 Step 3 |
| §4 問い合わせ側（O(1) 化、`getWaterSurfaceSegment` 削除） | Task 4 Step 4、Task 5 Step 2-3 |
| §5 死にコードの掃除 | Task 7 |
| テスト（参照実装との突き合わせ、爆破の回帰、mutation check） | Task 2, Task 3 |
| 実機で見ていただくこと | Task 8 Step 3 |

**詳細化した2点**（遅延再構築、`waterSurfaceRow` 据え置き）は冒頭に明記済み。

**Type consistency:** `waterKind` / `waterSurfaceY` / `dirtyWaterCols` /
`_markWaterDirty` / `_rebuildWaterCacheIfDirty` / `rebuildWaterCache` /
`isFallingCell` / `classifyWaterColumn` / `levelSurfaceSegment` / `makeWaterMap` /
`referenceKindAt` / `referenceSurfaceY` の名前は全タスクで一致。
`rebuildWaterCache` の引数は `{ water, kind, surfaceY, rows, cols, isSolid, dirtyCols }` で統一。

**注意点:** Task 6 は既存テストの状況によって作業量が読めない。落ちたテストの
期待値を変える必要が出たときは、**必ず「なぜ変わったか」をコメントに残す**こと。
期待値を実装から導いてしまうとテストが恒真になる。
