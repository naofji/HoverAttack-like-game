# 週替わり決定論ステージ ＋ ローカル週間ランキング 設計書

作成日: 2026-07-14

## 目的

西暦年＋ISO週番号から算出したシードでステージ生成を決定論化し、同じ週の間はどのユーザーが遊んでも1面〜7面が同じステージ構成（地形・敵の配置・敵の種類を含む）になるようにする。これによりスコアランキングが意味を持つようにする。加えて、週の切り替わり時にその週の上位スコアを記録し、Wall of Fame（殿堂）が更新されていく仕組みをローカルに実装する。

## スコープ / 前提

- **ホスティング**: GitHub Pages（静的サイト、サーバなし）。
- **ランキング範囲**: 当面は**ローカルのみ**（localStorage）。全ユーザー共通の集約は将来課題（別スペック）。
  - この前提により、殿堂に残るのは「その端末で出たスコア」であり全プレイヤー共通ではない。合意済み。
- **週の境界**: ISO 8601 週（月曜始まり、UTC基準）。シードは `年 + 週番号`。

## 決定論の範囲（重要な設計判断）

シード化する対象を「ステージの構造・見た目」と「敵の配置・種類」に限定する。

### シード化する（`game.rng` を使用）

- `src/js/world/Map.js` の地形生成に関わる全 `Math.random()`
  - 部屋配置、ブロック配置、トンネル、プラットフォーム、ハードブロック抽選、シャッフル各所、敵エリア中心座標など
  - 対象行（現時点）: 128, 129, 140, 141, 142, 143, 146, 159, 160, 201, 202, 295, 308, 412, 439, 471, 509, 543, 575, 592, 747
- `src/js/systems/SpawnManager.js`
  - 敵種の重み付き抽選（109行目）
  - 位置微調整 `resolveOverlap` のジッター（83行目）

### シード化しない（`Math.random()` のまま）

- 戦闘中のランダム挙動: 敵AIの動き（`EnemyDrone` など）、弾のばらつき（`main.js:660`、`EnemyTurret`）、パーティクル、カメラ揺れ（`Camera`）、砲塔クールダウン初期オフセット（`EnemyTurret:32`）、地雷点滅（`Landmine`）等
- `Map.js:894` の既存決定論ハッシュ（ブロックの見た目用）はそのまま

**理由**: ランキングの公平性に必要なのは「全員が同じ地形・同じ敵配置と戦う」ことのみ。戦闘中のランダム性は実プレイの揺らぎであり、決定論化するとゲームループ全体の作り直しが必要になりYAGNI。

## コンポーネント設計

### 1. `src/js/utils/SeededRNG.js`（新規）

- 軽量な決定論PRNG（mulberry32 相当）。
- API:
  - `constructor(seed: number)`
  - `next(): number` — `[0, 1)` の浮動小数を返す（`Math.random()` 互換）
- 同じシードなら `next()` の列が常に同一。

### 2. `src/js/utils/WeekSeed.js`（新規）

- 現在のUTC日時からISO週を算出。
- API:
  - `getCurrentWeek(date = new Date()): { weekId: string, seed: number }`
    - `weekId` 例: `"2026-W29"`
    - `seed` は `年` と `週番号` を合成した整数
  - 面ごとのシード合成用ヘルパ（例: `stageSeed(weekSeed, missionLevel)`）
- テスト容易性のため `date` を引数で受け取れるようにする。

### 3. `src/js/world/Map.js`（改修）

- `Math.random()` を `this.game.rng.next()` に置換（上記「シード化する」対象のみ）。
- `Map` は生成時に `game.rng` が設定済みである前提。

### 4. `src/js/systems/SpawnManager.js`（改修）

- 敵種抽選（109行目）と `resolveOverlap` ジッター（83行目）を `this.game.rng.next()` に置換。
- `Map` 生成 → `spawnLandmines` → `spawnEnemies` の固定順で同一 `game.rng` ストリームを消費する。順序が決定論的なので再現性が保たれる。

### 5. rng 配線（`main.js` と `GameStateManager.js`）

- 各ステージ生成の直前に `game.rng = new SeededRNG(stageSeed(weekSeed, missionLevel))` を設定。
  - `main.js` 初期化（`new Map(this, this.missionsCompleted)` の直前、118行目付近）
  - `GameStateManager.resetLevel()`（`new Map(...)` の直前、46行目付近）
- `weekSeed` はゲーム起動時に一度算出して保持し、プレイセッション中は固定。

### 6. `src/js/systems/HighScoreManager.js`（改修）— 2層構造

localStorage に2キーを使用:

- `hoverattack_weekly_ranking` = `{ weekId: string, scores: Array<{name, score, mission, clearTime}> }`
  - 今週のランキング（上位20件保持）
- `hoverattack_wall_of_fame` = `Array<{ weekId: string, entries: Array<{name, score, mission, clearTime}> }>`
  - 殿堂。各週の**上位3件**が永続的に蓄積される。

**週切り替え処理**（起動時 / `HighScoreManager` 初期化時に判定）:

1. `WeekSeed.getCurrentWeek()` で現在の `weekId` を取得。
2. `weekly_ranking` をロード。保存済み `weekId` が現在と異なる（または未保存）場合:
   - 旧週に `scores` があれば、その**上位3件**を `{ weekId: 旧weekId, entries: top3 }` として `wall_of_fame` に追記。
   - `weekly_ranking` を `{ weekId: 現在, scores: [] }` にリセット。
3. `wall_of_fame` はそのまま蓄積・保持。

- 既存のダミースコア20件（`_getDefaultScores`）は**廃止**し、週間ランキングは空スタート。殿堂も初期は空。
- 既存API（`isHighScore`, `addScore`, `getTop10`）は今週ランキングに対して動作するよう維持。殿堂取得用に `getWallOfFame()` を追加。

### 7. `src/js/ui/ScreenRenderer.js`（改修）— UI

- ランキング表示（`ranking_display`）に現在の `weekId` を表示。
- Wall of Fame 表示を追加（既存ランキング画面へのセクション追加、またはトグル切替）。
- 空ランキング時の表示（例: 「まだ記録なし」）を用意。

## 変更ファイル一覧

- 新規: `src/js/utils/SeededRNG.js`, `src/js/utils/WeekSeed.js`
- 改修: `src/js/world/Map.js`, `src/js/systems/SpawnManager.js`, `src/js/systems/HighScoreManager.js`, `src/js/main.js`, `src/js/systems/GameStateManager.js`, `src/js/ui/ScreenRenderer.js`

## テスト観点

- `SeededRNG`: 同一シードで `next()` の列が一致する。
- `WeekSeed`: 特定日付（週境界の前後、年またぎ含む）で期待する `weekId`/`seed` を返す。月曜UTC 00:00 で切り替わる。
- 決定論ステージ: 同一 `weekSeed`＋`missionLevel` で `Map` の `grid` と各 spawn 配列（敵位置・種類）が一致する。
- 週切り替え: `weekId` 変更時に旧週トップ3が殿堂へ移り、今週がリセットされる。

## 非スコープ / 将来課題

- 全ユーザー共通の集約ランキング（バックエンド/外部サービス導入）。
- 戦闘中挙動の決定論化。
- 不正スコア対策（ローカル改竄）。
