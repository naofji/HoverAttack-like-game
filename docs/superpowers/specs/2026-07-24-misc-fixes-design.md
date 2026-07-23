# 雑多な修正 5点 設計書 (2026-07-24)

## 背景
プレイテストで見つかった5つの独立した不具合・仕様改善をまとめて修正する。各項目は互いに独立しており、同一PR/ブランチ内で個別に実装・確認する。

---

## 1. ドッキング時の武器強制ミサイル化を停止

**現状**: `Player.js` の `resupply()` が `this.currentWeapon = 'missile'` を無条件セットしており、キャリアにドッキングするたびに選択中の武器がミサイルに切り替わってしまう。呼び出し元は `main.js` の `_handleDocking()`。

**修正**:
- `Player.js resupply()` から `this.currentWeapon = 'missile';` を削除。ドッキング中も直前に選択していた武器を維持する。
- `respawn()`(死亡復活時にキャリアへ再配置される処理)側の `this.currentWeapon = 'missile'` は変更しない。新しい命の開始としてミサイルスタートは妥当な挙動のため対象外。

**影響範囲**: `src/js/entities/Player.js`

---

## 2. carrierLiftオプションを廃止し常時「持ち上げ可能」に統一

**現状**: `main.js` の `game.options.carrierLift`(デフォルトtrue)が、Tabキーでトグル可能。`Player.js`内の2箇所(水平衝突判定・下からの持ち上げ判定)がこのフラグで分岐しており、OFF時は持ち上げ不可・横当たり無効になる。タイトル画面に `[TAB] CARRIER LIFT: ON/OFF` の表示あり。

**修正**:
- `main.js`: `options: { carrierLift: true }` フィールドと、`_updateTitle()` 内のTabキートグル処理を削除。
- `Player.js`: 2箇所の `&& this.game.options.carrierLift` 条件を削除し、常に持ち上げ・横当たり判定が有効な状態(=現行のON相当)に固定。
- `ScreenRenderer.js`: `[TAB] CARRIER LIFT` のUI描画コードを削除。

**影響範囲**: `src/js/main.js`, `src/js/entities/Player.js`, `src/js/ui/ScreenRenderer.js`

---

## 3. 爆発系ダメージに規模に応じたノックバックを追加

**現状**: ノックバックは `Landmine.js` の `applyAoE()` にのみ実装されている(`vy = LANDMINE_KNOCKBACK_VY`(-6固定)、`vx = ±3固定`)。グレネード(`Grenade.js`)・敵ミサイル(`CollisionManager.js` の `_enemyMissileVsTargets()`)には一切ノックバックがない。

**修正方針**:
- 地雷の吹き飛ばしロジックを汎用ヘルパー関数として切り出す(例: `applyExplosionKnockback(entity, dx, blastRadius)` を新規ユーティリティ、もしくは既存の爆発ヘルパーに追加)。
- 対象を拡張:
  - **地雷(Landmine)**: 現状の数値を維持(vy=-6, vx=±3)。
  - **グレネード(Grenade)**: 新規追加。地雷より小さいノックバック(目安: vy=-3〜-4, vx=±2)。`GRENADE_DAMAGE_RADIUS`(40px)を爆風範囲として使用。
  - **敵ミサイル被弾(プレイヤー)**: 新規追加。地雷よりさらに小さいノックバック(目安: vy=-2, vx=±1.5)。
- **対象外(変更しない)**: マシンガン弾(自機PLAYER_MG / 敵MG)、タレット弾。これらは着弾ダメージのみでノックバックを付与しない。
- 具体的な数値は `Constants.js` に新規定数として追加し(例: `GRENADE_KNOCKBACK_VY`, `GRENADE_KNOCKBACK_VX`, `MISSILE_HIT_KNOCKBACK_VY`, `MISSILE_HIT_KNOCKBACK_VX`)、実装後のプレイ感覚で微調整可能にする。

**影響範囲**: `src/js/entities/Landmine.js`(共通化のリファクタ), `src/js/entities/Grenade.js`, `src/js/systems/CollisionManager.js`, `src/js/utils/Constants.js`

---

## 4. タイトル画面の操作体系変更

**現状**:
- ゲーム開始は `_anyKeyOrClick()`(実質「任意の英数字キー or マウスクリック」、Arrow/Tab等は含まれない)で判定。表示は「HIT ANY KEY TO START」。
- NORMAL/NEWTYPEモード切替は `ArrowLeft`/`ArrowRight` のみ(タイトル画面限定)。
- タイトル→HOW TO PLAY→各種ランキング→殿堂入り→タイトル、の巡回はタイマー自動送りのみで、手動での前後移動手段がない。

**修正**:
- ゲーム開始判定をEnterキー押下のみに限定(`_anyKeyOrClick()` の判定ロジックを変更、または新規に `isKeyPressed('Enter')` ベースの判定に置き換え)。マウスクリックでの開始は維持するかは実装時に既存踏襲(現状クリック開始も含まれているため、Enter+クリックを開始条件とする)。
- モード切替キーを `KeyA` / `KeyD` に変更(Arrowキーの代わりに使用。既存のArrowLeft/Right によるモード切替は廃止し、巡回移動に専念させる)。
- 巡回中の全状態(`title`, `how_to_play`, `local_ranking_display`, `global_ranking_display`, `stage_ranking_display`, `wall_of_fame_display`)で共通して、`ArrowLeft`/`ArrowRight` により巡回順で前後の画面へ手動ジャンプできるようにする。タイマーによる自動送りは維持し、手動ジャンプ時は `stateTimer` をリセットする。
- UI文言「HIT ANY KEY TO START」→「HIT ENTER TO START」に変更(`ScreenRenderer.js`)。モードセレクタのヒント表示 `[ ← / → ]  SELECT MODE` も `[ A / D ]  SELECT MODE` に更新。

**影響範囲**: `src/js/main.js`(状態遷移・入力判定), `src/js/ui/ScreenRenderer.js`(文言), `src/js/utils/Input.js`(必要であれば)

---

## 5. 巡回位置ドット表示を全デモ画面で共通化

**現状**: `drawHowToPlay()` 内部にのみ、HOW TO PLAY画面の内部2ページ(MISSION&RULES / CONTROLS)を示すドット(●●)がハードコードされている。他の巡回画面(ランキング系・殿堂入り)には同種の表示がない。

**修正**:
- 内部ページ用のドット描画をHOW TO PLAYから削除。
- 巡回全体(`title`, `how_to_play`, `local_ranking_display`, `global_ranking_display`, `stage_ranking_display`, `wall_of_fame_display` の6画面)における現在位置を示す共通ドットコンポーネントを新設(例: `ScreenRenderer.js` に `drawDemoCycleDots(ctx, currentIndex, total)`)。
- 巡回対象の全6画面の描画時にこの共通ドットを呼び出し、現在のインデックスをハイライト表示する。
- 画面順序・インデックスは項目4で導入する巡回状態リストと共有する(1箇所で定義し、状態遷移・手動ジャンプ・ドット表示すべてが参照する)。

**影響範囲**: `src/js/ui/ScreenRenderer.js`, `src/js/main.js`(巡回状態リストの共有)

---

## テスト方針
自動テストは無い前提のため、各項目についてブラウザでの手動確認が必要(ユーザー側で実施)。実装後、以下を目視確認できるようにする:
1. ドッキングしても武器が変わらないこと
2. キャリアが常に持ち上げられ、TABトグルUIが消えていること
3. グレネード・敵ミサイル被弾でノックバックが発生し、MG/タレット弾では発生しないこと
4. Enterキーのみで開始、A/Dでモード切替、矢印キーで巡回画面を自由に行き来できること
5. 全巡回画面で共通のドットが表示され、現在地が正しくハイライトされること
