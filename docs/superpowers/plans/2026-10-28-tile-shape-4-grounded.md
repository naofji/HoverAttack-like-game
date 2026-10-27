# タイル形状つき当たり判定 段4（地面に乗るもの）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5面の坂と面取りの上で、地面に乗るもの（地雷・砲台・戦車と敵アタッカーの湧き位置・落ちてくるアイテム・母艦）を形の高さに合わせて置き直す（決定12）。あわせて、ブロックが壊れて形の規則で岩が増えたとき（坂が面取りに戻る）に、自機・戦車・敵アタッカーが岩に埋まらないようにする（段3の最終レビュー I1 の機体版）。5面以外は1フレームも変えない。

**Architecture:** 湧き位置は地形の生成の Step 10 で、形を焼く（`_buildTileShapes`）より前にタイルの上端で決まっている。形を焼いた直後に、床に乗る湧き位置だけを「足の幅の列で一番高い床」へ、天井の砲台を「一番低い天井」へ置き直す（乱数を使わない）。アイテムと母艦は動くので、接地の判定を形の問い合わせに替える（形のあるタイルの近くだけ。段2の機体と同じ作り）。岩が増えて体が埋まったら、段2の `liftOutOfFloor` で真上へ出す。

**Tech Stack:** バニラ ES modules、`node --test`。

**Spec:** `docs/superpowers/specs/2026-10-27-tile-shape-collision-design.md`（決定12、6章「地面に乗るもの」）。段1〜3の計画（`docs/superpowers/plans/2026-10-27-tile-shape-*.md`）と memory `hoverattack-tile-shape-collision`。

**この段に入れないもの:**
- 5面の雪の木・つらら（背景の建物）の置き方。浮いて見えるかは絵が形に置き換わる段5でないと判断できないので、段5で見る。
- 基地・旗・基地の守りの砲台と戦車。基地の部屋の床と台は磨き仕上げ（`BLOCK_INDESTRUCTIBLE`）で削られないので、今のままで床に乗っている。
- ドローン（空中に湧き、段3で形に当たる）。要塞のお宝（7面だけ）。
- 戦車の `onTerrain` がタイル単位、坂の上のホバーの粉雪の高さ（段2からの持ち越し。段5で描画と一緒に）。

## 判断（計画を書く側で決めたこと）

- **止まっている物は、足の幅の中で一番高い床に乗せる**（沈めない）。坂の上の砲台・地雷は下り側が少し浮くが、岩にめり込むより自然で、段5で絵が斜辺になっても破綻しない。足の幅は両端から 2px 内側と中央の3列（`getDefaultCheckPoints` の足の列と同じ考え）。
- 戦車・敵アタッカーの湧き位置も置き直す。重力で坂へ落ちるので無くても動くが、湧いた瞬間に最大 16px 落ちて着地の音と雪煙が出るのを避ける。
- 母艦は戦車と同じく坂を斜辺に沿って上り下りさせる（段差の 3px ずつの持ち上げを、形のあるタイルの近くでは `liftOutOfFloor` に替える）。
- 岩が増えて埋まった体を出す量は最大1タイル（16px）。それより深ければ何もしない（今までの挙動のまま）。

## Global Constraints

- 5面以外（`map.tileShapeRule === 'square'`）の湧き位置・軌跡は1フレームも変えない。段2・段3の基準線のテストも緑のまま。
- 期待値の基準線は**変更を入れる前のコード**で記録する。
- 週次の決定性: 置き直しで `game.rng` を消費しない（`tests/MapDeterminism.test.js` も緑）。
- 形の問い合わせは段1〜3の `isSolidPoint` / `rectHitsTerrain` / `terrainTopY` / `terrainBottomY` / `hasShapedTileIn` と段2の `utils/slopeMotion.js` を使う。偽地図は黙って `isSolidAtPixel` に落とさない。
- `Constants.js` と `main.js` にはユーザーの未コミットの変更がある。`git add -A` / `git add .` は使わない。コメントは日本語で「なぜ」。ソース文字列を grep するテストは書かない。変異で赤くなることを確かめる。
- 全テストのゲート: `npm test -- --test-skip-pattern=湧き位置は重複しない`

## Review Focus

1. **床の縁の面取りに半分だけ掛かる湧き位置**（足の片側が崖の上）: 一番高い床に乗り、岩に重ならない（Task 2 の本物の地図での全数検査）。
2. **天井の砲台の上が天井の斜面**: 一番低い天井に付き、岩に重ならない（Task 2）。
3. **坂の上に落ちてきたアイテム**: 斜辺の上で止まり、岩に入らない・浮かない（Task 3）。
4. **母艦で坂を上り下りする・坂の途中で止まる**: 岩に入らず、1フレームで横の移動量＋余裕を超えて上下しない（Task 4）。
5. **立っている坂の下の段が壊れて足元が岩になる**（自機・戦車・敵アタッカー）: 次のフレームで岩の外へ出る（Task 5）。

---

### Task 1: 変更前の基準線を記録する

**Files:**
- Modify: `tools/record-terrain-baseline.mjs`（`recordGrounded()` と `digestGrounded()`、`--grounded` で出力）
- Create: `tests/terrain-shape-grounded-invariance.test.js`

**Interfaces:**
- Produces: `recordGrounded()` → `{ spawns: string[], item: string[], carrier: string[] }`。
  - `spawns`: 本物の地図の面 0〜3・5・6（5面＝level 4 を除く）× 種 1〜3 の、地雷・戦車・敵アタッカー・砲台の湧き位置（`x,y[,isCeiling]`）と、地図を作った後の `game.rng.state`。
  - `item`: 段の地図（`rows()`）で、`MissileKit` を段・床・穴の上から落として接地するまでの `x,y,vy,onGround`。
  - `carrier`: 同じ地図で、自機を載せた（`player.docked = true`）母艦を右へ走らせて段を越え、左へ戻る `x,y,vx,vy`（600 フレーム）。

- [ ] **Step 1: 道具を書き、`node tools/record-terrain-baseline.mjs --grounded` の出力をテストに貼る**（コメント: 段4を入れる前のコード（この計画のコミット）で記録。実装から導かない）
- [ ] **Step 2: 変異で赤くなることを確かめる**（`CARRIER_SPEED` を一時的に変えて FAIL、戻して PASS）
- [ ] **Step 3: Commit** `test: 四角い地形での湧き位置・アイテム・母艦を段4の前の基準線として記録する`

---

### Task 2: 湧き位置を形の高さへ置き直す

**Files:**
- Modify: `src/js/world/Map.js`（`_buildTileShapes()` の直後に `_seatSpawnsOnShapes()`）
- Test: Create `tests/tile-shape-spawn-seat.test.js`

**Interfaces:**
- Produces: `Map.prototype.floorUnder(x, w, yFrom)` → 列 `x+2`・`x+w/2`・`x+w−2` を `yFrom` から1タイル下まで `terrainTopY` で見た一番高い床の y（どの列にも無ければ null）。`Map.prototype.ceilingOver(x, w, yFrom)` → 同じ3列を `yFrom` から1タイル上まで `terrainBottomY` で見た一番低い天井の y。
- Produces: `_seatSpawnsOnShapes()`。`tileShapeRule === 'square'` なら何もしない。地雷・戦車・敵アタッカー・床の砲台は `y = floorUnder(x, w, y + h) − h`、天井の砲台は `y = ceilingOver(x, w, y)`。見つからない・足元に形のあるタイルが無いものは動かさない。幅と高さは各機体の定数（`LANDMINE_*`・`ENEMY_TANK_*`・`PLAYER_*`・`ENEMY_TURRET_*`）。

- [ ] **Step 1: 失敗するテストを書く**
  - `5面の本物の地図で、床に乗る湧き位置はすべて岩に重ならず、足の列のどれかが床にちょうど触れている`（種 1〜6、地雷・戦車・アタッカー・床の砲台の全数。`rectHitsTerrain(x, y, w, h)` が偽、かつ3列のどれかで `terrainTopY(col, y + h − 0.5, y + h + 0.5) === y + h`）。
  - `5面の本物の地図で、天井の砲台はすべて岩に重ならず、天井にちょうど触れている`。
  - `5面の湧き位置のうち、坂か面取りの上のものがある`（置き直しが空振りしていない確認。1つ以上が y を変えている）。
  - `置き直しは乱数を使わない`（5面の地図を作った後の `game.rng.state` が、置き直しを消した場合と同じ。`_seatSpawnsOnShapes` を一時的に空にした Map と比べる）。
- [ ] **Step 2: 走らせて失敗を見る** Expected: FAIL（坂の上の湧き位置が床から浮いている）
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 走らせて通る。Task 1 の基準線と `MapDeterminism` も緑。変異（一番高い床ではなく中央の列だけを見る）で赤**
- [ ] **Step 5: Commit** `feat: 5面の地雷・砲台・戦車・敵アタッカーの湧き位置を、坂と面取りの高さへ置き直す`

---

### Task 3: 落ちてくるアイテムが形の上に止まる

**Files:**
- Modify: `src/js/entities/PickupItem.js`（`_fall`）
- Modify: 手書きの偽地図でアイテムを落としているテスト（`pickup-items.test.js` など。`isSolidPoint` / `terrainTopY` / `hasShapedTileIn` を足す）
- Test: Create `tests/pickup-slope.test.js`

**Interfaces:**
- Consumes: `map.hasShapedTileIn`, `map.isSolidPoint`, `map.terrainTopY`

- [ ] **Step 1: 失敗するテストを書く**（段2の `rampRows()` の坂、`tileShape: 'snowSlope'`）
  - `坂の上に落ちたアイテムは、斜辺の上に止まり、岩に入らない`: 坂の途中の上から落とす → `onGround`、`rectHitsTerrain(x, y, w, h)` が偽、2つの足の列のどちらかで床にちょうど触れる。
  - `床の縁の面取りに落ちたアイテムは、面取りの空中に浮かずに止まる`（足の片方が面取りの上）。
- [ ] **Step 2: 走らせて失敗を見る** Expected: FAIL（タイルの上端で止まって斜辺から浮く）
- [ ] **Step 3: 実装する** 足の2列の近くに形のあるタイルがあるときだけ、2列を `isSolidPoint` で見て、当たったら各列の `terrainTopY(col, 前のフレームの足 − 1, 今の足)` の一番高い床へ合わせる。無ければ今のタイルの上端へのスナップのまま。
- [ ] **Step 4: 走らせて通る（基準線も）。変異（形の側の分岐を消す）で赤**
- [ ] **Step 5: Commit** `feat: 落ちてくるアイテムが5面の坂と面取りの上に、形の高さで止まる`

---

### Task 4: 母艦が坂を斜辺に沿って上り下りする

**Files:**
- Modify: `src/js/entities/Carrier.js`（`_moveAndCollide`・`_collidesWithMap`）
- Modify: 手書きの偽地図で母艦を動かしているテスト（`carrier-lift.test.js`・`carrier-buoyancy.test.js` など）
- Test: Create `tests/carrier-slope.test.js`

**Interfaces:**
- Consumes: `collidesWithTerrain(entity, map, points)`（段2）、`liftOutOfFloor(map, entity, maxLift, pointsFn)` / `floorBelow`（`utils/slopeMotion.js`）、`SLOPE_CLIMB_MARGIN`

- [ ] **Step 1: 失敗するテストを書く**（`rampRows()`。自機を載せて `KeyD` / `KeyA` を押し続ける偽の入力）
  - `母艦は坂を、1フレームで横の移動量＋余裕を超えて上下せずに台地まで上る`（tank-slope.test.js と同じ測り方）。
  - `母艦は坂を下りるあいだ岩に入らず、坂の下まで着く`。
  - `母艦は坂の途中で止まっても岩に入らない`（入力を離して 120 フレーム、毎フレーム `collidesWithTerrain` が偽）。
- [ ] **Step 2: 走らせて失敗を見る** Expected: FAIL（3px ずつ持ち上げる段差の手順で、1フレームの上下が大きい／斜辺から浮く）
- [ ] **Step 3: 実装する** `_collidesWithMap` を `collidesWithTerrain`（点を渡すので点だけ）に。横に当たったとき、形のあるタイルの近くなら `liftOutOfFloor(map, this, |dx| + SLOPE_CLIMB_MARGIN, 母艦の点)` で持ち上げ、無理なら今までの段差の手順。縦に落ちて当たったとき、形のあるタイルの近くなら `liftOutOfFloor` で斜辺へ合わせ、無理なら今のタイルの上端へのスナップ。下りは前のフレームに接地していて横に動いたなら `floorBelow` で斜辺へ下ろす（戦車の下りの吸着と同じ）。
- [ ] **Step 4: 走らせて通る（基準線も）。変異（持ち上げ・吸着をそれぞれ外す）で赤**
- [ ] **Step 5: Commit** `feat: 母艦が5面の坂を斜辺に沿って上り下りする`

---

### Task 5: 壊れて岩が増えても、機体が埋まらない

**Files:**
- Modify: `src/js/entities/slopeBody.js`（`_popOutOfRock()` を足す）、`src/js/entities/Player.js` と `src/js/entities/attacker/collision.js`（`_moveAndCollide` の冒頭で呼ぶ）、`src/js/entities/EnemyTank.js`（同じことを戦車の点で）
- Test: Create `tests/body-pop-out.test.js`

**Interfaces:**
- Produces: `SlopeBody._popOutOfRock()` → 体の近くに形のあるタイルがあり、体が岩に入っていれば `liftOutOfFloor(map, this, TILE_SIZE, this._slopePoints)` だけ真上へ出す。出せなければ何もしない。戻り値 boolean。

- [ ] **Step 1: 失敗するテストを書く**
  - `立っている坂の下の段が壊れて足元が岩になっても、自機は次のフレームで岩の外に出る`: `rampRows()` の坂に立たせ、下の段を壊した地図（段3の `rampRowsWithout(17, 12)` と同じ作り）に差し替える。前提: 差し替えた直後に `collidesWithTerrain` が真。1 フレーム後に偽。
  - 同じことを敵アタッカーと戦車で。
  - `本物の5面の地図で、機体の周りのブロックをでたらめに壊しても、岩の中で終わるフレームが無い`: 段2の `terrain-shape-real-map.test.js` と同じ乱数の飛び回りに、20 フレームごとに自機の足元の周り（3×3 タイル）の壊せるブロックを1つ `damageBlock(r, c, 99)` で壊すのを足す。岩の中で終わったフレームを数えて 0。
- [ ] **Step 2: 走らせて失敗を見る**
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 走らせて通る（段2・段3の基準線も）。変異（`_popOutOfRock` を呼ばない）で赤**
- [ ] **Step 5: 全テスト** Run: `npm test -- --test-skip-pattern=湧き位置は重複しない` Expected: 0 fail
- [ ] **Step 6: Commit** `fix: 壊れて形が作り直され岩が増えても、自機・敵アタッカー・戦車が岩に埋まらない`
