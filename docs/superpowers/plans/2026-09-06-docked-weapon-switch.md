# キャリアドッキング中の武器切り替え機能 実装計画書

日付: 2026-09-06
設計書: `docs/superpowers/specs/2026-09-06-docked-weapon-switch-design.md`

## 概要

自機がキャリアにドッキング中（`player.docked === true`）でも `KeyF` キーにより武器選択（ミサイル ⇄ マシンガン）を変更できるようにする。

## 実装ステップ

### 1. テストの作成 (`tests/docked-weapon-switch.test.js`)
* ドッキング中（`docked: true`）でも `KeyF` 押下で `pressWeaponKey()` が呼ばれること。
* ドッキング中に武器をトグル（`missile` ↔ `mg`）できること。
* ポーズ中（`gameState !== 'playing'`）ではドッキング中であっても `pressWeaponKey()` が呼ばれないこと。

### 2. ソースコード修正 (`src/js/main.js`)
* `_updatePlaying()` 内の `KeyF` 入力判定から `!this.player.docked` を削除。
* なぜドッキング中でも安全に呼べるか（射撃側の独立ガード `_handleShooting()`、HUD連動、発進時の挙動）を日本語コメントで明記。

### 3. 検証
* `npm test` を実行し、既存テストおよび新規テストの全件通過を確認する。
