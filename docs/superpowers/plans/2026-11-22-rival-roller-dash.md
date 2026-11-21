# rival のローラーダッシュ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 近づかれた rival が、自機の方を向いたまま後ろへ高速で滑って距離を取り、撃ちながら下がり、火花を散らして急停止する。

**Architecture:** 新しい層 `src/js/entities/attacker/rollerDash.js`（`AttackerRollerDash`）を `EnemyAttacker.prototype` に Object.assign で混ぜる。状態は `rollerPhase`（`null|'accel'|'glide'|'stop'`）・`rollerTimer`・`rollerDir`・`rollerCooldown`。`_updateMovement` の先頭で滑走中なら移動を乗っ取り、`zigzag_chase` の「近すぎる」分岐から始める。脚・火花・音は既存の各層／ファイルに足す。

**Tech Stack:** バニラ ES modules、canvas 2D、Web Audio、`node --test`。

**Spec:** `docs/superpowers/specs/2026-11-22-rival-roller-dash-design.md`（実装者は必ず両方読む）

## Global Constraints

- 数値はすべて `src/js/utils/Constants.js` の `ROLLER_*`。脚の形の数値だけ `legs.js` のモジュールスコープ可。
- 型ごとの違いは `ENEMY_ATTACKER_TYPES.rival` に `rollerDash: true` の1行。
- `EnemyAttacker.js` 本体に挙動を書かない（触ってよいのは `Object.assign` に1語、`update()` の反動分岐に1行、`_applyGroundSlide` の早期 return 1行、コンストラクタの状態の初期化）。
- 音は `src/js/audio/sounds/enemySounds.js`。`AudioManager.js` 本体に書かない。`play*` は引数なしで呼んでも例外を投げない。
- AI の乱数は `Math.random`（`game.rng` を引かない）。
- コメントは日本語で「なぜ」を書く。決めた数値は根拠も残す。
- `git add -A` / `git add .` を使わない。ファイルを明示して add。`src/js/main.js` は触らない。
- 初期値: `ROLLER_SPEED = 2.4`、`ROLLER_ACCEL_FRAMES = 6`、`ROLLER_GLIDE_FRAMES_MIN = 20`、`ROLLER_GLIDE_FRAMES_MAX = 50`、`ROLLER_STOP_FRAMES = 8`、`ROLLER_COOLDOWN = 240`。

## Review Focus

1. 壁に当たったとき既存の `_reactToWall` が**跳ぶ**（`collision.js:105`）。滑走中は跳ばずにその場で終わること → Task 2 にテストあり。
2. 反動（被弾）中は `_updateMovement` が呼ばれないので、状態が残ったまま反動明けに続きを滑ってしまう → Task 2 にテストあり（`update()` の反動分岐で終わらせる）。
3. 雪・氷の床（`ICE_SLIDE` 0.94）で加速が鈍らないこと → Task 2 にテストあり。
4. 上り坂で 0.72 に失速しないこと → Task 2 にテストあり。
5. 他の型（standard / heavy / artillery）の挙動が変わらないこと → Task 1 の道具と Task 6 の比較。

---

### Task 1: trace-walkers を型ごとの指紋に分ける

**Files:**
- Modify: `tools/trace-walkers.mjs`

**Interfaces:**
- Produces: 出力の JSON のキーが `seed{S}/m{M}/{type}`（type は `ENEMY_ATTACKER_TYPES` のキー）。1つの run には自機1体と、その型だけの敵を `WALKERS_PER_MAP` 体。`Math.random` の LCG は run ごとに `seed * 7919 + mission * 31 + typeIndex` で種を入れ直す。`--compare` はそのまま使える。

- [ ] **Step 1:** 今のループ（seed × mission）の内側に型のループを足し、run ごとに `makeGame` からやり直す。`TYPE_KEYS[i % ...]` で混ぜていた割り当てをやめ、全湧き位置をその型にする。冒頭のコメントに「型ごとに分けた理由: 1体が乱数を余分に引くと共有 LCG を通じて他の型の指紋まで動くため（2026-11-22 ローラーダッシュで）」を足す。
- [ ] **Step 2:** `node tools/trace-walkers.mjs > /private/tmp/claude-501/-Users-nao-Library-CloudStorage-GoogleDrive-nfujii-npr-gmail-com--------Google-AI-Studio-proj-HoverAttack/8e470135-3744-41ec-97e2-f6e695c56685/scratchpad/walkers-before-a.json` を2回取り（別ファイル）、`--compare` で `IDENTICAL` になること（道具自体が決定的）。`error` が全 run で `null` であること。
- [ ] **Step 3:** 2回目の出力を Task 6 用の基準 `/private/tmp/claude-501/-Users-nao-Library-CloudStorage-GoogleDrive-nfujii-npr-gmail-com--------Google-AI-Studio-proj-HoverAttack/8e470135-3744-41ec-97e2-f6e695c56685/scratchpad/walkers-baseline.json` として残す（コミットしない）。
- [ ] **Step 4:** Commit

```bash
git add tools/trace-walkers.mjs
git commit -m "tools: trace-walkers の指紋を型ごとに分ける"
```

---

### Task 2: 滑走の状態機械（始める・滑る・止まる・途中で終わる）

**Files:**
- Create: `src/js/entities/attacker/rollerDash.js`
- Modify: `src/js/utils/Constants.js`（`ROLLER_*` の6つと、rival の行に `rollerDash: true`）
- Modify: `src/js/entities/EnemyAttacker.js`（import、Object.assign、コンストラクタで `rollerPhase = null; rollerTimer = 0; rollerDir = 0; rollerCooldown = 0;`、反動分岐、`_applyGroundSlide`）
- Modify: `src/js/entities/attacker/movement.js`（`_updateMovement` 先頭、`zigzag_chase` の近すぎる分岐、`_updateWalkAnimation`）
- Modify: `src/js/entities/attacker/collision.js`（`_reactToWall`、`_applyAttackerSlope`）
- Test: `tests/rival-roller-dash.test.js`、`tests/player-mixins.test.js`（または新規 `tests/attacker-mixins.test.js`）

**Interfaces:**
- Produces（`AttackerRollerDash`）:
  - `_tryStartRollerDash(dx: number): boolean` — 始める条件（spec「始める条件」）を全部見て、満たせば状態を立てて `true`。`rollerDir = dx > 0 ? -1 : 1`。滑る長さ `rollerGlideFrames` を `MIN..MAX` の整数で `Math.random` から決める。始めたフレームの `vx` も決める（accel 1フレーム目）。
  - `_updateRollerDash(): boolean` — 滑走中なら1フレーム進めて `vx` を決め `true`。滑走中でなければクールダウンを1減らして `false`。`aiState !== 'chase'` か `!onGround` なら `_endRollerDash()` して `false`。stop 相に入るフレームで `_onRollerStop()` を呼ぶ（Task 4・5 が中身を足すフック。Task 2 では空）。
  - `_endRollerDash(): void` — 状態を消し `rollerCooldown = ROLLER_COOLDOWN`。音・火花は出さない。最後まで滑り切ったときもこれで締める。
  - `isRollerDashing(): boolean` — `rollerPhase !== null`。
  - `_rollerSpeedNow(): number` — 相ごとの速さ（accel は `ROLLER_SPEED * 経過/ROLLER_ACCEL_FRAMES` の線形、glide は一定、stop は `ROLLER_SPEED` から 0 へ線形）。
- 呼び出し側の約束:
  - `_updateMovement`: 先頭（しゃがみ・連射の判定より前）で `if (this._updateRollerDash()) return;`
  - `zigzag_chase` の `absDx < preferredDist - 20` 分岐: `if (this._tryStartRollerDash(dx)) return;`（以降のジグザグ・ジャンプ・吹かしを飛ばす）
  - `_chaseTarget` の回避（`_updateAlignmentAvoidance`）は滑走中は呼ばれない（`_updateMovement` で先に return するため）。
  - `update()` の `if (!tickRecoil(this)) {...}` に `else if (this.isRollerDashing()) this._endRollerDash();`
  - `_applyGroundSlide`: 先頭で `if (this.isRollerDashing()) return;`（vx は AI の値のまま）
  - `_applyAttackerSlope`: 上りの上限を `this.isRollerDashing() ? Math.abs(desired) * SLOPE_UPHILL_SCALE : Math.min(Math.abs(desired), this.maxSpeed * SLOPE_UPHILL_SCALE)`
  - `_reactToWall`: 先頭で滑走中なら `this.vx = 0; this._endRollerDash(); return;`（跳ばない）
  - `_updateWalkAnimation`: 滑走中は `walkFrame` / `walkTimer` を据え置いて return

始める条件の「背後の床」: `map.isSolidAtPixel(中心X + rollerDir * TILE_SIZE, 足の下端 + 4)`。

- [ ] **Step 1: 失敗するテストを書く** — `tests/rival-roller-dash.test.js`。`helpers/enemy-world.js` の `makeMap / makeGame / makeAttacker / flatFloorRows` で、rival を床の上に置き `onGround = true; aiState = 'chase'`。自機は `game.player = { x, y, width:16, height:24, alive:true, docked:false }` を rival の右 40px に置く。テスト:
  - `近づかれると自機から離れる向きに滑り始める` — `_tryStartRollerDash(40)` が true、`rollerDir === -1`、`rollerPhase === 'accel'`。
  - `始めない: 空中 / クールダウン中 / 回避中 / 背後に床なし / rollerDash の無い型（heavy）` — 各 false。背後に床なしは `flatFloorRows` の床を rival の左1タイル分だけ `.` にした map で。
  - `速さは accel で線形に上がり glide で ROLLER_SPEED、stop で 0 へ` — `Math.random = () => 0` に差し替えて長さを MIN に固定し、毎フレーム `_updateRollerDash()` の後の `|vx|` を記録。accel の最後のフレームが `ROLLER_SPEED`、glide が全部 `ROLLER_SPEED`、stop が単調減少で最後 0、総フレームが `ACCEL + MIN + STOP`。終了後 `rollerCooldown === ROLLER_COOLDOWN`。
  - `滑る長さは MIN..MAX に収まる` — `Math.random` を 0 と 0.9999 にした2回で、glide のフレーム数が `MIN` と `MAX`。
  - `ROLLER_SPEED は残像のしきい値を超え、回避ダッシュの初速より遅い` — `ROLLER_SPEED > RIVAL_AFTERIMAGE_SPEED` かつ `< rival.speed * RIVAL_DASH_MULT`（定数どうしでなく spec の主張としてコメントを付ける）。
  - `滑走中は update() を回しても跳ばず、回避も始まらない` — 自機を真横（軸が合う）に置き、`alignXFrames = RIVAL_ALIGN_TRIGGER_FRAMES + 1` にしてから滑走を始め、滑り終わるまで `update()`。その間 `vy >= 0` 側に跳ばない（`jumpCooldown` が立たない）、`evadeTimer === 0`。
  - `滑走中も撃つ` — `fireInterval` を 10 にした rival（`makeAttacker` の後で `e.config = { ...e.config, fireInterval: 10 }; e.fireTimer = 1`）で滑走中に `update()` を回し、`game.projectiles` に弾が増える。
  - `壁に当たると跳ばずにその場で終わる` — 左に壁のある map。滑走開始から `update()` を回し、壁に着いたフレームで `isRollerDashing() === false`、`jumpCooldown === 0`、`rollerCooldown === ROLLER_COOLDOWN`。
  - `足が地面を離れたら終わり、vx は持ち越す` — 滑走中に `onGround = false` にして `_updateRollerDash()` → false、vx は直前の値のまま。
  - `反動が入ったら終わる` — 滑走中に `recoilTimer = 5` で `update()` → `isRollerDashing() === false`。
  - `chase でなくなったら終わる` — 自機を索敵外へ動かして `update()`。
  - `雪の床でも即座に速さが出る` — `game.env` を雪の床（`floorSlide` が `ICE_SLIDE` を返す形。既存の雪テスト `tests/` 内の作り方に合わせる）にして、accel 最後のフレームの `|vx|` が `ROLLER_SPEED`。比較として滑走していない rival は同じ条件で `maxSpeed` に届かないことも確かめる（差が出る fixture であることの確認）。
  - `上り坂で ROLLER_SPEED × SLOPE_UPHILL_SCALE まで出る` — `tests/attacker-slope.test.js` の坂の作り方を使い、上り方向に滑走して glide 中の `|vx|` ≈ `ROLLER_SPEED * SLOPE_UPHILL_SCALE`（±0.01）。
  - mixin: `AttackerRollerDash` の全キーが `EnemyAttacker.prototype` で列挙可能・同じ値で、他の attacker mixin（`AttackerMovement` ほか import できるもの全部）のキーと重ならない。
- [ ] **Step 2:** `npm test -- tests/rival-roller-dash.test.js` → 未定義で FAIL。
- [ ] **Step 3:** 実装（上の Interfaces どおり）。`Constants.js` の `ROLLER_*` は spec の表の根拠をコメントに写す。
- [ ] **Step 4:** `npm test -- tests/rival-roller-dash.test.js` → PASS。ついで `npm test` 全体 → PASS。
- [ ] **Step 5:** わざと壊して落ちることを確かめる: (a) `_applyGroundSlide` の早期 return を外す → 雪のテストが落ちる、(b) `_reactToWall` の分岐を外す → 壁のテストが落ちる、(c) 反動分岐の1行を外す → 反動のテストが落ちる。確認したら戻す。
- [ ] **Step 6:** Commit（変更した7ファイルを明示して add）`feat: rival のローラーダッシュ（滑走の状態機械）`

---

### Task 3: 滑走の構え（脚）

**Files:**
- Modify: `src/js/entities/attacker/legs.js`
- Test: `tests/attacker-leg-animation.test.js`

**Interfaces:**
- Consumes: `isRollerDashing()`（Task 2）
- Produces: `_bipedRollerJoints(hipY, style)` — `_bipedWalkJoints` と同じ戻り値の形。`_legJoints` の接地分岐で、2足かつ滑走中ならこれを返す（しゃがみ・空中の分岐より後、歩行より前）。

形の約束（数値はビルダー）: 両足の `footY` は立ち姿勢（`WALK_FRAME_POSES[2]`）の `footY` と同じ＝地面に着いたまま。膝は立ち姿勢より前へ曲げる。手前足と奥足を前後に開く。歩行フレームに依存しない（毎フレーム同じ）。

- [ ] **Step 1: 失敗するテスト** — `滑走中は両足が地面に着いたまま、歩行フレームが変わっても脚は動かない`: rival を滑走中にして `walkFrame` を 0..3 で回し、`_legJoints(16, style, false)` が全部同じ、両足の `footY` が立ち姿勢と等しい、手前足と奥足の `footX` が 3px 以上離れている。`滑走中は walkFrame が進まない`: 滑走中に `vx = 2.4, onGround = true` で `_updateWalkAnimation()` を10回 → `walkFrame` 不変。
- [ ] **Step 2:** 実行して FAIL。
- [ ] **Step 3:** 実装。
- [ ] **Step 4:** `npm test` 全体 PASS。破片のテスト（`tests/debris-attacker.test.js`）も通ること。
- [ ] **Step 5:** Commit `feat: rival の滑走の構え`

---

### Task 4: 足元の火花

**Files:**
- Modify: `src/js/systems/SpawnEffects.js`（`spawnRollerSparks`）
- Modify: `src/js/entities/attacker/rollerDash.js`（滑走中の撒きと `_onRollerStop` の中身）
- Modify: `src/js/utils/Constants.js`（`ROLLER_SPARK_*`）
- Test: `tests/rival-roller-dash.test.js`

**Interfaces:**
- Produces: `Game.spawnRollerSparks(x: number, y: number, count: number, dir: -1|1): void` — `Particle`（`entities/Particle.js`）を `count` 個。横は `dir` 向き（進行と逆＝後ろ）に `ROLLER_SPARK_SPEED_MIN..MAX`、縦は小さく上向き、寿命 `ROLLER_SPARK_LIFE_MIN..MAX`、大きさ1〜2、色は被弾の火花と同じ黄〜橙。
- 定数: `ROLLER_SPARK_INTERVAL = 3`（何フレームおき）、`ROLLER_SPARK_COUNT = 2`、`ROLLER_SPARK_STOP_COUNT = 10`、速さ・寿命は実装者が決めて根拠を書く。
- rollerDash 側: accel・glide 中は `ROLLER_SPARK_INTERVAL` おきに両足の接地点のあたりで `count = ROLLER_SPARK_COUNT`、`dir = -rollerDir`。`_onRollerStop` で `ROLLER_SPARK_STOP_COUNT`。出さない条件: `game.spawnRollerSparks` が無い、`floorSlide(this, this.game) > 0`（雪の床。雪煙が代わり）、画面外（`isInView(this, camera, canvas, VIEW_CULL_MARGIN)`、camera/canvas が無ければ判定しない＝`_kickSnow` と同じ書き方）。

- [ ] **Step 1: 失敗するテスト** — `spawnRollerSparks` を数える偽物を `game` に付けて: `滑走中は数フレームおきに火花が出る`（滑り切るまでの呼び出し回数 > 0、各回の count が `ROLLER_SPARK_COUNT`、dir が `-rollerDir`）／`急停止の瞬間にまとめて出る`（stop 相に入ったフレームで1回 `ROLLER_SPARK_STOP_COUNT`）／`壁で終わったときは急停止の火花が出ない`／`雪の床では出ない`（Task 2 の雪の fixture）。`SpawnEffects` 単体: `spawnRollerSparks(0,0,5,-1)` で particles が5増え、全部 `vx < 0`。
- [ ] **Step 2:** FAIL を確認。
- [ ] **Step 3:** 実装。
- [ ] **Step 4:** `npm test` 全体 PASS。
- [ ] **Step 5:** Commit `feat: ローラーダッシュの火花`

---

### Task 5: 滑走音と急停止の音

**Files:**
- Modify: `src/js/audio/sounds/enemySounds.js`（`playRollerDash` / `playRollerStop`）
- Modify: `src/js/entities/attacker/rollerDash.js`（鳴らす）
- Modify: `src/js/utils/Constants.js`（`ROLLER_SND_*` / `ROLLER_STOP_SND_*`）
- Test: `tests/rival-roller-sound.test.js`（新規）

**Interfaces:**
- Produces:
  - `audioManager.playRollerDash(x?: number, y?: number, durationSec?: number): void` — `playRivalDash` と同じ形（`_prepare` → `_positionalGain` → `_out(x)`）。車輪の唸り（鋸波のモーター音、始まりで少し上がる）＋接地の擦れ（帯域ノイズ）。`durationSec` が無ければ `ROLLER_SND_DEFAULT_DURATION`。
  - `audioManager.playRollerStop(x?: number, y?: number): void` — 短い高めの擦れ「キィッ」。
- rollerDash 側: `_tryStartRollerDash` で始めたときに `playRollerDash(中心x, 中心y, 総フレーム / (60 * (game.gameSpeed ?? 1)))`（物理は 60×gameSpeed フレーム/秒で進むので、音を滑走の実時間に合わせる）。`_onRollerStop` で `playRollerStop(中心x, 中心y)`。

- [ ] **Step 1: 失敗するテスト**
  - 配線: `tests/rival-dash.test.js` の `countDashSounds` と同じ差し替えで、`始めた瞬間に滑走音が1回、長さは総フレーム/60（gameSpeed 無し）`／`滑り切ると急停止の音が1回`／`壁・落下・反動で終わったときは急停止の音が鳴らない`。
  - 音量: `tests/rival-dash-sound.test.js` の `renderSweep` / `dashWave` の作り方にならい、新しい2音のオフライン再現をこのテストファイルに書く（ノイズは種つきの LCG）。冒頭に「`playRollerDash` / `playRollerStop` を変えたらここも合わせる」と書く。`transientLevel` で測り、`playRivalDash` 比で **滑走音は -8〜-1 dB**、**急停止は -3〜+2 dB**。歪まない（ピーク < 1）。
  - 引数なしで例外を投げないことは `tests/audio-manager.test.js` の総当たりが自動で見る。
- [ ] **Step 2:** FAIL を確認。
- [ ] **Step 3:** 実装。ゲインは測りながら決め、実測の相対 dB を `Constants.js` のコメントに残す。
- [ ] **Step 4:** `npm test` 全体 PASS。
- [ ] **Step 5:** Commit `feat: ローラーダッシュの音`

---

### Task 6: 他の型が変わっていないことの確認と引き渡し

**Files:** なし（確認のみ）

- [ ] **Step 1:** `node tools/trace-walkers.mjs > /private/tmp/claude-501/-Users-nao-Library-CloudStorage-GoogleDrive-nfujii-npr-gmail-com--------Google-AI-Studio-proj-HoverAttack/8e470135-3744-41ec-97e2-f6e695c56685/scratchpad/walkers-after.json`、`node tools/trace-walkers.mjs --compare /private/tmp/claude-501/-Users-nao-Library-CloudStorage-GoogleDrive-nfujii-npr-gmail-com--------Google-AI-Studio-proj-HoverAttack/8e470135-3744-41ec-97e2-f6e695c56685/scratchpad/walkers-baseline.json /private/tmp/claude-501/-Users-nao-Library-CloudStorage-GoogleDrive-nfujii-npr-gmail-com--------Google-AI-Studio-proj-HoverAttack/8e470135-3744-41ec-97e2-f6e695c56685/scratchpad/walkers-after.json` → 違うのは `/rival` のキーだけ（standard / heavy / artillery / ほかの型はすべて一致）。全 run の `error` が `null`。
- [ ] **Step 2:** `npm test` 全体 PASS。
- [ ] **Step 3:** ユーザーへの引き渡しに、確認ポイントと定数の対応表を作る（滑る速さ＝`ROLLER_SPEED`、距離・止まる位置のばらつき＝`ROLLER_GLIDE_FRAMES_MIN/MAX`、連発＝`ROLLER_COOLDOWN`、火花＝`ROLLER_SPARK_*`、音量＝`ROLLER_SND_GAIN` ほか、脚の構え＝`legs.js`）。ハードリロード（Cmd+Shift+R）が要ることを添える。
