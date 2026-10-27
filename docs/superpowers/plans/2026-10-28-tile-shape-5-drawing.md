# タイル形状つき当たり判定 段5（5面の描画を形に置き換える）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5面の地形の絵を、当たり判定と同じタイルの形（4象限）から描く。旧特例（坂・くの字）と `stairDirection` を撤去し、雪の木・つらら・ホバーの粉雪・戦車の onTerrain を形に合わせる。

**Architecture:** `utils/tileShape.js` に形から角の削り幅を出す純関数 `shapeCornerCuts(code)` を足し、`Map._drawRockyBlock` は形の規則が四角でない面だけ、その削り幅で輪郭の多角形を作る（5面以外は今のコードのまま）。雪のふちは上面の輪郭（上辺と上の2角の切り口）に沿う帯にする。背景の木とつららは、生成時に Map が渡す「列の床／天井の高さ」で置く高さを決める。粉雪の地面探しと戦車の onTerrain は `isSolidPoint`（四角い地形では `isSolidAtPixel` と同じ答え）に移す。

**Tech Stack:** バニラ ES modules、`node --test`、偽 ctx（`tests/helpers/fake-ctx.js`）。

**Spec:** `docs/superpowers/specs/2026-10-27-tile-shape-collision-design.md`（7章「描画」、9章の最後の項）

## Global Constraints

- 5面以外の描画・挙動を変えない（4章「5面以外の規則は常に四角。今の角を丸く削る絵は描画だけの装飾として残す」、7章「5面以外の描画は変えない」）。
- 形の計算で `game.rng` を消費しない（週次の決定性）。木・つららは今の派生ストリームのまま。
- 磨き仕上げ（外周・基地の金属）は5面でも四角のまま（`_drawPolishedBlock` は触らない）。
- 形が作り直されたタイルは描画のキャッシュも作り直す（`damageBlock` は形→`invalidateTileRegion` の順。既に満たしている）。
- テストは壊すと赤くなることを確かめる。ソース文字列を grep しない。全体ゲートは `npm test -- --test-skip-pattern=湧き位置は重複しない`。
- `git add -A` / `git add .` を使わない（main.js・Constants.js にユーザーの未コミットの変更）。

## Review Focus

1. 5面で、壊した後に形が変わったタイルの絵が判定とずれる（キャッシュの作り直し漏れ）→ Task 2 の本物の地図のテストで、壊した後も全タイルを確かめる。
2. 5面の輪郭が自己交差する、または1象限に三角が2つ入る形で崩れる → Task 2 の点の内外の総当たりで捕まえる。
3. 5面以外の絵が1つでも変わる → Task 1 の基準線。
4. 木・つららを下げたことで「岩に埋まりすぎ」の判定に落ちて、坂の上の木が大量に消える → Task 4 で本数を数えて比べる。
5. 粉雪の地面探しを形に移したことで、5面以外の雪煙が変わる → 5面以外の面には形が無いので答えが同じ（Task 5 のテストで四角い地図の値を縛る）。

---

### Task 1: 5面以外の描画の基準線

**Files:**
- Modify: `tools/record-terrain-baseline.mjs`（`recordDrawing()` / `digestDrawing()`、`--drawing`）
- Test: `tests/terrain-shape-drawing-invariance.test.js`

**Interfaces:**
- Produces: `digestDrawing(): Promise<{ cache: string, damaged: string }>`（SHA-256）

- [ ] **Step 1:** 計画のコミット（このファイルだけのコミット）のコードで `recordDrawing()` を書く。偽 ctx の document を差し込み、level 0,1,2,3,5,6 × seed 1,2 の Map を作り、`tileCacheCtx` の呼び出し（名前・引数・プロパティ代入）をすべて文字列にする（`cache`）。続けて各地図で岩のタイル 20 個（行列の決まった刻みで拾う）に `damageBlock(r, c, 99)` をかけ、その後の呼び出しを `damaged` に記録する。
- [ ] **Step 2:** `node tools/record-terrain-baseline.mjs --drawing` の出力をテストの BASELINE に貼る。テストは `digestDrawing()` と比べる。
- [ ] **Step 3:** 壊して赤くなることを確かめる（`_drawRockyBlock` の面取りの乱数の幅 `* 6` を `* 5` に一時的に変える → 赤、戻す → 緑）。
- [ ] **Step 4:** コミット。

### Task 2: 5面の地形を形から描く

**Files:**
- Modify: `src/js/utils/tileShape.js`（`shapeCornerCuts`）
- Modify: `src/js/world/Map.js`（`_drawRockyBlock` の雪の分岐）
- Rewrite: `tests/environment-snow-shape.test.js`
- Test: `tests/tile-shape-corner-cuts.test.js`、`tests/snow-drawing-matches-shape.test.js`

**Interfaces:**
- Produces: `shapeCornerCuts(code): { tl, tr, bl, br }`。各値は 0（削らない）・8（小さい面取り）・16（タイル1枚ぶんの斜め）。
  - その角の象限が空なら 16、その角を向いた三角（左上なら `Q_TRI_NO_TL`）なら 8、それ以外は 0。

- [ ] **Step 1: 失敗するテスト（純関数）。** `shapeCornerCuts`: 満ち→全部0、菱形（単独タイル）→全部8、板の左「<=」→ tl=8, bl=8, 他0、右上がりの坂（段の真ん中）→ tl=16, 他0、天井の坂（下の左が空）→ bl=16。形は `computeTileShape` に小さな格子を渡して作る。
- [ ] **Step 2:** 赤を確かめる → 実装 → 緑。
- [ ] **Step 3: 失敗するテスト（絵と形の一致）。** `snow-drawing-matches-shape.test.js`:
  - 本物の5面（level 4、seed 1・2）の Map を偽 ctx で作り、岩のタイル（磨き仕上げ以外）ごとに `_drawRockyBlock` を呼んで最初の多角形（ベース塗り）を取り出す。
  - タイル内の 1px 刻みの点の中心（lx+0.5, ly+0.5）が多角形の内側か（偶奇則）を、`shapeContainsPoint(code, lx+0.5, ly+0.5)` と比べ、**全タイル・全点で一致**すること。
  - 続けて岩のタイルを 30 個壊し（`damageBlock(r, c, 99)`）、壊したタイルの 3×3 も同じく一致すること（キャッシュの作り直しが形を読む順序）。
  - 雪のふち: 生成時に上が露出していた坂のタイルでは `SNOW_CAP_COLOR` の stroke が斜辺の上（(x, y+16)→(x+16, y) または鏡像）を通る。小さい面取りの角のあるタイルでは帯が切り口の線分を通る。
- [ ] **Step 4:** 赤を確かめる（今の絵は小さい面取りが 4〜9px のばらつきなので一致しない）。
- [ ] **Step 5: 実装。** `_drawRockyBlock` の雪の分岐を、`this.tileShapeRule !== 'square' && this.tileShapes` のときだけ `shapeCornerCuts(this.tileShapeAt(r, c))` の値で `cTL/cTR/cBR/cBL` を置き換える形にする（5面以外は乱数の面取りのまま）。くの字・坂の特例の多角形は消す（形の削り幅だけで輪郭が出る: 菱形・「<=」・坂・天井の坂）。雪のふちは、上面の輪郭（`(0, cTL)→(cTL, 0)→(S−cTR, 0)→(S, cTR)`）を線幅 `SNOW_CAP_THICKNESS * 2` で stroke する（clip の内側に残る半分が厚み）。四角のときの `fillRect` 帯は5面以外では元々描かれない（`envKind === 'snow'` の条件）ので、5面の帯をすべて stroke に揃える。
- [ ] **Step 6:** `environment-snow-shape.test.js` を新しい約束に書き直す: 段の真ん中は坂、1段の崖の足元・階段の端の段は小さい面取り（8px）、くの字は「<=」の5頂点、5面以外の同じ段は乱数の面取り（4〜9px）のまま。
- [ ] **Step 7:** 緑を確かめ、壊して赤くなることを確かめる（`shapeCornerCuts` の 16 を 8 にする等）→ コミット。

### Task 3: `stairDirection` の撤去

**Files:**
- Delete: `src/js/utils/slope.js`、`tests/slope.test.js`
- Modify: `src/js/world/Map.js`（import を消す）、`tests/snow-stairs.test.js`

- [ ] **Step 1:** `snow-stairs.test.js` の最初のテストを「盛った階段の真ん中の段の形が、`s.dir` の向きの坂（`shapeFloorSlope(code, 4) === s.dir` かつ `shapeFloorSlope(code, 12) === s.dir`）になる」に書き換える（形は `computeTileShape` に world の格子を渡して作る）。赤くなることを確かめる（`s.dir` を `-s.dir` にする）。
- [ ] **Step 2:** slope.js とそのテストを消し、Map.js の import を消す。`grep -rn "stairDirection\|slope.js'" src tests tools` で残りが無いこと。全体ゲート緑。
- [ ] **Step 3:** コミット。

### Task 4: 雪の木とつららを形の高さに置く

**Files:**
- Modify: `src/js/world/town/generateSnowTrees.js`、`generateIcicles.js`（引数 `floorY` / `ceilingY`）
- Modify: `src/js/world/Map.js`（`_buildSnowTreeSpecs` / `_buildIcicleSpecs` が渡す）
- Test: `tests/snow-props-seat.test.js`

**Interfaces:**
- Produces:
  - `generateSnowTrees({ ..., floorY })`。`floorY(x, r): number` は列 x の、行 r のタイルから下へ1タイルまでの岩の上端の y。既定は `(x, r) => r * T`（四角）。
  - `generateIcicles({ ..., ceilingY })`。`ceilingY(x, r): number` は列 x の、行 r のタイルから上へ1タイルまでの岩の下端の y。既定は `(x, r) => (r + 1) * T`。
  - Map は `terrainTopY(x, r*T, (r+2)*T)` / `terrainBottomY(x, (r+1)*T, (r-1)*T)` で渡す（null は既定の値）。

- [ ] **Step 1: 失敗するテスト。** 本物の5面（level 4、seed 1〜3）で、
  - 木: 根元（`x + footX` から右へ 4px）の左右端 +0.5 の2列で、`map.terrainTopY` の床の上端が、木の下端 `y + h` から `TOWN_FOUNDATION_SINK` を引いた高さ以上（＝根元が床から浮かない）。
  - つらら: 上端の左右（x+1, x+w−1）と中心の3列で、天井の下端 `terrainBottomY` が `y + CH` 以下（＝根元が天井から浮かない）。
  - 5面の木・つららの本数が、今の本数の 90% 以上（坂の上の木が「埋まりすぎ」で消えない）。今の本数は計画のコミットで数えてテストに書く。
- [ ] **Step 2:** 赤を確かめる。
- [ ] **Step 3: 実装。** 木は根元の2列の `floorY` の**低い方**（大きい y）＋ `TOWN_FOUNDATION_SINK` を地面にする（高い方に合わせると低い側が浮く。町は地形の奥に描くので高い側の埋まりは見えない）。つららは3列の `ceilingY` の**高い方**（小さい y）− CH を上端にする。
- [ ] **Step 4:** 緑。四角の地図（既存の generateSnowTrees / generateIcicles のテスト）が変わらないこと。壊して赤くなることを確かめる（低い方→高い方）→ コミット。

### Task 5: ホバーの粉雪の高さと戦車の onTerrain を形で見る

**Files:**
- Modify: `src/js/utils/surface.js`（`groundClearance` が `isSolidPoint`、`groundSlopeDirection` のコメント）
- Modify: `src/js/entities/EnemyTank.js`（onTerrain）
- Modify: `tests/surface.test.js`（偽の world に `isSolidPoint`）
- Test: `tests/slope-mist-and-tank-terrain.test.js`

- [ ] **Step 1: 失敗するテスト。** `makeMap`（形の表を持つ）で右上がりの坂を作り、
  - 中心の列の斜辺の上 10px でホバーする機体の `groundClearance(e, game, 32)` が 8〜12（4px 刻み）。今はタイルの上端で見つかって小さくなる。
  - 坂の上で、両端のプローブの列とも斜辺より 4px 以上浮いている戦車は `onTerrain === false`、斜辺に乗っていれば true。
- [ ] **Step 2:** 赤を確かめる → 実装（`map.isSolidPoint` に置き換え。偽の world には `isSolidPoint` を足す。黙って `isSolidAtPixel` に落とす分岐は作らない）→ 緑。
- [ ] **Step 3:** 全体ゲート緑。壊して赤くなることを確かめる → コミット。

### Task 6: 仕上げ

- [ ] memory（hoverattack-tile-shape-collision.md）の更新、全体ゲート、最終レビュー（opus の別エージェント）。
