# artillery の煙幕（スモークスクリーン）設計

2026-08-11

## 何を作るか

artillery 型の敵アタッカーに、**自機に発見された瞬間に煙幕を張って自分の位置を隠す**能力を足す。
煙の中の敵は目視できず、Auto Aim のロック対象からも外れる。弾そのものは通るので、
位置を読めば倒せる。

新しい敵の種類を足すのではない。既存の artillery が持つ「遮蔽を探し直す」挙動に、
その移動を隠す手段を1つ与えるだけ。

## 引き金 — 既存の cover seek に相乗りする

`EnemyAttacker._updateCoverSeek()`（`src/js/entities/EnemyAttacker.js:502`）は
`ATTACKER_COVER_CHECK_INTERVAL` ごとに自機との LoS を判定し、通っていれば
`inCover = false` にして遮蔽位置を探し直す。**この「露出を検出した瞬間」が
そのまま「ばれた瞬間」**なので、ここに発煙を差し込む。

- 条件: `inCover` が false になった判定の回、かつ発煙クールダウンが空いている
- クールダウン: 480 tick（8秒）。回数は無制限
- 対象: `config.usesSmoke` が真の型のみ（型の表に1行足す。今は artillery だけ）

新しい状態を足さない理由: 煙を張ってから逃げ直す動きは、既存の
`_findCoverX` → `coverGoalX` へ歩く経路がそのまま「煙に隠れての移動」になる。
ステートマシンに手を入れるほどの利得がない。

## 煙のモデル

`game.smokeScreens` に `SmokeScreen`（`src/js/entities/SmokeScreen.js`）を1つ積む。
1つの雲が14個のパフを持ち、**パフが全部消えたら雲も死ぬ**（雲は独自の寿命を持たない。
撒きをずらすので、雲の時計とパフの時計を別に持つと必ずどちらかが先に切れて、
まだ濃いのに消える／消えたのに判定が残るのどちらかが起きる）。

パフは**自分の経過時間ひとつ**から半径・alpha・色の3つが出る。出たては小さく濃く白っぽく、
古くなるにつれ大きく薄く紫がかった灰になり、最後は完全に透明になって消える。

| 項目 | 値 | 根拠 |
|---|---|---|
| パフ数 | 14 | 半径34px × 14枚で画面幅の1/4ほどを覆う。枚数で濃さを作るので1枚は薄い |
| 半径 | 16px → 34px（自分の寿命を通じて単調に拡大） | 出たてで機体（16×24px）を覆い、拡散後はその倍 |
| パフ最大 alpha | 0.38 | 上限なしで素直に重ねるため、1枚は薄く。重なり3枚で 0.63 としきい値を越える |
| 撒く位置のばらつき | 半径8px（噴出口の近くに固める） | フォールオフが急なので、広く撒くと発煙直後の一点で重なりが足りず、いちばん隠れてほしい瞬間にしきい値を越えない。広がりは漂いで稼ぐ（物理的にもそちらが正しい） |
| パフの寿命 | 240 tick（4秒） | normal モード 0.8x では実時間5秒 |
| 雲の全長 | 252 tick（撒き12 ＋ パフ240） | 最後に撒かれたパフが死ぬまで |
| 発煙の撒き方 | 12 tick に分散 | 一斉に生むと全パフの年齢が揃い、雲が一様に膨らんで一様に薄れる（時間変化が見えない）。ずらすと機体の近くに白い生まれたてが残り、外側に紫灰の古いのが漂う層ができて湧き上がって見える |
| 漂い | 外向きの微小な初速 ＋ ゆっくり上昇 | |
| 回転 | ±0.6°/frame | 4秒で約1/4回転。速いと渦に見えて煙から離れる |

### パフの消え方 — 薄れて、確実に 0 になる

パフの alpha は、自分の正規化年齢 `u = age / SMOKE_PUFF_LIFETIME`（0 → 1）に対して:

```
envelope(u) = min(1, u / 0.05) * (1 - u)^1.3
puffAlpha   = SMOKE_PUFF_ALPHA_MAX * envelope(u)
```

- `u = 1` で厳密に 0 になる。**残留しないし、消える瞬間にぷつりと切れることもない**
  （寿命切れで `alive = false` にするだけの実装だと、まだ見える濃さのまま消えてしまう）
- 立ち上がりの `min(1, u / 0.05)` は最初の12 tick で 0 → 1。生まれた瞬間に濃いパフが
  出現するのを避ける。撒きの分散と合わせて「湧き上がる」動きになる
- 指数 1.3 は減衰をわずかに前倒しにする形。1.0（直線）だと後半までしぶとく見え、
  2.0 だと発煙直後に急に薄くなって隠れる時間が足りない

半径は同じ `u` で 10 → 34px へ単調に拡大し、色段も同じ `u` で白 → 淡い紫 → 紫灰へ進む。
つまり**拡散・希薄化・冷却が1つの時計から出る**ので、位相がずれることがない。

隠蔽判定も同じ alpha を読むので（後述）、**煙が見えなくなる時刻と隠れなくなる時刻は
必ず一致する。** ただし隠蔽はしきい値越えなので、目視で薄く見えている状態では
既にロックできるようになっている（重なり3枚ぶんで 0.6 を越える計算）。
これは意図した順序で、「薄くなってきたから狙える」が自機側から読める。

### フォールオフ — 中心を濃く保ち、端で急に落とす

```
falloff(d, r)        = (1 - d/r)^2.5                    (d >= r のとき 0)
puffAlphaAt(d, r, u) = SMOKE_PUFF_ALPHA_MAX * envelope(u) * falloff(d, r)
```

指数 2.5 は「半径の半ばまではほぼ濃度を保ち、そこから外で一気に 0 へ落ちる」形。
ゲーム的にも都合が良く、境界がはっきりするぶん自機側が「どこから先が見えないか」を読める。

**空間の因子と時間の因子を分けているのは、焼き付けと噛み合わせるため。**
`falloff(d, r)` は形なのでスプライトに焼き込み、`SMOKE_PUFF_ALPHA_MAX * envelope(u)` は
`drawImage` 時の `globalAlpha` として毎フレーム渡す。canvas の合成が
両者の積を取るので、上式がそのまま画面に出る。

### 色

パフ1枚の中で色も振る。alpha のフォールオフと同じ停止点に色を載せるので、
実行時のコストは増えない。

- 中心 `#EFEDF5`（ほぼ白、わずかに青紫寄り）
- 中間 `#B4A9C4`
- 端 `#7A7089`（紫がかった灰）

加えて年齢で色が冷えていく。焼き付け方式なので時間変化にも代金が要らない:
**形4種 × 色3段（白 → 淡い紫 → 紫灰）= 12枚を起動時に焼き**、各パフは年齢に応じて
隣り合う2段をクロスフェードする（`drawImage` は1パフあたり最大2回）。

### 絵柄は起動時に焼き付ける

起動時に一度だけ 64×64 のオフスクリーンへ焼く。瘤の座標表（`[{dx, dy, r}, ...]` を4組）を
コードに持ち、グラデーションは `puffAlphaAt` から生成する。実行時は
`drawImage` ＋ 回転 ＋ 拡大 ＋ alpha のみ。

焼き付けを選ぶ理由:

- **形の複雑さの代金を起動時に一度だけ払う。** 毎フレームでは書けない絵柄（瘤の多重合成、
  縁の不規則なほつれ）を、実行時コストは `drawImage` 1回のまま使える。
  パフ1個のコストが形の複雑さと無関係になる
- 毎フレームの `createRadialGradient` が消える（`Map` のレンダーキャッシュと同じ手口）
- 形を4種にするのは、1種を回転させただけだと重なったときに反復が目に付くため

なめらかなグラデーションを選んだので回転は原理的に見えない。瘤を非対称に置くことで見せる。

## 隠蔽判定

`src/js/utils/concealment.js` の純粋関数:

```
coverageAt(x, y, screens) = 1 - Π(1 - puffAlphaAt(dᵢ, rᵢ, uᵢ))
```

これは `source-over` の合成式（透過率の積、Beer-Lambert）そのものなので、
**描いた見た目と判定が定義上一致する**。canvas のピクセルを読む必要はなく、
GPU と同じ計算を node でテストできる。

- しきい値 `SMOKE_CONCEAL_THRESHOLD = 0.6` 超えで隠蔽
- 判定点は敵の中心
- **煙の中にいる敵は誰でもロック不能**（artillery 本人に限らない）。結果として護衛効果も出る
- 弾・ミサイルの当たり判定には影響しない。煙は視界だけを遮る

### 守るべき対: フォールオフは1つの関数から

**焼き付けるグラデーションの停止点は `falloff()` から生成し、描画時の `globalAlpha` と
隠蔽判定はどちらも `puffAlphaAt()`（= `falloff` × `envelope`）を呼ぶ。**
どこか1箇所だけ数式を書き直すと「濃く見えるのに隠れない」「薄いのに隠れる」「消えたのに
判定が残る」がすぐ発生する。`renderWeaponSound` と `renderWeaponProfile` を対で扱う
既存のルール（CLAUDE.md）と同じ扱いにする。

## Auto Aim への接続

`main.js` の `_updateAutoAim()`（`src/js/main.js:821`）に2箇所:

1. 候補走査（`for (const enemy of this.enemies)`）で、隠蔽されている敵を飛ばす
2. ロック中の敵（`autoAimLockedEnemy`）が隠蔽されたらロックを落とす

自機の弾やクロスヘアの手動照準には手を入れない。

## 音

`src/js/audio/weaponSounds.js` の `WEAPON_SOUNDS` に `smoke` を1行足す。
hiss ベースの短い噴出音。位置つきで再生（`AudioManager.setListenerView` の定位に乗る）。

CLAUDE.md の規律どおり、A特性で音量を実測して既存音との相対 dB をテストで縛る
（`tests/weapon-sounds.test.js` は `WEAPON_SOUNDS` を総当たりするので、表に足した時点で
自動的に効く）。部品は既存の `hiss` と `puffs` だけを使うので
`tests/helpers/weapon-render.js` に手を入れる必要はない。**新しい部品を足すなら
`renderWeaponSound()` と `renderWeaponProfile()` を対で直すこと。**

## 描画とライフサイクル

- 更新: `particles` と同じ場所（`main.js` の更新ループ）で `smokeScreens` を回し、寿命切れを外す
- 描画: `_drawWorld()` の末尾。敵とHPバーの上、HUD の下（`main.js:1264` の後）
- ステージ開始・リトライ時に配列をクリアする
- 乱数は `Math.random`（既存 AI と同じ）。`game.rng` を消費しないので週次決定性に影響なし

## 定数（すべて `src/js/utils/Constants.js`）

```
SMOKE_COOLDOWN            = 480   // tick。発煙の間隔（8秒）
SMOKE_PUFF_COUNT          = 14
SMOKE_EMIT_SPAN           = 12    // tick。撒き終わるまで
SMOKE_PUFF_LIFETIME       = 240   // tick。パフ1個の寿命。雲はパフが全部消えたら死ぬ
SMOKE_PUFF_RISE_RATIO     = 0.05  // 立ち上がりに使う寿命の割合（最初の12 tick で 0→1）
SMOKE_PUFF_DECAY_EXPONENT = 1.3   // (1-u)^この指数 で薄れる。u=1 で厳密に 0
SMOKE_PUFF_RADIUS_START   = 16
SMOKE_PUFF_RADIUS_END     = 34
SMOKE_PUFF_ALPHA_MAX      = 0.38
SMOKE_FALLOFF_EXPONENT    = 2.5
SMOKE_CONCEAL_THRESHOLD   = 0.6
SMOKE_ROTATION_SPEED      = 0.6   // 度/frame。符号はパフごとにばらす
SMOKE_SPREAD_RADIUS       = 8     // 撒く位置のばらつき
SMOKE_DRIFT_SPEED         = 0.10  // 外向きの初速。半径の伸びと釣り合わせる
SMOKE_RISE_SPEED          = 0.08  // ゆっくり上昇
SMOKE_SPRITE_SIZE         = 64    // 焼き付けるスプライトの一辺
SMOKE_SPRITE_SHAPES       = 4
SMOKE_SPRITE_TINTS        = 3
```

## テスト

| ファイル | 確かめること |
|---|---|
| `tests/smoke-concealment.test.js` | `falloff` の形（中心で最大 / r で 0 / 指数2.5 の急峻さ）、`envelope` が単調に薄れて **u=1 で厳密に 0**、`coverageAt` が重なりで増える、薄れてしきい値を割る |
| `tests/smoke-screen.test.js` | パフが寿命で消え**雲もパフ全滅で死ぬ**、半径が拡散する、年齢で alpha と色段が動く、撒きが12 tick に分散する（同 tick に全パフが生まれない）、fake-ctx で `drawImage` の呼び出し数と alpha |
| `tests/smoke-sprite.test.js` | 起動時に12枚焼かれる、グラデーション停止点が `falloff` と一致する（対の担保） |
| `tests/smoke-autoaim.test.js` | 煙中の敵はロックされない、ロック中に隠れたら外れる、煙の外の敵はロックできる |
| `tests/smoke-trigger.test.js` | artillery が LoS 露出で発煙、クールダウン中は不発、他の型は不発、`AudioManager` の発煙音が呼ばれる |
| `tests/weapon-sounds.test.js`（既存に追加） | `smoke` の A特性レベルが既存音との相対 dB 範囲に収まる |

ソース文字列を grep するテストは書かない（CLAUDE.md）。

## 実機で確認してもらうこと

ハードリロード（Cmd+Shift+R）が必要。

| 見るところ | 調整用の定数 |
|---|---|
| 煙が濃すぎる / 薄すぎる | `SMOKE_PUFF_ALPHA_MAX`、`SMOKE_PUFF_COUNT` |
| 境界がぼやける / 硬すぎる | `SMOKE_FALLOFF_EXPONENT` |
| 隠れる範囲が広すぎる / 狭すぎる | `SMOKE_PUFF_RADIUS_END`、`SMOKE_CONCEAL_THRESHOLD` |
| 煙が長く残りすぎる | `SMOKE_PUFF_LIFETIME`、`SMOKE_PUFF_DECAY_EXPONENT`（上げると早く薄れる） |
| 発煙が頻繁すぎる | `SMOKE_COOLDOWN` |
| 湧き上がって見えない | `SMOKE_EMIT_SPAN` |
| 発煙直後なのに隠れない | `SMOKE_SPREAD_RADIUS` を下げる（広く撒くと一点での重なりが足りない） |
| 紫が強すぎる / 弱すぎる | スプライトの色段（`SmokeScreen.js` の色表） |

## やらないこと

- 煙が敵側の射線を遮ること（artillery は煙の中からでも撃てる）。煙を張る利得が
  「逃げる間の時間稼ぎ」だけになってしまうため
- ミニマップからの消去。まずは目視と Auto Aim だけで様子を見る
- 雲ごとの濃度上限（オフスクリーン合成）。素直な重ねで足りると判断
- 風で流れること
- 寿命後半の色の冷えを2組の種の差し替え以上に凝ること（実機で物足りなければ足す）
