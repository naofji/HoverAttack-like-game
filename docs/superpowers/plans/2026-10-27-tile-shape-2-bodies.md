# タイル形状つき当たり判定 段2（自機・敵アタッカー・戦車）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 自機・敵アタッカー・戦車が5面の坂と面取りの「形」で地形に当たるようにする。地上では押せば上れて離すと滑り落ち、空中で斜面に当たれば沿って滑る。5面以外の軌跡は1フレームも変えない。

**Architecture:** 3機体とも「体の周りの数点が岩に入るか」の点判定（`utils/Physics.js` の `collidesWithMap`）で動いている。点判定を形の問い合わせ `map.isSolidPoint` に替えた `collidesWithTerrain` を足し、形のあるタイル（満ちでも空でもないタイル）に触れているときだけ、坂の持ち上げ・吸着・斜辺への着地・天井の斜面での押し戻しを行う。触れていなければ今までのタイル単位の手順をそのまま通るので、5面以外（形のあるタイルが1枚も無い）では同じ軌跡になる。坂の判定は `stairDirection` / `plateTipDirection` から、形から読む `map.floorSlopeAt` に置き換え、自機の描画オフセットは外す。

**Tech Stack:** バニラ ES modules、`node --test`。

**Spec:** `docs/superpowers/specs/2026-10-27-tile-shape-collision-design.md`（決定3・6・7・11）。段1の計画 `docs/superpowers/plans/2026-10-27-tile-shape-1-foundation.md` と、その最終レビューの持ち越し（memory `hoverattack-tile-shape-collision`）。

**この段に入れないもの:** 弾・ドローン・母艦（段3・段4）、地形の描画の置き換えと `stairDirection` の撤去（段5。5面の絵は段5まで旧来の坂・くの字のまま）。

## Global Constraints

- 5面以外（`map.tileShapeRule === 'square'`）の軌跡は1フレームも変えない。`tests/environment-land-invariance.test.js` も緑のまま。
- 期待値の基準線は**変更を入れる前のコード**で記録する（実装から導かない）。
- 形を見る問い合わせは段1の `tileShapeAt` / `isSolidPoint` / `rectHitsTerrain` / `terrainTopY` / `terrainBottomY` を使う。滑りや反射の向きを機体ごとに導出しない（形から向きを読む関数は `tileShape.js` に1つ）。
- 偽地図は黙って `isSolid` に落とさない。`tests/helpers/enemy-world.js` の `makeMap` が形の表を持つようにする。
- 坂の符号は今の `slopeDir` と同じ: **+1 = 右へ上る**、-1 = 左へ上る。
- 新しい数値は `Constants.js`（`SLOPE_CLIMB_MARGIN`、`SLOPE_DEFLECT`）。`Constants.js` にはユーザーの未コミットの整形があるので、自分のハンクだけを HEAD に当てたパッチで `git apply --cached` する。
- `git add -A` / `git add .` は使わない。コメントは日本語で「なぜ」。ソース文字列を grep するテストは書かない。変異で赤くなることを確かめる。
- 全テストのゲート: `npm test -- --test-skip-pattern=湧き位置は重複しない`

## Review Focus

1. **坂の上端・下端のつなぎ目**（坂から平らな床へ、平らな床から坂へ）: 1フレームで |vx|+1px を超えて上下しない・空中に出ない（Task 4 のテスト）。
2. **坂の途中で止まって入力を離す**: 吸着したまま滑り落ち、着地と離陸を繰り返さない（Task 4・5）。
3. **形のあるタイルの隣の、ただの四角い壁**（5面にも四角い壁はある）: 今までどおり止まる／1段なら乗り上げる（Task 4 のテスト）。
4. **天井の斜面に頭から当たる**（ホバーで上昇中）: 斜辺の外へ押し出され、震えずに横へ流れる（Task 4）。
5. **偽地図・本物の地図の両方**で、形の表が無いときに問い合わせが例外を出す: `makeMap` と Map の両方に表がある前提を全テストで通す（Task 2・全体のゲート）。

---

### Task 1: 変更前の軌跡を基準線として記録する

**Files:**
- Create: `tools/record-terrain-baseline.mjs`
- Create: `tests/terrain-shape-invariance.test.js`

**Interfaces:**
- Produces: `record()`（`tools/record-terrain-baseline.mjs` の export）→ `{ player: string[], attacker: string[], tank: string[] }`。各要素は1フレームの状態を `x,y,vx,vy,onGround` を小数3桁に丸めて `|` でつないだ文字列。

- [ ] **Step 1: 道具を書く**

`tools/record-motion-baseline.mjs` と同じ作りで、`makeMap` の ASCII 地図（四角だけ）に次を入れる: 高さ1と高さ2の段、低い天井（頭がぶつかる）、幅2の穴、壁。自機は入力の台本（右へ歩く→段を乗り上げる→W でバースト・ホバーして天井に当たる→離して落ちる→左へ歩いて穴に落ちる→右へ）で 900 フレーム。敵アタッカー（`makeAttacker`、`'heavy'`）と戦車も同じ地図で 600 フレーム。敵アタッカーの AI は `Math.random` を使うので、記録の間だけ `Math.random` を `SeededRNG(1)` の `next` に差し替え、終わったら戻す。全フレームを記録する（チェックポイントでは差を見落とす）。

- [ ] **Step 2: 変更前のコードで走らせ、出力をテストに貼る**

Run: `node -e "import('./tools/record-terrain-baseline.mjs').then(m => console.log(JSON.stringify(m.record())))"  > <scratchpad>/terrain-baseline.json`（リポジトリの外に書く）
`tests/terrain-shape-invariance.test.js` に、文字列配列そのものではなく**各列の SHA-256**（`node:crypto`）と長さを `BASELINE` として貼り、`record()` の結果と一致することを確かめるテストにする（全フレームの文字列を貼ると数千行になるため）。冒頭のコメントに「変更前のコードで記録した値。実装から導かない。係数を入れた後は走らせない」と書く。

- [ ] **Step 3: 通ることを確かめる**

Run: `npm test -- tests/terrain-shape-invariance.test.js`
Expected: PASS

- [ ] **Step 4: 敏感さを確かめる**

`Player._moveHorizontalIntoMap` の乗り上げ（`this.y -= TILE_SIZE`）を一時的に `TILE_SIZE - 1` にすると player が、`attacker/collision.js` の着地のスナップを1px ずらすと attacker が、`EnemyTank._moveAndCollide` の着地の `- 0.01` を外すと tank が、それぞれ赤くなることを確かめて戻す。

- [ ] **Step 5: コミット**

```bash
git add tools/record-terrain-baseline.mjs tests/terrain-shape-invariance.test.js
git commit -m "test: 形つき当たり判定の前に、四角い地形での自機・アタッカー・戦車の全フレームの軌跡を基準線に記録"
```

---

### Task 2: 坂の向きの問い合わせと、形の表を持つ偽地図

**Files:**
- Modify: `src/js/utils/tileShape.js`、`src/js/world/Map.js`（Collision Helpers の形の節）、`tests/helpers/enemy-world.js`
- Test: `tests/tile-shape-slope.test.js`

**Interfaces:**
- Produces:
  - `shapeFloorSlope(code, lx) -> -1|0|1`（列 lx の上面の傾き。+1 = 右へ上る）／`shapeCeilingSlope(code, lx) -> -1|0|1`（列 lx の下面の傾き。+1 = 右へ下がる＝右ほど天井が低い）
  - `map.floorSlopeAt(x, y) -> -1|0|1`（床の上面の点 (x, y) を含むタイル `floor(y/16)` の、列 x での上面の傾き）
  - `map.ceilingSlopeAt(x, y) -> -1|0|1`（天井の下面の点。タイルは `ceil(y/16) - 1`）
  - `map.hasShapedTileIn(x, y, w, h) -> boolean`（半開矩形に掛かるタイルに、満ちでも空でもない形が1枚でもあるか。`tileShapeRule === 'square'` なら即 false）
  - `makeMap(rows, waterRows, { tileShape } = {})`: `tileShape` を `'square'`（既定）か `'snowSlope'` で受け、`'#'` を岩・範囲外を磨き仕上げとして `computeTileShape` で `tileShapes` を焼き、`tileShapeRule` を持つ。`tileShapeAt` / `isSolidPoint` / `rectHitsTerrain` / `terrainTopY` / `terrainBottomY` / `floorSlopeAt` / `ceilingSlopeAt` / `hasShapedTileIn` は `Map.prototype` の同名メソッドを借りる（`Map.js` は DOM 無しで import できることを確認済み）。

- [ ] **Step 1: 失敗するテストを書く**

`tests/tile-shape-slope.test.js`:
- `shapeFloorSlope`: 右へ上る段 `packShape(E, TL, TL, F)` は全列 +1、左へ上る段は -1、左上の小さい面取り `packShape(TL, F, F, F)` は lx < 8 で +1・lx ≧ 8 で 0、満ちは 0。
- `shapeCeilingSlope`: 天井の段 `packShape(BL, F, E, BL)` は +1、その鏡像 `packShape(F, BR, BR, E)` は -1、満ちは 0。
- `makeMap(rows, null, { tileShape: 'snowSlope' })` の階段で `floorSlopeAt(段の上面の点)` が段の向き、平らな床で 0。`makeMap(rows)`（既定）では同じ階段でも 0 で、`hasShapedTileIn` は常に false。
- `ceilingSlopeAt` は天井の下端がタイル境目ちょうど（満ちのタイルの下端）でも、その上のタイルを見て 0 を返す（下のタイルを見て範囲外や空を読まない）。

- [ ] **Step 2: 失敗を確かめる**

Run: `npm test -- tests/tile-shape-slope.test.js`
Expected: FAIL（関数が無い）

- [ ] **Step 3: 実装する**

`shapeFloorSlope` は列の上端がある象限（`shapeTopY` と同じ選び方）の三角が `NO_TL` なら +1、`NO_TR` なら -1、それ以外 0。`shapeCeilingSlope` は下端がある象限の三角が `NO_BL` なら +1、`NO_BR` なら -1。

- [ ] **Step 4: 通ることを確かめ、全テストを走らせる**

Run: `npm test -- tests/tile-shape-slope.test.js` → PASS。続けて全テストのゲート → 全部 PASS（`makeMap` の変更で既存の48ファイルが落ちないこと。Task 1 の基準線も緑）。

- [ ] **Step 5: 変異で赤くなることを確かめ、コミット**

`shapeFloorSlope` の符号を入れ替える／`ceilingSlopeAt` のタイルを `floor(y/16)` にする、で赤くなることを確かめて戻す。

```bash
git add src/js/utils/tileShape.js src/js/world/Map.js tests/helpers/enemy-world.js tests/tile-shape-slope.test.js
git commit -m "feat: 形から坂の向きを読む問い合わせ。偽地図 makeMap も形の表を持つ"
```

---

### Task 3: 機体の坂の解決（共通の部品）

**Files:**
- Create: `src/js/utils/slopeMotion.js`
- Modify: `src/js/utils/Physics.js`（`collidesWithTerrain` を足す）、`src/js/utils/Constants.js`（`SLOPE_CLIMB_MARGIN = 1`、`SLOPE_DEFLECT = 0.5`。雪の斜面の定数の並びに置く）
- Test: `tests/slope-motion.test.js`

**Interfaces:**
- Produces（`entity` は `x, y, width, height` を持つ。`points` は機体ごとの点判定の点と同じもの）:
  - `collidesWithTerrain(entity, map, customPoints?) -> boolean`（`collidesWithMap` と同じ点で `map.isSolidPoint` を見る）
  - `footXs(entity, inset) -> number[]`（`[x + inset, x + width/2, x + width - inset]`）
  - `liftOutOfFloor(map, entity, points, maxLift, inset) -> number | null`（足の列で `terrainTopY` を見て、体を何 px 持ち上げれば点がすべて岩の外に出るか。0 < 値 ≦ maxLift で、持ち上げた位置で `collidesWithTerrain` が偽のときだけ値を返す。それ以外は null）
  - `dropOutOfCeiling(map, entity, points, maxDrop, inset) -> number | null`（頭の列で `terrainBottomY` を見る鏡像）
  - `floorBelow(map, entity, maxDown, inset) -> number | null`（足の列それぞれで `terrainTopY(fx, y+h, y+h+maxDown)` の最小値。見つからなければ null）
  - `ceilingAbove(map, entity, maxUp, inset) -> number | null`（頭の列で `terrainBottomY(fx, y, y-maxUp)` の最大値）
- 定数: `SLOPE_CLIMB_MARGIN`（px。坂の持ち上げ・吸着で、1フレームの横移動量に足す余裕）、`SLOPE_DEFLECT`（縦の速さのうち、斜辺に当たったとき斜辺に沿う横の速さへ移す割合。45度の斜辺へ速度を射影すると半分になるので 0.5）。

- [ ] **Step 1: 失敗するテストを書く**

`tests/slope-motion.test.js`（`makeMap(..., { tileShape: 'snowSlope' })` の右へ上る階段）:
- 足が斜辺に 3px めり込んだ箱で `liftOutOfFloor(…, maxLift=4)` が 3、`maxLift=2` で null。持ち上げた先で頭が天井に当たる箱では null。
- 天井の斜面に頭が 2px めり込んだ箱で `dropOutOfCeiling` が 2。
- 斜辺の 5px 上に浮いた箱で `floorBelow(maxDown=6)` が斜辺の y（足の列のうち最も高い面）、`maxDown=4` で null。
- 平らな床（四角）の上でも `floorBelow` は床の y を返す（形のあるタイルかどうかに関係なく使える）。
- `collidesWithTerrain` は斜辺の上の空中の点では偽、`collidesWithMap` は同じ点で真（タイル単位なので）。

- [ ] **Step 2: 失敗を確かめる** — Run: `npm test -- tests/slope-motion.test.js` → FAIL

- [ ] **Step 3: 実装する** — `slopeMotion.js` は純関数だけ（機体の状態を書き換えない。呼んだ側が y を動かす）。

- [ ] **Step 4: 通ることを確かめる** — Run: `npm test -- tests/slope-motion.test.js` → PASS

- [ ] **Step 5: 変異で赤くなることを確かめ、コミット**

`liftOutOfFloor` の「持ち上げた先で当たらない」確認を外す／`floorBelow` の最小を最大にする、で赤くなることを確かめて戻す。`Constants.js` は自分のハンクだけ。

```bash
git add src/js/utils/slopeMotion.js src/js/utils/Physics.js tests/slope-motion.test.js
git apply --cached <自分のハンクだけのパッチ>   # Constants.js
git commit -m "feat: 機体を坂から押し出す・坂へ吸着する共通の部品（形の点判定 collidesWithTerrain）"
```

---

### Task 4: 自機

**Files:**
- Modify: `src/js/entities/Player.js`（`_applySnowSlope`、`_moveHorizontalIntoMap`、`_landOnMapOrHitCeiling`、`_probeGroundBelowFeet`、`_collidesWithMap`、描画オフセット `drawOffsetY` まわり、`respawn`）
- Modify: `tests/environment-snow-motion.test.js`（自機の坂と板の先端のテストを、`makeMap(..., { tileShape: 'snowSlope' })` の地図に置き換える）
- Test: `tests/player-slope.test.js`

**Interfaces:**
- Consumes: Task 2・3 のすべて。
- Produces: `player.slopeDir`（意味は今と同じ。形から読む）。`plateDir`・`slopeCoyote`・`drawOffsetY` は無くなる。

手順（形のあるタイルに触れているか＝ `map.hasShapedTileIn(x - |dx| - 1, y - |dy| - 1, w + 2|dx| + 2, h + 2|dy| + 2)` が偽なら、各段とも今のコードをそのまま通す）:

- **点判定**: `_collidesWithMap` を `collidesWithTerrain` にする（四角い地形では同じ答え。段1で証明済み）。
- **横（`_moveHorizontalIntoMap`）**: 当たったら、乗り上げ（1タイル）より先に `liftOutOfFloor(maxLift = |dx| + SLOPE_CLIMB_MARGIN)` を試し、駄目なら `dropOutOfCeiling(同じ)` を試す。どちらかが効けば y だけ動かして vx は保つ（地上では坂を上る、空中では上へ／下へ逸れる＝決定11）。どちらも駄目なら今の乗り上げ・停止。
- **縦（`_landOnMapOrHitCeiling`）**: 着地で形のあるタイルに触れていれば、y を `floorBelow` で見つけた斜辺へ（タイル境界へのスナップの代わり）。着地点の `floorSlopeAt` が 0 でなければ `vx += -slope * vy * SLOPE_DEFLECT`（下り方向へ流す）。天井なら `ceilingAbove` の下面 + 0.01 へ、`ceilingSlopeAt` が 0 でなければ `vx += -slope * |vy| * SLOPE_DEFLECT`（斜面の開いた側へ流す）。スタンの判定は今のまま。
- **吸着（`_probeGroundBelowFeet`）**: 階段の吸着（`slopeDir` と `TILE_SIZE + 1` 下の探査）を外し、「前のフレームに地形に接地していて、vy ≧ 0 で、形のあるタイルに触れている」なら `floorBelow(maxDown = |dx| + SLOPE_CLIMB_MARGIN)` へ下ろして接地のままにする（坂を下るあいだ空中に出ない。崖の縁は面取りが 8px なので、その先の垂直の落差には届かず落ちる）。
- **坂の加速（`_applySnowSlope`）**: 接地していれば `slopeDir = map.floorSlopeAt(足の中心 x, y + h)`。上りの最高速の制限と下りの加速は今の定数のまま。板の先端（`plateTipDirection`・`PLATE_TIP_SLIDE_ACCEL`）は外す（面取りも坂として読まれる）。`motion.slide === 0` で何もしない条件は残す（5面は雪なので常に滑る。将来、雪でない面に坂を置いたときの挙動は決めていない）。
- **描画オフセット**: 足が斜辺に乗るので `slopeDrawOffset` / `plateDrawOffset` による `drawOffsetY` を外す（決定3）。

- [ ] **Step 1: 失敗するテストを書く**

`tests/player-slope.test.js`（`makeMap(..., { tileShape: 'snowSlope' })`、`game.env` は雪。地図は「平らな床 → 右へ上る10段の坂 → 平らな床」と、「浮いた2ブロックの板」「天井の斜面」の3つ）:
- 坂の上り: D を押し続けると、坂のあいだずっと `onGround`、1フレームの上昇は `|vx| + SLOPE_CLIMB_MARGIN` 以下、坂の上の床まで着く。地上のフレームの |vx| は `PLAYER_MAX_SPEED * SLOPE_UPHILL_SCALE` 以下。
- 坂の途中で離す: 下り向きに vx が増え、坂の下の床に着くまで `onGround` が途切れない。
- 足が斜辺に乗っている: 坂の上で接地しているフレームは毎回、足の列のうち最も高い `terrainTopY` と `y + height` の差が 0.5px 以内。
- つなぎ目: 坂の下端と上端を越えるフレームで、1フレームの上下が `|vx| + SLOPE_CLIMB_MARGIN` 以下。
- 空中で坂の側面へ横から当たる: 低空ホバーで右へ飛んで坂に当たると、止まらず（vx > 0 のまま）上へ逸れる。
- 天井の斜面へ上昇して当たる: 斜辺の外へ押し出され、開いた側へ vx が付き、続く10フレームで頭が岩に入らない。
- 板の先端: 浮いた板の左のタイルの、面取りの上に立って入力なし → 左へ滑って落ちる。
- 5面の四角い壁（坂の隣）: 右へ歩いて高さ3の四角い壁に当たると止まる。高さ1の四角い段は今までどおり乗り上げる。
- 平らな床では滑らない: 入力なしで vx が 0 のまま。
- `respawn` のあとは `slopeDir` が 0。

- [ ] **Step 2: 失敗を確かめる** — Run: `npm test -- tests/player-slope.test.js` → FAIL（坂を上れず止まる、など）

- [ ] **Step 3: 上の手順どおり実装する。`tests/environment-snow-motion.test.js` の自機の坂・板の先端・吸着のテストを新しい地図に置き換え、`slopeCoyote` / `plateDir` / `drawOffsetY` を見ていたところを外す**

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test -- tests/player-slope.test.js tests/environment-snow-motion.test.js tests/terrain-shape-invariance.test.js tests/environment-land-invariance.test.js`
Expected: PASS（基準線が player も含めて一致）

- [ ] **Step 5: 変異で赤くなることを確かめ、コミット**

吸着を外す（坂を下るあいだ空中に出る）／`liftOutOfFloor` を外す（坂で止まる）／`SLOPE_DEFLECT` の符号を逆にする（天井で閉じた側へ流れる）、で赤くなることを確かめて戻す。

```bash
git add src/js/entities/Player.js tests/player-slope.test.js tests/environment-snow-motion.test.js
git commit -m "feat: 自機が坂と面取りの形で地形に当たる（押せば上り離すと滑る、空中は斜面に沿って逸れる）。描画オフセットを外す"
```

---

### Task 5: 敵アタッカー

**Files:**
- Modify: `src/js/entities/attacker/collision.js`（自機と同じ4か所）、`src/js/entities/attacker/movement.js` か `EnemyAttacker.js` の `update()`（坂の加速を AI が vx を決めた後に掛ける）
- Test: `tests/attacker-slope.test.js`

**Interfaces:**
- Consumes: Task 2・3。自機（Task 4）と同じ手順・同じ定数。
- Produces: `attacker.slopeDir`（自機と同じ意味）。

崖の確認（`map.isSolidAtPixel(frontX, feetY)`）は `isSolidPoint` にする（坂の下りで前が「崖」と誤判定されないように。四角い地形では同じ答え）。坂の加速は自機の `_applySnowSlope` と同じ規則（接地中、`floorSlopeAt`、上りの最高速の制限・下りの加速、`motion.slide === 0` なら何もしない）を、AI が vx を決めた後に掛ける。

- [ ] **Step 1: 失敗するテストを書く** — `tests/attacker-slope.test.js`: Task 4 と同じ坂の地図で、(a) 巡回で坂を上り下りするあいだ `onGround` が途切れず1フレームの上下が `|vx| + SLOPE_CLIMB_MARGIN` 以下（1タイルの乗り上げで 16px 跳ばない）、(b) 坂の途中で止まる AI（vx 0）にすると下りへ滑る、(c) 坂の下りで崖と誤判定して引き返さない。`Math.random` は SeededRNG に差し替える。

- [ ] **Step 2: 失敗を確かめる** — Run: `npm test -- tests/attacker-slope.test.js` → FAIL

- [ ] **Step 3: 実装する**

- [ ] **Step 4: 通ることを確かめる** — Run: `npm test -- tests/attacker-slope.test.js tests/enemy-snow-slide.test.js tests/terrain-shape-invariance.test.js` → PASS

- [ ] **Step 5: 変異で赤くなることを確かめ、コミット**

```bash
git add src/js/entities/attacker/collision.js src/js/entities/attacker/movement.js src/js/entities/EnemyAttacker.js tests/attacker-slope.test.js
git commit -m "feat: 敵アタッカーも坂と面取りの形で地形に当たり、坂で滑る"
```

---

### Task 6: 戦車

**Files:**
- Modify: `src/js/entities/EnemyTank.js`（`_applySnowSlope`、`_moveAndCollide` の行き先の判断・横・縦、`_collidesWithMap`）
- Modify: `tests/environment-snow-motion.test.js` と `tests/enemy-snow-slide.test.js` の戦車の坂のテストを新しい地図に
- Test: `tests/tank-slope.test.js`

**Interfaces:**
- Consumes: Task 2・3。

戦車は行き先をタイルの中心で判断し、前が1段高ければ 16px 持ち上げて進む。形のあるタイルに触れているときは、この判断で「前のタイルが坂（`floorSlopeAt` が進む向きに上る）」なら**まっすぐ進む**扱いにし、横の移動のあとで `liftOutOfFloor` で持ち上げる。下りは自機と同じ吸着（戦車は `grounded` を毎フレーム冒頭で見ているので、それを「前のフレームに接地」として使う）。着地は `floorBelow` の斜辺へ。坂の加速は `stairDirection` を `floorSlopeAt` に替えるだけ（今の「下りへ押す」挙動のまま）。

- [ ] **Step 1: 失敗するテストを書く** — `tests/tank-slope.test.js`: 坂の地図で巡回する戦車が、1フレームで `|vx| + SLOPE_CLIMB_MARGIN` を超えて上下せず坂を上り下りする（16px の瞬間移動が無い）、坂の上で下りへ押される、坂の脇の四角い高さ2の壁では今までどおり引き返す。

- [ ] **Step 2: 失敗を確かめる** — Run: `npm test -- tests/tank-slope.test.js` → FAIL

- [ ] **Step 3: 実装し、既存の戦車の坂のテストを新しい地図に置き換える**

- [ ] **Step 4: 通ることを確かめる** — Run: `npm test -- tests/tank-slope.test.js tests/enemy-snow-slide.test.js tests/environment-snow-motion.test.js tests/terrain-shape-invariance.test.js` → PASS

- [ ] **Step 5: 変異で赤くなることを確かめ、コミット**

```bash
git add src/js/entities/EnemyTank.js tests/tank-slope.test.js tests/enemy-snow-slide.test.js tests/environment-snow-motion.test.js
git commit -m "feat: 戦車も坂を形どおりに上り下りする（1段の瞬間移動をしない）"
```

---

### Task 7: 使われなくなったものを外す

**Files:**
- Modify: `src/js/utils/slope.js`（`slopeDrawOffset`・`plateTipDirection`・`plateDrawOffset`・`supportColumn` を消す。`stairDirection` は Map の描画が段5まで使うので残し、冒頭のコメントを「描画だけが使う。段5で消す」に書き換える）
- Modify: `src/js/utils/surface.js`（`groundSlopeDirection` を `map.floorSlopeAt` で書き直す。ホバーの雪煙の向きが形と一致する）
- Modify: `src/js/utils/Constants.js`（`PLATE_TIP_SLIDE_ACCEL`・`SLOPE_SNAP_COYOTE` を消す。自分のハンクだけ）
- Modify: `tests/slope.test.js`・`tests/surface.test.js`（消した関数のテストを消し、`groundSlopeDirection` のテストを形の地図に）

- [ ] **Step 1: `groundSlopeDirection` のテストを形の地図で書き直し、失敗を確かめる**（四角い `makeMap` の階段では 0、`snowSlope` の階段では段の向き）
- [ ] **Step 2: 実装し、消す関数・定数を消す。`grep` で参照が残っていないことを確かめる（テストではなく作業の確認として）**
- [ ] **Step 3: 全テストのゲートを走らせる** — Expected: 全部 PASS
- [ ] **Step 4: コミット**

```bash
git add src/js/utils/slope.js src/js/utils/surface.js tests/slope.test.js tests/surface.test.js
git apply --cached <自分のハンクだけのパッチ>   # Constants.js
git commit -m "refactor: 形に置き換わった階段・板の先端の判定と描画オフセットを外す"
```

---

## 引き渡し

実機の確認はこの段から要る（5面で自機・アタッカー・戦車の坂の手触り）。ただし**地形の絵は段5まで旧来のまま**なので、床の縁の面取り（判定は 8px、絵は 4〜9px の丸め）など、絵と判定が少しずれて見える所がある、と伝える。調整用の定数: `SLOPE_DOWNHILL_ACCEL`（下りの加速）、`SLOPE_UPHILL_SCALE`（上りの速さ）、`ICE_MAX_SLIDE_SPEED`（滑りの最高速）、`SLOPE_CLIMB_MARGIN`（坂に吸い付く余裕）、`SLOPE_DEFLECT`（斜面に当たったとき横へ流す割合）。ハードリロード（Cmd+Shift+R）が要る。
