# 雪の床を全員に共通化する 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 滑りと雪煙を「雪の積もった地形の上に接地しているとき」だけに限定し、自機・敵アタッカー・敵戦車の3者が同じ床の性質に従うようにする。

**Architecture:** 床の性質を `src/js/utils/surface.js` の純関数2つ（`groundSlide` / `approachVx`）に集める。各エンティティは「接地面が地形か」を表す `onTerrain` を持ち、AI と入力は「どう動きたいか」だけを書く。空中の扱いは一切変えない。

**Tech Stack:** バニラ ES modules（ビルドなし・依存なし）、テストは `node --test`。

**Spec:** `docs/superpowers/specs/2026-09-20-snow-slide-design.md`

## Global Constraints

- マジックナンバーは実装側に直書きせず `src/js/utils/Constants.js` に置く。
- コメントは日本語で「なぜそうしたか」を書く。数値には根拠（実測値）を残す。
- `git add -A` / `git add .` は使わない。**変更したファイルを明示して add する**（`src/js/main.js` にユーザーの `debugStartMission` が未コミットで置かれているため）。
- 物理はフレーム単位（deltaTime 非依存）。新しい時間依存の処理を持ち込まない。
- マップ生成中に `game.rng` を余分に消費しない（週次の決定性）。本計画は生成に触らない。
- **空中のフレームでは滑りを切らない。** `Player.js:642`（`_probeGroundBelowFeet`）と `_applySnowSlope` は空中で `motion.slide > 0` であることを前提に雪の階段の吸着を行っており、ここを切ると1段16pxの落下を10フレーム待つ以前の挙動に戻る。
- 自機の**加速**は鈍らせない（操作感を変えない）。滑るのは入力を離したあとだけ。
- 既存の雪テスト（`tests/environment-snow-motion.test.js` ほか）は全て通ったままにする。

---

### Task 1: 床の性質を持つ純関数（`utils/surface.js`）

**Files:**
- Create: `src/js/utils/surface.js`
- Create: `tests/surface.test.js`

**Interfaces:**
- Produces:
  - `groundSlide(entity, game) -> number`（0〜1）。`entity` は `{ x, y, width, height, onGround?, grounded?, onTerrain? }`。接地していて `onTerrain` が真のときだけ、足元の環境の `motion.slide` を返す。それ以外は 0。
  - `approachVx(currentVx, desiredVx, slide) -> number`。`slide === 0` なら `desiredVx` をそのまま返す。非0なら `currentVx * slide + desiredVx * (1 - slide)`。

- [ ] **Step 1: 失敗するテストを書く**

`tests/surface.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groundSlide, approachVx } from '../src/js/utils/surface.js';
import { ICE_SLIDE, TILE_SIZE } from '../src/js/utils/Constants.js';

const SNOW_ENV = { motionAt: () => ({ speed: 1, gravity: 1, slide: ICE_SLIDE }), sightScale: 1, kind: 'snow' };
const LAND_ENV = { motionAt: () => ({ speed: 1, gravity: 1, slide: 0 }), sightScale: 1, kind: 'none' };

/** 足元に地形がある雪の世界。groundSlide は環境しか見ないので map は最小でよい。 */
function world(env) {
  return { env, map: { isSolidAtPixel: () => true, cols: 100, rows: 100 } };
}

function entity(over = {}) {
  return { x: 100, y: 100, width: 16, height: 24, onGround: true, onTerrain: true, ...over };
}

test('雪の地形に接地していれば滑る', () => {
  assert.equal(groundSlide(entity(), world(SNOW_ENV)), ICE_SLIDE);
});

test('接地面が地形でなければ滑らない（甲板・敵の頭）', () => {
  assert.equal(groundSlide(entity({ onTerrain: false }), world(SNOW_ENV)), 0);
});

test('空中では滑らない（接地していない）', () => {
  assert.equal(groundSlide(entity({ onGround: false }), world(SNOW_ENV)), 0);
});

test('雪でない面では滑らない', () => {
  assert.equal(groundSlide(entity(), world(LAND_ENV)), 0);
});

test('grounded しか持たない敵戦車でも読める', () => {
  const tank = { x: 0, y: 0, width: 32, height: 20, grounded: true, onTerrain: true };
  assert.equal(groundSlide(tank, world(SNOW_ENV)), ICE_SLIDE);
});

test('env が無い世界（デモ画面やテストの最小 game）では 0', () => {
  assert.equal(groundSlide(entity(), { map: null }), 0);
});

test('滑らない床では目標速度がそのまま出る（陸上の現行挙動）', () => {
  assert.equal(approachVx(3, -2, 0), -2);
});

test('滑る床では前フレームの速度が残る', () => {
  const v = approachVx(3, 0, 0.94);
  assert.ok(v > 2.8 && v < 3, `残りすぎ／残らなすぎ: ${v}`);
});

test('滑る床でも、同じ目標を与え続ければ単調に近づく', () => {
  let v = 0;
  const seen = [];
  for (let i = 0; i < 60; i++) { v = approachVx(v, 2, 0.94); seen.push(v); }
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1], '単調でない');
  assert.ok(Math.abs(seen[seen.length - 1] - 2) < 0.1, `届かない: ${seen[seen.length - 1]}`);
});

test('滑る床で目標 0 を与え続ければ必ず止まる', () => {
  let v = 3;
  for (let i = 0; i < 600; i++) v = approachVx(v, 0, 0.94);
  assert.ok(Math.abs(v) < 0.05, `止まらない: ${v}`);
});
```

- [ ] **Step 2: 落ちることを確認する**

Run: `npm test -- tests/surface.test.js`
Expected: FAIL（`Cannot find module '../src/js/utils/surface.js'`）

- [ ] **Step 3: 実装する**

`src/js/utils/surface.js`:

```js
// ============================================
// surface - 床の性質（滑るか、どれだけ滑るか）
// ============================================
//
// 「雪の上で滑る」のは自機だけの話ではないので、自機・敵アタッカー・敵戦車が
// 同じ関数を読む形にしてある。AI と入力は「どう動きたいか」(desiredVx) だけを
// 書き、床の性質はここが持つ。
//
// **滑るのは例外的な条件**という整理。環境が雪でも、立っているのが母艦の甲板や
// 敵の頭なら滑らない（鉄板の上で滑るのはおかしい、という実機の指摘が出発点）。
//
// DOM もマップの中身も要らない純関数なので、単体で試せる。

import { motionFor } from '../world/StageEnvironment.js';

/**
 * その足元の床の滑り具合。0 なら滑らない（＝陸上と同じ即時停止）。
 *
 * 接地していることを条件にしているのが要点。**空中のフレームでは呼ばない**
 * （空中で滑りを 0 にすると、雪の階段の吸着が「滑る面かどうか」を見ている
 * 都合で壊れる。詳しくは Player._probeGroundBelowFeet のコメント）。
 *
 * @param {object} entity onGround か grounded と onTerrain を持つ
 * @param {object} game env と map を持つ（無ければ 0）
 * @returns {number} 0〜1
 */
export function groundSlide(entity, game) {
    if (!entity) return 0;
    const onGround = entity.onGround ?? entity.grounded ?? false;
    // onTerrain が未定義の相手（まだ対応していないエンティティ）は、
    // 従来どおり「地形の上」とみなす。黙って滑らなくなるより分かりやすい
    const onTerrain = entity.onTerrain ?? true;
    if (!onGround || !onTerrain) return 0;
    const motion = motionFor(game, entity.x + entity.width / 2, entity.y + entity.height / 2);
    return motion.slide || 0;
}

/**
 * 滑る床での速度追従。滑らない床では目標速度がそのまま出る（現行の陸上と
 * 完全に同じ）ので、呼ぶ側に分岐は要らない。
 *
 * 前フレームの速度を slide の割合だけ残す。自機が入力を離したときの
 * `vx *= slide` と同じ式で、目標速度 0 を与えた場合に一致する。
 *
 * @param {number} currentVx 前フレームの速度
 * @param {number} desiredVx そのフレームに出したい速度
 * @param {number} slide groundSlide の戻り値
 */
export function approachVx(currentVx, desiredVx, slide) {
    if (!slide) return desiredVx;
    const v = currentVx * slide + desiredVx * (1 - slide);
    // ごく小さい速度は 0 に落とす。残すと、止まっているのに歩行アニメや
    // 雪煙の条件(|vx| > 0.1)を跨ぎ続けてちらつく
    return Math.abs(v) < 0.05 ? 0 : v;
}
```

- [ ] **Step 4: 通ることを確認する**

Run: `npm test -- tests/surface.test.js`
Expected: PASS（10件）

- [ ] **Step 5: 変異させて、テストが落ちることを確認する**

`groundSlide` の `if (!onGround || !onTerrain) return 0;` を `if (!onGround) return 0;` に書き換えて `npm test -- tests/surface.test.js` を実行。
Expected: 「接地面が地形でなければ滑らない」が FAIL。確認したら元に戻す。

- [ ] **Step 6: コミット**

```bash
git add src/js/utils/surface.js tests/surface.test.js
git commit -m "feat: 床の滑りを持つ共通の純関数を追加"
```

---

### Task 2: 自機を共通関数に乗せる（元の不具合が直る）

**Files:**
- Modify: `src/js/entities/Player.js`（`_moveAndCollide` の接地リセット / 地形が接地させる3か所 / 甲板・敵の2か所 / `_updateHorizontal:261` / `_kickSnow:319`）
- Test: `tests/environment-snow-motion.test.js`（追記）

**Interfaces:**
- Consumes: `groundSlide(entity, game)`（Task 1）
- Produces: `Player.onTerrain`（boolean。地形に接地しているフレームだけ true。`onGround` と同じ寿命）

- [ ] **Step 1: 失敗するテストを書く**

`tests/environment-snow-motion.test.js` の末尾に追記する（このファイルの既存の `snowWorld()` / `inputWith()` を使う）:

```js
// --- 甲板・敵の頭の上では滑らない（実機の指摘: 鉄板の上で滑るのはおかしい）---

/** 母艦を持つ雪の世界。甲板の高さは自機の足がちょうど乗る位置に置く。 */
function snowWorldWithCarrier() {
  const game = snowWorld();
  game.carrier = {
    alive: true, x: 200, y: 100, width: 96, height: 32,
    platformLeft: 0, platformRight: 96, vx: 0,
  };
  return game;
}

/** 甲板の上に立たせた自機。1フレーム走らせて接地させる。 */
function playerOnDeck(game, held = new Set()) {
  const p = new Player(game, game.carrier.x + 20, game.carrier.y - PLAYER_HEIGHT - 2);
  game.player = p;
  p.vy = 1;
  game.input = inputWith(held);
  p.update();
  return p;
}

test('甲板の上では onTerrain が立たない', () => {
  const game = snowWorldWithCarrier();
  const p = playerOnDeck(game);
  assert.equal(p.onGround, true, '甲板に乗れていない');
  assert.equal(p.onTerrain, false);
});

test('甲板の上ではキーを離すと即止まる（滑らない）', () => {
  const game = snowWorldWithCarrier();
  const p = playerOnDeck(game);
  p.vx = 2;
  game.input = inputWith(new Set());
  p.update();
  assert.equal(p.vx, 0, `甲板の上で滑っている: ${p.vx}`);
});

test('甲板の上では雪が舞わない（着地の瞬間も）', () => {
  const game = snowWorldWithCarrier();
  game.snowKicks.length = 0;
  const p = playerOnDeck(game);
  p.vx = 2;
  game.input = inputWith(new Set(['KeyD']));
  p.update();
  assert.deepEqual(game.snowKicks, [], '甲板の上で雪が舞っている');
});

test('雪の地形の上では今までどおり滑り、雪が舞う（回帰）', () => {
  const game = snowWorld();
  const p = new Player(game, 100, 11 * TILE_SIZE - PLAYER_HEIGHT);
  game.player = p;
  game.input = inputWith(new Set(['KeyD']));
  for (let i = 0; i < 10; i++) p.update();
  assert.equal(p.onTerrain, true, '地形の上なのに onTerrain が立っていない');

  game.snowKicks.length = 0;
  game.input = inputWith(new Set());
  p.update();
  assert.ok(Math.abs(p.vx) > 0.1, `地形の上で滑らなくなっている: ${p.vx}`);
  assert.ok(game.snowKicks.length > 0, '地形の上で雪が舞わなくなっている');
});
```

- [ ] **Step 2: 落ちることを確認する**

Run: `npm test -- tests/environment-snow-motion.test.js`
Expected: 「甲板の上では onTerrain が立たない」「甲板の上ではキーを離すと即止まる」「甲板の上では雪が舞わない」が FAIL（`onTerrain` が undefined、`vx` が 0 にならない、`snowKicks` が空でない）

- [ ] **Step 3: 実装する**

(a) `Player.js:422` の `_moveAndCollide()` 冒頭、`this.onGround = false;` の直後に足す:

```js
        this.onGround = false;
        // 接地面の種別。地形が接地させたときだけ立てる（甲板・敵の頭では立てない）。
        // 滑りと雪煙がこれを見る ── 鉄板の上で滑るのはおかしい、という実機の指摘
        this.onTerrain = false;
```

(b) 地形が接地させる**3か所**で `this.onTerrain = true;` を `this.onGround = true;` の直後に足す:
- `_landOnMapOrHitCeiling()` 内（`Player.js:533` 付近）
- `_probeGroundBelowFeet()` の階段吸着（`Player.js:652` 付近）
- `_probeGroundBelowFeet()` の足元プローブ（`Player.js:667` 付近）

甲板（`_landOnCarrier`、`Player.js:580` 付近）・敵の頭（`_landOnEnemy` の `:625` と足元プローブの敵判定 `:677`）には**足さない**。

(c) コンストラクタ（`Player.js:80` の `this.onGround = false;` の隣）に既定値:

```js
        this.onGround = false;
        this.onTerrain = false;   // 接地面が地形か（_moveAndCollide が毎フレーム決める）
```

(d) `_updateHorizontal()`（`Player.js:250`）の import に `groundSlide` を足し、`:261` を差し替える:

```js
        } else if (this.onGround) {
            // 滑るのは「雪の積もった地形の上」だけ。甲板や敵の頭の上は陸上と
            // 同じ即時停止になる（utils/surface.js）
            this.vx *= groundSlide(this, this.game);
            if (Math.abs(this.vx) < 0.05) this.vx = 0;
        } else {
```

(e) `_kickSnow()`（`Player.js:319`）の冒頭に足す:

```js
    _kickSnow(landed) {
        if (!this.game.spawnSnowKick) return;
        // 着地したフレームは motion がまだ「雪の面」のまま（係数はフレーム先頭、
        // 着地は _moveAndCollide の中）なので、ここでも接地面を見る必要がある
        if (!this.onTerrain) return;
```

- [ ] **Step 4: 通ることを確認する**

Run: `npm test -- tests/environment-snow-motion.test.js`
Expected: PASS（既存分＋新規4件）

- [ ] **Step 5: 全テストを回す（階段の吸着が壊れていないこと）**

Run: `npm test`
Expected: fail 0。とくに `environment-snow-*`、`snow-stairs`、`carrier-lift` が通っていること。

- [ ] **Step 6: 変異させて、テストが落ちることを確認する**

`_landOnCarrier()` の `this.onGround = true;` の直後に `this.onTerrain = true;` を足して `npm test -- tests/environment-snow-motion.test.js` を実行。
Expected: 甲板の3件が FAIL。確認したら元に戻す。

- [ ] **Step 7: コミット**

```bash
git add src/js/entities/Player.js tests/environment-snow-motion.test.js
git commit -m "fix: 母艦の甲板・敵の頭の上で滑る・雪が舞うのを直す"
```

---

### Task 3: 敵アタッカーを同じ床に乗せる

**Files:**
- Modify: `src/js/entities/attacker/collision.js`（`onGround` を立てる3か所）
- Modify: `src/js/entities/EnemyAttacker.js:210` 付近（`_updateMovement` の直後）
- Test: `tests/enemy-snow-slide.test.js`（新規）

**Interfaces:**
- Consumes: `groundSlide` / `approachVx`（Task 1）、`EnemyAttacker.onTerrain`
- Produces: なし（後続タスクは戦車側で同じ形を繰り返す）

- [ ] **Step 1: 失敗するテストを書く**

`tests/enemy-snow-slide.test.js`:

```js
// 敵も雪の上では滑る（自機と同じ床の上に乗っている、という整理）。
// AI の分岐には手を入れず、決まった vx を「目標速度」として扱う。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMap, makeGame, makeAttacker, flatFloorRows } from './helpers/enemy-world.js';
import { ICE_SLIDE } from '../src/js/utils/Constants.js';

const SNOW = { motionAt: () => ({ speed: 1, gravity: 1, slide: ICE_SLIDE }), sightScale: 1, kind: 'snow' };

function snowGame() {
  const game = makeGame(makeMap(flatFloorRows()));
  game.env = SNOW;
  game.spawnSnowKick = () => {};
  return game;
}

/** 床の上に立たせて接地させる。 */
function grounded(game, typeKey = 'standard') {
  const e = makeAttacker(game, 200, 20 * 16 - 24, typeKey);
  for (let i = 0; i < 3; i++) e.update();
  return e;
}

test('雪の地形に接地していれば onTerrain が立つ', () => {
  const e = grounded(snowGame());
  assert.equal(e.onGround, true, '接地していない');
  assert.equal(e.onTerrain, true);
});

test('雪の上では目標速度に一発で届かない（滑る）', () => {
  const game = snowGame();
  const e = grounded(game);
  e.vx = 0;
  const desired = e.maxSpeed;
  e._applyGroundSlide(desired);     // 1フレームぶん
  assert.ok(Math.abs(e.vx) < desired * 0.9, `氷の上で一発で届いている: ${e.vx}`);
  assert.ok(Math.abs(e.vx) > 0, '一切動いていない');
});

test('陸上では目標速度がそのまま出る（現行の挙動を変えない）', () => {
  const game = makeGame(makeMap(flatFloorRows()));   // env 無し＝陸上
  const e = grounded(game);
  e.vx = 0;
  e._applyGroundSlide(1.2);
  assert.equal(e.vx, 1.2);
});

test('雪の上でも、同じ向きを出し続ければ最高速に達する', () => {
  const game = snowGame();
  const e = grounded(game);
  e.vx = 0;
  for (let i = 0; i < 120; i++) e._applyGroundSlide(e.maxSpeed);
  assert.ok(Math.abs(e.vx - e.maxSpeed) < 0.05, `最高速に届かない: ${e.vx}`);
});

test('雪の上では急に止まれない（目標 0 を出しても数フレーム流れる）', () => {
  const game = snowGame();
  const e = grounded(game);
  e.vx = e.maxSpeed;
  e._applyGroundSlide(0);
  assert.ok(Math.abs(e.vx) > e.maxSpeed * 0.5, `即止まっている: ${e.vx}`);
});

test('空中では滑りを掛けない（従来どおり AI の値がそのまま出る）', () => {
  const game = snowGame();
  const e = grounded(game);
  e.onGround = false;
  e.vx = 0;
  e._applyGroundSlide(e.maxSpeed);
  assert.equal(e.vx, e.maxSpeed);
});
```

- [ ] **Step 2: 落ちることを確認する**

Run: `npm test -- tests/enemy-snow-slide.test.js`
Expected: FAIL（`e._applyGroundSlide is not a function`、`onTerrain` が undefined）

- [ ] **Step 3: 実装する**

(a) `src/js/entities/attacker/collision.js`: `this.onGround = false;`（`:99`）の直後に `this.onTerrain = false;` を足し、**地形が立てる2か所**（`:105` の着地、`:140` の足元プローブ）に `this.onTerrain = true;` を足す。`_checkVerticalEntities()` 経由（`:125`。他機の頭の上）には足さない。

(b) `src/js/entities/EnemyAttacker.js` に import と1メソッドを足す:

```js
import { groundSlide, approachVx } from '../utils/surface.js';
```

```js
    /**
     * AI が決めた「こう動きたい」を、床の性質を通して実際の vx にする。
     * 雪の地形の上では前フレームの速度が残る＝止まれない・曲がれない。
     * 陸上（slide 0）では目標がそのまま出るので、従来の挙動と1ビットも変わらない。
     */
    _applyGroundSlide(desiredVx) {
        this.vx = approachVx(this.vx, desiredVx, groundSlide(this, this.game));
    }
```

(c) `EnemyAttacker.js:210` の移動呼び出しを、決まった `vx` を床に通す形にする:

```js
        // --- Movement ---
        // 反動中は自前の移動制御を飛ばす。重力・地形衝突・射撃はそのまま動く。
        if (!tickRecoil(this)) {
            this._updateMovement(target);
            // AI が出した vx は「目標速度」。実際に出る速度は床が決める
            // （雪の上では滑るので、止まるのにも曲がるのにも時間がかかる）
            this._applyGroundSlide(this.vx);
        }
```

- [ ] **Step 4: 通ることを確認する**

Run: `npm test -- tests/enemy-snow-slide.test.js`
Expected: PASS（6件）

- [ ] **Step 5: 全テストを回す**

Run: `npm test`
Expected: fail 0。敵の挙動テスト（`enemy-attacker-*`、`attacker-return`、`rival-dash`）が通っていること。落ちた場合は「陸上では現行と同一」が崩れていないかを最初に疑う（`groundSlide` が 0 を返していれば `vx` は目標そのまま）。

- [ ] **Step 6: コミット**

```bash
git add src/js/entities/attacker/collision.js src/js/entities/EnemyAttacker.js tests/enemy-snow-slide.test.js
git commit -m "feat: 敵アタッカーも雪の地形の上では滑るように"
```

---

### Task 4: 敵戦車を同じ床に乗せる

**Files:**
- Modify: `src/js/entities/EnemyTank.js`（`:71` の巡回速度、`:80` の摩擦、`:129` の `grounded`）
- Test: `tests/enemy-snow-slide.test.js`（追記）

**Interfaces:**
- Consumes: `groundSlide` / `approachVx`（Task 1）
- Produces: `EnemyTank.onTerrain`

- [ ] **Step 1: 失敗するテストを書く**

`tests/enemy-snow-slide.test.js` に追記:

```js
import { EnemyTank } from '../src/js/entities/EnemyTank.js';

function tankOn(game) {
  const t = new EnemyTank(game, 200, 20 * 16 - 20);
  game.enemies.push(t);
  for (let i = 0; i < 3; i++) t.update();
  return t;
}

test('戦車は雪の地形で向きを変えても即座には反転しない（滑る）', () => {
  const game = snowGame();
  const t = tankOn(game);
  // 右へ進みきった状態から、巡回方向だけ反転させる
  t.patrolDir = 1;
  for (let i = 0; i < 60; i++) t.update();
  const before = t.vx;
  assert.ok(before > 0, `右へ進んでいない: ${before}`);
  t.patrolDir = -1;
  t.update();
  assert.ok(t.vx > 0, `氷の上で1フレームで反転している: ${t.vx}`);
});

test('戦車は陸上では今までどおり即座に反転する', () => {
  const game = makeGame(makeMap(flatFloorRows()));   // 陸上
  game.spawnSnowKick = () => {};
  const t = tankOn(game);
  t.patrolDir = 1;
  for (let i = 0; i < 60; i++) t.update();
  t.patrolDir = -1;
  t.update();
  assert.ok(t.vx < 0, `陸上なのに反転が鈍っている: ${t.vx}`);
});
```

- [ ] **Step 2: 落ちることを確認する**

Run: `npm test -- tests/enemy-snow-slide.test.js`
Expected: 「雪の地形で向きを変えても即座には反転しない」が FAIL（1フレームで `vx` が負になる）

- [ ] **Step 3: 実装する**

`EnemyTank.js` に import を足す:

```js
import { groundSlide, approachVx } from '../utils/surface.js';
```

`:71` の巡回速度の代入を「目標速度を覚える」形に変え、`:80` の摩擦を床に通す形に置き換える:

```js
        // --- Patrol Movement ---
        // ここで決めるのは「こう動きたい」。実際の速度は床が決める（下）
        const desiredVx = recoiling ? this.vx : this.patrolDir * ENEMY_TANK_SPEED;
```

```js
        // --- Friction ---
        // 陸上は今までどおり FRICTION で落ち着く。雪の地形の上では前フレームの
        // 速度が残るので、止まるのにも反転にも時間がかかる（自機と同じ床）
        const slide = groundSlide(this, this.game);
        this.vx = slide
            ? approachVx(this.vx, desiredVx, slide)
            : desiredVx * FRICTION;
        if (Math.abs(this.vx) < 0.05) this.vx = 0;
```

> 戦車の雪煙（`_applySnowSlope` の中）は条件を変えない。戦車は地形にしか接地
> しないので `grounded` がそのまま「地形の上」を意味し、下の `onTerrain` と
> 同値になる。

`_moveAndCollide()` の `this.grounded = grounded;`（`:129`）の直後に足す:

```js
        this.grounded = grounded;
        // 戦車は地形にしか接地しない（甲板にも敵の頭にも乗らない）ので、
        // 接地＝地形。surface.js が読む
        this.onTerrain = grounded;
```

- [ ] **Step 4: 通ることを確認する**

Run: `npm test -- tests/enemy-snow-slide.test.js`
Expected: PASS（8件）

- [ ] **Step 5: 全テストを回す**

Run: `npm test`
Expected: fail 0（`enemy-tank-*`、`environment-snow-motion` の戦車の雪煙テストを含む）

- [ ] **Step 6: コミット**

```bash
git add src/js/entities/EnemyTank.js tests/enemy-snow-slide.test.js
git commit -m "feat: 敵戦車も雪の地形の上では滑るように"
```

---

### Task 5: 敵アタッカーの雪煙を揃える

**Files:**
- Modify: `src/js/entities/EnemyAttacker.js`（`update()` の末尾、`_recordAfterimage()` の隣）
- Modify: `src/js/utils/Constants.js`（しきい値を1つ）
- Test: `tests/enemy-snow-slide.test.js`（追記）

**Interfaces:**
- Consumes: `groundSlide`、`EnemyAttacker.onTerrain`、`game.spawnSnowKick(x, y, n)`、`SNOW_KICK_WALK`
- Produces: なし

- [ ] **Step 1: 失敗するテストを書く**

`tests/enemy-snow-slide.test.js` に追記:

```js
import { SNOW_KICK_WALK, ENEMY_SNOW_KICK_MIN_SPEED } from '../src/js/utils/Constants.js';

/** 雪煙の記録を取る世界。画面内判定のために camera / canvas も置く。 */
function kickGame() {
  const game = snowGame();
  game.snowKicks = [];
  game.spawnSnowKick = (x, y, n) => game.snowKicks.push(n);
  game.camera = { x: 0, y: 0 };
  game.canvas = { width: 1366, height: 768 };
  return game;
}

test('雪の地形を歩く敵アタッカーは雪を蹴る', () => {
  const game = kickGame();
  const e = grounded(game);
  game.snowKicks.length = 0;
  e.vx = ENEMY_SNOW_KICK_MIN_SPEED + 0.5;
  e._kickSnow();
  assert.deepEqual(game.snowKicks, [SNOW_KICK_WALK]);
});

test('止まっている敵アタッカーは雪を蹴らない', () => {
  const game = kickGame();
  const e = grounded(game);
  game.snowKicks.length = 0;
  e.vx = 0;
  e._kickSnow();
  assert.deepEqual(game.snowKicks, []);
});

test('空中の敵アタッカーは雪を蹴らない', () => {
  const game = kickGame();
  const e = grounded(game);
  game.snowKicks.length = 0;
  e.onGround = false;
  e.vx = 2;
  e._kickSnow();
  assert.deepEqual(game.snowKicks, []);
});

test('陸上の面では雪を蹴らない', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  game.snowKicks = [];
  game.spawnSnowKick = (x, y, n) => game.snowKicks.push(n);
  game.camera = { x: 0, y: 0 };
  game.canvas = { width: 1366, height: 768 };
  const e = grounded(game);
  e.vx = 2;
  e._kickSnow();
  assert.deepEqual(game.snowKicks, []);
});
```

- [ ] **Step 2: 落ちることを確認する**

Run: `npm test -- tests/enemy-snow-slide.test.js`
Expected: FAIL（`ENEMY_SNOW_KICK_MIN_SPEED` が未定義、`e._kickSnow is not a function`）

- [ ] **Step 3: 実装する**

`Constants.js` の `SNOW_KICK_SLIDE`（`:1287`）の直後に足す:

```js
// 敵が雪を蹴り始める速さ。自機は |vx| > 0.1 で蹴るが、敵は巡回で微速のまま
// 長く動くので、同じ値だと画面の敵全員が常時撒き続けることになる
export const ENEMY_SNOW_KICK_MIN_SPEED = 0.4;
```

`EnemyAttacker.js` の import に足す（戦車と同じ組み合わせ）:

```js
import { SNOW_KICK_WALK, ENEMY_SNOW_KICK_MIN_SPEED, VIEW_CULL_MARGIN } from '../utils/Constants.js';  // 既存の Constants の import 文に追記する
import { isInView } from '../utils/viewCull.js';
import { groundSlide } from '../utils/surface.js';   // Task 3 で追加済みなら approachVx と同じ行でよい
```

そのうえでメソッドを足す:

```js
    /**
     * 雪の地形を歩くときの雪煙。自機・戦車と同じ床の規則に従う。
     * 粒は**画面内の敵だけ**（画面外の9割で撒くと particles を食い潰す。
     * 戦車が同じ理由で同じ条件を持っている）。
     */
    _kickSnow() {
        if (!this.game.spawnSnowKick) return;
        if (!groundSlide(this, this.game)) return;
        if (Math.abs(this.vx) < ENEMY_SNOW_KICK_MIN_SPEED) return;
        if (this.game.camera && this.game.canvas
            && !isInView(this, this.game.camera, this.game.canvas, VIEW_CULL_MARGIN)) return;
        this.game.spawnSnowKick(this.x + this.width / 2, this.y + this.height, SNOW_KICK_WALK);
    }
```

`update()` の末尾、`this._recordAfterimage();` の直前に呼び出しを足す:

```js
        this._kickSnow();
        // 移動が終わったあとの位置と速さを残像の種として残す（rival のみ）
        this._recordAfterimage();
```

- [ ] **Step 4: 通ることを確認する**

Run: `npm test -- tests/enemy-snow-slide.test.js`
Expected: PASS（12件）

- [ ] **Step 5: 全テストを回す**

Run: `npm test`
Expected: fail 0

- [ ] **Step 6: コミット**

```bash
git add src/js/entities/EnemyAttacker.js src/js/utils/Constants.js tests/enemy-snow-slide.test.js
git commit -m "feat: 敵アタッカーも雪の地形を歩くと雪を蹴るように"
```

---

### Task 6: バランスの実測（滑り落ちる頻度）

**Files:**
- Create: `tools/measure-snow-slide.mjs`

**Interfaces:**
- Consumes: 実物の `Map`（`src/js/world/Map.js`）、`EnemyAttacker`、`EnemyTank`、`groundSlide`
- Produces: 標準出力に JSON（ゲーム本体からは呼ばれない）

- [ ] **Step 1: 計測スクリプトを書く**

`tools/measure-snow-slide.mjs`:

```js
// 雪の面で敵が「自分から落ちる」頻度を数える。滑りを入れる前後で比べるための
// もので、ゲーム本体からは呼ばれない。
//
// 使い方:
//   node tools/measure-snow-slide.mjs > /tmp/snow-after.json
//
// 画面に出さず JSON に吐くのは、実機の数値は記録して後から突き合わせたいため。

import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { ICE_SLIDE, TILE_SIZE, ENEMY_ATTACKER_TYPES } from '../src/js/utils/Constants.js';

// Map._generateMiniMap() が document を触るので、最小の stub を置く
// （tests/MapDeterminism.test.js と同じ手口）
const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }),
};

const { Map } = await import('../src/js/world/Map.js');
const { EnemyAttacker } = await import('../src/js/entities/EnemyAttacker.js');
const { EnemyTank } = await import('../src/js/entities/EnemyTank.js');

const SEEDS = [1, 2, 3, 4, 5, 6];
const FRAMES = 3600;          // 60秒ぶん
const MISSION_LEVEL = 4;      // 5面（0 起点）
const SNOW = { motionAt: () => ({ speed: 1, gravity: 1, slide: ICE_SLIDE }), sightScale: 1, kind: 'snow' };

/** 敵の update() が触るものだけを持つ最小の game。 */
function makeGame(map) {
    return {
        map, env: SNOW,
        player: null, carrier: null,
        enemies: [], projectiles: [], enemyBullets: [],
        missileKits: [], repairKits: [], autoAimUnits: [], particles: [],
        rng: new SeededRNG(1),
        camera: { x: 0, y: 0 }, canvas: { width: 1366, height: 768 },
        spawnSparks() {}, spawnExplosion() {}, addScore() {},
        spawnSmokeScreen() {}, spawnSnowKick() {},
    };
}

const result = { frames: FRAMES, seeds: SEEDS.length, falls: 0, deaths: 0, offMap: 0, perSeed: [] };

for (const seed of SEEDS) {
    const map = new Map({ rng: new SeededRNG(seed) }, MISSION_LEVEL);
    const game = makeGame(map);

    // 実物の湧き位置に置く（配置そのものは触らない＝週次の決定性に影響しない）
    for (const p of map.enemyAttackerSpawns) {
        game.enemies.push(new EnemyAttacker(game, p.x, p.y, ENEMY_ATTACKER_TYPES.standard));
    }
    for (const p of map.enemyTankSpawns) {
        game.enemies.push(new EnemyTank(game, p.x, p.y));
    }

    const seen = new globalThis.Map();   // entity -> 前フレームの接地
    let falls = 0, deaths = 0, offMap = 0;
    for (let f = 0; f < FRAMES; f++) {
        for (const e of game.enemies) {
            if (!e.alive) continue;
            const wasGrounded = seen.get(e) ?? false;
            e.update();
            const nowGrounded = e.onGround ?? e.grounded ?? false;
            // 接地→空中で、上向きの速度が無い＝ジャンプではなく落ちた
            if (wasGrounded && !nowGrounded && (e.vy ?? 0) >= 0) falls++;
            seen.set(e, nowGrounded);
            if (!e.alive) deaths++;
            if (e.y > map.rows * TILE_SIZE) offMap++;
        }
    }
    result.perSeed.push({ seed, enemies: game.enemies.length, falls, deaths, offMap });
    result.falls += falls;
    result.deaths += deaths;
    result.offMap += offMap;
}

// 1体あたり・60秒あたりに正規化しておく（体数が seed ごとに違うため）
const total = result.perSeed.reduce((n, s) => n + s.enemies, 0);
result.fallsPerEnemyPerMinute = +(result.falls / total).toFixed(3);
result.deathsPerEnemyPerMinute = +(result.deaths / total).toFixed(3);
console.log(JSON.stringify(result, null, 2));
```

- [ ] **Step 2: 変更後（滑りあり）の値を取る**

Run: `node tools/measure-snow-slide.mjs > /tmp/snow-after.json`
Expected: JSON が出る。`fallsPerEnemyPerMinute` と `deathsPerEnemyPerMinute` を読む。

- [ ] **Step 3: 変更前の値を取る**

**`git stash` は使わない**（`src/js/main.js` の `debugStartMission` を巻き込む）。Task 1 の直前のコミットを別の作業ディレクトリに展開して測る:

```bash
BASE=$(git log --format=%H --grep="床の滑りを持つ共通の純関数を追加" -1)^
git worktree add /tmp/snow-base "$BASE"
cp tools/measure-snow-slide.mjs /tmp/snow-base/tools/
(cd /tmp/snow-base && node tools/measure-snow-slide.mjs > /tmp/snow-before.json)
git worktree remove /tmp/snow-base
```

- [ ] **Step 4: 比べてユーザーに報告する**

Run: `node -e "const a=require('/tmp/snow-before.json'),b=require('/tmp/snow-after.json');console.log({before:{falls:a.fallsPerEnemyPerMinute,deaths:a.deathsPerEnemyPerMinute},after:{falls:b.fallsPerEnemyPerMinute,deaths:b.deathsPerEnemyPerMinute}})"`

報告に含めるもの: 1体あたり60秒あたりの自落回数と死亡数（変更前 → 変更後）。
**死亡数が 0.05/体/分 を超えて増えていたら Task 7 を実施する**（敵が勝手に減っていく＝ゲームとして壊れている）。それ未満なら Task 7 は飛ばし、ユーザーに数値だけ報告する。

- [ ] **Step 5: コミット**

```bash
git add tools/measure-snow-slide.mjs
git commit -m "chore: 雪の面で敵が滑り落ちる頻度を測るスクリプト"
```

---

### Task 7: （必要な場合のみ）敵の係数を分ける

**Files:**
- Modify: `src/js/utils/Constants.js`
- Modify: `src/js/utils/surface.js`
- Test: `tests/surface.test.js`（追記）

**Interfaces:**
- Consumes: `groundSlide(entity, game)`
- Produces: `groundSlide` が `entity.slideScale`（未定義なら 1）を掛けた値を返す

- [ ] **Step 1: テストを書く**

```js
test('slideScale を持つ相手は、そのぶん滑りが弱くなる', () => {
  const e = entity({ slideScale: 0.5 });
  const full = groundSlide(entity(), world(SNOW_ENV));
  assert.ok(groundSlide(e, world(SNOW_ENV)) < full);
});
```

- [ ] **Step 2: 落ちることを確認する**

Run: `npm test -- tests/surface.test.js`
Expected: FAIL

- [ ] **Step 3: 実装する**

`Constants.js`:

```js
// 敵の滑りやすさ。1 で自機と同じ。Task 6 の実測で敵が落ちて死ぬ数が増えたら
// ここだけ下げる（AI 側には手を入れない）
export const ENEMY_SLIDE_SCALE = 1.0;
```

`surface.js` の `groundSlide` の最後:

```js
    // 相手ごとの倍率（既定 1）。敵だけ滑りを弱めたいときのための逃げ道
    return (motion.slide || 0) * (entity.slideScale ?? 1);
```

`EnemyAttacker` / `EnemyTank` のコンストラクタで `this.slideScale = ENEMY_SLIDE_SCALE;`

- [ ] **Step 4: 通ることを確認する**

Run: `npm test`
Expected: fail 0

- [ ] **Step 5: コミット**

```bash
git add src/js/utils/surface.js src/js/utils/Constants.js src/js/entities/EnemyAttacker.js src/js/entities/EnemyTank.js tests/surface.test.js
git commit -m "feat: 敵の滑りやすさを自機と別に調整できるように"
```

---

## 引き渡し

実機で確認してもらう点と、対応する定数:

| 見え方 | 定数 / 場所 |
|---|---|
| 甲板の上で滑らない・雪が舞わない | Task 2（定数なし） |
| 敵の滑りやすさ | `ICE_SLIDE`（全員）/ `ENEMY_SLIDE_SCALE`（敵だけ、Task 7 を入れた場合） |
| 敵の雪煙の出始める速さ | `ENEMY_SNOW_KICK_MIN_SPEED` |

**ハードリロード（Cmd+Shift+R）が要る**ことを伝える（`index.html` が `main.js?v=1.0` でキャッシュを効かせているため）。
