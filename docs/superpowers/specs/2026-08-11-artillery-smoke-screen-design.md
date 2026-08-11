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
1つの雲が14個のパフを持ち、雲が寿命を終えたら配列から外す。

パフは**経過時間ひとつ**から半径・alpha・色の3つが出る。出たては小さく濃く白っぽく、
古くなるにつれ大きく薄く紫がかった灰になる。

| 項目 | 値 | 根拠 |
|---|---|---|
| パフ数 | 14 | 半径34px × 14枚で画面幅の1/4ほどを覆う。枚数で濃さを作るので1枚は薄い |
| 半径 | 10px → 34px | 初期は機体（16×24px）より小さく、拡散後は1枚で機体を覆う |
| パフ最大 alpha | 0.30 | 上限なしで素直に重ねるため、1枚は薄く。重なりで濃度が積み上がる |
| 寿命 | 240 tick（4秒） | normal モード 0.8x では実時間5秒。末尾90 tick で薄れる |
| 発煙の撒き方 | 12 tick に分散 | 一斉に生むと全パフの年齢が揃い、雲が一様に膨らんで一様に薄れる（時間変化が見えない）。ずらすと機体の近くに白い生まれたてが残り、外側に紫灰の古いのが漂う層ができて湧き上がって見える |
| 漂い | 外向きの微小な初速 ＋ ゆっくり上昇 | |
| 回転 | ±0.6°/frame | 4秒で約1/4回転。速いと渦に見えて煙から離れる |

### フォールオフ — 中心を濃く保ち、端で急に落とす

```
puffAlphaAt(d, r) = A * (1 - d/r)^2.5      (d >= r のとき 0、A = 0.30)
```

指数 2.5 は「半径の半ばまではほぼ濃度を保ち、そこから外で一気に 0 へ落ちる」形。
ゲーム的にも都合が良く、境界がはっきりするぶん自機側が「どこから先が見えないか」を読める。

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
coverageAt(x, y, screens) = 1 - Π(1 - puffAlphaAt(dᵢ, rᵢ))
```

これは `source-over` の合成式（透過率の積、Beer-Lambert）そのものなので、
**描いた見た目と判定が定義上一致する**。canvas のピクセルを読む必要はなく、
GPU と同じ計算を node でテストできる。

- しきい値 `SMOKE_CONCEAL_THRESHOLD = 0.6` 超えで隠蔽
- 判定点は敵の中心
- **煙の中にいる敵は誰でもロック不能**（artillery 本人に限らない）。結果として護衛効果も出る
- 弾・ミサイルの当たり判定には影響しない。煙は視界だけを遮る

### 守るべき対: フォールオフは1つの関数から

**焼き付けるグラデーションの停止点と、隠蔽判定の式は同じ `puffAlphaAt()` から生成する。**
片方だけ変えると「濃く見えるのに隠れない」「薄いのに隠れる」がすぐ発生する。
`renderWeaponSound` と `renderWeaponProfile` を対で扱う既存のルール（CLAUDE.md）と同じ扱い。

## Auto Aim への接続

`main.js` の `_updateAutoAim()`（`src/js/main.js:821`）に2箇所:

1. 候補走査（`for (const enemy of this.enemies)`）で、隠蔽されている敵を飛ばす
2. ロック中の敵（`autoAimLockedEnemy`）が隠蔽されたらロックを落とす

自機の弾やクロスヘアの手動照準には手を入れない。

## 音

`src/js/audio/weaponSounds.js` の `WEAPON_SOUNDS` に `smoke` を1行足す。
hiss ベースの短い噴出音。位置つきで再生（`AudioManager.setListenerView` の定位に乗る）。

CLAUDE.md の規律どおり、A特性で音量を実測して既存音（grenade など）との相対 dB を
テストで縛る。`renderWeaponProfile()` 側（`tests/helpers/weapon-render.js`）も同時に足す。

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
SMOKE_LIFETIME            = 240   // tick
SMOKE_FADE_TICKS          = 90    // 末尾の薄れ
SMOKE_PUFF_RADIUS_START   = 10
SMOKE_PUFF_RADIUS_END     = 34
SMOKE_PUFF_ALPHA_MAX      = 0.30
SMOKE_FALLOFF_EXPONENT    = 2.5
SMOKE_CONCEAL_THRESHOLD   = 0.6
SMOKE_ROTATION_SPEED      = 0.6   // 度/frame。符号はパフごとにばらす
SMOKE_SPRITE_SHAPES       = 4
SMOKE_SPRITE_TINTS        = 3
```

## テスト

| ファイル | 確かめること |
|---|---|
| `tests/smoke-concealment.test.js` | `puffAlphaAt` の形（中心で最大 / r で 0 / 指数2.5 の急峻さ）、`coverageAt` が重なりで増える、薄れてしきい値を割る |
| `tests/smoke-screen.test.js` | 寿命で消える、半径が拡散する、年齢で alpha と色段が動く、撒きが12 tick に分散する、fake-ctx で `drawImage` の呼び出し数と alpha |
| `tests/smoke-sprite.test.js` | 起動時に12枚焼かれる、グラデーション停止点が `puffAlphaAt` と一致する（対の担保） |
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
| 煙が長く残りすぎる | `SMOKE_LIFETIME`、`SMOKE_FADE_TICKS` |
| 発煙が頻繁すぎる | `SMOKE_COOLDOWN` |
| 湧き上がって見えない | `SMOKE_EMIT_SPAN` |
| 紫が強すぎる / 弱すぎる | スプライトの色段（`SmokeScreen.js` の色表） |

## やらないこと

- 煙が敵側の射線を遮ること（artillery は煙の中からでも撃てる）。煙を張る利得が
  「逃げる間の時間稼ぎ」だけになってしまうため
- ミニマップからの消去。まずは目視と Auto Aim だけで様子を見る
- 雲ごとの濃度上限（オフスクリーン合成）。素直な重ねで足りると判断
- 風で流れること
- 寿命後半の色の冷えを2組の種の差し替え以上に凝ること（実機で物足りなければ足す）
