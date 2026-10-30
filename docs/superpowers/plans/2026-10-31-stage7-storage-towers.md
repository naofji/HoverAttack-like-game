# 7面のお宝を格納塔に入れる Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 7面の要塞のお宝を、むき出しのアイテムから「壊すと中身が出る格納塔」に置き換える。塔は要塞に縛られない汎用の部品にする。

**Architecture:** 中身の種類→アイテムの対応表（`entities/itemKinds.js`）を1つ作り、塔の破壊もこれを通す。塔（`entities/StorageTower.js`）は `{x, y, kind}` だけを受け取り、`FortressBarrier` と同じく専用の配列 `game.storageTowers` に置いて自分で当たり判定を回す。置き場所は `map.storageTowerSpawns`（今は7面の要塞の生成だけが足す）。

**Tech Stack:** バニラ ES modules、canvas 2D、`node --test`。

**Spec:** `docs/superpowers/specs/2026-10-31-stage7-storage-towers-design.md`

## Global Constraints

- 塔は幅 16px・高さ 24px（`PLAYER_WIDTH`×`PLAYER_HEIGHT` と同じ値を `STORAGE_TOWER_W/H` に）。HP 15（`DAMAGE_PLAYER_MISSILE` 1発）
- 機関砲は `PLAYER_MG_DAMAGE`（3）を倍率なしで → 5発。グレネードは `GRENADE_DAMAGE`（80）を `GRENADE_DAMAGE_RADIUS`（40px）の内側で → 1発
- 自機の武器（`isPlayerOwned`）だけで壊れる。敵の弾・敵のグレネード・地雷の誘爆では壊れない
- 塔は `game.enemies` に入れない（撃破数・スコア・Auto Aim の対象外）。自機は通り抜けられる（障害物にしない）
- 黄白色の円筒＋足台、オレンジの横縞が明滅。位相は位置から決める（乱数を使わない）。色は面ごとに変えない
- マップ生成で `game.rng` を消費しない（週次の決定性）。お宝の決め方・個数は変えない
- 数値は `Constants.js` の `STORAGE_TOWER_*`。コメントは日本語で「なぜ」
- `git add -A` / `git add .` 禁止（`src/js/main.js` の `debugStartMission` を巻き込まない。main.js は自分の hunk だけ `git apply --cached`）
- ゲート: `npm test -- --test-skip-pattern=湧き位置は重複しない`

## Review Focus

1. 塔の矩形の下端が床の上面にぴったり乗っているか（浮く・埋まる）。お宝の `r` は「床の1つ上の行」で、塔の下端は `(r+1)*TILE_SIZE` → Task 4 のテストで床が固いこと・塔の上2行が空洞であることを縛る
2. 壊れた瞬間に中身が1個だけ出て、同じフレームに2発目が当たっても2個目が出ない → Task 2
3. グレネードの爆風は塔の中心までの距離で見る（`Grenade._explode` の敵と同じ測り方）。敵のグレネードでは削れない → Task 2
4. 面のリセットで塔が作り直され、前の面の塔が残らない → Task 4
5. 未知の `kind` を黙ってリペアにしない（黙って落ちる作りは壊れを隠す）→ Task 1

---

### Task 1: 中身の種類→アイテムの表

**Files:**
- Create: `src/js/entities/itemKinds.js`
- Modify: `src/js/systems/SpawnManager.js`（`spawnTreasures` の if の連なりを表に置き換える。Task 4 で消すが、この時点では挙動不変で置き換える）
- Test: `tests/storage-tower.test.js`（新規）

**Interfaces:**
- Produces: `ITEM_KINDS`（`{ overdrive: {cls: OverdriveKit, list: 'missileKits'}, repair: {cls: RepairKit, list: 'repairKits'}, life: {cls: ExtraLifeKit, list: 'lifeKits'} }`）、`spawnItem(game, kind, x, y) -> PickupItem`（`x` は中心、`y` は上端。`PickupItem` の constructor と同じ）。未知の kind は `Error` を投げる

- [ ] **Step 1: 失敗するテストを書く**
  - `spawnItem は kind ごとに正しいクラスを正しい配列に入れる`: 3種それぞれで `instanceof` と配列の長さ1、他の配列は空
  - `spawnItem は未知の kind で例外を投げる`: `assert.throws(() => spawnItem(game, 'nope', 0, 0))`
- [ ] **Step 2:** `npm test -- tests/storage-tower.test.js` → FAIL（モジュールが無い）
- [ ] **Step 3:** `itemKinds.js` を実装し、`SpawnManager.spawnTreasures` を `spawnItem` 経由にする
- [ ] **Step 4:** 同ファイルと `tests/extra-life.test.js` `tests/fortress.test.js` が PASS
- [ ] **Step 5: Commit** `refactor: お宝の中身の種類→アイテムの表を1つにする`

### Task 2: 格納塔の本体（当たり・壊れ方・中身）

**Files:**
- Create: `src/js/entities/StorageTower.js`
- Modify: `src/js/utils/Constants.js`（`STORAGE_TOWER_W=16`、`STORAGE_TOWER_H=24`、`STORAGE_TOWER_HP=15`。根拠のコメント）
- Modify: `src/js/entities/Grenade.js`（`_explode` の自機側の枝で `damageTowersInRadius` を呼ぶ）
- Test: `tests/storage-tower.test.js`

**Interfaces:**
- Consumes: `spawnItem`（Task 1）
- Produces: `class StorageTower { constructor(game, {x, y, kind}) }` — `x` は中心、`y` は**下端**（床の上面）。プロパティ `x,y,width,height`（左上と寸法）、`hp`、`maxHp`、`alive`、`kind`、`timer`。メソッド `update()`（弾を見る）、`damage(amount) -> boolean`（壊れたら true）、`draw(ctx)`（Task 3）
- Produces: `damageTowersInRadius(game, x, y, radius, amount)`（`StorageTower.js` から export。`game.storageTowers` が無ければ何もしない）

`update()` は `game.projectiles` だけを見る（敵の弾は `isPlayerOwned` が偽なので見ない）。自機の `Missile` が矩形に入ったら 15 削り、`exploded = true; alive = false` と `playBlast(.., 'missileHit')`。`PlayerBullet` なら 3 削り、`alive = false` と `playBlast(.., 'mgHit')`。`Grenade` は素通り（爆風で削る。敵と同じ）。壊れたら `playBlast(中心, 'missileHit')` と `spawnItem(game, kind, 中心x, 下端 - ITEM_SIZE)`。

- [ ] **Step 1: 失敗するテストを書く**（偽ゲーム `{ projectiles: [], repairKits: [], missileKits: [], lifeKits: [], particles: [] , map: 空の地図 }`）
  - `塔は下端が y、中心が x に立つ`: `t.y + t.height === y`、`t.x + t.width/2 === x`、寸法 16×24
  - `自機のミサイル1発で壊れ、中身が1個だけ出る`: ミサイルを矩形の中に置いて `update()` → `alive === false`、`lifeKits.length === 1`（kind 'life'）、ミサイルは `exploded`
  - `機関砲は4発では壊れず5発で壊れる`
  - `自機のグレネードの爆風（中心から 39px）で壊れ、41px では壊れない`: `Grenade` を作って `_explode()`。`game.enemies = []`、`map.destroyArea` は偽で空配列を返す
  - `敵のミサイル（isPlayerOwned=false）と敵のグレネードでは削れない`
  - `壊れた塔に当たっても2個目は出ない`: 壊した後にもう1発 → 配列の長さは1のまま、その弾は消費されない
  - `中身は床の上に出る`: 出たアイテムの `y + height === 塔の下端`
  - `塔を壊してもスコアは入らず、game.enemies に入らない`
- [ ] **Step 2:** FAIL を確認
- [ ] **Step 3:** 実装
- [ ] **Step 4:** PASS。ミューテーション（HP を 16 に・`isPlayerOwned` の判定を外す・`alive` の早期 return を外す）で赤になることを確かめる
- [ ] **Step 5: Commit** `feat: 壊すと中身が出る格納塔`

### Task 3: 格納塔の絵（黄白色の円筒・足台・オレンジの横縞の明滅）

**Files:**
- Modify: `src/js/entities/StorageTower.js`（`draw(ctx)`、`stripeAlpha()`）
- Modify: `src/js/utils/Constants.js`（`STORAGE_TOWER_BODY_COLOR`（黄白色）、`STORAGE_TOWER_SHADE_COLOR`、`STORAGE_TOWER_STAND_COLOR`、`STORAGE_TOWER_STAND_H`、`STORAGE_TOWER_STRIPE_COLOR`（オレンジ）、`STORAGE_TOWER_STRIPE_COUNT`、`STORAGE_TOWER_BLINK_PERIOD`（フレーム）、`STORAGE_TOWER_STRIPE_ALPHA_MIN/MAX`、`STORAGE_TOWER_PHASE_STEP`）
- Modify: `tools/render-fortress-scene.mjs`（区画を描くとき、その区画の塔も描く）
- Test: `tests/storage-tower.test.js`

**Interfaces:**
- Produces: `stripeAlpha() -> number`（今の横縞の明るさ。`MIN..MAX` を正弦でなめらかに往復。位相 = `timer / PERIOD` ＋ `(x / TILE_SIZE) * PHASE_STEP`）。`update()` の先頭で `timer++`（壊れた後は描かない）

- [ ] **Step 1: 失敗するテストを書く**
  - `横縞の明るさは時間で MIN と MAX の間を往復する`: 1周期ぶん回して最小値≈MIN・最大値≈MAX
  - `隣の塔とは同じ時刻でも明るさが違う`: x が 32px 違う2本、同じ timer で `stripeAlpha()` が異なる
  - `draw は足台・円筒・横縞を形の中に描く`: fake-ctx で `fillRect` がすべて塔の矩形の中、`STRIPE_COLOR` の塗りが `STRIPE_COUNT` 回、`STAND_COLOR` の塗りが下端から `STAND_H` の範囲
  - `壊れた塔は何も描かない`
- [ ] **Step 2:** FAIL を確認
- [ ] **Step 3:** 実装（`fillRect` だけで描く。PixelCanvas で描けるように）。`node tools/render-fortress-scene.mjs --zone 0 --scale 3 --out <scratchpad>/tower.png` で絵を見る
- [ ] **Step 4:** PASS。ミューテーション（位相の項を外す・縞の数を変える）で赤
- [ ] **Step 5: Commit** `feat: 格納塔を黄白色の円筒とオレンジの横縞の明滅で描く`

### Task 4: 置き場所の一覧とゲームへの組み込み

**Files:**
- Modify: `src/js/world/Map.js`（`treasureSpawns` を `storageTowerSpawns` に改名。要素 `{x: c*S + S/2, y: (r+1)*S, kind}`。コメントに「将来ほかの面はここに足す」）
- Modify: `src/js/systems/SpawnManager.js`（`spawnTreasures` を `spawnStorageTowers` に置き換え。`game.storageTowers` を作り直す）
- Modify: `src/js/systems/GameStateManager.js`（リセットで `game.storageTowers = []`、`spawnStorageTowers()` を呼ぶ）
- Modify: `src/js/main.js`（`storageTowers: []`、初期化で `spawnStorageTowers()`、更新はバリアの直後に `_updateAndPrune` ではなく全部 `update()`（壊れた塔は配列に残してよいが描かない。単純さのため `_updateAndPrune` でもよい — 選んだ方をコメントに）、描画はバリアの後に `isInView` で間引いて `draw` と `_drawHpBarIfDamaged`）
- Modify tests: `tests/extra-life.test.js`、`tests/fortress.test.js`、`tests/town-sound-wiring.test.js`、`tests/base-emergency-defense-integration.test.js`（名前の置き換え。お宝の数の検証は塔の数に）
- Test: `tests/storage-tower.test.js`

**Interfaces:**
- Consumes: `StorageTower`（Task 2）
- Produces: `map.storageTowerSpawns: {x, y, kind}[]`、`SpawnManager.spawnStorageTowers()`、`game.storageTowers: StorageTower[]`

- [ ] **Step 1: 失敗するテストを書く**
  - `実際の7面: お宝の位置ごとに塔が1本ずつ立ち、むき出しのアイテムは無い`: 複数シードで `spawnStorageTowers()` → 塔の数 = 区画数×3、`repairKits/missileKits/lifeKits` は空
  - `塔の下は固い床で、塔の高さぶん（2タイル）は空洞`
  - `塔の中身の種類はお宝と同じ（life 1・overdrive 区画数・repair 区画数×2−1）`
  - `ほかの面には塔が無い`（面1〜6）
  - `汎用: 偽の地図の storageTowerSpawns に入れれば7面でなくても立ち、壊すとその中身が出る`
  - `面のリセットで塔が作り直される`: `storageTowers` に古い塔を入れて `GameStateManager` のリセット → 古い塔が残らない（既存の extra-life のリセットのテストの形に合わせる）
- [ ] **Step 2:** FAIL を確認
- [ ] **Step 3:** 実装。既存テストの名前を置き換える
- [ ] **Step 4:** 全テストのゲートが PASS（`MapDeterminism` を含む）
- [ ] **Step 5: Commit**（main.js は自分の hunk だけ `git apply --cached`）`feat: 7面のお宝を格納塔に入れて要塞の奥に立てる`
