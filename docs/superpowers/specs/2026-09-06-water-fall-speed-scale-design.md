# 水中最大落下速度の倍率調整 設計書

日付: 2026-09-06

## 課題

テストプレイヤーより「水中での落下速度がやや速すぎる」との指摘があった。

### 原因

現行の物理処理では、重力加速度（`GRENADE_GRAVITY * motion.gravity`）や速度（`speed * motion.speed`）はスケーリングされているものの、最大落下速度（終端速度キャップ）は空気中と同じ定数がそのまま使われていた：
* 自機: `PLAYER_MAX_FALLING_SPEED = 7.0`（水中実速度 `7.0 × 0.5 = 3.5 px/frame`、秒間約13ブロック沈む）
* グレネード: `GRENADE_MAX_FALLING_SPEED = 6.0`（水中実速度 `6.0 × 0.5 = 3.0 px/frame`、秒間約11ブロック沈む）
* キャリア: `CARRIER_MAX_FALLING_SPEED = 5.0`（水中実速度 `5.0 × 0.5 = 2.5 px/frame`、秒間約9.4ブロック沈む）

さらに、空中から勢いよく飛び込んだ場合もそのままの速度で沈み続けるため、水中での抵抗感・浮遊感が損なわれていた。

## 方針（設計上の決定事項）

1. **空気中最大落下速度に対する倍率 `WATER_FALL_SPEED_SCALE` の新設**:
   固定値の絶対値ではなく、空気中の最大落下速度に対する倍率（係数）として `WATER_FALL_SPEED_SCALE` を定義する。
   これにより、エンティティごとの個性の差（自機、グレネード、キャリアなど）が水中でも自然に保たれ、保守性も高まる。
2. **係数の値**:
   `WATER_FALL_SPEED_SCALE = 0.42` とする。
   * 自機: `7.0 × 0.42 = 2.94`（水中実速度 `2.94 × 0.5 =` **約 1.47 px/frame**。現行 3.5 の半分以下）
     * 自機の水中ホバー上昇速度（`-1.25`）とほぼ対称になり、水中での上下コントロールが大幅に向上する。
   * グレネード: `6.0 × 0.42 = 2.52`（水中実速度 `2.52 × 0.5 =` **約 1.26 px/frame**。現行 3.0 の半分以下）
     * スローモーションのようにゆっくりと水底へ沈んでいく絵になり、水中の重み・粘性を感じられる。
   * キャリア: `5.0 × 0.42 = 2.10`（水中実速度 `2.10 × 0.5 =` **約 1.05 px/frame**。現行 2.5 の半分以下）
     * 巨大な補給母艦が重厚にゆっくりと沈むようになり、水中の抵抗感が自然に表現される。
3. **適用箇所**:
   * `Player.js`: `_updateSpeedCaps()` で水中（`this.motion.speed < 1`）時に `maxFall = PLAYER_MAX_FALLING_SPEED * WATER_FALL_SPEED_SCALE` を適用。
   * `Grenade.js`: `update()` で水中時に `maxFall = GRENADE_MAX_FALLING_SPEED * WATER_FALL_SPEED_SCALE` を適用。
   * `CombatActions.js`: `_calcGrenadeTrajectory()` 内でも同様に適用し、右クリックの弾道プレビューと実体の軌道を1ピクセル単位で完全一致させる。
   * `Carrier.js`: `update()` で水中（`this.motion.speed < 1`）時に `maxFall = CARRIER_MAX_FALLING_SPEED * WATER_FALL_SPEED_SCALE` を適用。
