# Auto Aim の一時解除（Shift 長押し）設計

2026-08-14

前提: [リロード・全画面・Auto Aim の設定拡張 設計](2026-08-13-reload-fullscreen-autoaim-settings-design.md)。
その設定機構（`choice` / `int` / `flag` の型と `SETTINGS_ITEMS` の表）の上に、設定を2つ足す。

## 背景

Auto Aim は拾うと 60 秒（上限 3 分）効き続け、**途中で切る手段が無い**。近くの敵に
勝手にスナップするので、狙いたい相手が別にいるときに邪魔になる。マウスを大きく振れば
その場のロックは外れるが、次のフレームにはまた吸い付く。

一方で残り時間の減り方にも穴がある。**母艦にドッキングしている間はタイマーが止まる** —
`_updateAutoAim()` が `player.docked` で早期 return するため、減算まで届かない。
Auto Aim を温存したまま補給に戻る立ち回りが成立してしまう。

## 決めたこと

- **`Shift` の長押しで Auto Aim を解除／再開する。** 短く押せば従来どおりクロスヘアロック
- **解除中も残り時間は減る。** 解除は「節約」ではなく「今は手動で狙いたい」ための操作
- **ドック中も残り時間は減る**（挙動変更）
- **設定画面を開いている間は止まる**（現状の性質を維持する。下記のとおり新しい処理は要らない）
- **長押しの時間**と**ユニットを拾ったときに再開するか**を設定にする
- 既定値は「今までに一番近い」側に倒す

## 設計

### 1. `Shift` をタップと長押しに分ける

いまの `Shift` は**押した瞬間**に `input.crosshairLocked` を反転する。長押しは押した瞬間から
始まるので、このままでは**長押しのたびにクロスヘアロックが道連れで切り替わる**。

| 操作 | 動作 | 発火のタイミング |
|---|---|---|
| しきい値未満で離す | クロスヘアロックを反転 | **離した瞬間** |
| しきい値に達する | Auto Aim の解除／再開を反転 | **達した瞬間**（離しても何も起きない） |

タップの確定が数フレーム遅れるのが代償だが、`Shift` 1本に収まる。別のキーを足すと
`HOW TO PLAY` の一覧が伸びる。

**判定は `src/js/utils/holdKey.js` の純関数に出す。** 「押し始め・しきい値通過・離した」の
3つの縁を数えるだけの状態機械で、DOM もゲームも要らない。`utils/` に置いてテストする
（`mgReload.js` / `aimLead.js` と同じ立ち位置）。

```js
/**
 * 長押しとタップを1つのキーで見分ける。
 * @param {object} state 呼び出し側が持つ状態（{heldMs, fired}）
 * @param {boolean} down 今このフレームに押されているか
 * @param {number} deltaMs 実経過ミリ秒
 * @param {number} thresholdMs 長押しと見なす時間
 * @returns {{state: object, tap: boolean, hold: boolean}}
 */
export function stepHoldKey(state, down, deltaMs, thresholdMs)
```

- `hold` は**しきい値を跨いだ1回だけ**真になる（`fired` で二度目を止める）。押しっぱなしで
  連続発火すると、0.3 秒ごとに解除と再開を往復してしまう
- `tap` は**離したフレームで `fired` が偽のときだけ**真
- 戻り値で新しい状態を返し、元は書き換えない（`stepSetting()` と同じ流儀）

**計測は実時間（ミリ秒）で行う。** 既存の長押しはグレネードの `Input.rightHoldFrames` で
**フレーム数**を数えているが、120Hz のディスプレイでは体感が半分になる。今回は設定画面に
「秒」で表示する以上、表示と実物がずれるのは避けたい。`_updatePlaying(deltaTime)` が
実経過ミリ秒を持っているのでそれを積む。**グレネード側は今回触らない**（挙動を変えない）。

### 2. `Shift` の処理をプレイ中に閉じる

`update()` 直下（コメント `// Lock-on toggle works in all states`）から
`_updatePlaying()` の中へ移す。**`F` キーと同じ場所・同じ理由。**

`this.player` は `'settings'`（ポーズ中）・`'mission_clear'`・`'ranking_entry'` でも
`alive` かつ未ドックのまま残るので、自機の状態を見るだけでは「プレイ中限定」にならない。

失うものは無い。**撃てるのはプレイ中だけ**なので、プレイ外でクロスヘアをロックしても
見た目が変わるだけで何にも使えない。既存コメントの「全状態で効く」は意図というより
置き場所の結果に見える。

**プレイ状態を離れるときに長押しの計測をリセットする。** `Shift` を押したまま設定画面を
開いて閉じると、たまった時間で即座に発火してしまうため。`_openSettings()` で落とす。

### 3. 残り時間の減り方

`autoAimTimer` の減算を `_updateAutoAim()` のガードより**前**へ移す。

| 状況 | 減るか | 効くか | 備考 |
|---|---|---|---|
| 通常 | 減る | 効く | 現行どおり |
| **ドック中** | **減る** | 効かない | **変更**。母艦で温存する立ち回りを作らない |
| **`Shift` で解除中** | **減る** | 効かない | **新規** |
| マウスを振ってロック解除中 | 減る | 効かない | 現行どおり |
| 自機が死亡中 | 減らない | 効かない | 現行どおり |
| **設定画面を開いている間** | **止まる** | — | 下記 |

```js
// 残り時間は「実際に効いているか」と無関係に減る。ドック中も解除中も減らすのは、
// Auto Aim を温存して使い回す立ち回りを作らないため
if (!player || !player.alive || player.autoAimTimer <= 0) { …; return; }
player.autoAimTimer--;
if (player.docked || player.autoAimPaused) { …; return; }
```

**設定画面で止まるのは、新しい判定を足すからではない。** `gameState === 'settings'` の間は
`_updateGameState()` が `_updatePlaying()` を呼ばず、`_simulationTick()` が回らないので
`_updateAutoAim()` 自体が呼ばれない。**減算を `_simulationTick()` の内側に留めることが
この性質を守る条件**であり、`update()` 直下など外へ出してはいけない。回帰テストで縛る。

### 4. 解除状態（`Player#autoAimPaused`）

- **`Shift` 長押しで反転するのは、Auto Aim を持っているとき（`autoAimTimer > 0`）だけ。**
  持っていないときの長押しは何も起こさない（タップも発火しない — 長押しだったので）。
  持っていない間に反転できてしまうと、次に拾った瞬間の状態が「いつ長押ししたか」で
  決まり、`autoAimResumeOnPickup` の意味が読めなくなる
- **`respawn()` で落とす**（`autoAimTimer` も 0 に戻る場所なので、そこに揃える）
- ユニットを拾ったときの扱いは**設定で選ぶ**（下記 `autoAimResumeOnPickup`）
- 残り時間が 0 になっても**自動では落とさない**。落とすと、次に拾った瞬間の状態が
  「拾う前に切っていたかどうか」ではなく「切れる前に時間が尽きたか」で決まってしまい、
  設定の意味が濁る

### 5. 画面表示

| 見せ方 | 条件 |
|---|---|
| HUD の Auto Aim ゲージ | **変更しない。** 残り時間は減り続けるので、見た目もそのまま減らす |
| クロスヘアを**通常色**に戻す | 解除中（今は `autoAimTimer > 0` だけで赤くしている） |
| クロスヘアの**右下**に **`AUTO OFF`** | 解除中 **かつ** 残り時間 > 0 |

`AUTO OFF` はクロスヘアの中心から右下へ少し離して置く。真上・真横だと照準の線と
重なって読みにくく、狙っている相手も隠す。文字はごく小さく、`UI.dim` 相当の落ち着いた色で
（警告ではなく状態表示なので、赤や点滅は使わない）。

残り時間が 0 になれば `AUTO OFF` は消え、ただのクロスヘアに戻る。文字を出す条件に
残り時間を含めるのはそのため — 解除フラグは残り続けるので、フラグだけを見ると
Auto Aim を持っていないのに `AUTO OFF` が出続ける。

### 6. 設定を2つ足す

```
AUTO-AIM RELEASE                     4
AUTO-AIM HOLD TO TOGGLE        0.3 SEC   ← 新規
RESUME AUTO-AIM ON PICKUP           ON   ← 新規
```

| キー | 型 | 値 | 既定 | 既定の理由 |
|---|---|---|---|---|
| `autoAimHoldTenths` | `int` | 1〜20 | `3` | 0.3 秒。タップと区別でき、待たされる感じもしない長さ |
| `autoAimResumeOnPickup` | `flag` | 真偽値 | `true` | 拾って何も起きないと壊れて見えるため |

**`int` は整数しか刻めないので 1/10 秒単位で持ち、表示だけ `0.3 SEC` に整える。**
そのために `SETTINGS_ITEMS` の行へ **`format(v)` を1つ足す**（`dimWhen` と同じ、
行に持たせるオプション）。値の型は増やさない。

```js
{ key: 'autoAimHoldTenths', label: 'AUTO-AIM HOLD TO TOGGLE', type: 'int',
  format: (v) => `${(v / 10).toFixed(1)} SEC` },
{ key: 'autoAimResumeOnPickup', label: 'RESUME AUTO-AIM ON PICKUP', type: 'toggle' },
```

`settingValueText()` は `item.format` があればそれを使い、無ければ従来どおり
`${v}${suffix ?? ''}` を返す。

上限 2.0 秒で止めるのは、これ以上は「押し間違いを防ぐ」域を超えて操作として重くなるため。
下限 0.1 秒は、タップと区別できる最小。

### 7. `HOW TO PLAY`

`SHIFT` の説明を `LOCK-ON AIM (TAP) / AUTO-AIM ON-OFF (HOLD)` に変える。

## テスト

| 対象 | 見るもの |
|---|---|
| `holdKey.js` | しきい値を跨いだ1フレームだけ `hold` が真。押しっぱなしで再発火しない |
| `holdKey.js` | しきい値未満で離すと `tap`。しきい値超えで離しても `tap` にならない |
| `holdKey.js` | 元の状態を書き換えない。しきい値の変更が効く |
| `main.js` 配線 | `Shift` 長押しで `autoAimPaused` が反転し、短押しで `crosshairLocked` が反転する |
| `main.js` 配線 | Auto Aim を持っていない（`autoAimTimer === 0`）ときの長押しは何も起こさない |
| `main.js` 配線 | **ポーズ中（`gameState === 'settings'`）に `Shift` を押しても何も起きない** |
| `main.js` 配線 | 設定画面を開くと長押しの計測が落ちる（閉じた直後に誤発火しない） |
| `_updateAutoAim` | **ドック中もタイマーが減る**（回帰。現行は減らない） |
| `_updateAutoAim` | **解除中もタイマーが減り、スナップはしない** |
| `_updateAutoAim` | 死亡中は減らない |
| **`_updateAutoAim`** | **`gameState === 'settings'` の間、`update()` を何度呼んでもタイマーが減らない**（減算を `_simulationTick()` の外へ出す変更を検出する） |
| `Player` | `respawn()` で `autoAimPaused` が落ちる |
| `AutoAimUnit` | 拾ったとき、設定 ON なら解除が解け、OFF なら解除のまま |
| 描画 | 解除中はクロスヘアが通常色。`AUTO OFF` は「解除中かつ残り時間 > 0」のときだけ出る |
| 設定 | `int` の `format` が効く。既定 3 が `0.3 SEC` と出る |
| `demo-screens` | `SHIFT` の説明が更新されている |

## やらないこと

- **グレネードの右クリック長押しをミリ秒に揃えない。** 実測で詰めた感触があり、今回の
  変更と関係がない。`holdKey.js` へ寄せるのは、そちらを触る用事ができたときでよい
- **解除中に Auto Aim ゲージの見た目を変えない。** ユーザーの指定どおり、`AUTO OFF` の
  文字だけで伝える
- **残り時間が 0 になったときに解除フラグを自動で落とさない**（4節の理由）
