# タイル形状つき当たり判定 段1（形の規則と問い合わせ）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** タイルごとの「4象限の形」を周囲の岩の並びから決めて Map に焼き、壊れたら周りを作り直し、形で当てる問い合わせ（点・矩形・床と天井の高さ）を用意する。この段ではまだ誰も新しい問い合わせを使わない（挙動は全面で不変）。

**Architecture:** 形の符号化と規則と幾何は純関数の `src/js/utils/tileShape.js`。面ごとの規則は `STAGE_ENVIRONMENTS` の新しい列 `tileShape`（表に1列）で選ぶ。Map は生成の最後に `tileShapes`（Uint16Array）を焼き、`damageBlock` で壊れたタイルの 3×3 を焼き直し、問い合わせメソッドを持つ。

**Tech Stack:** バニラ ES modules、`node --test`。

**Spec:** `docs/superpowers/specs/2026-10-27-tile-shape-collision-design.md`

**この段の後に続く計画（別ファイルで書く）:** 段2 自機・戦車・敵アタッカー（地上の坂と空中の滑り）／段3 弾・ミサイル・レーザー・ドローン・グレネード・反射ビーム・跳弾／段4 地面に乗るものの置き直し／段5 5面の描画の置き換えと旧特例（`stairDirection` の坂・chevron・`slopeDrawOffset`/`plateDrawOffset`）の撤去。

## Global Constraints

- TILE_SIZE = 16、象限は 8px×8px。角度は45度だけ。
- 斜面を作るのは5面（`STAGE_ENVIRONMENTS[4]`、`kind: 'snow'`）だけ。他の面の形は常に「満ち」。
- 磨き仕上げのブロック（`BLOCK_INDESTRUCTIBLE`、`BLOCK_METAL`）は5面でも削らない。隣から見れば岩。
- 形の計算で乱数を使わない（`game.rng` も派生ストリームも）。週次の決定性（`tests/MapDeterminism.test.js`）を守る。
- `Map.isSolid` / `isSolidAtPixel` は変えない（「タイルのどこかに岩がある」の意味で残す）。
- 5面以外では、新しい問い合わせが今のタイル単位の判定と**完全に同じ結果**を返す。
- マジックナンバーは `Constants.js`。コメントは日本語で「なぜ」。`git add -A` / `git add .` は使わない（`src/js/utils/Constants.js` にはユーザーの未コミットの変更がある。自分のハンクだけ `git add -p` で）。
- ソース文字列を grep するテストは書かない。テストは壊すと赤くなることを確かめる。
- 全テストのゲート: `npm test -- --test-skip-pattern=湧き位置は重複しない`

## Review Focus

1. **地図の外・NaN の座標**: 新しい問い合わせも `isSolid` と同じく「岩」と答える（Task 3 のテストで縛る）。
2. **タイルの境目ちょうどの矩形**（右端・下端が16の倍数）: 隣のタイルに当たったことにしない。半開区間 `[x, x+w)`（Task 2・3 のテストで縛る）。
3. **地図の端や磨き仕上げのブロックの隣でブロックが壊れたとき**: 焼き直しが範囲外を読まない・磨き仕上げは満ちのまま（Task 3）。
4. **`Map.prototype.damageBlock` を偽オブジェクトに bind しているテスト**（`metal-block.test.js` など）: `tileShapes` が無くても落ちない（Task 3。既存の全テストのゲートで確かめる）。
5. **板の両端の三角が上下から削られて自己交差しない**: 1象限に2つの切り込みが重なる組み合わせを作らない（Task 1 の規則のテストで縛る）。

---

### Task 1: 形の符号化と5面の規則

**Files:**
- Create: `src/js/utils/tileShape.js`
- Modify: `src/js/utils/Constants.js`（`STAGE_ENVIRONMENTS` の5面の行に `tileShape: 'snowSlope'` を足し、表の上のコメントに列の意味を書く）
- Test: `tests/tile-shape-rule.test.js`

**Interfaces:**
- Produces:
  - 象限の値 `Q_EMPTY = 0`, `Q_FULL = 1`, `Q_TRI_NO_TL = 2`, `Q_TRI_NO_TR = 3`, `Q_TRI_NO_BL = 4`, `Q_TRI_NO_BR = 5`（「NO_xx」はその象限のその角の側の半分が空）。
  - `packShape(tl, tr, bl, br) -> number`（3bit ずつ、TL が下位）／`unpackShape(code) -> [tl, tr, bl, br]`
  - `SHAPE_EMPTY = packShape(0,0,0,0)`、`SHAPE_FULL = packShape(1,1,1,1)`
  - `computeTileShape(cellAt, r, c, rule) -> number`。`cellAt(r, c)` は `'empty' | 'rock' | 'polished'` を返す（範囲外は呼び出し側が `'polished'` を返す＝外周と同じ扱い）。`rule` は `'square'` か `'snowSlope'`（`undefined` は `'square'`）。

- [ ] **Step 1: 失敗するテストを書く**

`tests/tile-shape-rule.test.js`。ASCII の格子（`#` 岩、`P` 磨き、`.` 空）から `cellAt` を作るヘルパーを置き、次を確かめる（`F`=Q_FULL など。期待値は手で書く。実装から導かない）:

- `'square'`: どの岩も `SHAPE_FULL`、空は `SHAPE_EMPTY`。
- 単独タイル（周り全部空）→ `packShape(NO_TL, NO_TR, NO_BL, NO_BR)`（菱形）。
- 宙に浮いた板 `.##.` の左 → `packShape(NO_TL, F, NO_BL, F)`、右 → `packShape(F, NO_TR, F, NO_BR)`。
- 床の縁（崖の高さ2以上）の上の角 → 小さい面取り: `packShape(NO_TL, F, F, F)`。
- 右へ上る1段ずつの階段（各段の左下の隣が岩、右が岩）→ 各段 `packShape(Q_EMPTY, NO_TL, NO_TL, F)`（タイル1枚ぶんの斜め）。左へ上る階段はその鏡像 `packShape(NO_TR, Q_EMPTY, F, NO_TR)`。
- 平らな床に1段だけの段 → 段が続く（左下が岩）ので斜め。
- 天井側の段（上下反転の階段）→ `packShape(NO_BL, F, Q_EMPTY, NO_BL)` とその鏡像。
- 凹角（内側の角）は削らない: L字の内側のタイルは `SHAPE_FULL`。
- 磨き仕上げ `P` は、周りが全部空でも `SHAPE_FULL`。`P` の隣の岩は、`P` を岩として数える（`P` 側の辺は露出していない）。
- 自己交差しない: 上と左右が露出していて下が岩のタイル（幅1の柱の上端）は、斜めにならず上の2角の小さい面取り `packShape(NO_TL, NO_TR, F, F)`。

- [ ] **Step 2: 失敗を確かめる**

Run: `npm test -- tests/tile-shape-rule.test.js`
Expected: FAIL（`tileShape.js` が無い）

- [ ] **Step 3: `tileShape.js` に符号化と `computeTileShape` を実装する**

規則（`'snowSlope'`、岩のタイルだけ。磨きと空はそれぞれ FULL／EMPTY）:
各角について、その角をはさむ2辺が両方とも空（`'empty'`）なら削る。左上の角を例に:
- **斜め（タイル1枚ぶん）**: 上・左が空、かつ**右と下が空でない**、かつ**左下の斜めの隣 `(r+1, c-1)` が空でない**（段が左下へ続く）。→ TL=EMPTY、TR=NO_TL、BL=NO_TL、BR=FULL。
- それ以外で上・左が空 → **小さい面取り**: TL=NO_TL。
- 他の3角は鏡像（右上は「右下 `(r+1, c+1)`」、左下は「左上 `(r-1, c-1)`」、右下は「右上 `(r-1, c+1)`」を見る）。

「右と下が空でない」を要求するのは、斜めの切り口がほかの角の切り込みと同じ象限に重なって形が表せなくなる（自己交差する）のを防ぐため。今の `_drawRockyBlock` の `if (rampTL) cTR = 0` と同じ問題をこちらは条件で避ける、とコメントに残す。

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test -- tests/tile-shape-rule.test.js`
Expected: PASS

- [ ] **Step 5: わざと壊して赤くなることを確かめる**

「左下が空でない」の条件を外す／磨きの判定を外す、のそれぞれでテストが落ちることを確かめてから戻す。

- [ ] **Step 6: コミット**

```bash
git add src/js/utils/tileShape.js tests/tile-shape-rule.test.js
git add -p src/js/utils/Constants.js   # 自分の tileShape 列のハンクだけ
git commit -m "feat: タイルの形（4象限）の符号化と5面の規則（段が続く角は斜め、それ以外は8pxの面取り）"
```

---

### Task 2: 形の幾何（点・矩形・床と天井の高さ）

**Files:**
- Modify: `src/js/utils/tileShape.js`
- Test: `tests/tile-shape-geometry.test.js`

**Interfaces:**
- Consumes: Task 1 の符号化。
- Produces（座標はタイル内のローカル px、0〜16）:
  - `shapeContainsPoint(code, lx, ly) -> boolean`（`lx, ly` は `[0, 16)`）
  - `shapeOverlapsRect(code, x0, y0, x1, y1) -> boolean`（半開区間 `[x0, x1) × [y0, y1)`、0 ≦ x0 < x1 ≦ 16）
  - `shapeTopY(code, lx) -> number | null`（その列で岩が始まる y。列が空なら null）
  - `shapeBottomY(code, lx) -> number | null`（その列で岩が終わる y。満ちなら 16）

- [ ] **Step 1: 失敗するテストを書く**

`tests/tile-shape-geometry.test.js`:
- `SHAPE_FULL` は全点で真、`SHAPE_EMPTY` は全点で偽。
- 象限の内側の境界: 象限の局所座標 u, v（0〜8）で、`NO_TL` は `u + v >= 8` が岩、`NO_BR` は `u + v <= 8`、`NO_TR` は `v >= u`、`NO_BL` は `u >= v`（斜辺の上は岩）。各象限について斜辺の両側の点を1つずつ確かめる。
- 矩形: 斜めのタイル（右へ上る階段の段）で、斜辺の上の空中に収まる矩形は偽、斜辺を1pxでも越える矩形は真。満ちのタイルで `[0,16)×[0,16)` は真、幅0に近い `[15.9,16)` も真。
- `shapeTopY`: 右へ上る階段の段で `lx = 1 → 15`、`lx = 8 → 8`、`lx = 15 → 1`（斜辺 y = 16 − lx）。小さい面取り `packShape(NO_TL,F,F,F)` で `lx = 2 → 6`、`lx = 12 → 0`。満ちで 0、空で null。
- `shapeBottomY`: 天井側の段 `packShape(NO_BL,F,Q_EMPTY,NO_BL)`（斜辺 y = lx、岩は斜辺の右上）で `lx = 1 → 1`、`lx = 15 → 15`。満ちで 16。
- 総当たり: Task 1 の規則で作れる形すべて（テストの格子から集める）について、0.5px 刻みの全点で `shapeContainsPoint` と `shapeOverlapsRect(lx, ly, lx+0.5, ly+0.5)` が「点が真なら矩形も真」を満たす。

- [ ] **Step 2: 失敗を確かめる**

Run: `npm test -- tests/tile-shape-geometry.test.js`
Expected: FAIL（関数が無い）

- [ ] **Step 3: 実装する**

矩形と三角の交わりは、矩形を象限で切り分けて、象限ごとに斜辺の式の上限・下限で判定する（`NO_TL` なら切った矩形の右下の角の `u1 + v1 > 8` で交わる。半開区間なので上限は届かない値＝厳密な不等号）。他の3つも同じ考え方で決まる。Task 1 の規則が作る形は「正方形の角を削ったもの」で、どの列も岩の部分が1本につながっているので、`shapeTopY` と `shapeBottomY` の2つで列の岩を表せる（とコメントに書く）。

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test -- tests/tile-shape-geometry.test.js`
Expected: PASS

- [ ] **Step 5: わざと壊して赤くなることを確かめる**

`NO_TL` の不等号を `>=` → `>` にする、`shapeTopY` の斜辺を1px ずらす、のそれぞれで落ちることを確かめて戻す。

- [ ] **Step 6: コミット**

```bash
git add src/js/utils/tileShape.js tests/tile-shape-geometry.test.js
git commit -m "feat: タイルの形の幾何（点・矩形の当たりと列の上端・下端）"
```

---

### Task 3: Map に形を焼き、壊れたら焼き直し、問い合わせを足す

**Files:**
- Modify: `src/js/world/Map.js`（生成の `exposedAtGen` の直後・`_initTileCache()` の前で `_buildTileShapes()`、`damageBlock` で `_rebuildTileShapesAround(r, c)`、Collision Helpers 節に問い合わせ）
- Test: `tests/tile-shape-map.test.js`

**Interfaces:**
- Consumes: Task 1・2 のすべて。
- Produces（段2以降が使う）:
  - `map.tileShapeRule`（`'square' | 'snowSlope'`。`STAGE_ENVIRONMENTS[missionLevel % 長さ].tileShape ?? 'square'`）
  - `map.tileShapes`（`Uint16Array(rows * cols)`、添字 `r * cols + c`）
  - `map.tileShapeAt(r, c) -> number`（範囲外・NaN は `SHAPE_FULL`）
  - `map.isSolidPoint(x, y) -> boolean`（ワールド px。範囲外・NaN は真）
  - `map.rectHitsTerrain(x, y, w, h) -> boolean`（ワールド px の半開区間 `[x, x+w) × [y, y+h)`。範囲外のタイルに掛かれば真）
  - `map.terrainTopY(x, yFrom, yTo) -> number | null`（列 x を yFrom から下へ yTo まで見て、最初に岩が始まる y）
  - `map.terrainBottomY(x, yFrom, yTo) -> number | null`（列 x を yFrom から上へ yTo まで見て、最初に岩が終わる y）
  - `map._rebuildTileShapesAround(r, c)`（3×3 を焼き直す。`tileShapes` が無ければ何もしない）

- [ ] **Step 1: 失敗するテストを書く**

`tests/tile-shape-map.test.js`（`MapDeterminism.test.js` と同じ DOM の stub と `new Map({ rng: new SeededRNG(seed) }, missionLevel)` で本物の地図を作る）:
- **5面以外は今と同じ**: missionLevel 0,1,2,3,5,6 の地図それぞれ、seed 2つで:
  - 全タイルで `tileShapeAt` が `isSolid ? SHAPE_FULL : SHAPE_EMPTY`。
  - 乱数で選んだ 2000 点で `isSolidPoint(x, y) === isSolidAtPixel(x, y)`（地図の外とタイルの境目ちょうどの点を必ず含める）。
  - 乱数で選んだ 2000 個の矩形（幅・高さ 1〜40px、境目ちょうどに揃えたものを含む）で `rectHitsTerrain` が、テスト内に書いた参照（列 `floor(x/16)` 〜 `ceil((x+w)/16)-1`、行も同じ、のどれかが `isSolid`）と一致。
  - テストの乱数はテスト用の `SeededRNG` で、地図の `game.rng` とは別。
- **5面**: missionLevel 4 の地図で、斜めのタイル（`Q_EMPTY` の象限を持ち岩でもあるタイル）が `map.stairs` の段の上にある。磨き仕上げのタイルは全部 `SHAPE_FULL`。
- **壊れたら焼き直す**: 5面の地図で、平らな床の上に `.##.` の板ができる場所を探す代わりに、地図の一部を書き換えた小さな地図もどき（`Object.create(Map.prototype)` に `grid`・`blockHP`・`rows`・`cols`・`tileShapeRule = 'snowSlope'`、`_buildTileShapes()` を呼ぶ）で、板の左を `damageBlock(r, c, 99)` で壊すと右が菱形になり、左は `SHAPE_EMPTY`。地図の端（`c = 0` の隣）で壊しても例外を投げない。
- **`tileShapes` の無い偽オブジェクト**に `Map.prototype.damageBlock` を bind して呼んでも例外を投げない。
- **地図の外・NaN**: `isSolidPoint(NaN, 0)`、`isSolidPoint(-1, 10)`、`rectHitsTerrain(-5, 10, 10, 10)` が真。
- `terrainTopY`: 5面の地図もどきの斜めの段の上で、斜辺の高さ（タイルの上端 + `16 − lx`）を返す。岩が無ければ null。
- **乱数を使わない**: 5面の地図を作ったあとの `game.rng.state` が、`_buildTileShapes` を何もしない関数に差し替えて作ったときと同じ。

- [ ] **Step 2: 失敗を確かめる**

Run: `npm test -- tests/tile-shape-map.test.js`
Expected: FAIL（メソッドが無い）

- [ ] **Step 3: 実装する**

`cellAt` は `grid` から `'empty' | 'rock' | 'polished'` を返す（`BLOCK_INDESTRUCTIBLE` と `BLOCK_METAL` が `'polished'`、範囲外も `'polished'`）。問い合わせは、掛かるタイルを列挙して、`tileShapeAt` が FULL ならタイル単位のまま即答し、それ以外だけ `tileShape.js` の幾何を呼ぶ（5面以外は FULL か EMPTY しか無いので、今と同じ速さで同じ答えになる）。`damageBlock` では `invalidateTileRegion` の前で焼き直す（段5で描画がこの表を読むため、描画のキャッシュより先に形が新しくなっている必要がある）。

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test -- tests/tile-shape-map.test.js`
Expected: PASS

- [ ] **Step 5: わざと壊して赤くなることを確かめる**

`damageBlock` の焼き直しを外す／`rectHitsTerrain` の右端を `floor((x+w)/16)` にする（境目で隣に当たる）、のそれぞれで落ちることを確かめて戻す。

- [ ] **Step 6: 全テストを走らせる**

Run: `npm test -- --test-skip-pattern=湧き位置は重複しない`
Expected: 全部 PASS（`MapDeterminism.test.js` を含む）

- [ ] **Step 7: コミット**

```bash
git add src/js/world/Map.js tests/tile-shape-map.test.js
git commit -m "feat: Map にタイルの形を焼き、壊れたら 3x3 を焼き直す。形で当てる問い合わせ（点・矩形・床と天井の高さ）"
```

---

## 引き渡し

この段は挙動を変えないので、実機の確認は要らない。続けて段2の計画（自機・戦車・敵アタッカー）を書く。
