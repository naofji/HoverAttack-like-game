# アタッカー移動個性の差別化 設計書

日付: 2026-07-19

## 課題

帰還AI+ホバー登坂(`2026-07-19-attacker-return-and-climb-design.md`)の実機確認で、タイプごとの動きの差が薄いとのフィードバック。全タイプが同じ「ジャンプ+連続ホバー上昇」で登るため、重量級も普通に浮いて見える。

## ゴール(実機フィードバックそのまま)

- **standard(水色)**: ホバー滞空はせず、ジャンプ+短時間の上昇ブーストと歩行の組み合わせ
- **heavy(緑)**: 歩行主体。ホバー滞空なし。時々ジャンプ+ゆっくり上昇
- **artillery(黄)**: heavyと同様。ホバーほぼ無し
- **rival(赤)**: 唯一ホバーを多用。被弾しにくいよう高度・位置を頻繁に変え、プレイヤーとX軸/Y軸が長時間揃わないように動く
- 全タイプ: **1段(1タイル)の段差は歩いて登る**(ジャンプ不要)。帰還時もタイプ別スタイルを適用(heavyは登りに時間がかかってよい)

## 設計

### 1. `climbStyle`(タイプ別の空中スタイル)

`ENEMY_ATTACKER_TYPES` 各タイプに `climbStyle` を追加。登坂・垂直追従・帰還のすべてで共通適用:

| タイプ | climbStyle | 挙動 |
|---|---|---|
| heavy / artillery | `'jump'` | 登る必要がある時だけジャンプし、**上昇中(vy < 0)のみ** `climbThrust` を適用(=ゆっくり上昇)。落下開始後は推力なし — 絶対に浮かない。高い段差はジャンプレグの繰り返しで登る |
| standard | `'boost'` | ジャンプ+上昇中のみ推力、ただし1回の空中につき `ATTACKER_BOOST_MAX_FRAMES`(20)フレームまで。ホバー滞空しない |
| rival | `'hover'` | 従来どおりの連続ホバー(落下中も推力可)。唯一の常用タイプ |

### 2. 共通ヘルパー `_applyAerialThrust()` への統合

現在5箇所に重複しているホバー推力処理(`chase_and_jump` / `skirmish` / `zigzag_chase` / 垂直追従ブロック / `_climbToward`)を、`climbStyle` を解釈する単一ヘルパー `_applyAerialThrust(riseCap)` に統合する。

- ジャンプ初速維持ガード(`vy > riseCap` のときのみ推力)もヘルパー内の1箇所に集約
- `hovering` フラグ(排気エフェクト描画)はヘルパーが推力を適用したフレームのみ true
- 燃料消費 `HOVER_FUEL_CONSUMPTION` もヘルパー内で一元管理
- 各呼び出し箇所の上昇速度上限は現行値を維持(skirmish -3.0、その他 -4.0/`ATTACKER_CLIMB_MAX_RISE`)
- 'boost' の残フレーム管理: 空中に出た時点で `boostFrames = ATTACKER_BOOST_MAX_FRAMES` をリセットし、推力を適用したフレームでデクリメント。0で以降そのレグでは推力なし

### 3. ステップアップ(1段は歩いて登る)

`EnemyAttacker._moveAndCollide()` の水平マップ衝突処理で、接地中ならプレイヤー(`Player.js` の STEP-UP LOGIC)と同じ1タイルステップアップを先に試みる:

1. y を 1タイル分上にずらして衝突判定 → 衝突しなければ成立(そのまま歩行継続、ジャンプしない)
2. 失敗したら従来どおり: ジャンプ(`onGround && jumpCooldown <= 0`)→ それも無理なら反転

全タイプ共通。歩行主体の heavy/artillery の見た目が特に自然になる。

### 4. rival の整列回避(軸ずらし)

`zigzag_chase` に回避レイヤーを追加:

- **検知**: プレイヤー(ターゲット)中心との `|dx| < RIVAL_ALIGN_THRESHOLD`(24px)が `RIVAL_ALIGN_TRIGGER_FRAMES`(45)続いたらX整列、`|dy| < 24px` が45フレーム続いたらY整列と判定。整列が切れたらカウンタリセット
- **回避行動**: 発動時にオフセット目標を設定し `RIVAL_EVADE_DURATION`(40フレーム)維持
  - X整列 → 横に `RIVAL_EVADE_OFFSET`(60〜120pxランダム)離脱(方向は空いている側、壁なら反対)
  - Y整列 → 高度変更: 上(ホバー上昇)or 下(推力停止で落下)をランダム選択。地面上で「下」が選ばれたら「上」に切替
- 回避中も射撃は通常どおり(移動ターゲットだけがずれる)
- 回避終了後は通常の zigzag_chase に戻る

### 5. 定数(Constants.js)

```
ATTACKER_BOOST_MAX_FRAMES = 20   // standardの1空中レグあたりのブースト上限
RIVAL_ALIGN_THRESHOLD = 24       // 整列判定の距離(px)
RIVAL_ALIGN_TRIGGER_FRAMES = 45  // 整列→回避発動までのフレーム数
RIVAL_EVADE_OFFSET_MIN = 60      // 回避オフセット最小(px)
RIVAL_EVADE_OFFSET_MAX = 120     // 回避オフセット最大(px)
RIVAL_EVADE_DURATION = 40        // 回避行動の維持フレーム数
```

`climbThrust` は現行値を維持(heavy 0.45 = ゆっくり上昇、rival 0.65)。

### 6. テスト(既存 `tests/attacker-return.test.js` + ヘルパー流用)

- **浮かない検証**: heavy を空中(vy > 0 の下降中)に置いて `_applyAerialThrust` 経路を通しても `hovering` が true にならない/vy が減らない
- **登坂は依然可能**: heavy が8タイル段差をジャンプレグの繰り返しで(時間はかかっても)登って帰還できる(既存シムテストの流用、フレーム上限を緩和)
- **ブースト上限**: standard の1空中レグで推力適用フレームが20以下
- **ステップアップ**: 1段の段差を歩いて越える(越えるまで vy がジャンプ初速に達しない)。2段の壁では従来どおりジャンプ
- **rival整列回避**: 同X(または同Y)に置いたrivalが45+αフレーム以内に整列を解消し、以後長時間(例: 120フレーム)連続整列しない

## 変更ファイル

- `src/js/utils/Constants.js` — `climbStyle` 追加、回避・ブースト定数
- `src/js/entities/EnemyAttacker.js` — `_applyAerialThrust()` 新設と5箇所の置換、ステップアップ、rival回避レイヤー
- `tests/attacker-return.test.js` — 上記テスト追加・既存シムテスト調整

## スコープ外

- プレイヤー・他敵種(タンク/ドローン/タレット)の変更
- BFS経路探索による移動
- `climbThrust` 等の数値バランス再調整(実機フィードバック後に別途)
