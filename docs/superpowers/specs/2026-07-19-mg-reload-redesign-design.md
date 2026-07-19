# マシンガン・リロード設計の見直し 設計書

日付: 2026-07-19

## 課題

現状はリロード開始時に弾倉が満タンになり、満タンでもリロードが走る(武器切替時など)。プレイヤーは満タンのマシンガンで60フレーム待たされる。リロードのトリガーが4箇所(切替、ミサイル切れ自動切替×2、撃ち切り)に散在している。

## 方針(ユーザー決定事項)

1. **補充はリロード完了時**(開始時ではなく)
2. **リロード開始判断は残弾閾値ベース**: 残弾が50%以下(16発中8発以下)のときだけリロードする
3. **残弾があるうちは撃ち切りを優先**: リロード開始は「射撃キーを離している時 or 残弾0の時」に限る
4. 判断ロジックは1箇所に集約する

## 設計

### 判断ロジック(純関数、1箇所)

`src/js/utils/mgReload.js`(新規):

```js
import { PLAYER_MG_RELOAD_THRESHOLD } from './Constants.js';

export function shouldStartMGReload(burstLeft, burstSize, fireHeld) {
    if (burstLeft > burstSize * PLAYER_MG_RELOAD_THRESHOLD) return false; // 50%超は温存
    return burstLeft === 0 || !fireHeld; // 撃ち切ったか、指を離した時だけ
}
```

### Player 側(毎フレーム、`update()` 内)

- **完了時補充**: `_updateTimers` で `mgReloadTimer` が 1→0 になった瞬間 `mgBurstLeft = PLAYER_MG_BURST_SIZE`
- **開始チェック**: `currentWeapon === 'mg'` かつ `mgReloadTimer === 0` のとき、`shouldStartMGReload(mgBurstLeft, PLAYER_MG_BURST_SIZE, fireHeld)` が true なら `mgReloadTimer = PLAYER_MG_RELOAD_TIME`
  - `fireHeld = input.mouse.left || input.isKeyDown('Space')`
- リロード中は射撃不可(現行どおり、`_fireMachineGun` 冒頭のガード維持)

### 散在トリガーの削除(4箇所)

- `Player.switchWeapon()`: MG切替時の `mgReloadTimer` 設定と `mgBurstLeft` リセットを削除(切替は弾倉に触らない)
- `main.js _fireMissile()`: ミサイル切れ自動切替2箇所の `mgReloadTimer = PLAYER_MG_RELOAD_TIME` を削除
- `main.js _fireMachineGun()`: 撃ち切り時の `mgReloadTimer` 設定と `mgBurstLeft` 補充を削除(残弾0になれば毎フレームチェックが翌フレームに開始する)

### 定数

`Constants.js`: `PLAYER_MG_RELOAD_THRESHOLD = 0.5`

### 挙動まとめ

- 満タン(または9発以上)でMGへ切替 → リロードなし、即射撃可
- 8発以下でも射撃キーを押している間は撃ち続けられる(0になったらリロード)
- 8発以下で射撃キーを離す → リロード開始、60フレーム後に16発回復
- リロード途中の武器切替往復では踏み倒せない(補充は完了時のみ。タイマーは切替中も進行)
- HUD(`RELOAD` / `RDY n` 表示)・`_resetMGState`・ドック補給は変更不要

## テスト(`tests/mg-reload.test.js` 新規)

- `shouldStartMGReload` 純関数: 50%超(9発)→false / 8発+キー押下→false / 8発+キー解放→true / 0発+キー押下→true / 0発+キー解放→true / 境界(8発ちょうど=50%)→開始対象
- 統合(可能なら Player をモックgameで駆動、audioManager が node で import 不可なら純関数テストのみ): リロード完了フレームで満タン復帰

## 変更ファイル

- Create: `src/js/utils/mgReload.js`
- Modify: `src/js/utils/Constants.js`, `src/js/entities/Player.js`, `src/js/main.js`
- Test: `tests/mg-reload.test.js`

## スコープ外

- リロード時間・弾倉サイズの数値変更、HUD表示の変更、敵側の武器
