# 地形描画高速化（タイルキャッシュ）設計

## 背景・目的

毎フレーム、カメラ可視範囲内の全ブロックに対して `clip()` / `beginPath()` / 複数回の `fill()` / `stroke()` と決定論的疑似乱数演算を伴うベクター描画（`Map.draw` → `_drawRockyBlock` / `_drawPolishedBlock`）を行っており、非力なPCで負荷が大きい。ブロックの見た目（岩肌・ひび割れ・面取り）は破壊されるまで変化しないため、事前に1枚のキャッシュ画像へ描いておき、毎フレームは矩形コピー（`drawImage`）のみを行うことで劇的に軽くする。

ゲームの処理速度（プレイの体感速度）は `src/js/main.js` の固定タイムステップ・アキュムレータ（`advanceAccumulator`、`SIM_STEP = 1000/60`、実時間 × `gameSpeed` でスケール）により、描画フレームレートから既に分離されている。そのため本変更は純粋に描画負荷の削減であり、PC間のプレイ速度差やノーマル/ニュータイプの速度バランスには影響しない（スコープ外）。

## アーキテクチャ

1. `Map` に地図全体サイズ（最大 `MAX_MAP_COLS × TILE_SIZE` = 4800px, `MAX_MAP_ROWS × TILE_SIZE` = 2400px、TILE_SIZE=16）のキャッシュ用 `<canvas>` (`this.tileCacheCanvas` / `this.tileCacheCtx`) を持たせる。
   - 既存の `_generateMiniMap()` が `document.createElement('canvas')` を使っている前例に倣い、キャッシュも同じくプレーンな `<canvas>` を使う（DOM には追加しない）。`OffscreenCanvas` の機能検出とフォールバック分岐は、ワーカーへの転送等を行わない今回の用途では不要な複雑さなので採用しない。
2. マップ生成完了時（コンストラクタ末尾、`_generateMiniMap()` 呼び出しの近く）に `_renderAllToCache()` を呼び、`grid` 上の全非空ブロックを、現行の `_drawRockyBlock(ctx, r, c, block)` / `_drawPolishedBlock(ctx, x, y, S)` をそのまま流用してキャッシュ canvas へ1回だけ描画する。
3. 毎フレームの `draw(ctx)` は、可視範囲（`startCol/endCol/startRow/endRow`、既存ロジックを流用）を求めるところまでは変えず、ブロック単位のループ描画をやめて、可視矩形1回分の `ctx.drawImage(this.tileCacheCanvas, sx, sy, sw, sh, sx, sy, sw, sh)` に置き換える。

## 差分更新（キャッシュ無効化）

- 地形破壊の実装を洗った結果、破壊経路は `damageBlock(r, c, damage)` 一本に集約されている（`destroyArea` は内部で `damageBlock` を呼ぶだけ。呼び出し元は `Grenade.js`, `Missile.js`, `EnemyHomingMissile.js`, `EnemyCruiseMissile.js`）。
- `damageBlock` 内で `blockHP[r][c] <= 0` となり `grid[r][c] = BLOCK_EMPTY` にした直後に `this.invalidateTileRegion(r, c)` を呼ぶ1箇所のフックのみで済む。
- `invalidateTileRegion(centerR, centerC)`: 中心タイルと周囲8マス（計9マス、マップ境界はクランプ）について、キャッシュ canvas 上の該当矩形を `clearRect` した後、`grid[r][c]` が非空なら `_drawRockyBlock` / `_drawPolishedBlock` で再描画する。
  - 周囲8マスも再描画対象に含める理由: `_drawRockyBlock` の露出判定（`expTop/expBottom/expLeft/expRight`）と角の面取り（`notchTL` 等）は隣接タイルの `grid` 状態を参照して決まるため、中心タイルが空洞化すると隣接タイルの見た目（面取り・エッジ）も変わる。
  - 破壊された中心タイル自体は空洞になるため再描画は不要（`clearRect` のみで足りる）。

## テスト方針

`node --test` によるユニットテストを新規追加する（`tests/map-render-cache.test.js`）。

- キャッシュ canvas が `Map` 生成時に期待サイズ（`this.width × this.height`）で存在すること。
- `damageBlock` によってブロックが破壊された際、キャッシュ上で中心タイル＋周囲8マス（境界はクランプ）に対応する再描画が実際に発生していること。`_drawRockyBlock` 等を呼んだかどうかをスパイして呼び出し座標を検証する形にし、`assert.ok(true)` のような形骸化したテストにはしない。
- 既存の全ユニットテスト（`npm test`）がグリーンのまま保たれること。

## スコープ外

- ノーマル/ニュータイプの `gameSpeed` 差（現行20%を維持、変更しない）。
- 低スペックPCでの `MAX_TICKS` まわりの追いつき対策（別機会に回す）。
- 見た目・60fps維持の実機確認はユーザーが行う（[[manual-verification-by-user]]）。
