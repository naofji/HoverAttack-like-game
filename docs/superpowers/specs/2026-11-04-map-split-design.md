# `world/Map.js` の層分け（挙動を変えない構造リファクタ）

2026-11-04。**実装済み（ブランチ refactor/map-split、91b507e〜f20d6da）。** 親: なし（`EnemyAttacker` の層分け、`ScreenRenderer` / `Game` の mixin 化と同じ方針の続き）。

## 何のためか

`Map.js` は 2452 行で、1クラスに5つの責務が同居している。実測した内訳（行数は着手前の HEAD）:

| 責務 | 行範囲 | 行数 | 中身 |
|---|---|---|---|
| マップ生成 | 187–1242 | 約1050 | `_generate`、岩・トンネル・部屋の彫り、面ごとの飾り（町・植物・雪・施設・要塞・水）、敵・地雷の湧き位置、基地の部屋 |
| 破壊・水の通知 | 1243–1427 | 約185 | `damageBlock` / `destroyArea`、水の dirty 管理 |
| 形・当たりの問い合わせ | 1428–1795 | 約370 | タイルキャッシュ、ミニマップ、`tileShapeAt` 系、`isSolid` 系、湧きの着地 |
| Orb 配置・水の問い合わせ | 1796–2000 | 約205 | `_findOrbPositions`、`popOutOfRock`、`isWater*` / `getSurfaceY` |
| update と描画 | 2001–2452 | 約450 | 水源の更新、`draw`、`_drawRockyBlock`（258行） |

困っていること:

- 「水の問い合わせを直す」と「岩の絵を直す」が同じ 2452 行の中で起きる。
  どこに何があるかを毎回探すことになり、差分も読みにくい
- 生成の1050行は、`game.rng` を消費するもの（週次の決定性に効く）と、派生ストリームのもの（効かない）が
  混ざっている。**どれが決定性に効くかが、ファイルの切れ目から読めない**
- 他の大きな塊（`EnemyAttacker`、`ScreenRenderer`、`Game`）は層に分けてあり、
  `Map` だけが取り残されている

## 決めたこと

| 論点 | 決定 |
|---|---|
| 挙動 | **1ビットも変えない。** 移動だけ。バランス・見た目・乱数の消費順は触らない |
| 分け方 | `Object.assign(Map.prototype, …)` の mixin。`EnemyAttacker` / `ScreenRenderer` / `Game` と同じ作り |
| `Map` クラス | **残す。** 呼ぶ側（`main.js`、`GameStateManager.js`、`tools/` の7本）の import は変えない |
| テスト | **1行も変えない。** 46ファイルが `Map` を import し、 `Map.prototype._xxx` を直接呼んでいる（`_drawRockyBlock` 9回、`_seatSpawnsOnShapes` 6回など）。mixin ならこの呼び方がそのまま通る。変える必要が出たら、移動の仕方が間違っている |
| 関数名 | **変えない。** `_` 付きの名前もそのまま（テストが名前で呼ぶ） |
| `_generate()` | **`Map.js` に残す。** どの順で何を呼ぶかの唯一の記述にする（`EnemyAttacker.update()` と同じ理由）。乱数の消費順がここで読める |
| 長い単一メソッド | `_drawRockyBlock`（258行）と `_generate`（195行）は**この設計では中を割らない。** 先に場所だけ動かし、中身の整理は別の設計にする |

## 新しい配置

```
world/
  Map.js                  constructor / _generate / damageBlock / destroyArea /
                          invalidateTileRegion / update / pixelToTile  （約500行）
  mapgen/
    common.js             BORDER_THICKNESS（2層以上が使うものだけ。shuffleWith は spawns.js）
    carve.js              _isAreaEmpty … _carveTunnel / _generatePlatforms / _placeHardBlocks
    features.js           面ごとの飾り（下の表）
    spawns.js             湧き位置・基地の部屋・Orb 配置・形への着地
  mapWater.js             水の dirty 管理と問い合わせ（isWater 系）
  mapShapes.js            形・当たりの問い合わせ（tileShapeAt 系、isSolid 系、popOutOfRock）
  mapMiniMap.js           _generateMiniMap / _applyMiniMapToning / refreshMiniMap
  mapRender.js            _initTileCache / _renderAllToCache / draw / _drawTile / _draw*Block
```

各ファイルは `ScreenRenderer` の mixin と同じ書き方で、**オブジェクトリテラルを `export` するだけ**。
`this` はインスタンスを指す。冒頭のコメントに「何を持つか」と「`Map.prototype` へ混ぜる前提」を書く。

### どのメソッドをどこへ

| 行き先 | メソッド（着手前の行） |
|---|---|
| `mapgen/carve.js` | `_isAreaEmpty`(663) `_isBorder` `_carveRoom` `_carveEllipse` `_connectRooms` `_carveTunnelPath` `_carveTunnelLine` `_carveBrush` `_smoothStep` `_countNeighbors` `_carveArea` `_carveMainPath` `_carveTunnel`(863) / `_generatePlatforms`(635) / `_placeHardBlocks`(877) |
| `mapgen/features.js` | `_reservedRects`(382) `_buildTownSpecs` `_buildPlantSpecs` `_generatePlants` `_buildSnowTreeSpecs` `_buildIcicleSpecs` `_generateSnow` `_generateTown` `_generateFacility` `_generateFortress` `_placeFortressContents` `_generateWater`(599) / `_snowDressExposedBelow`(1234) |
| `mapgen/spawns.js` | `_pickSpawnPositions`(925) `_hasFloorBelow` `_hasHeadroomOnFloor` `_findLandminePositions` `_findEnemyTankPositions` `_findEnemyAttackerPositions` `_findEnemyDronePositions` `_carveMainBaseRoom` `_baseTurretSpots` `_clearBaseTurretBoxes` `_addMainBaseDefenders` `_findEnemyTurretPositions`(1161) / `_seatSpawnsOnShapes`(1768) / `_findOrbPositions`(1796) |
| `mapWater.js` | `onWaterChanged`(1338) `_markWaterDirty` `_rebuildWaterCacheIfDirty` `takeWaterRepaintCells` `getWaterPaintTopY` `isWaterFoam` `getWaterFoamCells` `_waterSolidFn`(1419) / `isWater`(1897) `isWaterSurface` `isWaterfallCell` `getSurfaceY` `isWaterAtPixel` `waterfallLandingCols` `isWaterfallAtPixel`(1981) |
| `mapShapes.js` | `isSolid`(1543) `isSolidAtPixel` `_tileShapeCell` `_metalizeFacilitySlopes` `_buildTileShapes` `_rebuildTileShapesAround` `tileShapeAt` `isSolidPoint` `rectHitsTerrain` `terrainTopY` `terrainBottomY` `floorSlopeAt` `ceilingSlopeAt` `hasShapedTileIn` `floorUnder` `ceilingOver`(1753) / `popOutOfRock`(1861) `slopeHitAlong` |
| `mapMiniMap.js` | `_generateMiniMap`(1449) `_applyMiniMapToning` `refreshMiniMap`(1534) |
| `mapRender.js` | `_initTileCache`(1428) `_renderAllToCache` / `draw`(2086) `_drawTile` `_drawPanelBlock` `_drawRockyBlock` `_drawPolishedBlock`(2410) |
| `Map.js` に残す | `constructor` `_generate` `damageBlock` `invalidateTileRegion` `destroyArea` `update` `pixelToTile` |

**`update()`（水源の更新、85行）は `Map.js` に残す。** 水の問い合わせを `mapWater.js` に出しても、
`update` は水の状態を進める側（書く側）で、問い合わせ（読む側）と分けておくほうが
「書き込みは必ず `onWaterChanged` を通す」という既存の約束（memory: lazy-cache-every-writer-notifies）を
確かめやすい。

### モジュールスコープの小物

`Map.js` の先頭にある4つの小物は、使われ方で行き先が決まる（着手前の行）:

| 小物 | 使う行 | 行き先 |
|---|---|---|
| `BORDER_THICKNESS` | 219–1166（生成のほぼ全部） | `mapgen/common.js` に `export`（3つの `mapgen/` ファイルと `Map.js` が使う） |
| `shuffleWith` | 1800, 1840（`_findOrbPositions` だけ） | `mapgen/spawns.js` のモジュールスコープ（他に使う所は無い） |
| `hardBlockColor` / `metalBlockColor` | 110–116（`constructor` だけ） | `Map.js` に残す |

`BORDER_THICKNESS` だけが複数の層にまたがる。**2層以上が使うものだけ `common.js` に置く**。
便利そうだからという理由で入れていくと、`common.js` が新しいゴミ箱になる。

## 守ること

### 週次の決定性（最重要）

`CLAUDE.md` のとおり、生成の途中で `game.rng` を余分に消費するとその週の敵の構成が変わる。
**呼び出しの順序と回数は 1 回も変えない。** 具体的には:

- `_generate()` が各ステップを呼ぶ順は、そのまま `Map.js` に残す（順が一目で分かる）
- `game.rng.next()` を直接呼んでいる所（219–251, 642–643, 736, 749, 853, 890, 938, 1034, 1200）は、
  **移動するだけで1行も書き換えない**
- 派生ストリーム（`new SeededRNG((this.game.rng.state ^ SALT) >>> 0)`）の SALT は、
  定数のまま、同じ式で作る。`game.rng.state` を読む**時点**も変えない
  （`_buildTownSpecs` のコメント「生成後に呼んでも `game.rng.state` は生成中と同じ値」が前提にしている）

### 循環 import を作らない

mixin のファイルは `Map.js` を import しない（`Map.js` が mixin を import する一方向）。
クラスの `Map` が必要に見える所は `this.constructor` ではなく、必要な関数を直接 import する。

### import の漏れ

`node --check` は構文しか見ない。各 mixin は**使う定数・関数を自分で import する**。
漏れは実行時の `ReferenceError` になるので、下の検証 3 で拾う。

### 名前の衝突

`Object.assign` は後勝ちで、**同名のメソッドが2つあっても黙って上書きされる。**
今は同名が無いが、将来足したときに黙って片方が消える。検証 5 のテストで縛る。

### 他にあるもの

- グローバルの `Map`（JS 標準）を `Map.js` のクラスが覆い隠している。**この設計では触らない。**
  `world/Map.js` の中で標準の `Map` を使う箇所があれば、そのまま
- `export { BLOCK_EMPTY, … } from '../utils/Constants.js';`（2452 行目）は `Map.js` に残す（他のファイルが `Map.js` から取っているため）

## 進め方

**1 層 = 1 コミット。後ろのブロックから切り出す**（前から消すと以降の行番号がずれる。memory: refactor-verification-recipe）。

| 順 | 層 | 理由 |
|---|---|---|
| 1 | `mapRender.js`（描画） | 最も大きい塊（約370行）で、乱数も状態も触らない＝リスクが最も低い。手順を確かめる試し切り |
| 2 | `mapMiniMap.js` | 同上。小さい |
| 3 | `mapWater.js` | 読み書きの境界をはっきりさせる |
| 4 | `mapShapes.js` | 当たり判定の問い合わせ。テストが最も多く触る層 |
| 5 | `mapgen/spawns.js` | `game.rng` を消費するものを含む。決定性の検証が効く |
| 6 | `mapgen/features.js` | 同上 |
| 7 | `mapgen/carve.js` + `common.js` | 乱数を最も使う層。最後に回す |

各コミットで、次の検証を**すべて**通す。

## 検証

1. **`npm test` を通す。テストは 1 行も変えない。**
   現在の失敗数は着手前に `npm test` で採り、**同じ数であること**を確かめる
   （既存の失敗を移動の影響と取り違えないため）
2. **メソッド集合の照合。** 着手前のコミットの `Map.js` と、分割後の全ファイルを合わせた
   メソッド名の集合が一致するか、`node -e` で機械的に比べる
   （`/^    (?:async )?([a-zA-Z_$][\w$]*)\(/gm`。mixin のリテラルは字下げが4つ）。
   行範囲の削除で宣言行を巻き込む事故が過去に2回あった
3. **import 漏れの検出。** スクラッチパッドに使い捨てのスクリプトを置く（リポジトリには入れない）:
   本物の `Map` を面 0〜6 で生成し、`draw` / `update` / 問い合わせ系を総当たりで呼ぶ。
   偽 ctx は `tests/helpers/fake-ctx.js`。**`ReferenceError` だけを失格として数える。**
   モック不足の `TypeError` は別枠
4. **状態の指紋の diff（決定性はここで示す）。** `tools/trace-map.mjs` を新設する（`tools/trace-water.mjs` と同じ使い方）:

   ```
   node tools/trace-map.mjs > before.json
   node tools/trace-map.mjs > after.json
   node tools/trace-map.mjs --compare before.json after.json
   ```

   シード × 面（0〜6）ごとに、SHA-1 で次を取る:
   - `grid` / `blockHP` / `water` / `waterKind`
   - 全湧き位置（地雷・戦車・アタッカー・ドローン・タレット・基地・Orb・格納塔）、`rooms`、`stairs`、`metalStairs`
   - `facilityAreas` / `fortressZones` / `town` の設計図一覧
   - `tileShapes`
   - **生成後の `game.rng.state`** — 乱数の消費回数が変わっていれば、ここに出る
   - 描画: 偽 ctx で `draw` を数フレーム呼んだ呼び出し列

   **着手前に 2 回採り、同じ値になること（決定的であること）を先に確かめる。**
   その後でわざと 1 文字壊して（例: ある `game.rng.next()` を 1 回余分に呼ぶ）、差が出ることを確かめる
   （memory: test-rewrite-mutation-check / mutation-must-be-able-to-fail）
5. **名前の衝突テスト。** `tests/map-mixins.test.js` を新設する:
   mixin のリテラルをすべて import し、**キーが他の mixin と、また `Map.prototype` に元から
   あるものと重ならない**ことを確かめる。`Object.keys` を使う実行時の検査で、ソース文字列の grep ではない。
   確認: 重複を 1 つ作ると赤くなること

## やらないこと

- 呼び出し側（`main.js`、`GameStateManager.js`、`SpawnManager` など）の変更
- `Map` を `Terrain` と `Generator` の別クラスに割ること。`this.grid` / `this.water` / `this.tileShapes` など
  共有フィールドが約60あり、クラスに割ると**全メソッドの `this.` が変わる**（50ファイルのテストも）。
  mixin はこの変更を避けるための選択
- `_drawRockyBlock` の中身の整理、`_generate` の分割（別の設計）
- `Constants.js` の分割、`Player.js` / `main.js` / `EnemyBase.js` の層分け（別の設計。この設計の手順が通ってから）
- 命名の整理、コメントの書き直し。**コメントは一字も変えずに一緒に動かす**
  （既存のコメントは選んだ理由と実測値が入っていて、書き直すとそれが落ちる）

## 完了の基準

- `Map.js` が約 500 行になり、`mapgen/` と `map*.js` に責務ごとに分かれている
- `npm test` が着手前と同じ結果で、テストファイルの差分が 0
- `tools/trace-map.mjs --compare` の差分が 0（シード × 面 0〜6）
- 実機の確認は不要（見た目・音・挙動が変わらないため）。**ただしハードリロードは案内する**
  （`index.html` が `main.js?v=1.0` とクエリでキャッシュしており、ES module の依存先は
  リロードしないと古いファイルが残る恐れがある）

## 着手前の状態（2026-11-04 に再点検）

- Orb の変更は 29f8ae8 でコミット済み。作業ツリーに残っているのは `main.js` の `debugStartMission`（ユーザーのデバッグ値、add しない）と未追跡の `future plans.md` だけ
- **基準のコミットは 29f8ae8。** 行番号・メソッド一覧・`game.rng` の消費箇所は、この時点の `Map.js`（2452行）で照合し直して一致した
- ブランチ `refactor/map-split` を main（29f8ae8）から切って作業する。`git switch -c` は作業ツリーを触らないので `debugStartMission` は残る。マージは checkout をせずに `push HEAD:main` と `update-ref` で行う
- 再点検で追加して確かめたこと:
  - mixin のリテラルのメソッドは prototype 上で**列挙可能**になる（class のメソッドは列挙不可）。`for…in` や `Object.keys(map)` で map を走査する所は src・tests・tools のどこにも無いので、影響は無い
  - テスト2本（`facility.test.js`、`map-render-cache.test.js`）は `Map.prototype._xxx = …` で差し替えて後で戻している。呼び出しが `this._xxx()` 経由なので、mixin で混ぜた後でも差し替えは効く
  - `Map.js` の中で標準の `Map`（`new Map()`）を使っている所は無い。mixin のファイルでは `Map` が標準のものを指すことになるが、使っていないので影響は無い
- 指紋ツール `tools/trace-map.mjs` を先に作って確かめた（2026-11-04）:
  - 着手前に2回採って IDENTICAL（決定的）
  - わざと壊した6通りがすべて差として出た: `game.rng.next()` を1回足す（state・rng）／岩の絵の線を 0.5px ずらす（canvas）／
    `isWaterAtPixel` の y を 1 ずらす（query）／水源のタイマーを倍速に（afterState・afterQuery）／爆破の半径を +1（afterState）／
    ミニマップの dirty を反転（afterCanvas）
  - 最初に試した「`waterFallTimer` を余分に進める」は差が出なかった。`WATER_FALL_INTERVAL` が 1 で、壊し方が効いていなかった
    （memory: mutation-must-be-able-to-fail）。上の「水源のタイマー」に替えた
  - **検証 3（import 漏れ）は指紋ツールが兼ねる。** 全7面で `draw` / `update` / 問い合わせ / 破壊を実際に呼ぶので、漏れがあれば `ReferenceError` で落ちる。
    `--coverage` で、91 メソッドのうち一度も呼ばれないものを数えた → `_carveArea` `_carveMainPath` `_carveTunnel` の3つだけ。
    **どこからも呼ばれていない死んだコード**（呼び元は互いだけ）。この設計では消さずに `carve.js` へ動かす（使うのは `BORDER_THICKNESS` と `BLOCK_EMPTY` だけで、どちらも `carve.js` が import する）。消すかは別に決める

## 結果（2026-11-04）

- `Map.js` 2452 → 546 行。7段とも各コミットで指紋 IDENTICAL・メソッド集合一致
- 92 メソッドの本文（コメント込み）が基準と1バイトも違わないこと、基準のコメント行が1行も失われていないことを機械的に照合した
- `main.js` が committed の状態のワークツリーで全テスト: 基準 3209 / 3208 pass / 0 fail → 後 3212 / 3211 / 0（+3 は map-mixins.test.js）
- 設計からの変更: `mapgen/common.js` は段5で作った（spawns.js が最初に `BORDER_THICKNESS` を使う層のため）。
  「Block Destruction」の見出しは `_snowDressExposedBelow` の直前にあったが、`damageBlock` の見出しなので `Map.js` に残した
- 最終レビュー（別エージェント）: Critical / Important なし。Minor のうち、指紋ツールの偽 ctx に `filter` を持たせて
  Chrome の分岐も通すこと（基準を採り直して IDENTICAL）、`--compare` が after にだけある組も数えること、
  冒頭コメント・CLAUDE.md・この設計書の細かいずれは直した。直していない Minor（実害なし）:
  - 問い合わせは 21px 刻みの格子で当てているだけ。`game.env` が null なので `renderer.onBlockDestroyed` の経路も通らない。
    今回は本文のバイト一致と `tools/trace-water.mjs` の一致（レビューで確認）で補った。中身を書き換えるリファクタで使うなら細かくする
  - `tests/map-mixins.test.js` は、mixin のメソッド名とコンストラクタが立てるフィールド名の重なりを見ない（class のときも同じリスク）
