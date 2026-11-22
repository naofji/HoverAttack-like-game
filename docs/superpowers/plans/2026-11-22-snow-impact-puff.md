# 5面: 着弾と爆発で雪が舞う Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5面で、弾が雪の積もった上面に当たったとき・爆発が雪面の近くで起きたときに、舞う雪（SnowFlurryParticle）を出す。

**Architecture:** 「この列の、この範囲に雪の積もった上面があるか」を `mapShapes.js` の問い合わせ1本（`snowSurfaceY`）に置き、弾（`Bullet.update`）と爆発（`SpawnEffects.spawnExplosion`）の両方がそれを読む。粒を撒くのは `SpawnEffects` の1本（`spawnSnowPuff`）。

**Tech Stack:** バニラ ES modules、`node --test`。

**Spec:** `docs/superpowers/specs/2026-11-22-snow-impact-puff-design.md`

## Global Constraints

- 地形・当たり判定・`game.rng` には触れない。粒は Math.random でよい（既存の雪の粒と同じ）。
- 数値は全部 `Constants.js`。根拠と「実機で見て調整する出発点」であることをコメントに書く（日本語、なぜを書く）。
- 雪面の定義は描画と同じ: `envKind === 'snow'` かつ `exposedAtGen[r * cols + c]` が立つマスの上面。
- `SpawnEffects` は mixin（`this` が Game）。`game` を第一引数に取る関数にしない。
- 自機の弾・敵の弾の両方が対象（ユーザー承認）。
- ソース文字列を grep するテストは書かない。`git add -A` を使わない。

## Review Focus

- 岩の側面に横から当たった弾 → 雪は出ない（側面に雪は描かれていない）。Task 1 で縛る。
- 掘った穴の底など積雪ビットの無い上面 → 出ない。Task 1。
- 雪の無い面（envKind が 'snow' 以外）→ 出ない、例外も出ない（`exposedAtGen` が無い地図・偽地図でも落ちない）。Task 1・2。
- MG が敵に当たったときの小さな爆発（`mgHit`、粒数 4）→ 雪は出さない（連射で雪だらけになる）。Task 3 で `SNOW_BLAST_MIN_SIZE` を縛る。
- 天井の下面に下から当たった弾 → 出ない。Task 1。

---

### Task 1: 雪面の問い合わせ `snowSurfaceY`

**Files:**
- Modify: `src/js/world/mapShapes.js`（`terrainTopY` の近く）
- Modify: `tests/helpers/enemy-world.js`（`SHAPE_QUERIES` に `'snowSurfaceY'` を足す。偽地図に `envKind` / `exposedAtGen` を渡せるよう `makeMap` のオプションに `envKind`、`snowCaps`（`exposedAtGen` を生成時と同じ規則＝上が空の岩、で焼くか）を足す）
- Test: `tests/snow-surface-query.test.js`

**Interfaces:**
- Produces: `Map.prototype.snowSurfaceY(x: number, yFrom: number, yTo: number): number | null` — 列 x を yFrom から yTo まで下へ見て、最初に岩が始まる y（`terrainTopY` の結果）を返す。ただし次のどれかなら null: envKind が 'snow' でない／`exposedAtGen` が無い／`terrainTopY` が null／その y のすぐ上（y - 0.5）が岩（＝始点が岩の中。側面・天井の当たり）／そのマス（`floor(y / TILE_SIZE)`, `floor(x / TILE_SIZE)`）に積雪ビットが無い。

- [ ] **Step 1: 失敗するテストを書く**（`makeMap(flatFloorRows(), null, { envKind: 'snow', snowCaps: true })` などで）
  - `雪の上面に上から入れば上面の y を返す`: 床の上 (x, FLOOR_Y - 10) → (x, FLOOR_Y + 3) で `FLOOR_Y`
  - `側面に横から当たったら null`: 壁の列で yFrom も yTo も壁の中 → null
  - `天井の下面に下から当たったら null`: yFrom が天井の中
  - `積雪ビットの無い上面は null`: 同じ地図で該当マスの `exposedAtGen` を 0 に
  - `雪の面でなければ null`: envKind 'cave'。`exposedAtGen` 無しの地図でも例外を投げず null
  - 坂（`tileShape: 'snowSlope'`）の上面に上から入れば坂の高さ（`terrainTopY` と同じ値）を返す

- [ ] **Step 2: 走らせて落ちることを確かめる** — `npm test -- tests/snow-surface-query.test.js` → FAIL（関数が無い）

- [ ] **Step 3: `snowSurfaceY` を実装する**

- [ ] **Step 4: 通ることを確かめる** — 同じコマンドで PASS、`npm test` 全体も PASS

- [ ] **Step 5: わざと壊して赤くなるのを確かめる**（y - 0.5 の判定を外す → 側面・天井のテストが落ちる。積雪ビットの判定を外す → ビット無しのテストが落ちる）。戻して commit

```bash
git add src/js/world/mapShapes.js tests/helpers/enemy-world.js tests/snow-surface-query.test.js
git commit -m "feat: 雪の積もった上面を問い合わせる snowSurfaceY"
```

### Task 2: 撒く入口 `spawnSnowPuff` と弾の着弾

**Files:**
- Modify: `src/js/utils/Constants.js`（SNOWTREE_FLURRY_* の近く）
- Modify: `src/js/systems/SpawnEffects.js`
- Modify: `src/js/entities/Bullet.js`（地形ヒットの所）
- Test: `tests/snow-impact-puff.test.js`

**Interfaces:**
- Consumes: `map.snowSurfaceY(x, yFrom, yTo)`（Task 1）
- Produces:
  - `SpawnEffects.spawnSnowPuff(x: number, y: number, count: number, spread: number): void` — (x, y) から上半分へ count 粒の SnowFlurryParticle を出す。動きは `SNOWTREE_FLURRY_MODES.hit`、色は `SNOWTREE_FLURRY_COLORS`、寿命は `SNOWTREE_FLURRY_LIFE`、出る位置は横 ±spread・上へ 0〜spread（Town._spawnSnowFlurry と同じく下へは散らさない。岩の中で生まれて即死するため）。
  - `SpawnEffects.spawnBulletSnowPuff(x: number, yFrom: number, yTo: number): void` — `snowSurfaceY` が y を返したら `spawnSnowPuff(x, y, SNOW_BULLET_PUFF_COUNT, SNOW_BULLET_PUFF_SPREAD)`。map が無い／問い合わせが無ければ何もしない。
  - 定数: `SNOW_BULLET_PUFF_COUNT = 3`（MG は連射なので木の欠け HIT 5 より少なく）、`SNOW_BULLET_PUFF_SPREAD = 2`
  - `Bullet.update()`: 移動前の y を控え、`isSolidPoint` で消えるときに `this.game.spawnBulletSnowPuff?.(this.x, prevY, this.y)`（水中で減速して消える経路・寿命切れでは呼ばない）

- [ ] **Step 1: 失敗するテストを書く**
  - `雪の上面に当たった弾は雪を舞わせる`: 偽 game（Task 1 の雪の偽地図、particles: []、`Object.assign` で SpawnEffects を混ぜる）に PlayerBullet を真下向きに床の少し上から撃ち、消えるまで update → particles に SnowFlurryParticle が `SNOW_BULLET_PUFF_COUNT` 個、どれも y ≤ 床の y
  - `敵の弾でも同じ`: EnemyBullet で同じ
  - `壁に横から当たった弾は出さない`
  - `雪の面でない地図では出さない`（envKind 'cave'）
  - `寿命切れで消えた弾は出さない`

- [ ] **Step 2: 落ちることを確かめる** — `npm test -- tests/snow-impact-puff.test.js` → FAIL

- [ ] **Step 3: 定数・`spawnSnowPuff`・`spawnBulletSnowPuff`・Bullet の呼び出しを実装する**

- [ ] **Step 4: 通ることを確かめる** — 同ファイル PASS、`npm test` 全体 PASS

- [ ] **Step 5: わざと壊す**（Bullet の呼び出しを消す → 弾のテストが落ちる）。戻して commit

```bash
git add src/js/utils/Constants.js src/js/systems/SpawnEffects.js src/js/entities/Bullet.js tests/snow-impact-puff.test.js
git commit -m "feat: 5面で弾が雪面に当たると雪が舞う"
```

### Task 3: 爆発で雪が舞う

**Files:**
- Modify: `src/js/utils/Constants.js`
- Modify: `src/js/systems/SpawnEffects.js`（`spawnExplosion` の水柱の隣）
- Test: `tests/snow-impact-puff.test.js`（追記）

**Interfaces:**
- Consumes: `snowSurfaceY`（Task 1）、`spawnSnowPuff`（Task 2）
- Produces: `SpawnEffects._spawnBlastSnow(x: number, y: number, size: number): void` を `spawnExplosion` から呼ぶ（水中の爆発では呼ばない）。
  - `size < SNOW_BLAST_MIN_SIZE` なら何もしない
  - 列は x + k × `SNOW_BLAST_COLUMN_STEP`（k = -`SNOW_BLAST_COLUMNS`..+`SNOW_BLAST_COLUMNS`）。各列で `snowSurfaceY(cx, y - TILE_SIZE, y + SNOW_BLAST_REACH)`。見つかった列の数で総粒数を割って各列に `spawnSnowPuff(cx, sy, n, SNOW_BLAST_PUFF_SPREAD)`
  - 総粒数 = `Math.min(SNOW_BLAST_MAX, Math.round(size * SNOW_BLAST_PER_SIZE))`
  - 動きは hit より強く上へ（`SNOWTREE_FLURRY_MODES.puff` を使う。`spawnSnowPuff` に mode 引数を足す: `spawnSnowPuff(x, y, count, spread, mode = 'hit')`）
  - 定数の出発点: `SNOW_BLAST_MIN_SIZE = 8`（mgHit 4・cruiseSpark 5 を除き、enemyMissileHit 8 以上は出す）、`SNOW_BLAST_PER_SIZE = 0.6`、`SNOW_BLAST_MAX = 40`、`SNOW_BLAST_COLUMNS = 2`、`SNOW_BLAST_COLUMN_STEP = 8`、`SNOW_BLAST_REACH = TILE_SIZE * 2`、`SNOW_BLAST_PUFF_SPREAD = 4`

- [ ] **Step 1: 失敗するテストを書く**
  - `雪面の近くの爆発は雪を舞わせる`: 床の 10px 上で `spawnExplosion(x, y, 36)` → SnowFlurryParticle が `min(40, round(36*0.6))` 個（audioManager は環境が無いので黙る）
  - `小さな爆発（mgHit 相当の 4）は出さない`
  - `雪面から REACH より高い空中の爆発は出さない`
  - `雪の面でない地図では出さない`

- [ ] **Step 2: 落ちることを確かめる**

- [ ] **Step 3: 実装する**

- [ ] **Step 4: 通ることを確かめる** — 同ファイル PASS、`npm test` 全体 PASS

- [ ] **Step 5: わざと壊す**（MIN_SIZE の判定を外す → 小さな爆発のテストが落ちる）。戻して commit

```bash
git add src/js/utils/Constants.js src/js/systems/SpawnEffects.js tests/snow-impact-puff.test.js
git commit -m "feat: 5面で爆発が雪面を叩くと雪が舞う"
```
