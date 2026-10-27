# タイル形状つき当たり判定 段3（飛び道具）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 地形に当たる飛び道具（自機・敵の弾、自機のミサイル、敵の追尾ミサイル・巡航ミサイル、ドローン、グレネード、反射ビーム）が、5面の坂と面取りの「形」で地形に当たるようにする。削れた空中は素通りし、斜辺で止まる・爆発する。反射ビームとグレネードは斜辺の法線で斜めに跳ね返り、グレネードは坂を転がり落ちる。5面以外の軌跡は1フレームも変えない。

**Architecture:** 点で当たる飛び道具は `map.isSolidAtPixel` / `map.isSolid(tile)` を段1の `map.isSolidPoint` に、矩形で当たる巡航ミサイルは `map.rectHitsTerrain` に替える（四角い地形では同じ答え）。跳ね返るもの（反射ビーム・グレネード）は、新しい問い合わせ `map.slopeHitAlong(x0, y0, x1, y1)` で「この1フレームの移動で最初に触れた岩が斜辺か」を調べ、斜辺ならその法線で反射する。斜辺でなければ今までの「x だけ・y だけ動かして当たる軸を見る」手順をそのまま通るので、形のあるタイルが無い面では同じ結果になる。グレネードは本体（`Grenade.update`）と照準の軌道予測（`CombatActions._calcGrenadeTrajectory`）で物理が二重に書かれているので、先に1つの純関数へまとめてから斜辺を足す。

**Tech Stack:** バニラ ES modules、`node --test`。

**Spec:** `docs/superpowers/specs/2026-10-27-tile-shape-collision-design.md`（決定6・10、6章「弾」「反射ビーム・跳弾」「グレネード」）。段1・段2の計画 `docs/superpowers/plans/2026-10-27-tile-shape-1-foundation.md` / `-2-bodies.md` と memory `hoverattack-tile-shape-collision`。

**この段に入れないもの:**
- 地面に乗るもの（アイテム・地雷・砲台・母艦など）の置き直し（段4）。地形の描画の置き換えと `stairDirection` の撤去（段5）。
- `entities/ricochet.js` の跳弾。調べたところ、これは**装甲に当たった MG の演出**で地形には当たらない（地形で跳ねる弾はこの作りに無い）。決定10の「跳弾」は斜辺で跳ね返る飛び道具＝反射ビームとグレネードとして扱う（下の「判断」）。
- `BaseLaser`（地形を素通りする作り）、薬莢・破片・粒子（決定6で対象外）、見通しの判定（`hasLineOfSight`・`EnemyBase._hasLineOfSight`・`obstacleAvoidance`・アタッカーの射線探し）。見通しは面取りの空中を「見えない」と答えるだけで、撃った弾は形で飛ぶので、遊びで食い違いは出ない。

## 判断（計画を書く側で決めたこと）

- **斜辺の法線は (±1, ±1) の符号の組で持つ**（正規化しない）。45度の斜辺しか無いので、完全な反射は `vx' = −vy·sx·sy, vy' = −vx·sx·sy` になり、反射ビームの速さが反射のたびに浮動小数の誤差でずれない。
- **「最初に触れた岩」は 1px 刻みで線分をたどって探す**（形のあるタイルの近くだけ）。グレネードは最大 6px/フレーム、反射ビームは 5px/フレームで動くので、移動先の点だけを見ると斜辺を通り越して下の満ちた象限に入り、平らな床として跳ね返ってしまう。
- **グレネードの坂の上の転がりは今の摩擦 `GRENADE_FRICTION` をそのまま使う**。新しい定数は足さない（重力の斜面方向の成分が毎フレーム加わるので、摩擦で頭打ちになった速さで転がり落ちる。実機で速すぎ・遅すぎなら定数を分ける）。
- 反射ビームが水面境界と斜辺に同じフレームで当たる場合は斜辺を優先する（水面の境と斜辺が 5px 以内で重なる所はほぼ無い）。

## Global Constraints

- 5面以外（`map.tileShapeRule === 'square'`）の軌跡は1フレームも変えない。段2の `tests/terrain-shape-invariance.test.js` も緑のまま。
- 期待値の基準線は**変更を入れる前のコード**で記録する（実装から導かない）。
- 形を見る問い合わせは段1の `isSolidPoint` / `rectHitsTerrain` / `hasShapedTileIn` と、この段で足す `slopeHitAlong` だけを使う。斜辺の向きを飛び道具ごとに導出しない（形から法線を読む関数は `tileShape.js` に1つ）。
- 偽地図は黙って `isSolidAtPixel` に落とさない（memory `silent-fallback-hides-bugs`）。手書きの偽地図には `isSolidPoint` / `slopeHitAlong` を足す。`map.slopeHitAlong ? … : null` のような存在確認のフォールバックは書かない。
- 新しい数値を足すなら `Constants.js`。`Constants.js` と `main.js` にはユーザーの未コミットの変更があるので、自分のハンクだけを HEAD に当てたパッチで `git apply --cached` する。
- `git add -A` / `git add .` は使わない。コメントは日本語で「なぜ」。ソース文字列を grep するテストは書かない。変異で赤くなることを確かめる。
- 週次の決定性: 飛び道具の物理で `game.rng` を消費しない（乱数は使わない）。
- 全テストのゲート: `npm test -- --test-skip-pattern=湧き位置は重複しない`

## Review Focus

1. **面取りの頂点（斜辺と垂直な面の角）に斜めから入る反射ビーム・グレネード**: 岩の中で終わらず、反射を繰り返して詰まらない（Task 7 の本物の地図での乱射）。
2. **坂の下の V 字（坂と平らな床の境）で止まるグレネード**: 震えず・沈まず止まる（Task 5 のテスト）。
3. **飛んでいる間にブロックが壊れて形が作り直された**: 次のフレームから新しい斜辺で跳ね返る（Task 2 のテスト。`damageBlock` 後の `slopeHitAlong`）。
4. **浮いた板の先（くの字）の細い先にミサイルが当たる**: 先の空中では爆発せず、岩に入ったフレームで爆発して、そのタイルを壊す（Task 6）。
5. **照準の軌道予測と実際のグレネードのずれ**: 坂のある地図でも1点も違わない（Task 4・5）。

---

### Task 1: 変更前の飛び道具の軌跡を基準線として記録する

**Files:**
- Modify: `tools/record-terrain-baseline.mjs`（`recordProjectiles()` を足す。`record()` と `digest()` の既存の出力は変えない）
- Create: `tests/terrain-shape-projectile-invariance.test.js`

**Interfaces:**
- Produces: `recordProjectiles()` → `{ grenade: string[], beam: string[], bullet: string[], missile: string[], homing: string[], cruise: string[], drone: string[] }`。各要素は1フレームの状態を小数3桁に丸めて `|` でつないだ文字列（飛び道具は `x,y,vx,vy,alive`、ドローンは `x,y,vx,vy,state,alive`）。`digestProjectiles(rec = recordProjectiles())` は `digest()` と同じ形の要約。

- [ ] **Step 1: 道具を書く**

既存の `rows()` の地図（段・穴・低い天井・壁）を使う。`damageBlock` は段2と同じく何もしない関数に差し替えず、**本物のまま**にする（ミサイルが壊した後の地形も記録に入れるため）。台本:
- グレネード: 自機の位置から角度 −80°〜−10° を 10° 刻み（8本）、`GRENADE_SPEED` と半分の速さの2通りで投げ、寿命まで（`Grenade` 実体）。
- 反射ビーム: 天井・壁・床に当たる角度を 8 本、`stepBeam` を 400 フレーム。
- 弾・ミサイル・追尾ミサイル・巡航ミサイル: それぞれ壁・段・天井に向けて数本、消えるまで。追尾は標的を固定位置に置く。巡航ミサイルは経路を与えず直進させる。
- ドローン: 巡回と体当たり（`state = 'kamikaze'`）を各 600 フレーム。`Math.random` は段2の記録と同じく種つきの乱数に差し替える。

- [ ] **Step 2: 走らせて SHA-256 をテストに貼る**

Run: `node tools/record-terrain-baseline.mjs --projectiles`（引数で `digestProjectiles()` を出す）
Expected: 7列ぶんの `{ frames, sha256 }`。どの列も frames > 0。

テスト `四角い地形での飛び道具の全フレームの軌跡は、段3の前と同じ` に貼る。コメントに「段3を入れる前のコード（`f51744e`）で記録。実装から導かない」と書く。

- [ ] **Step 3: 変異で赤くなることを確かめる**

`GRENADE_BOUNCE` を一時的に 0.21 にして `npm test -- tests/terrain-shape-projectile-invariance.test.js` が FAIL、戻して PASS。

- [ ] **Step 4: Commit**

```bash
git add tools/record-terrain-baseline.mjs tests/terrain-shape-projectile-invariance.test.js
git commit -m "test: 四角い地形での飛び道具の軌跡を段3の前の基準線として記録する"
```

---

### Task 2: 斜辺に触れたかの問い合わせ `slopeHitAlong`

**Files:**
- Modify: `src/js/utils/tileShape.js`
- Modify: `src/js/world/Map.js`（形の問い合わせの節）
- Modify: `tests/helpers/enemy-world.js`（`makeMap` が新しい問い合わせも Map.prototype から借りる）
- Test: `tests/tile-shape-geometry.test.js`, `tests/tile-shape-map.test.js`

**Interfaces:**
- Produces: `hypotenuseNormal(code, lx, ly, px, py)`（`tileShape.js`）→ `{ sx: ±1, sy: ±1 } | null`。(lx, ly) はタイル内の岩の点、(px, py) は同じタイル基準の直前の空の点。(lx, ly) が三角の象限にあり、(px, py) がその斜辺の直線の開いた側にあるとき、外向きの法線の符号の組を返す。`Q_TRI_NO_TL` → (−1, −1)、`Q_TRI_NO_TR` → (+1, −1)、`Q_TRI_NO_BL` → (−1, +1)、`Q_TRI_NO_BR` → (+1, +1)。開いた側の判定は象限内の (u, v) で `quadContains` の逆（NO_TL: u+v < 8、NO_BR: u+v > 8、NO_TR: v < u、NO_BL: u < v）。直線の延長上で見るので (px, py) は象限の外でもよい。
- Produces: `Map.prototype.slopeHitAlong(x0, y0, x1, y1)` → `{ x, y, sx, sy } | null`。`tileShapeRule === 'square'`、または線分の外接矩形（1px 広げる）に `hasShapedTileIn` が偽なら即 null。そうでなければ (x0, y0) から (x1, y1) へ `ceil(長さ)` 等分（最低1）でたどり、最初に `isSolidPoint` が真になった点 s とその直前の点 q で `hypotenuseNormal` を引く。法線があれば `{ x: q.x, y: q.y, sx, sy }`（q は触れる直前の空の点）、最初に触れたのが斜辺でなければ null。始点が岩の中なら null。

- [ ] **Step 1: 失敗するテストを書く**

`tile-shape-geometry.test.js`:
- `hypotenuseNormal は三角の象限の点と開いた側の点で外向きの法線を返す`: 4種の三角それぞれで、象限の中の岩の点と開いた側の点 → 上の符号の組。
- `hypotenuseNormal は満ちた象限・開いた側に無い直前の点では null`: 満ちの象限の点 → null。NO_TL の岩の点と、直線の岩の側にある直前の点（右の垂直な面から入った）→ null。

`tile-shape-map.test.js`（`makeMap(rows, null, { tileShape: 'snowSlope' })` の 45度の坂。段2の `rampRows()` と同じ地図）:
- `slopeHitAlong は斜辺へ真下に落ちる線分で、触れる直前の点と右へ上る坂の法線 (−1, −1) を返す`。
- `slopeHitAlong は斜辺を通り越して下の満ちた象限まで届く線分でも、斜辺で止まる`（6px の線分で、終点が満ちた象限）。
- `slopeHitAlong は平らな床に当たる線分では null`。
- `四角い地形の slopeHitAlong はどの線分でも null`（`tileShape: 'square'` の地図で格子状に線分を総当たり）。
- `ブロックが壊れて形が作り直されると、次の slopeHitAlong は新しい斜辺の法線を返す`（`damageBlock` で台地の角を壊し、その下に新しくできた面取りへ線分を当てる）。

- [ ] **Step 2: 走らせて失敗を見る**

Run: `npm test -- tests/tile-shape-geometry.test.js tests/tile-shape-map.test.js`
Expected: FAIL（`hypotenuseNormal is not a function` / `slopeHitAlong is not a function`）

- [ ] **Step 3: 実装する**（Interfaces のとおり。`makeMap` の借りる一覧に `slopeHitAlong` を足す）

- [ ] **Step 4: 走らせて通るのを見る。変異（法線の符号を1つ入れ替える、たどる刻みを1等分にする）で赤くなるのを見る**

Run: `npm test -- tests/tile-shape-geometry.test.js tests/tile-shape-map.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/js/utils/tileShape.js src/js/world/Map.js tests/helpers/enemy-world.js tests/tile-shape-geometry.test.js tests/tile-shape-map.test.js
git commit -m "feat: 1フレームの移動で最初に触れた岩が斜辺かを調べる slopeHitAlong と、斜辺の法線"
```

---

### Task 3: 反射ビームが斜辺の法線で跳ね返る

**Files:**
- Modify: `src/js/utils/beamPath.js`（`stepBeam`）
- Modify: `tests/beam-path.test.js` と、`stepBeam` / `ReflectBeam` に手書きの偽地図を渡しているテスト（`reflect-beam*.test.js`）
- Test: `tests/beam-path.test.js`

**Interfaces:**
- Consumes: `map.slopeHitAlong`, `map.isSolidPoint`（Task 2）
- Produces: `stepBeam(beam, map)` の戻り値は今と同じ形。地図に求めるものが `{ isSolidPoint, slopeHitAlong, isWaterAtPixel? }` になる。

- [ ] **Step 1: 失敗するテストを書く**

- `斜辺に真下から当たった反射ビームは横へ跳ね返る`: 右へ上る坂へ (0, +5) で入る → 反射後 (−5, 0)（法線 (−1, −1)）。`bounced: true`、`waterBounced: false`。
- `斜辺で跳ね返っても速さは REFLECT_BEAM_SPEED のまま変わらない`: 坂を何度も跳ねる部屋で 2000 フレーム、毎フレーム `Math.hypot(vx, vy) === REFLECT_BEAM_SPEED`（許容誤差なし）。
- `斜辺で跳ね返ったビームは岩の中に入らない`: 同じ部屋で毎フレーム `isSolidPoint(x, y) === false`。
- 既存のテストの偽地図に `isSolidPoint`（`isSolidAtPixel` と同じ関数）と `slopeHitAlong: () => null` を足す。

- [ ] **Step 2: 走らせて失敗を見る**

Run: `npm test -- tests/beam-path.test.js`
Expected: FAIL（真下の反射が (0, −5) になる）

- [ ] **Step 3: 実装する**

`isBlocked` の岩の判定を `isSolidPoint` に替える。移動先がふさがっているとき、水面より先に `map.slopeHitAlong(x, y, nx, ny)` を見て、斜辺なら `rvx = −vy·sx·sy, rvy = −vx·sx·sy`、`waterBounced: false`。その後の「元の位置から新しい速度で動かす、抜けられなければ動かさない」は今のまま共通。斜辺でなければ今の軸の手順。ファイル冒頭と `stepBeam` のコメントの「法線は縦か横の2通りしかない」を、斜辺の扱いを含めて書き直す。

- [ ] **Step 4: 走らせて通るのを見る（Task 1 の基準線も）。変異（`sx·sy` の符号を外す）で赤くなるのを見る**

Run: `npm test -- tests/beam-path.test.js tests/reflect-beam.test.js tests/reflect-beam-collision.test.js tests/reflect-beam-sound.test.js tests/terrain-shape-projectile-invariance.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/js/utils/beamPath.js tests/beam-path.test.js tests/reflect-beam*.test.js
git commit -m "feat: 反射ビームが坂と面取りの斜辺で、その法線の向きへ斜めに跳ね返る"
```

---

### Task 4: グレネードの物理を1つの純関数にまとめる（挙動は変えない）

**Files:**
- Create: `src/js/utils/grenadePhysics.js`
- Modify: `src/js/entities/Grenade.js`（`update` の重力〜地形の跳ね返り）
- Modify: `src/js/systems/CombatActions.js`（`_calcGrenadeTrajectory` の同じ部分）
- Test: `tests/grenade-trajectory.test.js`（既存）、Task 1 の基準線

**Interfaces:**
- Produces: `stepGrenade(map, g, motion)`（`grenadePhysics.js`）。`g = { x, y, vx, vy }` を1フレームぶん書き換える（重力・最大落下速度・x の跳ね返り・y の跳ね返りと接地の摩擦）。`motion` は `motionFor` の戻り値。`fallSpeedScaleFor` はこの関数の中で呼ぶ。回転・寿命・画面外・バリアは呼んだ側に残す。

- [ ] **Step 1: 純関数を作り、2か所から呼ぶ**（今の式をそのまま移す。`isSolidAtPixel` のまま）

- [ ] **Step 2: 挙動が変わっていないことを確かめる**

Run: `npm test -- tests/grenade-trajectory.test.js tests/enemy-grenade-terrain.test.js tests/terrain-shape-projectile-invariance.test.js`
Expected: PASS（基準線の grenade 列が同じ SHA-256）

`Grenade.update` 側だけ `GRENADE_FRICTION` を一時的に 0.91 にして、`grenade-trajectory.test.js` と基準線が FAIL することを確かめて戻す（2か所が本当に同じ関数を通るようになったかの確認は、`CombatActions` 側の呼び出しを一時的に消して軌道予測のテストが FAIL することで見る）。

- [ ] **Step 3: Commit**

```bash
git add src/js/utils/grenadePhysics.js src/js/entities/Grenade.js src/js/systems/CombatActions.js
git commit -m "refactor: グレネードの物理を本体と照準の軌道予測で共有する純関数 stepGrenade にまとめる"
```

---

### Task 5: グレネードが斜辺で跳ね返り、坂を転がり落ちる

**Files:**
- Modify: `src/js/utils/grenadePhysics.js`
- Modify: 手書きの偽地図でグレネードを動かしているテスト（`grenade-trajectory.test.js` など。`isSolidPoint` / `slopeHitAlong` を足す）
- Test: Create `tests/grenade-slope.test.js`

**Interfaces:**
- Consumes: `map.slopeHitAlong`, `map.isSolidPoint`（Task 2）、`stepGrenade`（Task 4）

- [ ] **Step 1: 失敗するテストを書く**（段2の `rampRows()` の 45度の坂、`tileShape: 'snowSlope'`）

- `斜辺へ真下に落ちたグレネードは、坂の下り側へ跳ねる`: 坂の真ん中の上から落とす → 最初に跳ねた直後の vx < 0（右へ上る坂なので左が下り）、vy < 0。
- `坂の上に置いたグレネードは、転がり落ちて坂の下の平らな床で止まる`: 寿命の直前で x が坂の下端より左、|vx| < 0.05、床の上（`isSolidPoint(x, y + 1)` が真）。
- `坂を転がっているあいだ、グレネードは岩の中に入らない`: 毎フレーム `isSolidPoint(x, y) === false`。
- `坂の下の V 字で止まったグレネードは、震えない`: 止まってから 60 フレーム、位置の変化が 0.01px 未満。
- `坂のある地図でも、照準の軌道予測は実際のグレネードと1点も違わない`: `_calcGrenadeTrajectory` の点と、同じ条件の `Grenade` 実体の3フレームおきの位置を比べる（`grenade-trajectory.test.js` の既存のテストと同じ形）。

- [ ] **Step 2: 走らせて失敗を見る**

Run: `npm test -- tests/grenade-slope.test.js`
Expected: FAIL（真下に落ちると vx が 0 のまま上へ跳ねる）

- [ ] **Step 3: 実装する**

`stepGrenade` の次の位置を出した直後、x・y の軸の判定より前に `map.slopeHitAlong(x, y, nextX, nextY)` を見る。斜辺なら:
- `d = (vx·sx + vy·sy) / 2`（法線方向の成分 × √2 ÷ √2 を整数の符号の組で書いたもの）。d ≥ 0（離れる向き）なら何もしない。
- 法線方向の速さ `|d|·√2` が今の接地のしきい値 0.5 を超えるなら跳ね返す: `v ← v − (1 + GRENADE_BOUNCE)·d·s`。
- 超えなければ斜面に沿わせて摩擦: `v ← (v − d·s)·GRENADE_FRICTION`。
- 位置は触れる直前の点 `(hit.x, hit.y)`。このフレームの軸の判定は飛ばす。

斜辺でなければ、軸の判定を `isSolidPoint` で今の手順どおり。コメントに「平らな床の接地（vy = 0、vx に摩擦）と同じことを斜面の向きでしている」と書く。

- [ ] **Step 4: 走らせて通るのを見る（Task 1 の基準線も）。変異（跳ね返りの `1 +` を外す、摩擦を外す）で赤くなるのを見る**

Run: `npm test -- tests/grenade-slope.test.js tests/grenade-trajectory.test.js tests/enemy-grenade-terrain.test.js tests/terrain-shape-projectile-invariance.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/js/utils/grenadePhysics.js tests/grenade-slope.test.js tests/grenade-trajectory.test.js
git commit -m "feat: グレネードが坂と面取りの斜辺で法線の向きへ跳ね返り、坂を転がり落ちる"
```

---

### Task 6: 弾・ミサイル・ドローンを形で当てる

**Files:**
- Modify: `src/js/entities/Bullet.js`（地形の判定）
- Modify: `src/js/entities/Missile.js`, `src/js/entities/EnemyHomingMissile.js`（`isSolid(tile)` → `isSolidPoint(x, y)`。壊すのは今のとおりそのタイル）
- Modify: `src/js/entities/EnemyCruiseMissile.js`（外接矩形のタイルの総当たり）
- Modify: `src/js/entities/EnemyDrone.js`（`_collidesWithMap`）
- Modify: これらに手書きの偽地図を渡しているテスト（`isSolidPoint` / `rectHitsTerrain` / `hasShapedTileIn` を足す）
- Test: Create `tests/projectile-shape.test.js`

**Interfaces:**
- Consumes: `map.isSolidPoint`, `map.rectHitsTerrain`, `map.hasShapedTileIn`（段1）、`collidesWithTerrain(entity, map, points)`（段2。点を渡すと点だけで当てる）

- [ ] **Step 1: 失敗するテストを書く**（`makeMap` に、平らな床の縁の 8px の面取りと、浮いた板「<==>」を置いた5面の形の地図）

- `自機の弾は面取りの削れた空中を素通りし、斜辺で消える`: 面取りの三角の空中を通る線で撃つ → 削れた所を過ぎても生きていて、岩に入ったフレームで消える。
- `敵の弾も同じく形で消える`（`EnemyBullet`）。
- `自機のミサイルは面取りの空中では爆発せず、岩に入ったフレームで爆発してそのタイルを壊す`: `damageBlock` の呼び出しを記録して、呼ばれたタイルと、爆発したフレームの位置が `isSolidPoint` 真であること。
- `追尾ミサイルも同じ`（`EnemyHomingMissile`、標的は板の向こう）。
- `巡航ミサイルは板の先の削れた空中をかすめても爆発しない`: 板の先の三角の空中だけに外接矩形が掛かる位置 → 生きている。矩形が岩に掛かる位置 → 爆発。
- `体当たりのドローンは面取りの空中では落ちず、岩に当たると落ちる`: `state = 'kamikaze'` で面取りの空中へ斜めに突っ込ませる。

- [ ] **Step 2: 走らせて失敗を見る**

Run: `npm test -- tests/projectile-shape.test.js`
Expected: FAIL（面取りの空中で消える・爆発する）

- [ ] **Step 3: 実装する**

- 弾・ミサイル・追尾ミサイル: 点の判定を `isSolidPoint(this.x, this.y)` に。壊すタイルは今のとおり `pixelToTile`。
- 巡航ミサイル: 外接矩形 `(x+minX+2, y+minY+2)〜(x+maxX−2, y+maxY−2)` に `hasShapedTileIn` が偽なら今のタイルの総当たり（端のタイルを含む閉区間なので、四角い地形の答えを変えないためにそのまま残す）、真なら `rectHitsTerrain`。コメントに理由（段2の `collidesWithTerrain` と同じ考え）を書く。
- ドローン: `collidesWithMap(this, map, points)` → `collidesWithTerrain(this, map, points)`。

- [ ] **Step 4: 走らせて通るのを見る（Task 1 の基準線も）。変異（各ファイルを1つずつ元の判定へ戻す）でそれぞれのテストが赤くなるのを見る**

Run: `npm test -- tests/projectile-shape.test.js tests/terrain-shape-projectile-invariance.test.js`
Expected: PASS

- [ ] **Step 5: 全テストを通す**

Run: `npm test -- --test-skip-pattern=湧き位置は重複しない`
Expected: 0 fail（偽地図に足りない問い合わせがあれば、そのテストの偽地図に足す。黙って isSolidAtPixel に落とさない）

- [ ] **Step 6: Commit**

```bash
git add src/js/entities/Bullet.js src/js/entities/Missile.js src/js/entities/EnemyHomingMissile.js src/js/entities/EnemyCruiseMissile.js src/js/entities/EnemyDrone.js tests/projectile-shape.test.js <偽地図を直したテスト>
git commit -m "feat: 弾・ミサイル・追尾ミサイル・巡航ミサイル・ドローンが坂と面取りの形で地形に当たる"
```

---

### Task 7: 本物の5面の地図で乱射しても、岩の中で終わらない

**Files:**
- Test: Create `tests/terrain-shape-real-map-projectiles.test.js`（段2の `terrain-shape-real-map.test.js` と同じ作り）

- [ ] **Step 1: テストを書く**

本物の5面の地図（種 1〜4）で、敵アタッカーの湧き位置から:
- 反射ビームを 16 方向に撃ち、寿命まで `stepBeam` を回す。毎フレーム `isSolidPoint(x, y) === false`、速さは `REFLECT_BEAM_SPEED` ちょうど。
- グレネードを 16 方向・2通りの速さで投げ、寿命まで。毎フレーム `isSolidPoint(x, y) === false`、最後の 30 フレームで止まったもの（|v| < 0.05）は床の上にいる。

数を数えて、0 でなければ最初の5例（種・湧き位置・方向・フレーム・位置）をメッセージに出す。斜辺で跳ねた回数も数え、0 でないこと（坂に当たっていないテストになっていないかの確認）。

- [ ] **Step 2: 走らせる**

Run: `npm test -- tests/terrain-shape-real-map-projectiles.test.js`
Expected: PASS。FAIL なら superpowers:systematic-debugging で原因を探して直し、直す前に再現するテストを Task 2〜5 のテストへ足す。

- [ ] **Step 3: 変異で赤くなるのを見る**（`slopeHitAlong` が常に null を返すようにすると、跳ねた回数 0 で FAIL）

- [ ] **Step 4: 全テストを通して Commit**

Run: `npm test -- --test-skip-pattern=湧き位置は重複しない`
Expected: 0 fail

```bash
git add tests/terrain-shape-real-map-projectiles.test.js
git commit -m "test: 本物の5面の地図で反射ビームとグレネードを乱射しても岩の中で終わらない"
```
