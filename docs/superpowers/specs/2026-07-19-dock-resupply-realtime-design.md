# ドック補給の実時間化 設計書

日付: 2026-07-19

## 課題

NORMALモードは `deltaTime × gameSpeed(0.8)` でシミュレーションを進めるため、シムフレーム単位で定義されたドック補給レート(`DOCK_*_RATE`)が実時間では1.25倍かかる(ミサイル: 6秒→7.5秒)。補給の体感速度をモード間で揃えたい。

## 方針

補給レートに `1 / gameSpeed` を掛けて**実時間基準**にする。NEWTYPE(1.0)は従来どおり、NORMAL(0.8)は実時間でNEWTYPEと同じ秒数(HP≈3.6秒 / ミサイル6秒 / グレネード6秒 / 燃料4秒)になる。

## 設計

`Player._updateDockedResupply()` の冒頭で係数を計算し、4つのレート全てに適用:

```js
const scale = 1 / (this.game.gameSpeed || 1);
```

- `this.hp += DOCK_HP_RATE * scale`(上限クランプは現行どおり)
- `this.missiles += DOCK_MISSILE_RATE * scale`
- `this.grenades += DOCK_GRENADE_RATE * scale`
- `this.hoverFuel += DOCK_FUEL_RATE * scale`

`|| 1` は `gameSpeed` 未設定のモックgameでも安全に動くためのフォールバック。

定数(`DOCK_*_RATE`)・モード定義(`modes.js`)・タイムステップ(`timestep.js`)は変更しない。

## テスト(`tests/dock-resupply.test.js` 新規)

`Player.prototype` + 最小状態(既存 `tests/mg-reload.test.js` の統合テストと同じ `Object.create` 方式)で `_updateDockedResupply` を直接駆動:

- `gameSpeed = 0.8` のとき、288シムフレーム(=実時間6秒相当: 60fps×6s×0.8)でミサイルが0→24(満タン)に達する
- `gameSpeed = 1.0` のとき、360シムフレームで同じく満タン(現行挙動の回帰確認)
- `gameSpeed` 未定義のモックでも例外なく動く(フォールバック)

## 変更ファイル

- Modify: `src/js/entities/Player.js`(`_updateDockedResupply` のみ)
- Test: `tests/dock-resupply.test.js`(新規)

## スコープ外

- ドック以外のタイマー類(リロード・無敵時間等)の実時間化(意図的にシム時間のまま)
- `DOCK_*_RATE` の数値バランス変更
