# ゲームモード追加 ＋ 面別ランキング — 設計書

- 日付: 2026-07-18
- 対象: Hover Attack Web
- 概要: (1) 速度の異なる2ゲームモード（ノーマル / ニュータイプ）を追加し、
  タイムボーナスをモード別に再設定する。(2) 週替わり・各面トップ5の
  「面別ランキング」（最速タイム＋ハイスコア）をオンライン(GAS)＋ローカルで実装する。

---

## 機能1：ゲームモード（ノーマル / ニュータイプ）

### 目的
- **ノーマル**: 0.8倍速のウェイトを入れ、弾幕をよけやすくじっくり遊べる（初心者向け・デフォルト）
- **ニュータイプ**: 現状のままウェイトなし。実時間あたりの進行が速く、タイムボーナスを稼ぎやすい

### モード選択UI
- タイトル画面で **←/→キー** によりモードを切替。選択中モードを画面に表示する。
- デフォルトは **ノーマル**。
- 状態: `Game.mode`（`'normal' | 'newtype'`）、`Game.gameSpeed`（`normal=0.8`, `newtype=1.0`）。
- 既存のタイトル操作（Tab=carrierLift トグル、任意キー/クリックで開始）とは別キーなので競合しない。

### 速度の実装方式
現状、物理はフレーム単位の固定ステップ（`x += vx` など、deltaTime非依存）。
タイマー（`totalTime` / `missionTimer`）だけが実 `deltaTime` を積算している。

- **固定タイムステップ・アキュムレータ**を導入する:
  - `loop()` で `simAccumulator += deltaTime * gameSpeed` を積算。
  - `STEP = 1000/60 (≈16.67ms)` ごとに物理更新（`_updatePlaying` のシミュレーション部分）を1ステップ実行。
  - タイマー（`totalTime` / `missionTimer`）は **生の `deltaTime`** で進める（＝「時間の進み方は同じ」）。
  - ニュータイプ(1.0)は現状の挙動をほぼ維持。ノーマル(0.8)は物理が20%スロー。
  - 副次効果として、高リフレッシュ環境（120/144Hz）で現状は速く動く挙動が是正され、速度が画面リフレッシュレート非依存になる。
- **入力・単発処理**（キーのエッジ検出、武器切替、発射トリガ、ドッキング判定など）は
  1フレームに1回だけ実行し、物理ステップの反復ループの外に置く（多重発火防止）。

#### カクつき対策（③カメラ補間から着手）
- 素のアキュムレータは描画が「整数ステップ位置」に限られるため、0.8倍では平均5フレームに1回
  “動かないフレーム”が入り、微小なカクつき（マイクロスタッター）が出る。
- **第1段階（本設計のスコープ）**: **カメラの描画位置のみ補間**する。
  - `alpha = simAccumulator / STEP` を用い、カメラ描画位置 = `lerp(前ステップのカメラ位置, 現ステップのカメラ位置, alpha)`。
  - 体感的なカクつきの大半は背景スクロール（カメラ）由来のため、これで大きく改善する見込み。
- **第2段階（将来拡張・本設計では未実装）**: 足りなければ全エンティティに `prevX/prevY` を持たせた
  完全なレンダリング補間へ拡張する。本設計では着手しない（YAGNI）。

### タイムボーナス再設定
- 現状（`_onFlagCaptured`）: `targetTimeBonus = max(0, baseBonus - floor(missionTimer/1000) * 50)`、
  `baseBonus = floor(totalTiles/100) * 100`。
- ノーマルは物理0.8倍のため、同等の腕前でもクリアに実時間が余計にかかり、そのままだと不利。
- **減衰率をモード別**にする:
  - ニュータイプ: `50 pt/秒`（現状維持）
  - ノーマル: `40 pt/秒`（＝0.8に合わせ甘め。初期値）
- 減衰率は調整しやすいよう定数（例: `TIME_BONUS_DECAY = { normal: 40, newtype: 50 }`）で保持する。
- ニュータイプのタイムボーナス優位は意図的に残す（完全な等化はしない）。

---

## 機能2：面別ランキング（週替わり・各面トップ5・オンライン＋ローカル）

### 概要
- 面（ステージ）ごとに **最速タイム** と **ハイスコア** の2本立てランキングを持つ（最大7面 × 2）。
- **週替わり**（既存の weekId と同じ周期）でリセット。各ランキング **トップ5** を表示。
- モードは区別しない（**モード共通で1本**）。
- 保存はオンライン(GAS)＋ローカル両方。

### 記録する値
- 各面クリア時（`_onFlagCaptured`）に以下を確定:
  - `stage`: 面番号（1〜7）
  - `stageTimeMs`: その面のクリアタイム。面開始からの経過（面ごとにリセットされる `missionTimer` を使用）。
  - `stageScore`: その面の獲得得点 = 「面クリア時点の累計スコア（フラグ加点＋タイムボーナス反映後）」−「面開始時の累計スコア」。
- 名前入力は走行後（`ranking_entry`）に行われるため、走行中は各面結果を
  `Game.stageResults = [{ stage, timeMs, score }, ...]` にバッファする。
- 走行終了時（名前確定時）に、バッファした各面結果へ入力名・国旗コードを付与してローカル＆GASへ送信する。
  - 名前入力の発生条件は既存ロジックに合わせる（全体スコアが `isHighScore` の時のみ名前入力される）。
    面別ランキング送信も **名前が確定した場合のみ** 行う（名前が無いと誰の記録か不明なため）。
    ※将来、全体ハイスコアに届かなくても面別記録は残したい場合の拡張余地は残すが、本設計では
    「名前確定時にまとめて送信」に統一する。

### ローカル保存
- キー: `hoverattack_stage_rankings`
- 形: `{ weekId, stages: [ { time: [top5], score: [top5] }, ...(7要素) ] }`
  - `time` エントリ: `{ name, timeMs, country }`（`timeMs` 昇順でトップ5）
  - `score` エントリ: `{ name, score, country }`（`score` 降順でトップ5）
- `weekId` が変わっていたらリセット（既存 HighScoreManager と同じロールオーバー方針）。
- 実装は新クラス `StageRankingManager`（`src/js/systems/`）に集約する。
  - `addStageResult(stage, { name, timeMs, score, country })` → 該当面の time/score へ挿入・ソート・トップ5切詰め・保存。
  - `getStage(stage)` → `{ time: [...], score: [...] }`。
  - `wouldRankTime(stage, timeMs)` / `wouldRankScore(stage, score)` → トップ5入り判定（面クリア通知用）。

### オンライン(GAS)
- 新シート `StageScores`、列: `timestamp, weekId, name, stage, timeMs, score, country`。
- `doGet` の返却に `stageRankings` を追加:
  `stageRankings = [ { stage, time: [top5 by timeMs asc], score: [top5 by score desc] }, ... ]`
  - 純関数 `topStagesForWeek(rows, weekId, n)` を追加（Nodeで単体テスト可能に、既存の純関数方針を踏襲）。
- 送信は `doPost` を拡張し、本文に面別バッチが含まれる場合を判別:
  - 本文に `stages: [{ stage, timeMs, score }, ...]` があれば面別送信として処理。
  - `name` / `country` はサニタイズ（既存 `sanitizeName` / `sanitizeCountry` を再利用）。
  - `stage` は 1〜7 にクランプ、`timeMs`・`score` は数値・範囲チェック。
  - 同名レート制限（既存 `RATE_LIMIT_MS`）を面別送信にも適用。
  - 各面ぶんを `StageScores` に追記。
- `weeklySnapshot`（殿堂入りアーカイブ）は面別には適用しない（面別は殿堂入り対象外。週替わりリセットのみ）。
- クライアント `OnlineLeaderboard` に面別送信メソッド（例: `submitStages(payload)`）と、
  `fetchData` 応答からの `stageRankings` 取り込みを追加。

### 表示画面（自動巡回）
- 新ゲームステート `stage_ranking_display` を追加し、既存の自動巡回に組み込む。
  - 巡回順の例: `... → global_ranking_display → stage_ranking_display → wall_of_fame_display → ...`
  - 挿入位置の最終決定は実装時に既存遷移を確認して合わせる。
- STAGE 1 → 7 を一定秒ずつ **自動切替**（サブタイマーで管理）。7面表示後、巡回の次ステートへ遷移。
- 各面画面は **そのステージのパレット色** で配色する。
  - `Map.js` の7色パレット（`palettes` 配列: 面1=Brown … 面7=DarkSlateBlue）を
    共有可能な定数として切り出し、`Map` と表示画面の双方から参照する。
- レイアウト（1面ぶん）:
  - 見出し: `STAGE i`（そのステージ色）
  - 上段: `FASTEST TIME` — トップ5（順位・名前・国旗・タイム）
  - 下段: `HIGH SCORE` — トップ5（順位・名前・国旗・得点）
- オンライン未取得/オフライン時はローカルの面別ランキングを表示する（既存のフォールバック方針に合わせる）。

### 面クリア時のトップ5通知
- `mission_clear` 画面で、直前にクリアした面の `stageTimeMs` / `stageScore` が
  ロード済みランキング（オンラインがあればオンライン、無ければローカル）比較でトップ5相当なら、
  次の帯を表示する:
  - 最速タイム圏内: `TOP 5! FASTEST TIME`
  - ハイスコア圏内: `TOP 5! HIGH SCORE`
  - 両方該当なら両方表示。
- これは **暫定表示**（最終順位は送信後に確定）。判定は `StageRankingManager.wouldRankTime/Score`
  および取得済みオンライン `stageRankings` を用いる。

---

## テスト方針
既存の Node テスト（`tests/`、`node --test`）に純関数中心のテストを追加する。

- モード別タイムボーナス計算（減衰率 normal=40 / newtype=50 の期待値、下限0クランプ）。
- `StageRankingManager`: 挿入・ソート・トップ5切詰め、time昇順/score降順、weekId ロールオーバー、
  `wouldRankTime/Score` の境界（5位ちょうど・6位相当）。
- GAS 純関数 `topStagesForWeek`（time昇順/score降順トップ5、週フィルタ）、面別 `validateEntry` 相当の
  バリデーション（stageクランプ、範囲外拒否）。
- モード切替の状態遷移（←/→ で `mode`/`gameSpeed` が期待通り変わる）。
- アキュムレータ/カメラ補間はロジック部分（`lerp`、ステップ反復回数の算出）を純関数化して単体テスト。

---

## スコープ外（YAGNI / 将来拡張）
- 全エンティティのレンダリング完全補間（第2段階）。カメラ補間で不足の場合のみ着手。
- モード別の面別ランキング分割（モード共通で1本に統一）。
- 面別の殿堂入りアーカイブ。
- 全体ハイスコア未達時でも面別記録を残す仕組み。
