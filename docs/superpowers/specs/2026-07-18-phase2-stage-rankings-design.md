# Phase 2: 面別ランキング — 設計書

- 日付: 2026-07-18
- 対象: Hover Attack Web
- 前提: Phase 1（バランス調整＋モード）で配点・難易度が確定していること。
  面別スコアの基準（stageScore）は Phase 1 の配点に依存するため、Phase 1 完了後に着手する。
- スコープ: 週替わり・各面トップ5の「面別ランキング」（最速タイム＋ハイスコア）を
  オンライン(GAS)＋ローカルで実装し、自動巡回画面と面クリア時のトップ5通知を追加する。

---

## 概要

- 面（ステージ）ごとに **最速タイム** と **ハイスコア** の2本立てランキング（最大7面 × 2）。
- **週替わり**（既存 weekId と同周期）でリセット。各ランキング **トップ5** を表示。
- モードは区別しない（**モード共通で1本**）。
- 保存はオンライン(GAS)＋ローカル両方。

---

## 記録する値

- 各面クリア時（`_onFlagCaptured`）に確定:
  - `stage`: 面番号（1〜7）。
  - `stageTimeMs`: その面のクリアタイム。面ごとにリセットされる `missionTimer` を使用。
  - `stageScore`: その面の獲得得点 =
    「面クリア時点の累計スコア（フラグ加点＋タイムボーナス反映後）」−「面開始時の累計スコア」。
- 名前入力は走行後（`ranking_entry`）のため、走行中は各面結果を
  `Game.stageResults = [{ stage, timeMs, score }, ...]` にバッファ。
- 走行終了時（名前確定時）に、各面結果へ入力名・国旗コードを付与してローカル＆GASへ送信。
  - 送信は **名前が確定した場合のみ**（既存 `isHighScore` により名前入力された時）。
    名前が無いと記録の帰属が不明なため。

---

## ローカル保存

- クラス `StageRankingManager`（`src/js/systems/`）に集約。
- キー: `hoverattack_stage_rankings`
- 形: `{ weekId, stages: [ { time: [top5], score: [top5] }, ...(7要素) ] }`
  - `time` エントリ: `{ name, timeMs, country }`（`timeMs` 昇順トップ5）
  - `score` エントリ: `{ name, score, country }`（`score` 降順トップ5）
- `weekId` 変化でリセット（既存 HighScoreManager と同じロールオーバー方針）。
- API:
  - `addStageResult(stage, { name, timeMs, score, country })` → time/score へ挿入・ソート・トップ5切詰め・保存。
  - `getStage(stage)` → `{ time: [...], score: [...] }`。
  - `wouldRankTime(stage, timeMs)` / `wouldRankScore(stage, score)` → トップ5入り判定（面クリア通知用）。

---

## オンライン(GAS)

- 新シート `StageScores`、列: `timestamp, weekId, name, stage, timeMs, score, country`。
- `doGet` の返却に `stageRankings` を追加:
  `stageRankings = [ { stage, time: [top5 by timeMs asc], score: [top5 by score desc] }, ... ]`
  - 純関数 `topStagesForWeek(rows, weekId, n)` を追加（Nodeで単体テスト可能に）。
- `doPost` を拡張し、本文に面別バッチが含まれる場合を判別:
  - 本文に `stages: [{ stage, timeMs, score }, ...]` があれば面別送信として処理。
  - `name`/`country` はサニタイズ（既存 `sanitizeName`/`sanitizeCountry` を再利用）。
  - `stage` は 1〜7 にクランプ、`timeMs`・`score` は数値・範囲チェック。
  - 同名レート制限（既存 `RATE_LIMIT_MS`）を面別送信にも適用。
  - 各面ぶんを `StageScores` に追記。
- `weeklySnapshot`（殿堂入り）は面別には適用しない（面別は殿堂入り対象外・週替わりリセットのみ）。
- クライアント `OnlineLeaderboard` に面別送信メソッド（例 `submitStages(payload)`）と、
  `fetchData` 応答からの `stageRankings` 取り込みを追加。

---

## 表示画面（自動巡回）

- 新ゲームステート `stage_ranking_display` を追加し、既存の自動巡回に組み込む。
  - 巡回順の例: `... → global_ranking_display → stage_ranking_display → wall_of_fame_display → ...`
    （挿入位置は実装時に既存遷移を確認して合わせる）。
- STAGE 1 → 7 を一定秒ずつ **自動切替**（サブタイマー管理）。7面表示後、巡回の次ステートへ。
- 各面画面は **そのステージのパレット色** で配色。
  - `Map.js` の7色パレット（面1=Brown … 面7=DarkSlateBlue）を共有定数として切り出し、
    `Map` と表示画面の双方から参照する。
- レイアウト（1面ぶん）:
  - 見出し: `STAGE i`（そのステージ色）
  - 上段: `FASTEST TIME` — トップ5（順位・名前・国旗・タイム）
  - 下段: `HIGH SCORE` — トップ5（順位・名前・国旗・得点）
- オンライン未取得/オフライン時はローカルの面別ランキングを表示（既存フォールバック方針に合わせる）。

---

## 面クリア時のトップ5通知

- `mission_clear` 画面で、直前にクリアした面の `stageTimeMs`/`stageScore` が
  ロード済みランキング（オンラインがあればオンライン、無ければローカル）比較でトップ5相当なら帯を表示:
  - 最速タイム圏内: `TOP 5! FASTEST TIME`
  - ハイスコア圏内: `TOP 5! HIGH SCORE`
  - 両方該当なら両方表示。
- **暫定表示**（最終順位は送信後に確定）。判定は `StageRankingManager.wouldRankTime/Score`
  および取得済みオンライン `stageRankings` を用いる。

---

## テスト方針

- `StageRankingManager`: 挿入・ソート・トップ5切詰め、time昇順/score降順、weekId ロールオーバー、
  `wouldRankTime/Score` の境界（5位ちょうど・6位相当）。
- GAS 純関数 `topStagesForWeek`（time昇順/score降順トップ5、週フィルタ）、面別バリデーション
  （stageクランプ、範囲外拒否）。
- stageScore 算出（面開始スコアとの差分）ロジックを薄いヘルパに切り出しテスト。

---

## スコープ外（YAGNI / 将来拡張）

- モード別の面別ランキング分割（モード共通1本に統一）。
- 面別の殿堂入りアーカイブ。
- 全体ハイスコア未達時でも面別記録を残す仕組み。
