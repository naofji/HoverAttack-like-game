# 反射ビームの水面反射 実装計画書

日付: 2026-09-06
設計書: `docs/superpowers/specs/2026-09-06-water-reflect-beam-design.md`

## 概要

反射ビーム（`ReflectBeam`）が地形だけでなく水面（空気と水の境界面）でも反射するように `beamPath.js` と `ReflectBeam.js` を拡張し、水面反射時に水面の波紋（`addRipple`）を発生させる。

## 実装ステップ

### 1. `tests/beam-path.test.js` にテストを追加
- 水面（`isWaterAtPixel`）を持つマップで、空中から斜め下に進入したビームが水面で `vy` を反転させ（`bounced: true`）、`waterBounced: true` を返すこと。
- 水面反射後、ビーム座標が水面の上（空気中）にとどまり水中に進入しないこと。
- 固体壁での通常の反射では `waterBounced: false` であること。

### 2. `src/js/utils/beamPath.js` の改修
- `stepBeam` 内で `isWaterAtPixel` を参照し、水面境界（`isWater(px, py) !== currentWater`）を障害物として扱う。
- 反射判定において、衝突原因が水面境界である場合に `waterBounced: true` を返す。

### 3. `src/js/entities/ReflectBeam.js` の改修
- `next.bounced` 時に `next.waterBounced` が true で、`game.env.renderer.addRipple` が存在する場合、反射座標（`this.x`）に波紋を追加。

### 4. `tests/reflect-beam.test.js` にテストを追加
- 水面を持つゲーム環境で `ReflectBeam` が水面に到達した際、跳ね返って `bounces` が増加し、`addRipple` が呼ばれること。

### 5. 検証
- `node --test tests/beam-path.test.js`
- `node --test tests/reflect-beam.test.js`
- `npm test`（全テスト通過）
