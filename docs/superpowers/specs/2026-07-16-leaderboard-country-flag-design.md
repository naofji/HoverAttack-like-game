# ランキングの国旗による個別化 設計書

作成日: 2026-07-16

## 目的

オンライン／ローカル週間ランキングで、ユーザー名だけでは同名プレイヤーの区別が難しい問題を緩和する。プレイヤーの端末のタイムゾーンから国を推定し、記録に国コードを残して**国旗**を併記することで、外部通信・ログイン無しに「もう少しだけ」個別化する。

## 前提 / スコープ

- 静的サイト（GitHub Pages）＋GASバックエンド。外部Geo-IPサービスは使わない。
- 「正確な位置情報」ではなく、端末設定（タイムゾーン）由来の推定。個別化のヒントとして用いる。
- 後方互換：既存の6列スキーマに国コード列を1つ追加。旧データ（国コード空）は国旗なしで正常表示。
- オンライン主・ローカル従の既存方針は維持。ローカル記録にも国コードを保存して表示を揃える。

## 個別化の仕組み

- 国コードは**登録時にプレイヤー端末のタイムゾーンから算出**し保存する（表示側の閲覧者ではなく、記録した本人の国が残る）。
- 新規 `src/js/utils/geo.js`:
  - `getCountryCode(timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): string` — タイムゾーン名（例 `Asia/Tokyo`）を、**タイムゾーン→国コード対応表**で2文字大文字コード（例 `JP`）へ変換。未知/取得不可のゾーンは空文字 `''`。引数を受け取れるようにし、テスト時に `Intl` をスタブせず直接検証できるようにする。
  - `flagEmoji(code: string): string` — 2文字コードを国旗絵文字へ変換（各文字を地域指標記号 `0x1F1E6 + (c - 'A')` に写像）。無効値は `''`。
- タイムゾーン→国コード対応表 `src/js/utils/timezoneCountry.js`:
  - IANAタイムゾーン名 → ISO 3166-1 alpha-2 の対応（主要ゾーンを網羅。未知は表に無し＝空コード）。
  - データのみのモジュール（ロジックは持たない）。

## データモデル（後方互換）

`Scores` / `Fame` シートに **G列 `country`** を追加。

**Scores シート**:

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| timestamp | weekId | name | score | mission | clearTime | country |

**Fame シート**:

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| weekId | rank | name | score | mission | clearTime | country |

- `country` は2文字大文字コードまたは空。

## ランキングのエントリ形状（オンライン・ローカル共通）

- `{ name, score, mission, clearTime, country }`（`country` を追加）
- 旧データは `country` が空文字/未定義 → 国旗なし。

## GAS 変更（`gas/Code.gs`）

- `readRows_`: 読み取り列数を 6 → 7 に（`getRange(2, 1, lastRow-1, 7)`）。
- `topNForWeek`: エントリに `country: rows[i][6] || ''` を追加。
- `groupFame`: エントリに `country: fameRows[i][6] || ''` を追加。
- `sanitizeCountry(raw)` を追加：英字のみ2文字に切り詰め・大文字化、該当しなければ空。
- `validateEntry`: 返す value に `country: sanitizeCountry(entry.country)` を追加。
- `doPost`: 追記行を7列に（末尾に `entry.country`）。順位一致判定は従来通り name+score。
- `weeklySnapshot`: Fame への追記を7列に（末尾に `top[r].country || ''`）。
- `doGet`: ranking/fame に country が含まれる（上記ヘルパ経由で自動）。

## クライアント変更

- `src/js/systems/OnlineLeaderboard.js`: 変更なし（`submit(entry)` は渡された entry をそのまま送るため、呼び出し側が `country` を含める）。
- `src/js/systems/HighScoreManager.js`: `addScore(name, score, mission, clearTime, country)` に `country` 引数を追加し、エントリに保存。既存呼び出しとの互換のため `country = ''` 既定。
- `src/js/main.js`:
  - 登録時（`_updateRankingEntry` Enter分岐）に `const country = getCountryCode();` を算出し、ローカル `addScore(..., country)` とオンライン `_submitOnline(..., country)` の両方へ渡す。
  - `_submitOnline(name, score, mission, clearTime, country)` に引数追加し、`submit({ name, score, mission, clearTime, country })` を送る。
- `src/js/ui/ScreenRenderer.js`:
  - `drawRankingDisplay` / `drawWallOfFame` の各行末に `flagEmoji(entry.country)` を表示（列ズレ回避のため行末配置）。

## 表示上の制約（既知）

- **Windows の Chrome では国旗絵文字がフラグ画像で描画されず `JP` のように2文字で表示される**（WindowsがOSに国旗グリフを持たないため）。Mac/iOS/Android では国旗が表示される。いずれも「同名の区別」という目的は達成できる。合意済みの前提。

## 作者の手作業

- 既存スプレッドシートの **`Scores` と `Fame` の G1 セルに見出し `country` を追加**する。既存行のG列は空のままでよい（後方互換）。
- `gas/Code.gs` を更新後、Apps Script に貼り直して保存（トリガーは Head 実行のため再デプロイ不要。ただしWebアプリのGET/POST挙動を確実に反映するには、必要なら「デプロイを管理」から新バージョンにする）。

## テスト

- `src/js/utils/geo.js`：
  - `getCountryCode`（`Intl` をスタブ、または既知ゾーン名で対応表を検証）で `Asia/Tokyo → 'JP'`、未知ゾーン → `''`。
  - `flagEmoji('JP')` が 🇯🇵 相当（コードポイント検証）、無効値 → `''`。
- `tests/gas-core.test.js`：7列行に対応する `topNForWeek`/`groupFame` の country 反映、`sanitizeCountry`、`validateEntry` の country を検証。
- `HighScoreManager`：`addScore` の country 保存を検証（既存テストは `country` 既定で不変）。
- エンドツーエンド：デプロイ後、実機で国旗（またはWindowsでは2文字）が表示され、シートG列に国コードが残ることを手動確認。

## 非スコープ / 将来課題

- 正確な位置情報（Geo-IP）や本人性（ログイン）。
- タイムゾーン対応表の完全網羅（主要ゾーンでカバー、長い裾は空コード＝国旗なし）。
- Windows での国旗画像表示（OS制約のため対象外。必要なら2文字コード表示に切替可能）。
