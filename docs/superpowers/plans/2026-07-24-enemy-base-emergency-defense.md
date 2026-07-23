# 敵基地緊急防衛モード (Emergency Defense Mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 敵基地 (`EnemyBase`) がプレイヤーからの攻撃（被弾）を受けた際、アタッカーが登場する**2面以降（Mission 2+: `missionsCompleted >= 1`）**において緊急防衛警報（Emergency Defense Alert）を発令し、マップ上に存在する全 `EnemyAttacker`（各種アタッカー）および全 `EnemyDrone`（ドローン）を**「緊急防衛モード (Emergency Defense Mode)」**に遷移させ、敵基地の座標（ボス基地周辺）へと急行・緊急配備させる。配備後は基地周辺を防衛パトロールし、接近するプレイヤーを迎撃する。※タンク (`EnemyTank`)、巡航ミサイル (`EnemyCruiseMissile`)、固定砲台 (`EnemyTurret`) は対象外。1面 (`missionsCompleted < 1`) では発動しない。

**Architecture:** 
1. `EnemyBase.takeDamage()` 時にステージ条件（`game.missionsCompleted >= 1`）を確認し、2面以降であれば警報処理 `triggerEmergencyAlert()` を実行して `game.triggerBaseEmergencyAlert(enemyBase)` を呼び出す。
2. `EnemyAttacker` に `setEmergencyDefense(active, targetBase)` を追加。プレイヤーが視界外の際、帰還・移動目標（`homeX, homeY`）を敵基地周辺の座標へと上書きし、`_climbToward(baseX, baseY)` でボス基地へと急行配備。基地到着後は周辺を防衛。
3. `EnemyDrone` に `setEmergencyDefense(active, targetBase)` を追加。基地の上空・周辺 (`baseX, baseY - offset`) へダッシュ/急行し、基地周りを旋回防衛。
4. スポーンマネージャー (`SpawnManager`) で警報発動後に新しく生成されたアタッカー・ドローンも即座に敵基地防衛への緊急配備モードで出現。
5. 視覚・音響演出（HUDの赤点滅「`WARNING: ENEMY BASE UNDER ATTACK! DEFENSE MODE ACTIVATED!`」、アラート警報音、敵基地からのパルス波）を追加。

**Tech Stack:** Vanilla JS (ES Modules), Node.js Test Runner (`node --test`)

---

## Global Constraints

- **適用ステージ制限**: 緊急防衛モードはアタッカーが登場する **2面以降（Mission 2+: `missionsCompleted >= 1`）** でのみ動作する。1面 (`missionsCompleted === 0`) では発動しない。
- **緊急配備目的地**: ユニットの目的地はプレイヤー追尾ではなく**「攻撃を受けた敵基地（ボス基地）周辺」**とする。
- **対象ユニット限定**: 急行・配備の対象は `EnemyAttacker` (standard, heavy, rival, artillery) と `EnemyDrone` のみ。 `EnemyTank`, `EnemyCruiseMissile`, `EnemyTurret` の挙動は変更しない。
- **地形スナップ・スタック回避**: 基地へ急行する際も既存の地形レイキャスト・障害物回避/ステップアップ処理を遵守し、壁抜けやスタックを発生させない。
- **ユニット間の分散配置**: `EnemyDrone` はエンティティ同士の衝突判定を持たないため、全ユニットが基地の同一座標へ収束すると視覚的に重なって破綻する。基地周囲に角度ベースのスロット（または `_startDash` 同様のランダムオフセット）を割り当て、収束先を分散させる。
- **アラート発注は一発ラッチ**: `EnemyBase.takeDamage()` はスロットリングなしで被弾ごとに毎回呼ばれる（連射・複数ミサイル同時着弾で1秒に数十回）。`triggerBaseEmergencyAlert()` は `game.baseEmergencyAlert` が既に `true` の場合は即座に return する一発ラッチとし、敵一覧への `setEmergencyDefense` 再呼び出しやアラート音の多重再生を防ぐ。
- **基地破壊時のアラート解除**: `EnemyBase` は `_die()`（`dying=true`、1.5秒の破壊シーケンス開始、`alive` はまだ `true`）→ `_finishDestruction()`（`alive=false`）という2段階構成。`_finishDestruction()` で `game.baseEmergencyAlert=false` 等をクリアし、以後 `takeDamage()` からのアラート発注も `dying` 中は無視する。解除時、緊急防衛中だったユニットは通常の `patrol`/`return` 挙動へ復帰させる。
- **ミッション遷移時のリセット**: `game.baseEmergencyAlert` / `game.emergencyTargetBase` は `game` に永続する値であり `resetLevel()` ではリセットされない。ミッション遷移（`restart()` / `nextMission()`）時に明示的にクリアし、次ミッションの新規スポーン敵が誤って緊急防衛モードで出現しないようにする。
- **既存ステートマシンへの統合**: `EnemyAttacker`（`aiState: 'patrol'|'chase'|'return'`）・`EnemyDrone`（`'patrol'|'dash'|'hover'|'attack'|'kamikaze'`）はいずれも `update()` 内で毎フレーム無条件にステートを再計算している。緊急防衛モードは独立フラグとして重ねるのではなく、このステート分岐に明示的に組み込む。特に `EnemyAttacker._handleShooting()` は `aiState !== 'chase'` の間は発砲しないため、緊急防衛ステート中も迎撃射撃できるよう分岐を見直す。
- **自動テスト化**: `tests/base-emergency-defense.test.js` にて、1面での無効化・2面以降での緊急防衛配備・対象ユニット限定動作・一発ラッチ・基地破壊時解除・ミッション遷移時リセットを検証。

---

### Task 1: 定数の定義と初期セットアップ

**Files:**
- Modify: `src/js/utils/Constants.js`
- Test: `tests/base-emergency-defense.test.js` (新規作成)

- [ ] **Step 1: 定数テストの作成**

`tests/base-emergency-defense.test.js` を作成し、定数の値の検証テストを記述。

- [ ] **Step 2: Constants.js に緊急防衛モード用定数を定義**

`src/js/utils/Constants.js` に以下の定数を追加:
```js
export const EMERGENCY_DEFENSE_BASE_RADIUS = 120;
export const EMERGENCY_DEFENSE_SPEED_MULT = 1.15;
export const EMERGENCY_DEFENSE_SIGHT_RANGE = 250;
```

---

### Task 2: EnemyBase の攻撃検知＆アラート発注ロジックの実装（2面以降条件）

**Files:**
- Modify: `src/js/entities/EnemyBase.js`

- [ ] **Step 1: EnemyBase.takeDamage での警報発注フック（2面以降限定・dying中は無視）**

`EnemyBase.js` の `takeDamage(amount)` にて `this.game.missionsCompleted >= 1 && !this.dying` を確認し、被弾時に `this.game.triggerBaseEmergencyAlert(this)` を呼ぶように改修。`triggerBaseEmergencyAlert()` 側は `game.baseEmergencyAlert` 済みなら即 return する一発ラッチとし、被弾のたびに敵一覧再走査・アラート音多重再生が起きないようにする。

- [ ] **Step 2: 基地破壊時のアラート解除**

`_finishDestruction()`（`alive=false` になるタイミング）で `game.baseEmergencyAlert=false` および `game.emergencyTargetBase=null` をクリアし、`setEmergencyDefense(false)` を全対象ユニットへ一括呼び出しして通常挙動へ復帰させる。

- [ ] **Step 3: 基地周りのアラート視覚エフェクト追加**

アラート発注時、敵基地の周辺に拡散する赤色衝撃波（レスキューパルス）を描画する処理を追加。

---

### Task 3: EnemyAttacker の緊急防衛（基地急行・配備）実装

**Files:**
- Modify: `src/js/entities/EnemyAttacker.js`

- [ ] **Step 1: `setEmergencyDefense(active, targetBase)` メソッドの実装**

`EnemyAttacker.js` に `setEmergencyDefense(active, targetBase)` を定義し、`this.emergencyDefense = active` フラグおよびターゲット基地を保存。

- [ ] **Step 2: 既存ステートマシンへの統合と分散配置**

`update()` の `aiState`（`'patrol'|'chase'|'return'`）判定チェーンに `emergencyDefense` を新たな分岐として組み込む（フラグを立てるだけで既存分岐の上に重ねない）。`movementType`（stop_and_shoot/pace_and_jump/chase_and_jump/skirmish/zigzag_chase）・`avoidsAlignment`（rival）・`seeksCover`（artillery）など `_chaseTarget()` 内の各タイプ固有の早期return分岐をバイパスする専用の移動ブランチとして実装する。移動目標は enemyBase 周辺座標＋角度ベースのオフセット（他ユニットとの重複回避）とし、`_climbToward` でボス基地へ配達。

- [ ] **Step 3: 基地周辺での防御パトロールと迎撃（発砲ゲートの見直し含む）**

基地周辺に到達後は周りを防衛パトロールし、接近してきたプレイヤーを感知して迎撃。`_handleShooting()` は現状 `aiState !== 'chase'` の間発砲しないため、緊急防衛ステート中も迎撃射撃できるようゲート条件を更新する。

---

### Task 4: EnemyDrone の緊急防衛（基地上空急行・旋回防衛）実装

**Files:**
- Modify: `src/js/entities/EnemyDrone.js`

- [ ] **Step 1: `setEmergencyDefense(active, targetBase)` メソッドの実装**

`EnemyDrone.js` に `setEmergencyDefense(active, targetBase)` を定義し、`this.emergencyDefense = active` フラグおよびターゲット基地を保存。

- [ ] **Step 2: 敵基地上空への急行と防衛旋回（分散配置込み）**

既存の `'patrol'|'dash'|'hover'|'attack'|'kamikaze'` ステート分岐に緊急防衛モードを組み込む（`_updatePatrolState()` 等が `_findTarget()` の結果で勝手にステートを上書きしないよう注意）。目標位置は `targetBase` の上空周辺に、`_startDash()` と同様のランダムオフセット（例: ±100/±50px）または角度スロットを付けて設定し急行。`EnemyDrone` はエンティティ間衝突判定を持たないため、この分散がないと複数ドローンが同一点に重なるので必須。基地周りを旋回防衛し、接近するプレイヤーを優先攻撃。

---

### Task 5: ゲーム管理クラス・スポーンマネージャー・UI/SFX統合

**Files:**
- Modify: `src/js/main.js`
- Modify: `src/js/systems/SpawnManager.js`

- [ ] **Step 1: Game クラスへのアラート管理・2面以降条件・基地座標保持の実装**

`main.js` の `Game` クラスに `triggerBaseEmergencyAlert(enemyBase)` メソッドを実装。
- 既に `this.baseEmergencyAlert === true` なら即 return（一発ラッチ、多重発火防止）。
- `missionsCompleted >= 1` （2面以降）のときのみ起動。
- `this.baseEmergencyAlert = true` および `this.emergencyTargetBase = enemyBase` をセット。
- `game.enemyAttackers` / `game.enemyDrones` という専用配列は存在しない（全敵は `game.enemies` フラット配列に格納）。`game.enemies.filter(e => e instanceof EnemyAttacker || e instanceof EnemyDrone)` で対象を抽出し `setEmergencyDefense(true, enemyBase)` を一括呼び出しする。

- [ ] **Step 2: SpawnManager の緊急防衛モード継承**

`SpawnManager.js` で新たな `EnemyAttacker` または `EnemyDrone` を生成する際、`game.baseEmergencyAlert` が true であれば、生成直後に `setEmergencyDefense(true, game.emergencyTargetBase)` を呼び出す。

- [ ] **Step 3: ミッション遷移時のアラート状態リセット**

`restart()` / `nextMission()`（`resetLevel()` 呼び出し箇所）にて `game.baseEmergencyAlert = false` および `game.emergencyTargetBase = null` を明示的にリセットする。これを怠ると前ミッションで基地が破壊された際のアラート状態が残り、次ミッションの新規スポーン敵が被弾前から緊急防衛モードで出現してしまう。

- [ ] **Step 4: UI警告メッセージおよび音響演出（既存パターンの再利用）**

`HUD.js` には `cruiseWarning` バナーや `_drawCarrierDamageAlert`・`_drawProximityAlert` など `Math.sin(Date.now()/100)` ベースの赤点滅パルス表示が既に実装されている。新規に描画ロジックを作らず、この既存パターンに倣って `game.baseEmergencyAlert` を見る新規 `_drawBaseEmergencyAlert()` 相当を追加し、画面上部に赤点滅テロップ `"WARNING: ENEMY BASE UNDER ATTACK! DEFENSE MODE ACTIVATED!"` を表示。アラート開始時（ラッチが立った瞬間の1回のみ）に警報サウンドを再生する。

---

### Task 6: 自動テストの記述と動作検証

**Files:**
- Modify: `tests/base-emergency-defense.test.js`

- [ ] **Step 1: 結合テストの追加**
- 1面（`missionsCompleted === 0`）ではアラートが不発となることの検証。
- 2面以降（`missionsCompleted >= 1`）の敵基地ダメージで `baseEmergencyAlert` が起動し基地座標が設定されることの検証。
- 遠距離にいる `EnemyAttacker` および `EnemyDrone` がアラート発令により敵基地座標へ移動目的地を変更・急行することの検証。
- `EnemyTank` に配備先変更や緊急防衛モードが適用されないことの検証。
- 同一基地への連続被弾（`takeDamage()` を複数回呼ぶ）でも `triggerBaseEmergencyAlert()` の本体処理（敵一覧走査・アラート音再生）が1回しか実行されないこと（一発ラッチ）の検証。
- 基地の `dying` 中（`_die()` 後・`_finishDestruction()` 前）は `takeDamage()` がアラートを再発注しないことの検証。
- 基地破壊完了（`_finishDestruction()`）後に `baseEmergencyAlert` が `false` に戻り、緊急防衛中だったユニットが通常挙動（`patrol`/`return`）に復帰することの検証。
- ミッション遷移（`nextMission()` / `restart()`）で `baseEmergencyAlert` / `emergencyTargetBase` がリセットされ、新ミッションの新規スポーン敵が緊急防衛モードで出現しないことの検証。
- 緊急防衛モード中の `EnemyAttacker` が `_handleShooting()` のゲート変更により迎撃射撃できることの検証。
- 複数の `EnemyAttacker`/`EnemyDrone` が基地へ収束する際、同一座標に完全一致（スタック）しないこと（分散オフセットが機能していること）の検証。
