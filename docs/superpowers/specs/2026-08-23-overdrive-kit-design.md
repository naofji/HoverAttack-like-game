# オーバードライブキット（heavy のレア版ドロップ）

2026-08-23

## 狙い

heavy が落とすキットに「一定時間 弾が減らない」効果を足して、爽快感の山を作る。
ミサイルは無限、マシンガンはリロード無しで打ちっぱなし。

### 「一発逆転」は狙わない（判断の記録）

ユーザーの当初の意図には「一発逆転性」も入っていたが、heavy を倒せている状況は
たいてい既に有利で、ピンチのときほど heavy は落とせない。この報酬は逆転ではなく
「有利をさらに気持ちよく拡大する」方向に働く。逆転の役は rival のリペアキット
（ドロップ率 1.0）が既に担っているので、そちらと役割を分ける。

## 供給量の見積もり

スポーン重み（`ENEMY_ATTACKER_TYPES.spawnWeight`）とマップ面積
（`Map.js` の `targetAttackerCount = max(5, floor(40 * areaRatio))`、5面で頭打ち）から:

| | アタッカー数 | heavy の割合 | heavy 体数 | キット（×0.6） |
|---|---|---|---|---|
| 3〜4面 | 22 → 30 | 29.4% | 6.5 → 8.8 | 3.9 → 5.3 |
| 5面 | 40 | 25% | 10 | 6.0 |
| 6面以降 | 40 | 12.5% | 5 | 3.0 |

6面以降で薄くなるのは artillery（重み100）が加わって heavy の相対出現率が半減するため。
**周回シールドが付いて最も難しい面で報酬が最も薄い**という逆進があるので、レア版の
確率を面で変えて打ち消す:

| | 3面 | 4面 | 5面 | 6面以降 |
|---|---|---|---|---|
| レア版の確率 | 0.25 | 0.25 | 0.25 | 0.60 |
| レア版の個数 | 0.98 | 1.32 | 1.50 | **1.80** |

ハズレ側（通常のミサイル補給）も 6面以降で 1.2個/面 残るので、補給が枯れることはない。

## 設計

### アイテム

`OverdriveKit extends MissileKit`。満タン補給を継承し、その上に時限バフを乗せる。

同じ `game.missileKits` 配列に入れるのが要点で、拾得の判定・更新・描画をまるごと
共用できる（配列を1本増やすと main.js の更新順に手を入れることになる）。
ドロップは `EnemyAttacker.die()` の1行を分岐に変えるだけ:

```js
const rare = Math.random() < overdriveDropChance(this.game.missionsCompleted);
this.game.missileKits.push(new (rare ? OverdriveKit : MissileKit)(this.game, cx, this.y));
```

`game.rng` ではなく `Math.random()` を使う既存の経路なので、週次の決定性には影響しない。

### 効果

`Player.overdriveTimer` / `overdriveMaxTimer`（`autoAimTimer` と同じ形）。

- ミサイル: `consumeMissile()` の `debugInvincible` の分岐に条件を1つ追加
- MG: `main.js` の `player.mgBurstLeft--` を `Player.consumeMGRound()` に寄せ、そこで判定
- グレネードは対象外

**`mgReload.js` の6つの規則には一切触っていない。** 残弾が満タンのままなら
規則1（弾切れ）も規則4（しきい値）も成立しないので装填が始まらず、F の手動装填も
`burstLeft < burstSize` が偽になって空振りする。打ちっぱなしはその副作用として出る。

### 時間

`OVERDRIVE_DURATION = 2160` tick。`autoAimTimer` と同じくシムティックで減るので、
実時間では newtype 36秒 / normal 45秒。どちらも狙いの 30〜45秒に収まる。
減算は `_simulationTick()` の内側（設定画面を開いている間は止めたいため）。

重ね取りの上限は `OVERDRIVE_MAX_DURATION = 4320`（2本ぶん）。
HUD バーの分母は上限ではなく「そのとき持っていた最大」にした。上限に固定すると
1個拾っただけではバーが半分しか溜まらず、損をしたように見えるため。

### 演出

- 自機のまわりに赤い輝き（`Player._drawOverdriveGlow`）。機体より**先に**描いて
  背後から漏れる光にする。手前に描くと機体が赤く塗り潰されて被弾の点滅と紛らわしい。
  半径は自機の幅の 2.2倍（35px）。3.0 では狭い通路が丸ごと赤くなって地形が読めなかった。
- 残り3秒（`OVERDRIVE_WARN_TICKS = 180`）で輝きと HUD バーが同時に点滅。
  無限だと思って撃っていた弾が予告なく減り始めるのが一番きついため。
- アイテムは金色＋稲妻。通常のミサイルキットが赤なので、拾う前に見分けがつく。
  機体の輝きを赤にしているのは「過負荷で焼けている」絵にしたいからで、
  アイテムの色分け（金＝レア／赤＝通常）とは別の話。
- 起動音 `WEAPON_SOUNDS.overdrive`。上へ開いて hold で保つ掃引。
  最初 hiss 0.030 / tone 0.055 で組んだら A特性の実測で基準比 +2.3dB と表の中で最大
  （自機ミサイル -5.0dB を 7dB 上回る）だったので 0.667倍し、-1.1dB に。
  同じ「稀に鳴る報せ」であるレディの声（-0.8dB）と揃えた。

## 触ったファイル

| ファイル | 内容 |
|---|---|
| `utils/Constants.js` | 確率・時間・演出の定数 |
| `utils/drops.js`（新規） | `overdriveDropChance()` |
| `entities/OverdriveKit.js`（新規） | アイテム本体 |
| `entities/EnemyAttacker.js` | ドロップの振り分け |
| `entities/Player.js` | タイマー・消費判定・赤い輝き |
| `main.js` | `_updateOverdrive()`、MG 消費の寄せ |
| `ui/HUD.js` | O-DRIVE バー |
| `ui/ScreenRenderer.js` | 遊び方画面の ITEMS を表（`ITEM_GUIDE`）にして4行目を追加 |
| `docs/仕様書.md` | アイテム節・HUD 表・敵の表 |

## ついでに直したもの

`docs/仕様書.md` の敵の表にあったドロップ率が実装とずれていた（2026-08-22 の
バランス調整を反映していなかった）。ライバル 30% → **100%**、砲撃型 30% → **50%**。
