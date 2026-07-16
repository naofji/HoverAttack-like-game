# ランキング画面の分離とティア別テーマ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ランキング表示を LOCAL(ブロンズ)・GLOBAL(シルバー)・FAME(ゴールド) の独立3画面に分離し、ティア色の明暗グラデーションで明確に区別する。オンライン取得成功時のみ GLOBAL/FAME を表示し、失敗時は LOCAL のみ巡回する（フォールバック混在を廃止）。

**Architecture:** アトラクト状態機械を `local_ranking_display` / `global_ranking_display` / `wall_of_fame_display` の3状態に分割。`title→how_to_play` で `_refreshOnline()` を先読みし、LOCAL 表示後に `onlineStatus` で GLOBAL/FAME を出す/スキップを決める。描画はティア別テーマ（背景・タイトル・行の明暗グラデーション）で行い、色補間は純粋関数 `lerpColor` に切り出してテストする。

**Tech Stack:** バニラJS（ES6 modules、ビルド無し）。テストは Node 標準テストランナー（`node --test`）。描画・状態遷移はキャンバス依存のためブラウザで目視検証。

## Global Constraints

- 追加npm依存は入れない。テストは Node 標準の `node:test` / `node:assert` のみ。
- ソースは ES6 module。フォントは `"Space Mono", monospace`（既存踏襲）。
- 3画面のデータソース：LOCAL=`highScoreManager.getTop10()`（常時）、GLOBAL=`onlineData.ranking`（`onlineStatus==='ok'` のみ）、FAME=`onlineData.fame`（`onlineStatus==='ok'` のみ）。
- GLOBAL と FAME は同一 `doGet` 取得を共有 → 表示可否は一括。取得不可時は両方スキップし LOCAL のみ巡回。
- ティア色（初期値、実機微調整可）：
  - LOCAL(ブロンズ)：bg `#120b04`、title `#CD7F32`、sub `#9c6b34`、行 bright `#F0AE6A`→dim `#7a5228`
  - GLOBAL(シルバー)：bg `#080b0f`、title `#D8DEE6`、sub `#95a0ab`、行 bright `#FFFFFF`→dim `#5f6b78`
  - FAME(ゴールド)：bg `#17102b`、title `#FFD700`、sub `#c9a94a`、週見出し `#e0c060`、行 bright `#FFE680`→dim `#9c7a26`
- 行の色は順位で bright↔dim を補間（LOCAL/GLOBAL は `t=min(index/19,1)`、FAME は週内 `t=min(i/2,1)`）。自分の記録行は既存のブリンク（マゼンタ `#FF00FF`）でハイライト。
- ハイライトは LOCAL=`localRankIndex`（`addScore` 返り値）、GLOBAL=`globalRankIndex`（`submit` の `res.rank`）、FAME=なし。
- 国旗は各行末に既存どおり表示。既存の週シード・オンライン基盤・国旗個別化を壊さない。

---

### Task 1: 色補間ユーティリティ `lerpColor` ＋ テスト

**Files:**
- Create: `src/js/utils/color.js`
- Test: `tests/color.test.js`

**Interfaces:**
- Consumes: なし
- Produces: `lerpColor(a: string, b: string, t: number): string`（`#rrggbb`、t は [0,1] にクランプ）

- [ ] **Step 1: 失敗するテストを書く**

`tests/color.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerpColor } from '../src/js/utils/color.js';

test('lerpColor returns endpoints at t=0 and t=1', () => {
  assert.equal(lerpColor('#000000', '#ffffff', 0), '#000000');
  assert.equal(lerpColor('#000000', '#ffffff', 1), '#ffffff');
});

test('lerpColor interpolates the midpoint', () => {
  assert.equal(lerpColor('#000000', '#ffffff', 0.5), '#808080'); // round(127.5)=128=0x80
});

test('lerpColor clamps t outside [0,1]', () => {
  assert.equal(lerpColor('#102030', '#a0b0c0', -1), '#102030');
  assert.equal(lerpColor('#102030', '#a0b0c0', 2), '#a0b0c0');
});

test('lerpColor handles uppercase and per-channel interpolation', () => {
  // R:0x00->0x10 at .5 = 0x08, G:0x00->0x20 = 0x10, B:0x00->0x40 = 0x20
  assert.equal(lerpColor('#000000', '#102040', 0.5), '#081020');
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test tests/color.test.js`
Expected: FAIL（`color.js` が存在しない）

- [ ] **Step 3: 実装を書く**

`src/js/utils/color.js`:
```js
// ============================================
// color - small hex color interpolation helper
// ============================================

function _parseHex(h) {
    const s = String(h).replace('#', '');
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function _toHex(n) {
    return Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
}

/** Linear-interpolate two #rrggbb colors. t is clamped to [0,1]. Returns #rrggbb. */
export function lerpColor(a, b, t) {
    const x = Math.max(0, Math.min(1, t));
    const pa = _parseHex(a);
    const pb = _parseHex(b);
    const r = Math.round(pa[0] + (pb[0] - pa[0]) * x);
    const g = Math.round(pa[1] + (pb[1] - pa[1]) * x);
    const bl = Math.round(pa[2] + (pb[2] - pa[2]) * x);
    return '#' + _toHex(r) + _toHex(g) + _toHex(bl);
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `node --test tests/color.test.js`
Expected: PASS（4 tests）

- [ ] **Step 5: 全テスト実行**

Run: `node --test`
Expected: 全パス

- [ ] **Step 6: コミット**

```bash
git add src/js/utils/color.js tests/color.test.js
git commit -m "feat: 色補間ユーティリティ lerpColor を追加"
```

---

### Task 2: ScreenRenderer にティア別描画を追加（LOCAL/GLOBAL/FAMEリテーマ）

**Files:**
- Modify: `src/js/ui/ScreenRenderer.js`

**Interfaces:**
- Consumes: `lerpColor`（Task 1）、`flagEmoji`（既存）、エントリ `{name,score,mission,clearTime,country}`、fame `{weekId,entries}`
- Produces:
  - `drawLocalRanking(ctx, scores, highlightIndex = -1, weekId = '')`
  - `drawGlobalRanking(ctx, scores, highlightIndex = -1, weekId = '')`
  - `drawWallOfFame(ctx, fame)`（リテーマ、status 引数を廃止）
  - 内部 `_drawRankingList(ctx, opts)`

このタスクでは既存の `drawRankingDisplay` と `_drawStatusBadge` は**まだ残す**（main.js からの参照が残るため。撤去は Task 4）。

- [ ] **Step 1: `lerpColor` を import**

`src/js/ui/ScreenRenderer.js` の先頭 import 群（`flagEmoji` の import 付近）に追加:
```js
import { lerpColor } from '../utils/color.js';
```

- [ ] **Step 2: 共通の行リスト描画 `_drawRankingList` を追加**

`drawRankingDisplay`（469行目付近）の**直前**に新規メソッドを追加:
```js
    _drawRankingList(ctx, o) {
        const canvas = this.game.canvas;

        ctx.fillStyle = o.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.textAlign = 'center';
        ctx.fillStyle = o.titleColor;
        ctx.font = 'bold 34px "Space Mono", monospace';
        ctx.fillText(o.title, canvas.width / 2, 40);

        ctx.fillStyle = o.subtitleColor;
        ctx.font = 'bold 16px "Space Mono", monospace';
        ctx.fillText(o.subtitle, canvas.width / 2, 66);

        ctx.font = 'bold 19px "Space Mono", monospace';
        ctx.fillStyle = o.subtitleColor;
        ctx.fillText('RANK   SCORE       NAME         MISSION (TIME)', canvas.width / 2, 95);

        const scores = o.scores || [];
        if (scores.length === 0) {
            ctx.textAlign = 'center';
            ctx.fillStyle = o.subtitleColor;
            ctx.font = 'bold 18px "Space Mono", monospace';
            ctx.fillText('NO RECORDS YET', canvas.width / 2, canvas.height / 2);
        } else {
            ctx.font = 'bold 19px "Space Mono", monospace';
            const startY = 130;
            const lineH = 22.5;
            const textLeft = canvas.width / 2 - 255;
            scores.forEach((entry, index) => {
                if (index === o.highlightIndex && Math.floor(Date.now() / 200) % 2 === 0) {
                    ctx.fillStyle = '#FF00FF';
                } else {
                    ctx.fillStyle = lerpColor(o.rowBright, o.rowDim, Math.min(index / 19, 1));
                }
                const rank = String(index + 1).padStart(2, ' ');
                const scoreStr = String(entry.score).padStart(7, ' ');
                const nameStr = (entry.name).padEnd(10, ' ');
                const missionStr = String(entry.mission).padStart(2, ' ');
                const timeStr = entry.clearTime ? ` (${entry.clearTime})` : '';
                const flag = flagEmoji(entry.country);
                ctx.textAlign = 'left';
                ctx.fillText(`${rank}.  ${scoreStr}     ${nameStr}      ${missionStr}${timeStr}${flag ? '  ' + flag : ''}`, textLeft, startY + index * lineH);
            });
        }

        ctx.textAlign = 'center';
        if (Math.floor(Date.now() / 500) % 2 === 0) {
            ctx.save();
            ctx.fillStyle = '#FFFFFF';
            ctx.shadowColor = '#FFFFFF';
            ctx.shadowBlur = 10;
            ctx.font = 'bold 20px "Space Mono", monospace';
            ctx.fillText('PRESS ANY KEY TO START', canvas.width / 2, canvas.height - 20);
            ctx.restore();
        }
        ctx.textAlign = 'left';
    }

    drawLocalRanking(ctx, scores, highlightIndex = -1, weekId = '') {
        this._drawRankingList(ctx, {
            scores, highlightIndex,
            title: '▌ LOCAL RANKING — THIS DEVICE',
            subtitle: `${weekId} · YOUR MACHINE`,
            bg: '#120b04', titleColor: '#CD7F32', subtitleColor: '#9c6b34',
            rowBright: '#F0AE6A', rowDim: '#7a5228',
        });
    }

    drawGlobalRanking(ctx, scores, highlightIndex = -1, weekId = '') {
        this._drawRankingList(ctx, {
            scores, highlightIndex,
            title: '◍ GLOBAL RANKING — THIS WEEK 🌐',
            subtitle: `${weekId} · WORLDWIDE`,
            bg: '#080b0f', titleColor: '#D8DEE6', subtitleColor: '#95a0ab',
            rowBright: '#FFFFFF', rowDim: '#5f6b78',
        });
    }
```

- [ ] **Step 3: `drawWallOfFame` をゴールド／深紫にリテーマ（status 引数廃止）**

`src/js/ui/ScreenRenderer.js` の既存 `drawWallOfFame`（537-590行目付近）を**全体**次のように置き換える:
```js
    drawWallOfFame(ctx, fame) {
        const canvas = this.game.canvas;

        ctx.fillStyle = '#17102b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 40px "Space Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('✦ WALL OF FAME ✦', canvas.width / 2, 44);

        ctx.fillStyle = '#c9a94a';
        ctx.font = 'bold 16px "Space Mono", monospace';
        ctx.fillText('WEEKLY CHAMPIONS', canvas.width / 2, 70);

        if (!fame || fame.length === 0) {
            ctx.fillStyle = '#c9a94a';
            ctx.font = 'bold 18px "Space Mono", monospace';
            ctx.fillText('NO CHAMPIONS YET', canvas.width / 2, canvas.height / 2);
        } else {
            let y = 108;
            const textLeft = canvas.width / 2 - 255;
            for (const wk of fame) {
                if (y > canvas.height - 60) break;
                ctx.textAlign = 'left';
                ctx.fillStyle = '#e0c060';
                ctx.font = 'bold 18px "Space Mono", monospace';
                ctx.fillText(wk.weekId, textLeft, y);
                y += 24;
                ctx.font = 'bold 17px "Space Mono", monospace';
                wk.entries.forEach((e, i) => {
                    ctx.fillStyle = lerpColor('#FFE680', '#9c7a26', Math.min(i / 2, 1));
                    const rank = String(i + 1);
                    const scoreStr = String(e.score).padStart(7, ' ');
                    const nameStr = (e.name).padEnd(10, ' ');
                    const flag = flagEmoji(e.country);
                    ctx.fillText(`  ${rank}.  ${scoreStr}   ${nameStr}${flag ? '  ' + flag : ''}`, textLeft, y);
                    y += 22;
                });
                y += 8;
            }
        }

        ctx.textAlign = 'center';
        if (Math.floor(Date.now() / 500) % 2 === 0) {
            ctx.save();
            ctx.fillStyle = '#FFFFFF';
            ctx.shadowColor = '#FFFFFF';
            ctx.shadowBlur = 10;
            ctx.font = 'bold 20px "Space Mono", monospace';
            ctx.fillText('PRESS ANY KEY TO START', canvas.width / 2, canvas.height - 20);
            ctx.restore();
        }
        ctx.textAlign = 'left';
    }
```

- [ ] **Step 4: 構文チェックと既存テスト**

Run: `node --check src/js/ui/ScreenRenderer.js && node --test`
Expected: 構文OK、既存テスト全パス

- [ ] **Step 5: コミット**

```bash
git add src/js/ui/ScreenRenderer.js
git commit -m "feat: LOCAL/GLOBALのティア別描画を追加しWALL OF FAMEをリテーマ"
```

---

### Task 3: main.js を3画面の状態機械に更新

**Files:**
- Modify: `src/js/main.js`

**Interfaces:**
- Consumes: `drawLocalRanking`/`drawGlobalRanking`/`drawWallOfFame`（Task 2）、`_refreshOnline`/`_submitOnline`（既存）
- Produces: なし

- [ ] **Step 1: gameState コメントと状態プロパティを更新**

`src/js/main.js` の96行目付近の `gameState` コメントの状態一覧を更新（`ranking_display` を `local_ranking_display | global_ranking_display` に）:
```js
    gameState: 'title', // 'title' | 'playing' | 'gameover' | 'mission_clear' | 'game_clear' | 'ranking_entry' | 'local_ranking_display' | 'global_ranking_display' | 'wall_of_fame_display'
```

109行目付近の `lastRankIndex: -1,` を次に置換:
```js
    localRankIndex: -1,
    globalRankIndex: -1,
```

- [ ] **Step 2: 更新ディスパッチを差し替え**

`src/js/main.js` の185行目付近を変更:
```js
            case 'local_ranking_display': return this._updateLocalRanking(deltaTime);
            case 'global_ranking_display': return this._updateGlobalRanking(deltaTime);
            case 'wall_of_fame_display': return this._updateWallOfFameDisplay(deltaTime);
```

- [ ] **Step 3: `_updateTitle` に先読みを追加**

`src/js/main.js` の `_updateTitle`（199-201行目付近）の how_to_play 遷移を次のように変更:
```js
        } else if (this.stateTimer > 8000) {
            this.gameState = 'how_to_play';
            this.stateTimer = 0;
            this._refreshOnline(); // prefetch online data during how_to_play + local so GLOBAL/FAME are ready
```

- [ ] **Step 4: `_updateHowToPlay` の遷移先を local に変更（先読み行は削除）**

`src/js/main.js` の `_updateHowToPlay`（211-215行目付近）を次のように変更:
```js
        if (this.stateTimer > 20000) { // 20 seconds total (10s per page)
            this.gameState = 'local_ranking_display';
            this.stateTimer = 0;
            this.localRankIndex = -1;
            this.globalRankIndex = -1;
        } else if (this._anyKeyOrClick()) {
```
（元の `this.lastRankIndex = -1;` と `this._refreshOnline();` の2行は上記に置き換わる。）

- [ ] **Step 5: `_updateRankingDisplay` を `_updateLocalRanking` + `_updateGlobalRanking` に置換**

`src/js/main.js` の `_updateRankingDisplay`（223-233行目付近）を**全体**次の2メソッドに置き換える:
```js
    _updateLocalRanking(deltaTime) {
        this.stateTimer += deltaTime;
        if (this.stateTimer > 10000) {
            if (this.onlineStatus === 'ok' && this.onlineData) {
                this.gameState = 'global_ranking_display';
            } else {
                this.gameState = 'title';
                audioManager.playTitleBGM();
            }
            this.stateTimer = 0;
        } else if (this._anyKeyOrClick()) {
            this.stateManager.restart();
            this.gameState = 'playing';
            audioManager.startBGM(this.missionsCompleted);
        }
    },

    _updateGlobalRanking(deltaTime) {
        this.stateTimer += deltaTime;
        if (this.stateTimer > 10000) {
            this.gameState = 'wall_of_fame_display';
            this.stateTimer = 0;
        } else if (this._anyKeyOrClick()) {
            this.stateManager.restart();
            this.gameState = 'playing';
            audioManager.startBGM(this.missionsCompleted);
        }
    },
```
（`_updateWallOfFameDisplay` は既存のまま維持。）

- [ ] **Step 6: `_submitOnline` のハイライトを globalRankIndex に**

`src/js/main.js` の `_submitOnline`（267行目付近）の `this.lastRankIndex = res.rank;` を次に変更:
```js
            this.globalRankIndex = res.rank;
```

- [ ] **Step 7: 名前入力完了時のハイライトと遷移先を更新**

`src/js/main.js` の `_updateRankingEntry` の Enter 分岐（282-286行目付近）を次のように変更:
```js
                this.localRankIndex = this.highScoreManager.addScore(
                    this.playerNameInput, this.score, displayMission, formattedTime, country
                );
                this._submitOnline(this.playerNameInput, this.score, displayMission, formattedTime, country);
                this.gameState = 'local_ranking_display';
```

- [ ] **Step 8: 描画分岐を3画面に更新**

`src/js/main.js` の描画分岐（743-754行目付近、`ranking_display` と `wall_of_fame_display` の2ブロック）を次の3ブロックに置き換える:
```js
        if (this.gameState === 'local_ranking_display') {
            this.screenRenderer.drawLocalRanking(ctx, this.highScoreManager.getTop10(), this.localRankIndex, this.week.weekId);
            return;
        }
        if (this.gameState === 'global_ranking_display') {
            const data = this.onlineData || { ranking: [], weekId: this.week.weekId };
            this.screenRenderer.drawGlobalRanking(ctx, data.ranking, this.globalRankIndex, data.weekId);
            return;
        }
        if (this.gameState === 'wall_of_fame_display') {
            const fame = (this.onlineData && this.onlineData.fame) || [];
            this.screenRenderer.drawWallOfFame(ctx, fame);
            return;
        }
```

- [ ] **Step 9: 構文チェックと参照確認**

Run: `node --check src/js/main.js && node --test`
Expected: 構文OK、全テストパス

Run: `grep -n "lastRankIndex\|ranking_display'" src/js/main.js`
Expected: `lastRankIndex` は0件、`'ranking_display'`（旧単一状態名）も0件。`'local_ranking_display'` / `'global_ranking_display'` が現れる。

- [ ] **Step 10: コミット**

```bash
git add src/js/main.js
git commit -m "feat: ランキングを3画面(LOCAL/GLOBAL/FAME)の状態機械に更新"
```

---

### Task 4: ScreenRenderer から未使用の旧描画を撤去

**Files:**
- Modify: `src/js/ui/ScreenRenderer.js`

**Interfaces:**
- Consumes: なし
- Produces: なし

- [ ] **Step 1: 参照が無いことを確認**

Run: `grep -rn "drawRankingDisplay\|_drawStatusBadge" src/js`
Expected: `src/js/ui/ScreenRenderer.js` の定義箇所のみ（main.js 等からの呼び出しが無いこと）。呼び出しが残っていればここで停止して報告。

- [ ] **Step 2: 旧 `drawRankingDisplay` と `_drawStatusBadge` を削除**

`src/js/ui/ScreenRenderer.js` から `_drawStatusBadge(ctx, status) { ... }` メソッド全体と、旧 `drawRankingDisplay(ctx, scores, highlightIndex = -1, weekId = '', status = 'ok') { ... }` メソッド全体を削除する（Task 2 で追加した `_drawRankingList`/`drawLocalRanking`/`drawGlobalRanking`/リテーマ後の `drawWallOfFame` は残す）。

- [ ] **Step 3: 構文チェックと全テスト**

Run: `node --check src/js/ui/ScreenRenderer.js && node --test`
Expected: 構文OK、全テストパス

Run: `grep -rn "drawRankingDisplay\|_drawStatusBadge" src/js`
Expected: 出力なし（0件）

- [ ] **Step 4: コミット**

```bash
git add src/js/ui/ScreenRenderer.js
git commit -m "refactor: 未使用の旧ランキング描画とステータスバッジを撤去"
```

---

### Task 5: ブラウザ実機検証

**Files:**
- 変更なし（動作確認）

- [ ] **Step 1: 全テスト**

Run: `node --test`
Expected: 全パス（color / 既存すべて）

- [ ] **Step 2: 構文チェック**

Run: `node --check src/js/main.js && node --check src/js/ui/ScreenRenderer.js`
Expected: いずれもOK

- [ ] **Step 3: オンライン有効時のアトラクト巡回（`LEADERBOARD_URL` 設定済み前提）**

1. `python3 -m http.server 8000` で起動、`http://localhost:8000/index.html`。
2. アトラクトを待ち、**LOCAL(ブロンズ) → GLOBAL(シルバー) → FAME(ゴールド／深紫) → title** の順で巡回すること。
3. 各画面の色調・タイトル・サブタイトル・国旗・1位が最も明るいグラデーションを目視確認。
4. LOCAL→GLOBAL 切替時に「同じ画面が2種類」に見えないこと（別画面として明確に分かれる）。
5. コンソールエラーが無いこと。

- [ ] **Step 4: オフライン時（`LEADERBOARD_URL` 空、またはネット遮断）**

1. アトラクトが **LOCAL のみ**を巡回し、GLOBAL/FAME はスキップされること（LOCAL(10s)後に title へ戻る）。
2. LOCAL がローカル記録を国旗付きで表示すること。エラーが無いこと。

- [ ] **Step 5: プレイ後フロー**

1. スコア（10000超）を出して名前登録 → `local_ranking_display` に入り、自分の記録がマゼンタでハイライトされること。
2. オンライン有効なら続けて GLOBAL/FAME に反映されること。

- [ ] **Step 6: 検証で見つかった不具合があれば修正してコミット**

```bash
git add -A
git commit -m "fix: ランキング3画面化の検証で見つかった不具合を修正"
```

---

## 完了条件

- `node --test` 全パス（color 追加 + 既存）。
- アトラクトが LOCAL/GLOBAL/FAME の3画面をティア色で明確に区別して巡回。
- オンライン取得不可時は GLOBAL/FAME をスキップし LOCAL のみ巡回（フォールバック混在なし）。
- 旧 `drawRankingDisplay` / `_drawStatusBadge` が撤去され、参照ゼロ。
- 既存機能（週シード・オンライン基盤・国旗）を維持。
