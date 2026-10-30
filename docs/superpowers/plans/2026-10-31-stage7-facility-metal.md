# 7面の施設エリア（メタルパネルと金属の斜面） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 7面の要塞の区画の外に「施設エリア」を置き、中の地形をメタルパネルの絵にし、金属の階段を45度の金属の斜面にする。

**Architecture:** 生成は新しい純関数モジュール `world/facility.js`（エリア選び・外周の帯の金属化）と、`snowStairs.js` を一般化した金属の階段。形は `utils/tileShape.js` に規則 `'metalSlope'` を足し、`Map._tileShapeCell` が7面ではエリアの外を `'polished'`（削らない）として渡すことで「エリアの中だけ斜面」を実現する。絵は `world/panelBlocks.js` に薄い板と斜面のパネルを足し、`Map._drawTile` の振り分けを広げる。

**Tech Stack:** バニラ ES modules、canvas 2D、`node --test`。

**Spec:** `docs/superpowers/specs/2026-10-31-stage7-facility-metal-design.md`

## Global Constraints

- 応答・コメントは日本語。コメントは「なぜ」を書く。数値は `src/js/utils/Constants.js` に置き根拠を残す
- 乱数は**派生ストリーム**（`new SeededRNG((this.game.rng.state ^ <定数>) >>> 0)`）。`game.rng` を消費しない（`tests/MapDeterminism.test.js` が通ること）
- 区画の中（`fortressZones` の矩形）・開始の部屋・基地の部屋（`_reservedRects()`）には施設エリアを重ねない
- 本物の金属は `BLOCK_METAL`・HP `METAL_BLOCK_HP`（6）。通常の岩・硬い岩の HP は変えない
- 斜面は45度だけ。8px の小さい面取りは付けない
- 7面の環境は `kind: 'none'`（`motion.slide === 0`）のまま。滑りのコードは足さない
- 描画関数は `fillRect` と多角形（`beginPath/moveTo/lineTo/closePath/fill`）だけ。`clip`・`stroke` は使わない（`tools/render-fortress-scene.mjs` の PixelCanvas で描くため）
- `git add -A` / `git add .` は禁止。`src/js/main.js` の `debugStartMission` と `docs/superpowers/plans/future plans.md` はコミットしない
- テストはミューテーションで赤になることを確かめる。期待値を実装から導かない。ソース文字列を grep しない
- 全テストのゲート: `npm test -- --test-skip-pattern=湧き位置は重複しない`

## Review Focus

1. **施設エリアの外周の帯が、開始から基地までの道を「金属だけ」でふさぐ** → 帯は岩を金属にするだけで空洞は埋めないので、空洞だけを辿って通れた所は通れたまま（Task 1 のテスト）
2. **金属の斜面を壊した後** → 隣の形の作り直し（`_rebuildTileShapesAround`）で斜面が残骸の三角になり、描画も追従する（Task 3・4 のテスト）
3. **斜面の上で入力なしの自機が勝手に動く** → slide 0 なので x が変わらない（Task 3 のテスト）
4. **斜面に止まったグレネードが途中で引っかかる** → 斜面の下まで転がる（Task 3 のテスト）
5. **他の面（特に5面の雪の斜面）が変わる** → 5面の形は従来どおり、1〜4・6面は四角のまま（Task 3 のテスト）

---

### Task 1: 施設エリアを選び、外周の帯を金属にする

**Files:**
- Create: `src/js/world/facility.js`
- Modify: `src/js/utils/Constants.js`（要塞の定数の近く）、`src/js/world/Map.js`（Step 9a の直後に Step 9a2）
- Test: `tests/facility.test.js`

**Interfaces:**
- Produces:
  - `pickFacilityAreas({ rows, cols, excludeRects, rng, count, wMin, wRange, hMin, hRange }) => Array<{r0,r1,c0,c1}>`（互いに重ならず、`excludeRects` と重ならない。置けなければ少なくてよい）
  - `metalizeFacilityBand(grid, blockHP, area) => number`（矩形の縁1層の空でないタイルを `BLOCK_METAL`・`METAL_BLOCK_HP` に。`BLOCK_INDESTRUCTIBLE` は触らない。金属にした数を返す）
  - Map のプロパティ `this.facilityAreas`（配列）と `this.facility`（`Uint8Array(rows*cols)`、エリアの中のタイルが 1）
  - 定数 `FACILITY_AREA_COUNT = 8`、`FACILITY_AREA_W_MIN = 10`、`FACILITY_AREA_W_RANGE = 10`、`FACILITY_AREA_H_MIN = 8`、`FACILITY_AREA_H_RANGE = 6`

- [ ] **Step 1: 失敗するテストを書く**（`tests/facility.test.js`。`before` で `globalThis.document` を偽にする — `tests/electric-floor.test.js` 冒頭と同じ）
  - `pickFacilityAreas は除外矩形と重ならず、互いにも重ならない`（見本の excludeRects で、全ペアの矩形交差なしを assert）
  - `metalizeFacilityBand は縁の岩だけを金属にし、空洞は空洞のまま、内側は触らない`（小さな grid で縁・内側・空洞を並べて期待のグリッドと deepEqual）
  - `実際の7面（SEEDS 1..8）: 施設エリアが 1 個以上あり、区画・_reservedRects() と重ならない`
  - `実際の7面: 帯の空洞は空洞のまま（帯の各タイルについて、帯にする前に空なら後も空）` — 帯の前後を比べるため、`metalizeFacilityBand` を見本 grid にかけた結果で縛る
  - `7面以外では facilityAreas は空、facility は全部 0`
  - `game.rng を消費しない（Map を作った後の game.rng.state が、施設エリアの定数 count を 0 にしたときと同じ）` — `FACILITY_AREA_COUNT` を差し替えられないので、代わりに「7面の Map を2回作って rng.state が一致」かつ `tests/MapDeterminism.test.js` が通ることで縛る

- [ ] **Step 2: 走らせて赤を確認** — `npm test -- tests/facility.test.js` → import エラーで FAIL

- [ ] **Step 3: 実装**
  - `facility.js` は `fortress.js` の `pickFortressZones` と同じ作法（試行回数の上限つきでランダムな矩形を引き、除外と既存に重なれば捨てる）
  - Map: `_generateFacility()` を `_generateFortress()` の直後に `if (this.envTerrain === 'fortress')` で呼ぶ。除外は `[...this._reservedRects(), ...this.fortressZones.map(z => ({ r0: z.r0 - FORTRESS_ZONE_MARGIN, r1: z.r1 + FORTRESS_ZONE_MARGIN, c0: z.c0 - FORTRESS_ZONE_MARGIN, c1: z.c1 + FORTRESS_ZONE_MARGIN }))]`、乱数は `new SeededRNG((this.game.rng.state ^ 0xFAC17E) >>> 0)`。マップの外周2列（磨きの外周）にはみ出さないよう rows/cols から外周を除く
  - `this.facility` / `this.facilityAreas` は7面以外でも空で初期化する（他の面の描画・形が読むため）

- [ ] **Step 4: 緑を確認** — `npm test -- tests/facility.test.js tests/MapDeterminism.test.js` → PASS

- [ ] **Step 5: ミューテーション**（除外を外す／重なり判定を外す／帯で空洞も埋める／内側も金属にする）で赤を確認し、全テストのゲートを通してコミット
  ```bash
  git add src/js/world/facility.js src/js/world/Map.js tests/facility.test.js   # Constants.js は自分の hunk だけ git apply --cached
  git commit -m "feat: 7面の区画の外に施設エリアを置き、外周の帯を金属にする"
  ```

### Task 2: 施設エリアの中に金属の階段を盛る

**Files:**
- Modify: `src/js/world/snowStairs.js`（一般化）、`src/js/world/Map.js`、`src/js/utils/Constants.js`
- Test: `tests/facility.test.js`（追記）、既存の雪の階段のテストは変えずに通ること

**Interfaces:**
- Consumes: Task 1 の `this.facilityAreas`
- Produces:
  - `carveSnowStairs({ ..., block = BLOCK_NORMAL, hp = 1, withinRects = null })` — `withinRects` があれば、段の全セルがどれかの矩形の内側であることを要求する。`block`/`hp` は盛るブロック。既定値で従来と完全に同じ（rng の消費順も同じ）
  - `this.metalStairs`（盛った階段の配列。`carveSnowStairs` の戻り値と同じ形 `{r, c, dir, length}`）
  - 定数 `FACILITY_STAIRS_COUNT = 8`、`FACILITY_STAIRS_LENGTH_MIN = 3`、`FACILITY_STAIRS_LENGTH_RANGE = 3`

- [ ] **Step 1: 失敗するテスト**
  - `withinRects を渡すと、段のセルは全部その矩形の中`（見本 grid）
  - `block/hp を渡すと、盛った段がそのブロック・HP になる`
  - `既定値の carveSnowStairs は従来と同じ結果`（5面の Map の `stairs` を、変更前の値を固定値として持たずに、「block/hp/withinRects を省いた呼び出しと、明示的に BLOCK_NORMAL/1/null を渡した呼び出しが同じ grid を作る」で縛る）
  - `実際の7面: metalStairs が SEEDS の合計で 1 本以上、段はすべて BLOCK_METAL で施設エリアの中`

- [ ] **Step 2: 赤を確認** — `npm test -- tests/facility.test.js`

- [ ] **Step 3: 実装** — Map の `_generateFacility()` の最後で、部屋は `this.rooms` のうち中心が施設エリアの中にあるものに絞り、`excludeRects` は Task 1 と同じ、`withinRects: this.facilityAreas`、`block: BLOCK_METAL, hp: METAL_BLOCK_HP`、乱数は別の派生ストリーム（`^ 0xFAC57A`）

- [ ] **Step 4: 緑と5面の既存テスト** — `npm test -- tests/facility.test.js` と全テストのゲート

- [ ] **Step 5: ミューテーション**（withinRects を無視／block を無視）→ コミット `feat: 7面の施設エリアに金属の階段を盛る`

### Task 3: 形の規則 'metalSlope'（エリアの中だけ45度の斜面、斜面は本物の金属）

**Files:**
- Modify: `src/js/utils/tileShape.js`（`computeTileShape`）、`src/js/world/Map.js`（`_tileShapeCell`、形を焼いた後の金属化）、`src/js/utils/Constants.js`（`STAGE_ENVIRONMENTS` の7面の行に `tileShape: 'metalSlope'`）
- Test: `tests/facility.test.js`（追記）、`tests/tile-shape-map.test.js` が7面を四角と仮定していれば直す

**Interfaces:**
- Consumes: Task 1 の `this.facility`
- Produces:
  - `computeTileShape(cellAt, r, c, 'metalSlope')`: self が `'rock'` のときだけ削る。`snowSlope` の4つの「斜め（タイル1枚ぶん）」の分岐だけを使い、8px の小さい面取りは入れない。斜めの条件を満たさなければ `SHAPE_FULL`
  - `Map._tileShapeCell(r, c)`: 規則が `'metalSlope'` のとき、空でないタイルは `this.facility` が 1 なら `'rock'`（金属も含む）、0 なら `'polished'`
  - `Map._metalizeFacilitySlopes()`: `_buildTileShapes()` の直後に7面だけ呼ぶ。施設エリアの中で形が `SHAPE_FULL` でも `SHAPE_EMPTY` でもないタイルを `BLOCK_METAL`・`METAL_BLOCK_HP` にする（形は変わらない）

- [ ] **Step 1: 失敗するテスト**
  - `metalSlope: 1段ずつの階段の段が45度の斜面になる`（`computeTileShape` を見本の cellAt で。期待の形は `packShape` で手書き：左上が開いた段なら TL=Q_EMPTY, TR=Q_TRI_NO_TL, BL=Q_TRI_NO_TL, BR=Q_FULL）
  - `metalSlope: 床の縁・浮いた板の先は削らない（SHAPE_FULL）`（snowSlope なら面取りになる配置で、metalSlope は SHAPE_FULL）
  - `metalSlope: 'polished' は削らない`
  - `実際の7面: 削れたタイルは全部施設エリアの中で、全部 BLOCK_METAL`
  - `実際の7面: 施設エリアの中に斜面が 1 枚以上ある`（SEEDS の合計）
  - `5面の形は変わらない`（5面の Map の `tileShapes` を、規則 `'snowSlope'` で `computeTileShape` を直接回した結果と比べる）と `1〜4・6面は全部 SHAPE_FULL か SHAPE_EMPTY`
  - `7面の斜面で、入力なしの自機は横に動かない`（`tests/helpers/enemy-world.js` の `makeMap(rows, null, { tileShape: 'metalSlope' })` が規則を受けるなら使う。受けなければ `tileShape` オプションに `'metalSlope'` を通す小改修を Task に含める。`Player` を斜面の上に置き、`motion` は `LAND_MOTION`、60 tick 回して x の変化が 0.5px 未満）
  - `7面の斜面で、グレネードは下へ転がり落ちる`（同じ地図で `stepGrenade` を斜面の上端の少し上から vx=0 で落とし、200 tick 後に x が斜面の下る向きへ 1 タイル以上進み、y が開始より下）
  - `金属の斜面を壊すと、隣の形が作り直される`（`damageBlock` で斜面の金属を壊し切り、`tileShapes` の隣が変わる＝空になったタイルは SHAPE_EMPTY、上の段は残骸の形に）

- [ ] **Step 2: 赤を確認**

- [ ] **Step 3: 実装**（上の Interfaces どおり）

- [ ] **Step 4: 緑と全テストのゲート**

- [ ] **Step 5: ミューテーション**（小さい面取りを入れる／`_tileShapeCell` でエリアの外も 'rock'／金属化を外す／7面の行の tileShape を外す）→ コミット `feat: 7面の施設エリアの段を45度の金属の斜面にする`

### Task 4: 描画（薄い板・装甲板・斜面の金属パネル）

**Files:**
- Modify: `src/js/world/panelBlocks.js`、`src/js/world/Map.js`（`_drawTile` / `_drawPanelBlock`）、`tools/render-fortress-scene.mjs`（`--facility N` で施設エリアを描けるように）
- Test: `tests/facility.test.js`（追記。`tests/helpers/fake-ctx.js`）

**Interfaces:**
- Consumes: `this.facility`、`tileShapeAt(r, c)`、`shapeTriangle(code)` / `shapeCornerCuts(code)`（`tileShape.js`）
- Produces:
  - `drawPlatePanel(ctx, x, y, S, { fill, exp, rng })` — 通常の岩の「艶のない薄い板」。圧延の筋（白い横線）を**描かない**ことで金属と見分ける。継ぎ目は `drawMetalPanel` と同じく空洞に面していない辺だけ
  - `drawMetalPanel` / `drawArmorPanel` / `drawPlatePanel` に省略可能な `shape`（`tileShapeAt` のコード）を足す。`SHAPE_FULL` 以外なら、矩形の代わりに形の多角形（`Map._drawRockyBlock` と同じ頂点の列挙）で地を塗り、斜辺に沿って明るい1px の帯（多角形）を引く。筋・リベット・ボルトは多角形の外に出る分を描かない（象限の判定 `shapeContainsPoint` で間引く）
  - `Map._drawTile`: 7面で `this.facility` が 1 のタイルは、`BLOCK_METAL` → 金属、`BLOCK_HARD` → 装甲板、`BLOCK_NORMAL` → 薄い板。区画の印（`this.fortress`）の振り分けは今のまま

- [ ] **Step 1: 失敗するテスト**
  - `施設エリアの通常の岩は薄い板で描かれ、エリアの外の通常の岩は今までどおり岩で描かれる`（Map のメソッドを差し替えて呼ばれた方を記録）
  - `施設エリアの硬い岩は装甲板、金属は金属パネル`
  - `薄い板は圧延の筋（rgba(255,255,255,… の 1px 高の横線）を描かず、金属パネルは描く`（fake ctx の fillRect と直前の fillStyle で判定）
  - `斜面のパネルは形の外へ塗らない`（左上が開いた斜面のタイルで、fill のパスの頂点がすべて形の中か斜辺上。fillRect の矩形の中心がすべて `shapeContainsPoint` で岩）
- [ ] **Step 2: 赤を確認**
- [ ] **Step 3: 実装**
- [ ] **Step 4: 緑、全テストのゲート、PNG で目視**（`node tools/render-fortress-scene.mjs --seed 3 --facility 0 --scale 3 --out <scratchpad>/f.png` を Read で見る）
- [ ] **Step 5: ミューテーション**（振り分けを外す／筋を薄い板にも描く／斜面で矩形を塗る）→ コミット `feat: 7面の施設エリアをメタルパネル・装甲板・薄い板と金属の斜面で描く`

### Task 5: 量の実測と引き渡し

**Files:**
- Modify: 必要なら `src/js/utils/Constants.js` の `FACILITY_*`、設計メモに実測値を追記

- [ ] **Step 1: 実測** — SEEDS 1..8 で、施設エリアの数・区画の外の空でないタイルのうちエリアに入った割合・本物の金属になったタイル数（帯／斜面別）・斜面の枚数を数えて表にする（一時スクリプトは scratchpad に置く）
- [ ] **Step 2: 判断** — 割合が 10% 未満なら少なすぎ、40% 超なら多すぎとして `FACILITY_AREA_COUNT` を調整し、根拠をコメントに残す
- [ ] **Step 3: 全テストのゲートを通し、設計メモに実測表を追記してコミット** `tune: 7面の施設エリアの量を実測で決める`
- [ ] **Step 4: 引き渡し** — 実機で見る点と定数の対応表（設計メモの表）と、ハードリロード（Cmd+Shift+R）を伝える
