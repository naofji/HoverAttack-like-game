# 水中最大落下速度の倍率調整 実装計画書

日付: 2026-09-06
設計書: `docs/superpowers/specs/2026-09-06-water-fall-speed-scale-design.md`

## 概要

自機（プレイヤー）およびグレネードの水中最大落下速度を `WATER_FALL_SPEED_SCALE = 0.42` により現行の約半分（実速度 1.25〜1.5 px/frame 程度）に抑え、快適な水中浮遊感と弾道プレビューの完全一致を実現する。

## 実装ステップ

### 1. 定数の追加 (`src/js/utils/Constants.js`)
* `WATER_FALL_SPEED_SCALE = 0.42` を追加・エクスポート。

### 2. テストの作成 (`tests/water-falling-speed.test.js`)
* 自機（Player）が水中において `PLAYER_MAX_FALLING_SPEED * WATER_FALL_SPEED_SCALE` でキャップされること。
* 空中から高速（`vy = 7.0`）で水中に飛び込んだ際、即座に水中の上限速度にクランプされること。
* グレネード（Grenade）が水中において `GRENADE_MAX_FALLING_SPEED * WATER_FALL_SPEED_SCALE` でキャップされること。
* `_calcGrenadeTrajectory` が水中での新しい終端速度を反映し、Grenade 実体と全ステップで一致すること。

### 3. ソースコードの修正
* `src/js/entities/Player.js`: `_updateSpeedCaps()` で水中判定と `WATER_FALL_SPEED_SCALE` の適用。
* `src/js/entities/Grenade.js`: `update()` で水中判定と `WATER_FALL_SPEED_SCALE` の適用。
* `src/js/systems/CombatActions.js`: `_calcGrenadeTrajectory()` 内で `WATER_FALL_SPEED_SCALE` の適用。

### 4. 検証
* `node --test tests/water-falling-speed.test.js`
* `npm test`（全件通過）
