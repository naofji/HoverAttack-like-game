# セル・オートマトン水流シミュレーション 実装計画書

日付: 2026-09-06
ブランチ: `feat/water-flow-simulation`
設計書: `docs/superpowers/specs/2026-09-06-water-cellular-automata-design.md`

## 実装ステップ

### 1. 定数の追加 (`src/js/utils/Constants.js`)
- `MAX_WATER_MASS = 8`
- `MIN_WATER_MASS = 1`

### 2. 流体シミュレーションコアの実装 (`src/js/world/waterSimulation.js`)
- `stepWaterSimulation({ water, rows, cols, isSolid, activeCells })`
- 垂直落下、斜め滑落、水平拡散のアルゴリズム。
- 質量保存の徹底。

### 3. 単体テストの作成 (`tests/water-simulation.test.js`)
- 自由落下、階段滑落、U字管水位平衡、質量保存の検証。

### 4. `Map.js` の改修
- `_generateWater`: 生成された水プールを水量 `MAX_WATER_MASS` (8) として記録。
- `isWater(r, c)`: `water[idx] >= MIN_WATER_MASS`
- `isWaterAtPixel(x, y)`: 最上段セルの液面高さ（`(r + 1 - mass / 8) * 16`）に基づくピクセル判定。
- `destroyArea` / `destroyTile`: 破壊セルの周囲を `activeWaterCells` に追加。
- `update()`: 地底湖かつアクティブセルがある場合に `stepWaterSimulation` を実行し、変更があれば `onWaterChanged` を呼ぶ。

### 5. `water.js` の改修
- `paint`: 水量に応じた描画高さ（`(1 - mass / 8) * 16` から下端まで）。
- `surfaces`: 水面セルの収集時に水量に応じた液面高さ `y` を記録。

### 6. 検証
- `node --test tests/water-simulation.test.js`
- `npm test`（全件通過）
