# heavy/artillery の間合い・遮蔽スタイル 設計書

日付: 2026-07-19

## 課題

heavy と artillery は `movementType: 'stop_and_shoot'` のため、プレイヤーへ直線的に接近して至近で足を止める。実機の体感として不自然(特に重量級・砲撃型のキャラ性に合わない)。

## ゴール

- **heavy**: 140±30px の間合いを維持しつつ、プレイヤーとX/Y軸が揃い続けたら軸をずらす(rivalの整列回避を流用)
- **artillery**: 200±40px の間合いを維持しつつ、プレイヤーとの間に遮蔽物がある位置(視線が切れる位置)に移動して物陰から狙撃する
- 両タイプとも `climbStyle: 'jump'`(浮かない・ゆっくり上昇)は変更しない

## 設計

### 1. movementType の変更(Constants.js)

- heavy: `'stop_and_shoot'` → `'chase_and_jump'`(既存・未使用の140±30px距離維持ロジック)
- artillery: `'stop_and_shoot'` → `'skirmish'`(既存・未使用の200±40px距離維持ロジック、接近されると1.2倍速で後退)

両分岐のホバー処理は既に `_applyAerialThrust` 経由なので、`'jump'` スタイル(上昇中のみ推力・上限-1.5)がそのまま効く。`_chaseTarget` 末尾の垂直追従ブロックは `stop_and_shoot`/`pace_and_jump` 専用のため、この変更で heavy/artillery は対象外になる(chase_and_jump/skirmish の各分岐が独自の垂直対応を持つので問題ない)。

### 2. 整列回避の共通化と heavy への適用(EnemyAttacker.js)

- `zigzag_chase` 内の整列回避ブロックをヘルパー `_updateAlignmentAvoidance(dx, dy, targetX)` に抽出。回避中は移動を設定して true を返し、呼び出し元は通常移動をスキップ
- 適用は config フラグ `avoidsAlignment: true` で制御し、`_chaseTarget` の mType 分岐より前で共通実行
- config に `evadeDuration` を追加: rival 40(現状維持)/ heavy 90(速度0.5でも 45px 動けて閾値24pxを確実に抜ける)。未設定は `RIVAL_EVADE_DURATION`(40) にフォールバック
- rival の挙動は変えない(既存の整列回避テスト2本が回帰ガード)

### 3. 遮蔽探索レイヤー(artillery、config `seeksCover: true`)

`_chaseTarget` の skirmish 分岐実行後に上書きする形で動作(後退が必要な場合は skirmish の後退がそのまま勝つ):

- `ATTACKER_COVER_CHECK_INTERVAL`(30)フレームごとに `hasLineOfSight(自機中心, プレイヤー中心, map)` を判定(既存 `Physics.js` ヘルパー)
- **露出中かつ間合いが確保できている**(プレイヤー距離 ≥ `ATTACKER_COVER_MIN_DIST`(160px)): 現在地から左右 ±1..±`ATTACKER_COVER_SCAN_TILES`(6)タイルを走査し、以下を満たす最寄り候補を `coverGoalX` に設定:
  1. 足場がある(`isSolidAtPixel(候補X, 足元Y+4)`)
  2. 候補地点からプレイヤーまでの距離 ≥ 160px
  3. 候補地点の中心からプレイヤー中心への視線が遮られる
- `coverGoalX` があれば `vx = ±maxSpeed` でそこへ歩く(skirmishのペーシングを上書き)。到達(|dx|≤4)で解除
- **遮蔽中**(視線が切れている): `vx = 0` で留まる(クラウチ→バースト射撃は現行どおり。誘導ミサイルは既存のBFS初期方向計算で遮蔽物を回り込む)
- **候補なし**(平地など): skirmish の距離維持にフォールバック(上書きしない)
- **接近された**(距離 < 160px): 遮蔽探索・滞在より skirmish の後退を優先(上書きしない)

### 4. 定数(Constants.js)

```
ATTACKER_COVER_CHECK_INTERVAL = 30  // 視線チェック間隔(フレーム)
ATTACKER_COVER_SCAN_TILES = 6       // 遮蔽候補の走査範囲(±タイル)
ATTACKER_COVER_MIN_DIST = 160       // 遮蔽採用に必要な最小距離(px)
```

config 追加: heavy `avoidsAlignment: true, evadeDuration: 90`、rival `avoidsAlignment: true, evadeDuration: 40`、artillery `seeksCover: true`

### 5. テスト(`tests/attacker-return.test.js` 追記、既存ヘルパー流用)

- **heavy間合い**: 平地でプレイヤーと同じ高さに配置し900フレーム駆動 → 一度も60px以内に入らない(直進しない)、かつ200px以内には入る(交戦する)
- **heavy整列回避**: Y整列の連続フレーム数 ≤ 45+90+マージン20
- **rival回帰**: 既存の整列回避テスト2本がそのまま通る
- **artillery遮蔽**: プレイヤーとの間に壁柱のある地形で、視線が切れる位置に移動して留まる(N フレーム後に `hasLineOfSight` が false かつ |vx| ≈ 0)
- **artillery平地フォールバック**: 遮蔽のない平地で距離200±60pxに収束する
- **artillery後退優先**: プレイヤーを100pxまで近づけると遮蔽中でも距離が開く方向に動く

## 変更ファイル

- `src/js/utils/Constants.js` — movementType 2件変更、config フラグ・`evadeDuration`、遮蔽定数3件
- `src/js/entities/EnemyAttacker.js` — `_updateAlignmentAvoidance` 抽出、`evadeDuration` フォールバック、遮蔽探索レイヤー
- `tests/attacker-return.test.js` — 上記テスト追加

## スコープ外

- standard / rival の挙動変更(rivalはヘルパー抽出による等価リファクタのみ)
- 帰還('return')・patrol時の挙動(chase中のみの変更)
- BFS経路探索による遮蔽移動(走査は左右の直線のみ)
