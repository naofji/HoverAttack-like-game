# GAS＋スプレッドシート オンライン週間ランキング 設計書

作成日: 2026-07-15

## 目的

既存のローカル週間ランキング／殿堂（Wall of Fame）を、全プレイヤー共通のオンラインランキングに拡張する。Google スプレッドシートをデータストア、Google Apps Script (GAS) Web App をバックエンドとして用い、GitHub Pages（静的サイト）から安全にスコアを登録・取得できるようにする。決定論ステージ（週シード）と組み合わせ、週替わりの共通ランキングを成立させる。

## 前提 / スコープ

- ホスティングは GitHub Pages（静的サイト）。書き込み資格情報をクライアントに露出させないため、GAS（作者の Google アカウント権限で実行）を書き込み代理人とする。
- **オンライン主・ローカル従**：オンライン取得成功時はオンライン内容を表示。失敗/オフライン時は既存 `HighScoreManager`（localStorage）へフォールバックし、画面に `OFFLINE` を表示。
- 既存機能（週シードによる決定論ステージ、`MIN_SCORE=10000` の記録閾値、名前入力フロー、アトラクト画面）は維持する。
- チート許容度：**GAS側で基本チェック**のみ（完全防御はしない。不正はシート手動削除で対応）。

## 全体アーキテクチャ

```
[ゲーム(GitHub Pages)] --GET(doGet)---> [GAS Web App] --読み書き--> [スプレッドシート]
                        --POST(doPost)->                            (Scores / Fame シート)
                                          ↑ 週次時間トリガー(月曜UTC)で
                                            前週トップ3をFameへスナップショット
```

- 読み書きとも**単一のGAS Web App エンドポイント**。`doGet`＝読み取り、`doPost`＝登録。
- ゲームループは同期・`fetch` は非同期のため、**取得結果は `game.onlineData` にキャッシュ**し、描画はキャッシュを読む。

## データモデル（スプレッドシート）

**Scores シート**（列見出し行あり）:

| timestamp | weekId | name | score | mission | clearTime |
|-----------|--------|------|-------|---------|-----------|

**Fame シート**（週次トリガーが追記）:

| weekId | rank | name | score | mission | clearTime |
|--------|------|------|-------|---------|-----------|

- **weekId はサーバー（GAS）側で算出**（ISO 8601 週・月曜UTC、クライアントの `WeekSeed.js` と同一定義）。`doPost` 受信時にサーバー現在 weekId を付与し、クライアント時計のズレや偽装 weekId を排除する。
- `clearTime` は 7 面クリア時のみ文字列（例 `05:00.00`）、それ以外は空。

## API 仕様

### GET（読み取り）: `doGet(e)`

- パラメータ不要（もしくは無視）。
- 応答（JSON, `Content-Type: application/json`）:

```json
{
  "ok": true,
  "weekId": "2026-W29",
  "ranking": [ { "name": "AAA", "score": 12345, "mission": 4, "clearTime": null }, ... up to 20 ],
  "fame":    [ { "weekId": "2026-W28", "entries": [ {top3...} ] }, ... newest first ]
}
```

- `ranking` は現在 weekId の Scores からスコア降順トップ20。
- `fame` は Fame シートを weekId ごとにまとめ、新しい週が先頭。

### POST（登録）: `doPost(e)`

- **CORS プリフライト回避**のため、クライアントは `Content-Type: text/plain` で JSON 文字列を送る。GAS 側で `JSON.parse(e.postData.contents)`。
- リクエスト body:

```json
{ "name": "AAA", "score": 12345, "mission": 4, "clearTime": null }
```

- サーバー処理:
  1. `LockService.getScriptLock()` を取得（最大待機は妥当な秒数、失敗時は `{ ok:false, reason:"busy" }`）。
  2. 基本チェック（下記）を通過したら、`timestamp`（サーバー時刻）と `weekId`（サーバー算出）を付与して Scores に1行追記。
  3. 追記後、現在 weekId のトップ20内での順位を算出。
  4. 応答: `{ ok:true, rank: <0始まりindex または -1>, weekId }`。不正時 `{ ok:false, reason }`。

### 基本チェック（GAS側）

- `score` が整数かつ `0 < score <= SCORE_CAP`（現実的上限。定数、例: 100000000）。範囲外は拒否。
- `name` サニタイズ：制御文字除去、10文字に切り詰め、大文字化。空なら `AAA`。
- `mission` は 1〜7 の整数に丸め。
- 同一 `name` の短時間連投レート制限：直近 10 秒以内に同名の登録があれば拒否（Scores 末尾から同名の最新 timestamp を参照）。
- weekId はサーバー算出のため、クライアント由来の weekId は受け取らない（整合性担保）。

## 週次トリガー（殿堂スナップショット）

- GAS の**時間主導トリガー**を毎週（月曜UTC付近）に設定。
- 処理: 直前の週の `weekId` を算出し、その週の Scores からトップ3を取り、Fame シートへ `rank` 1〜3 で追記。既に同 weekId が Fame にあれば二重追記しない。
- これにより殿堂は不変・読み取り軽量。

## クライアント実装とファイル構成

### 新規 `src/js/systems/OnlineLeaderboard.js`

ネットワーク層のみを担う（テスト可能）。

- `constructor(url)`
- `async fetchData(timeoutMs = 5000): { ok, weekId?, ranking?, fame?, error? }`
  - `fetch(url)` を `AbortController` でタイムアウト。失敗/タイムアウト/不正JSONは `{ ok:false, error }` を返す（例外は投げない）。
- `async submit(entry, timeoutMs = 5000): { ok, rank?, error? }`
  - `fetch(url, { method:'POST', body: JSON.stringify(entry), headers:{'Content-Type':'text/plain'} })`。同様に安全に失敗を返す。
- URL 未設定（空文字）の場合は即 `{ ok:false, error:'not-configured' }` を返し、常にフォールバックさせる。

### 新規 設定（`src/js/utils/Constants.js` に追記）

- `export const LEADERBOARD_URL = '';`  ← **GAS デプロイ後に取得した Web App URL を貼る**。空のうちは常にローカルフォールバック。

### 改修 `src/js/main.js`

- 起動時（`init`）に `this.onlineLeaderboard = new OnlineLeaderboard(LEADERBOARD_URL)` を生成し、`this.onlineData = null`、`this.onlineStatus = 'loading' | 'ok' | 'offline'` を用意。
- アトラクトのランキング系画面へ入る際（`_updateHowToPlay` → `ranking_display` 遷移時など）に `fetchData()` を呼び、結果を `this.onlineData` にキャッシュ、`onlineStatus` を更新。
- 名前入力完了時（`_updateRankingEntry` の Enter 分岐）：従来通りローカル `addScore` を実行し、さらに `submit()` を呼ぶ。成功後に `fetchData()` で再取得して順位反映。
- 送信/取得は非同期。描画はキャッシュ参照。

### 改修 `src/js/ui/ScreenRenderer.js`

- `drawRankingDisplay` / `drawWallOfFame` に、オンライン `onlineData` があればそれを、無ければローカル（`HighScoreManager`）を表示する分岐を、呼び出し側（main.js）で解決して渡す。
- `LOADING…`（取得中）/ `OFFLINE`（フォールバック中）の小さなステータス表示を追加。

### 既存 `src/js/systems/HighScoreManager.js`

- **変更なし**。オフライン時のフォールバック表示とローカル記録に使用。

### 新規 `gas/Code.gs`

- Apps Script サーバーコード（サイトからは実行されない成果物）。`doGet` / `doPost` / 週次トリガー関数 / 純粋ヘルパー（weekId算出・トップN抽出・入力検証・サニタイズ）を含む。
- ヘルパーは副作用（SpreadsheetApp）から分離し、ロジックを見通しよく保つ。

### 新規 `docs/superpowers/specs/2026-07-15-gas-setup.md`

- 手順書：スプレッドシート作成、シート名/見出し設定、GAS 貼付、Web アプリのデプロイ（実行者=自分、アクセス=全員）、時間トリガー設定、Web App URL 取得と `LEADERBOARD_URL` への貼付、動作確認。

## 作者の手作業（私が代行できない作業）

Google リソースの作成・認証・デプロイは代行不可。以下は利用者（貴方）の手作業:

1. スプレッドシート作成（Scores / Fame シートと見出し行）。
2. `gas/Code.gs` を Apps Script エディタに貼付。
3. Web アプリとしてデプロイ（実行者=自分、アクセス=全員）。
4. 週次の時間主導トリガーを設定。
5. 取得した Web App URL を `src/js/utils/Constants.js` の `LEADERBOARD_URL` に貼付。

私は GAS コード一式・手順書を用意し、クライアント実装とユニットテストを行う。

## テストと検証

- `OnlineLeaderboard.js`：`globalThis.fetch` をスタブし Node でユニットテスト。
  - 正常取得で `{ ok:true, ranking, fame, weekId }` を返す。
  - タイムアウト/ネットワーク失敗で `{ ok:false }`（例外を投げない）。
  - 不正 JSON で `{ ok:false }`。
  - URL 未設定で即 `{ ok:false, error:'not-configured' }`。
- GAS 純粋ヘルパー（weekId算出・トップN抽出・検証）：可能な範囲でロジックを検証（Node で `SpreadsheetApp` 非依存部分を移植テスト、または手動確認）。
- エンドツーエンド：デプロイ後の手動スモークテスト（登録→シート反映→再取得で順位反映、オフライン時フォールバック、週次トリガー実行で Fame 追記）。

## 非スコープ / 将来課題

- シード再生による厳密なチート検証。
- ログイン/アカウントによる本人性担保（現状は匿名・名前collision許容）。
- 高トラフィック時の GAS クォータ超過対策（読み取りのCSVオフロード等）。
- 名前の不適切語フィルタ（必要なら後日）。
