# キャリアドッキング中の武器切り替え機能 設計書

日付: 2026-09-06

## 課題・背景

自機がキャリア（母艦）にドッキングしている最中は、`F` キーを押しても武器の切り替え（ミサイル ⇄ マシンガン）および手動リロードの入力が受け付けられなかった。
これにより、プレイヤーはドッキング中に次の戦闘に備えて武器を選択しておくことができず、必ず一度発進（`W` キー）してから `F` キーを押す必要があった。

### 原因

`src/js/main.js` の `_updatePlaying()` 内で、武器キー入力判定に `!this.player.docked` というガードが存在していたため。

```javascript
if (this.input.isKeyPressed('KeyF') && this.player && this.player.alive && !this.player.docked) {
    this.player.pressWeaponKey();
}
```

## 方針（設計上の決定事項）

1. **ドッキング中も `KeyF`（`pressWeaponKey()`）を受け付ける**
   * `!this.player.docked` のガードを解除し、自機が生存中（`this.player.alive`）かつプレイ中画面であればドッキング中でも `pressWeaponKey()` を実行可能にする。
2. **射撃の安全性維持**
   * 射撃処理（`CombatActions.js` の `_handleShooting()`）には別途 `if (!player || !player.alive || player.docked) return;` のガードがあるため、ドッキング中に武器を切り替えても誤射・誤投擲は一切発生しない。
3. **HUD・描画の連動**
   * HUDの武器表示（`HUD.js`）は `player.currentWeapon` を参照しているため、ドッキング中に切り替えると即座にハイライトが移り、切り替え音（`audioManager.playSwitch()`）も鳴る。
   * 自機本体はドッキング中はしゃがみ姿勢（腕は非表示）だが、発進（`W` キー）した瞬間に選択中の武器を構えて飛び立つ。
4. **オプション設定（`autoSwitchMissile`）との親和性**
   * `autoSwitchMissile: true`（ON）の場合: ドッキング成立時にミサイルへ自動で持ち替えるが、その後ドッキング待機中に `F` キーを押せば任意で MG に変更できる。
   * `autoSwitchMissile: false`（OFF、既定）の場合: ドッキング前の武器を維持しつつ、ドッキング中に自由に武器を選択できる。
   * ミサイル残弾が0発の状態でミサイルを選択していても、`Player.js` の `pressWeaponKey()` は最優先で MG への切り替えを行うため、詰まることなく安全に切り替え可能。

## 影響範囲

* `src/js/main.js`: `KeyF` 判定部の `!this.player.docked` を解除。
* テスト: ドッキング中に `KeyF` で武器切り替えが行われることを保証するユニットテストを追加。
