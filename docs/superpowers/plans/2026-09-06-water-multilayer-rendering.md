# 水とブロック境界の多層水描画（案A） 実装計画書

日付: 2026-09-06
設計書: `docs/superpowers/specs/2026-09-06-water-multilayer-rendering-design.md`

## 概要

地底湖ステージにおいて、水とブロックの境界で面取りによる水の欠けを防止し、立体的な水中深度表現を実現するため、案A（下層水 `drawBehindTerrain` ＋ 前景水 `drawOverWorld`）を実装する。

## 実装ステップ

### 1. 定数の追加 (`src/js/utils/Constants.js`)
- `WATER_BEHIND_FILL = 'rgba(40, 120, 200, 0.35)'` を定義。
- `WATER_FILL` を `'rgba(40, 120, 200, 0.35)'` に調整。

### 2. 水レンダラーの拡張 (`src/js/world/environment/water.js`)
- `behindCache`（下層水用オフスクリーンキャンバス）を新設。
- 水に隣接するブロックセル（8近傍）を収集・塗布するロジックを追加。
- `invalidate(cells)` で流入セルおよびその周囲の境界セルを再描画。
- `drawBehindTerrain(ctx, camX, camY)` を実装し、`behindCache` の画面視野内を一括転送。

### 3. 単体テストの追加 (`tests/water-environment.test.js`)
- `createWaterRenderer` が `drawBehindTerrain` を提供し、呼び出し時に `drawImage` を実行すること。
- 水に隣接するブロックセルが下層キャッシュに描画されること。
- ブロック破壊時の `invalidate` で境界セルが正しく更新されること。

### 4. 検証
- `node --test tests/water-environment.test.js`
- `npm test`（全件通過）
