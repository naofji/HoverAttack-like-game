# グレネード軌道プレビューの環境係数・バリア連動 実装計画書

日付: 2026-09-06
設計書: `docs/superpowers/specs/2026-09-06-grenade-trajectory-environment-design.md`

## 概要

グレネードの弾道プレビュー計算（`_calcGrenadeTrajectory`）に水中などの環境係数（`motionFor`）およびバリア判定を適用し、実体の軌道と完全に一致させる。

## 実装ステップ

### 1. テストの作成 (`tests/grenade-trajectory.test.js`)
* 陸上において、`Grenade` の実際のステップ座標と `_calcGrenadeTrajectory` の座標が一致すること。
* 水中において、`_calcGrenadeTrajectory` が減速・浮力（`motionFor`）を反映し、実際の `Grenade` の水中座標と一致すること。
* バリアがある場合、バリアに当たった位置で軌道計算が終了すること。

### 2. ソースコード修正 (`src/js/systems/CombatActions.js`)
* `motionFor` を `../world/StageEnvironment.js` からインポート。
* `GRENADE_GRAVITY`, `GRENADE_MAX_FALLING_SPEED`, `GRENADE_BOUNCE`, `GRENADE_FRICTION`, `GRENADE_LIFETIME` を `../utils/Constants.js` からインポート。
* `_calcGrenadeTrajectory` の物理計算ループを `Grenade.js` の物理計算と同一にし、`motionFor(this, x, y)` を適用。
* バリア（`this.barriers`）との接触判定を追加。

### 3. 検証
* `node --test tests/grenade-trajectory.test.js`
* `npm test`（全件通過）
