# ランキング画面の分離とティア別テーマ（Bronze/Silver/Gold）設計書

作成日: 2026-07-17

## 目的

現在「THIS WEEK」画面が1つで、オンライン取得の成否により表示元（オンライン/ローカル）が入れ替わり、内容や国旗の有無が変わって紛らわしい。これを解消するため、**LOCAL（この端末）・GLOBAL（世界の今週）・FAME（世界の殿堂）を独立した3画面に分離**し、それぞれ**明確に異なる雰囲気（ブロンズ／シルバー／ゴールドのティア色）**で表示して、別のランキングであることが一目で分かるようにする。

## 背景 / 現状の問題

- `ranking_display` は `onlineStatus==='ok'` ならオンライン、そうでなければローカルへフォールバックする（main.js の描画分岐）。
- アトラクトでこの画面に入ると `_refreshOnline()` が `loading` にし、まずローカル、数秒後にオンラインへ切り替わる → 「THIS WEEK が2種類」に見え、国旗の有無も変わる。
- GLOBAL（今週）と FAME（殿堂）は**同じ1回の `doGet`**（`onlineData.ranking` / `onlineData.fame`）から得るため、**成否は常に一致**する。

## 決定事項（合意済み）

1. **3画面構成**：`title → how_to_play → LOCAL → GLOBAL → FAME → title`。
2. **GLOBAL/FAME はオンライン取得成功時のみ表示**。取得失敗/URL未設定時は**両方スキップ**し、アトラクトは **LOCAL のみ**巡回する（GLOBALとFAMEは取得を共有するため一括で表示可否が決まる）。
3. **ローカルへのフォールバック混在を廃止**（LOCALは常にローカル、GLOBAL/FAMEは常にオンライン）。
4. **ティア色で統一**：各画面はそのティア色の**明暗グラデーション**（1位が最も明るく、下位ほど暗い）。行ごとの金銀銅は廃止。
   - LOCAL＝ブロンズ、GLOBAL＝シルバー、FAME＝ゴールド。
5. **ハイライトを分離**：LOCAL は `localRankIndex`（`addScore` の返り値）、GLOBAL は `globalRankIndex`（`submit` の `res.rank`）。FAME はハイライトなし。

## アトラクト状態機械

状態（`ranking_display` を分割・改名）:
- `local_ranking_display`
- `global_ranking_display`
- `wall_of_fame_display`（維持、テーマ変更）

**先読み**：`title → how_to_play` へ遷移するタイミングで `_refreshOnline()` を呼ぶ。LOCAL 表示（how_to_play 20s + local 10s）中に取得が完了し、GLOBAL 到達時には成否が確定している。

遷移:
- `_updateTitle`（8s）→ `how_to_play`：ここで `_refreshOnline()` を発火（fire-and-forget）。
- `_updateHowToPlay`（20s）→ `local_ranking_display`（`localRankIndex=-1`, `globalRankIndex=-1` にリセット）。
- `_updateLocalRanking`（10s）→ `onlineStatus==='ok' && onlineData` なら `global_ranking_display`、そうでなければ `title`（`playTitleBGM`）。
- `_updateGlobalRanking`（10s）→ `wall_of_fame_display`。
- `_updateWallOfFameDisplay`（10s）→ `title`（`playTitleBGM`）。
- いずれの画面もキー/クリックでゲーム開始（既存の `_anyKeyOrClick()`）。

**プレイ後（名前入力 Enter）** → `local_ranking_display`（自分の記録をハイライト）。`_submitOnline` がオンラインを再取得し `globalRankIndex` を設定、続く GLOBAL/FAME に反映。

## データソース

| 画面 | データ | weekId | 表示条件 |
|------|--------|--------|----------|
| LOCAL | `highScoreManager.getTop10()` | `this.week.weekId` | 常時 |
| GLOBAL | `onlineData.ranking` | `onlineData.weekId` | `onlineStatus==='ok'` |
| FAME | `onlineData.fame` | （週ごと見出し） | `onlineStatus==='ok'` |

- LOCAL 表示中でオンラインが利用不可のときは、画面下部に控えめな注記（例：`— GLOBAL unavailable (offline) —`）を出して「世界ランキングが別に存在するが今は接続不可」を示す（任意・小さく）。

## 視覚テーマ（ティア色）

各画面は「背景 + タイトル色 + サブタイトル色 + 行のグラデーション（bright→dim）」で構成。行の色は順位 index に応じて bright↔dim を線形補間（`t = min(index/19, 1)`、20行を基準に補間。短いリストは明るめのまま）。自分の記録の行は既存のブリンク（マゼンタ）でハイライト。

**LOCAL（ブロンズ）**
- 背景 `#120b04`、タイトル `#CD7F32`、サブ `#9c6b34`
- 行 bright `#F0AE6A` → dim `#7a5228`
- タイトル `▌ LOCAL RANKING — THIS DEVICE`、サブ `${weekId} · YOUR MACHINE`

**GLOBAL（シルバー）**
- 背景 `#080b0f`、タイトル `#D8DEE6`、サブ `#95a0ab`
- 行 bright `#FFFFFF` → dim `#5f6b78`
- タイトル `◍ GLOBAL RANKING — THIS WEEK 🌐`、サブ `${weekId} · WORLDWIDE`

**FAME（ゴールド／深紫背景）**
- 背景 `#17102b`（深紫）、タイトル `#FFD700`、サブ `#c9a94a`
- 週見出し `#e0c060`、エントリ行 bright `#FFE680` → dim `#9c7a26`（週内 index で補間 `t=i/2`）
- タイトル `✦ WALL OF FAME ✦`、サブ `WEEKLY CHAMPIONS`

- いずれの画面も下部に既存の点滅 `PRESS ANY KEY TO START`。
- 国旗は既存どおり各行末に表示（LOCAL/GLOBAL/FAME 共通）。

## 実装方針（ファイル）

### `src/js/ui/ScreenRenderer.js`
- 共通ヘルパ `_lerpColor(bright, dim, t)` を追加（hex 線形補間）。
- 共通の行リスト描画 `_drawTierList(ctx, { theme, scores, highlightIndex })` を抽出（LOCAL/GLOBAL 用。ヘッダ・列レイアウトは既存の `drawRankingDisplay` を踏襲）。
- `drawLocalRanking(ctx, scores, highlightIndex, weekId)` と `drawGlobalRanking(ctx, scores, highlightIndex, weekId)` の薄いラッパを用意（各テーマを渡す）。
- `drawWallOfFame(ctx, fame)` をゴールド／深紫にリテーマ（既存の週ごとレイアウトは踏襲、色をティア化）。
- 旧 `drawRankingDisplay` と `_drawStatusBadge`（および status 引数）は不要になるため撤去（または未使用化）。

### `src/js/main.js`
- 状態名を分割（`local_ranking_display` / `global_ranking_display`）。更新ハンドラ `_updateLocalRanking` / `_updateGlobalRanking` を追加、`_updateRankingDisplay` を置換。
- `init` に `this.localRankIndex = -1; this.globalRankIndex = -1;` を追加（既存の `lastRankIndex` は撤去 or 置換）。
- `_updateTitle` の how_to_play 遷移に `_refreshOnline()` 先読みを追加。
- `_submitOnline` は成功時 `this.globalRankIndex = res.rank`（`lastRankIndex` から改名）。
- 名前入力 Enter：`this.localRankIndex = addScore(...)`、`_submitOnline(...)`、`gameState='local_ranking_display'`。
- 描画分岐を3画面に更新（上表のデータソースに従う）。

## テスト

- 描画（canvas）は直接単体テスト不可。可能な範囲で：
  - `_lerpColor` を純粋関数として切り出し、Node で境界（t=0→bright, t=1→dim, 中間）を検証。
- 状態遷移の中核（LOCAL 後に `onlineStatus` により GLOBAL へ行く/`title` へ戻る分岐）は、可能なら小さなロジック関数に切り出して検証。難しければブラウザ確認に委ねる。
- エンドツーエンド：ブラウザでアトラクト巡回の3画面・色・国旗・オフライン時 LOCAL のみ、を目視確認。

## 非スコープ / 前提

- 既存の週シード決定論・オンライン基盤・国旗個別化は維持。
- Windows の canvas では国旗が2文字表示（OS制約、許容済み）。
- 色値は上記を初期値とし、実機確認で微調整する余地あり。
