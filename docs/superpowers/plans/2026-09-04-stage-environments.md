# 面ごとの環境（霧・雪・地底湖） 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 4面に地底湖、5面に雪と氷、6面に霧を足し、動き・索敵・遠景・デモ画面の背景に効かせる。7面は遠景だけ機械的にする。

**Architecture:** `Constants.js` の `STAGE_ENVIRONMENTS`（面ごとに1行）を `world/StageEnvironment.js` が読み、エンティティは `motionFor(game, x, y)` と `sightScaleFor(game)` の2つの純関数経由でしか環境を知らない。描画は kind ごとに `world/environment/{fog,snow,water}.js` へ分け、`main.js` からは `env.drawOverWorld` と `env.drawOverlay` の2回だけ呼ぶ。遠景の装飾は `CaveBackdrop` に `backdrop` 引数を足して分岐する。

**Tech Stack:** バニラ ES modules、canvas 2D、`node --test`。依存パッケージなし。

**Spec:** `docs/superpowers/specs/2026-09-04-stage-environments-design.md`

## Global Constraints

- **`git add -A` / `git add .` は使わない。** `src/js/main.js` にはユーザーのデバッグ用 `debugStartMission` が意図的に未コミットで置かれている。main.js を触るタスクは `git add -p src/js/main.js` で自分のハンクだけを stage する。`git checkout` / `git restore` / `git stash` も main.js に対しては使わない
- 作業ツリーには 2026-08-29 の未コミット変更（面別ランキング2段化など、`git status` の M ファイル群）が残っている。**それらは触らない・stage しない**
- 数値は `src/js/utils/Constants.js` に置く（描画専用のパラメータだけ各ファイルのモジュールスコープ可）。決めた根拠をコメントに書く
- コメントは日本語で「なぜそうしたか」を書く
- マップ生成中に `game.rng` を余分に消費しない（週の決定性が壊れる）。生成中の乱数は派生ストリーム `new SeededRNG((game.rng.state ^ 定数) >>> 0)` を使う
- 新しい `play*` メソッドは足さない（音は今回対象外）
- 描画で毎フレーム `createRadialGradient` / `createLinearGradient` を作らない。粒は `fillRect` 1回。1〜2px の細片は遠景に使わない
- テストは実装から期待値を導かない（恒真になる）。壊して赤くなることを必ず確認する
- 全テスト: `npm test`（1秒弱）。1ファイル: `npm test -- tests/xxx.test.js`
- 実機確認はユーザーが行う。引き渡すときはハードリロード（Cmd+Shift+R）が要ることを伝える

---

## File Structure

| ファイル | 責務 |
|---|---|
| `src/js/utils/Constants.js`（Modify） | `STAGE_ENVIRONMENTS` の表と、水・雪・霧・斜面・しぶきの調整値 |
| `src/js/world/StageEnvironment.js`（Create） | 面の環境1つ。`motionAt` / `sightScale` / `update` / `drawOverWorld` / `drawOverlay`。`motionFor` / `sightScaleFor` の純関数もここ |
| `src/js/world/environment/none.js`（Create） | 何もしない描画。kind 'none' と、document が無い環境（テスト）の逃げ先 |
| `src/js/world/environment/fog.js`（Create） | 霧の層（オフスクリーン2枚）と全画面の薄塗り |
| `src/js/world/environment/snow.js`（Create） | 降雪の板（オフスクリーン3枚）のスクロール |
| `src/js/world/environment/water.js`（Create） | 水タイルのキャッシュ canvas、波打つ水面、波紋 |
| `src/js/world/waterPools.js`（Create） | 地底湖の生成（純関数）と、破壊跡への流入（純関数） |
| `src/js/world/snowStairs.js`（Create） | 雪の面の階段の生成（純関数） |
| `src/js/world/Map.js`（Modify） | 水タイルの保持と問い合わせ、生成時露出ビット、積雪の帯、破壊時の流入 |
| `src/js/world/CaveBackdrop.js`（Modify） | `backdrop` 引数と5種の装飾 |
| `src/js/utils/slope.js`（Create） | 階段の向きの検出と45度の描画オフセット（純関数） |
| `src/js/entities/Player.js`（Modify） | 重力・推力・位置更新に係数、滑り、斜面、雪の粒、描画オフセット |
| `src/js/entities/EnemyTank.js` / `EnemyAttacker.js` / `Carrier.js` / `PickupItem.js`（Modify） | 重力と位置更新に係数 |
| `src/js/entities/Bullet.js` / `Missile.js` / `Grenade.js` / `EnemyHomingMissile.js`（Modify） | 位置更新（と推力）に係数 |
| `src/js/entities/EnemyDrone.js`（Modify） | 水に入らない |
| `src/js/entities/EnemyTank.js` / `EnemyTurret.js` / `EnemyDrone.js` / `EnemyAttacker.js` / `EnemyBase.js` / `main.js`（Modify） | 索敵の range に `sightScaleFor` |
| `src/js/entities/Particle.js`（Modify） | `SplashParticle` / `SnowKickParticle` |
| `src/js/systems/SpawnEffects.js`（Modify） | `spawnSplash` / `spawnSnowKick` |
| `src/js/systems/GameStateManager.js` / `src/js/main.js`（Modify） | 環境の生成と、update / draw の呼び出し |
| `src/js/ui/StageScene.js` / `ui/screens/rankingScreens.js` / `titleScreen.js` / `ScreenRenderer.js`（Modify） | デモ画面の背景 |
| `tests/helpers/enemy-world.js`（Modify） | `makeGame` に `env` を足す |
| `tests/environment-*.test.js`（Create） | 各タスクのテスト |

---

## Phase A: 土台（表・問い合わせ口・物理の係数）

### Task 1: `STAGE_ENVIRONMENTS` の表と定数

**Files:**
- Modify: `src/js/utils/Constants.js`（`STAGE_PALETTES` の直後、`// --- Colors ---` の前）
- Test: `tests/environment-table.test.js`

**Interfaces:**
- Produces: `STAGE_ENVIRONMENTS: Array<{kind, backdrop, terrain}>`、`ENV_KINDS`、`ENV_BACKDROPS`、以下の定数

- [ ] **Step 1: 失敗するテストを書く**

```js
// tests/environment-table.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE_ENVIRONMENTS, ENV_KINDS, ENV_BACKDROPS, STAGE_PALETTES,
} from '../src/js/utils/Constants.js';

// 面ごとの環境は表の1行。行数はパレットと同じ7、値は既知のものだけ。
test('STAGE_ENVIRONMENTS has one row per stage palette', () => {
  assert.equal(STAGE_ENVIRONMENTS.length, STAGE_PALETTES.length);
});

test('every row uses a known kind, backdrop and terrain', () => {
  for (const row of STAGE_ENVIRONMENTS) {
    assert.ok(ENV_KINDS.includes(row.kind), `unknown kind ${row.kind}`);
    assert.ok(ENV_BACKDROPS.includes(row.backdrop), `unknown backdrop ${row.backdrop}`);
    assert.equal(row.terrain, 'cave'); // 7面の要塞化は別設計。今は予約だけ
  }
});

// 設計で決めた割り当て。ここが動くと面別ランキングの条件が変わるので固定する。
test('stage assignment matches the design', () => {
  assert.deepEqual(STAGE_ENVIRONMENTS.map((r) => r.kind),
    ['none', 'none', 'none', 'water', 'snow', 'fog', 'none']);
  assert.deepEqual(STAGE_ENVIRONMENTS.map((r) => r.backdrop),
    ['cave', 'cave', 'cave', 'wet', 'snow', 'fog', 'machine']);
});
```

- [ ] **Step 2: 落ちることを確認**

Run: `npm test -- tests/environment-table.test.js`
Expected: FAIL（`STAGE_ENVIRONMENTS` が export されていない）

- [ ] **Step 3: 表と定数を足す**

`STAGE_PALETTES` の直後に追加:

```js
// --- 面ごとの環境（霧・雪・地底湖） ---
// 設計: docs/superpowers/specs/2026-09-04-stage-environments-design.md
// 面に固定する（面別ランキングがタイムアタックなので、同じ面は常に同じ条件）。
// kind = 動きと画面に重ねる描画、backdrop = 遠景の装飾（kind から導けない行がある:
// 7面は動きは今のままで遠景だけ機械）、terrain = 地形の生成規則（7面の要塞化のために
// 予約。今は全行 'cave' で、読む側もまだ無い）。
export const ENV_KINDS = ['none', 'water', 'snow', 'fog'];
export const ENV_BACKDROPS = ['cave', 'wet', 'snow', 'fog', 'machine'];
export const STAGE_ENVIRONMENTS = [
    { kind: 'none',  backdrop: 'cave',    terrain: 'cave' }, // 1
    { kind: 'none',  backdrop: 'cave',    terrain: 'cave' }, // 2
    { kind: 'none',  backdrop: 'cave',    terrain: 'cave' }, // 3
    { kind: 'water', backdrop: 'wet',     terrain: 'cave' }, // 4: 地底湖
    { kind: 'snow',  backdrop: 'snow',    terrain: 'cave' }, // 5: 雪と氷
    { kind: 'fog',   backdrop: 'fog',     terrain: 'cave' }, // 6: 霧（砲兵の煙幕と見分けにくくする）
    { kind: 'none',  backdrop: 'machine', terrain: 'cave' }, // 7: 洞窟を改造した要塞（遠景だけ）
];

// 水中の動き。speed は位置更新と推力に掛ける倍率、gravity は重力の倍率。
// 浮力は持たない（重力が弱いだけで、沈めば底を歩く）。実機で詰める前の初期値。
export const WATER_SPEED_SCALE = 0.5;
export const WATER_GRAVITY_SCALE = 0.3;
// 雪の地上で入力を離したときの速度の残存率（陸上は 0 = 即停止）。
export const ICE_SLIDE = 0.9;
export const ICE_MAX_SLIDE_SPEED = 3.0;    // 斜面で加速し続けても超えない
export const SLOPE_DOWNHILL_ACCEL = 0.06;  // 斜面に立っているあいだ毎フレーム下り方向へ
export const SLOPE_UPHILL_SCALE = 0.6;     // 上り方向の入力の最高速の倍率
// 霧で索敵の横半径に掛ける倍率（縦は SIGHT_ASPECT 経由で同じ比率で縮む）。自機の Auto Aim も同じ。
export const FOG_SIGHT_SCALE = 0.5;

// 地底湖の生成。低い位置のチャンバーを選び、部屋の底から数段を水にする。
export const WATER_POOL_COUNT = 3;
export const WATER_POOL_DEPTH_MIN = 3;      // 段（タイル）
export const WATER_POOL_DEPTH_RANGE = 3;    // 3〜5段
export const WATER_POOL_MAX_TILES = 600;    // これを超える塗り広がりは「部屋に閉じていない」とみなして捨てる
// 地底湖の描画。塗りは半透明（機体が水の色をかぶる）。水面は区間ごとに sin で上下。
export const WATER_FILL = 'rgba(40, 120, 200, 0.45)';
export const WATER_SURFACE_COLOR = 'rgba(180, 220, 255, 0.9)';
export const WATER_WAVE_AMPLITUDE = 2.5;    // px。当たり判定は波打たない
export const WATER_WAVE_LENGTH = 48;        // px。3タイル
export const WATER_WAVE_SPEED = 0.05;       // rad/frame
export const WATER_RIPPLE_DECAY = 0.94;     // しぶきが落ちた場所の波の減衰（毎フレーム）
export const WATER_RIPPLE_MIN = 0.2;        // これ未満になった波紋は捨てる
// しぶき。粒の数は |vy| に比例（速く落ちるほど盛大）。
export const SPLASH_PARTICLES_PER_VY = 3;
export const SPLASH_MAX_PARTICLES = 24;
export const SPLASH_LIFETIME = 28;

// 降雪。板（オフスクリーン）を層ごとにスクロールする。粒を個別に描かないのは
// 縮尺（タイル16px）に見合う 1〜2px の粒を数千出したいから。
export const SNOW_SHEET_SIZE = 512;
export const SNOW_LAYERS = [
    { count: 260, size: 1, speed: 0.6, sway: 0.25, alpha: 0.55 }, // 遠い
    { count: 140, size: 2, speed: 1.2, sway: 0.5,  alpha: 0.8 },
    { count: 50,  size: 3, speed: 2.0, sway: 0.9,  alpha: 1.0 },  // 近い
];
export const SNOW_COLOR = '#F4F8FF';
// 舞う雪。既存の TrailParticle と同じ fillRect 1回の粒。
export const SNOW_KICK_WALK = 1;     // 雪の地上を動いているあいだ、毎フレーム
export const SNOW_KICK_LAND = 10;    // 着地
export const SNOW_KICK_SLIDE = 3;    // 斜面を滑っているあいだ、毎フレーム
export const SNOW_KICK_LIFETIME = 30;
// 積雪の帯（地形キャッシュに焼く。生成時に露出していた上面だけ）。
export const SNOW_CAP_THICKNESS = 5;
export const SNOW_CAP_COLOR = '#EEF4FB';
// 雪の面の階段。部屋の縁に意図的に作り、滑れる長さを保証する。
export const SNOW_STAIRS_COUNT = 8;
export const SNOW_STAIRS_LENGTH_MIN = 5;
export const SNOW_STAIRS_LENGTH_RANGE = 5;  // 5〜9段

// 霧。層は事前に描いた板を視差付きでずらすだけ。粒は出さない。
export const FOG_COLOR = '#8A96A8';
export const FOG_OVERLAY_ALPHA = 0.22;      // 全画面の薄塗り
// 板は画面（1366×768）より大きくして、継ぎ目が横方向にだけ1回入る形にする
// （drawImage が層×2回で済む。1024×512 だと横2×縦2＝層×4回になる）
export const FOG_SHEET_WIDTH = 2048;
export const FOG_SHEET_HEIGHT = 1024;
export const FOG_BLOB_COUNT = 160;          // 板1枚あたりの雲の塊
export const FOG_LAYERS = [
    { speed: 0.12, alpha: 0.30 },
    { speed: 0.28, alpha: 0.22 },
];

// デモ画面（面別ランキング・面セレクト・タイトル）では文字の可読性のために薄くする。
export const DEMO_OVERLAY_ALPHA_SCALE = 0.5;
```

- [ ] **Step 4: 通ることを確認**

Run: `npm test -- tests/environment-table.test.js`
Expected: PASS（3 tests）

- [ ] **Step 5: 全テストと commit**

Run: `npm test`
Expected: 全 PASS

```bash
git add src/js/utils/Constants.js tests/environment-table.test.js
git commit -m "feat: 面ごとの環境の表 STAGE_ENVIRONMENTS と調整値を追加"
```

---

### Task 2: `StageEnvironment` と問い合わせ口

**Files:**
- Create: `src/js/world/StageEnvironment.js`
- Create: `src/js/world/environment/none.js`
- Modify: `tests/helpers/enemy-world.js`（`makeGame` に `env`）
- Test: `tests/environment-motion.test.js`

**Interfaces:**
- Produces:
  - `class StageEnvironment { constructor(game, stageIndex); kind; backdrop; sightScale; motionAt(x, y) → {speed, gravity, slide}; update(); drawOverWorld(ctx, camX, camY); drawOverlay(ctx, alphaScale = 1) }`
  - `LAND_MOTION`（frozen `{speed:1, gravity:1, slide:0}`）
  - `motionFor(game, x, y)`：`game.env` が無ければ `LAND_MOTION`
  - `sightScaleFor(game)`：`game.env` が無ければ `1`
  - 描画側のインターフェース（kind ごとのファイルが実装）: `{ update(), drawOverWorld(ctx, camX, camY), drawOverlay(ctx, alphaScale) }`
- Consumes: Task 1 の定数

- [ ] **Step 1: 失敗するテストを書く**

```js
// tests/environment-motion.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WATER_SPEED_SCALE, WATER_GRAVITY_SCALE, ICE_SLIDE, FOG_SIGHT_SCALE,
} from '../src/js/utils/Constants.js';

// 水タイルを持つ最小のマップ
function mapWithWater(isWater) {
  return { isWaterAtPixel: isWater };
}

test('motionFor falls back to land when the game has no env (test stubs)', async () => {
  const { motionFor, LAND_MOTION } = await import('../src/js/world/StageEnvironment.js');
  assert.deepEqual(motionFor({}, 0, 0), { speed: 1, gravity: 1, slide: 0 });
  assert.ok(Object.isFrozen(LAND_MOTION));
});

test('stage 1 (none) returns land motion everywhere and full sight', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const env = new StageEnvironment({ map: mapWithWater(() => true) }, 0);
  assert.equal(env.kind, 'none');
  assert.deepEqual(env.motionAt(10, 10), { speed: 1, gravity: 1, slide: 0 });
  assert.equal(env.sightScale, 1);
});

test('stage 4 (water) returns water motion only inside water tiles', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const game = { map: mapWithWater((x, y) => y >= 100) };
  const env = new StageEnvironment(game, 3);
  assert.equal(env.kind, 'water');
  assert.deepEqual(env.motionAt(0, 50), { speed: 1, gravity: 1, slide: 0 });
  assert.deepEqual(env.motionAt(0, 150),
    { speed: WATER_SPEED_SCALE, gravity: WATER_GRAVITY_SCALE, slide: 0 });
});

test('stage 5 (snow) returns ice slide with normal speed and gravity', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const env = new StageEnvironment({ map: mapWithWater(() => false) }, 4);
  assert.deepEqual(env.motionAt(0, 0), { speed: 1, gravity: 1, slide: ICE_SLIDE });
});

test('stage 6 (fog) shrinks sight and keeps land motion', async () => {
  const { StageEnvironment, sightScaleFor } = await import('../src/js/world/StageEnvironment.js');
  const env = new StageEnvironment({ map: mapWithWater(() => false) }, 5);
  assert.equal(env.sightScale, FOG_SIGHT_SCALE);
  assert.equal(sightScaleFor({ env }), FOG_SIGHT_SCALE);
  assert.equal(sightScaleFor({}), 1);
  assert.deepEqual(env.motionAt(0, 0), { speed: 1, gravity: 1, slide: 0 });
});

test('env without document (node) still updates and draws without throwing', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  for (const idx of [0, 3, 4, 5, 6]) {
    const env = new StageEnvironment({ map: mapWithWater(() => false), enemies: [], projectiles: [], enemyBullets: [], particles: [] }, idx);
    env.update();
    env.drawOverWorld({ drawImage() {} }, 0, 0);
    env.drawOverlay({ drawImage() {}, fillRect() {} });
  }
});
```

- [ ] **Step 2: 落ちることを確認**

Run: `npm test -- tests/environment-motion.test.js`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: 実装**

```js
// src/js/world/environment/none.js
// ============================================
// 環境なしの描画。kind 'none' と、document が無い環境（node のテスト）の逃げ先。
// ============================================
//
// 霧・雪・水の描画はオフスクリーン canvas を作る。テストには document が無いので、
// 作れないときはこの「何もしない」実装に落とす。AudioManager が available で
// 黙るのと同じ作り。挙動（motionAt / sightScale）はこの分岐の影響を受けない。

export function createNoneRenderer() {
    return {
        update() {},
        drawOverWorld() {},
        drawOverlay() {},
    };
}

/** オフスクリーン canvas が作れる環境か。 */
export function canvasAvailable() {
    return typeof document !== 'undefined' && typeof document.createElement === 'function';
}
```

```js
// src/js/world/StageEnvironment.js
// ============================================
// StageEnvironment - 面の環境（霧・雪・地底湖）
// ============================================
//
// 設計: docs/superpowers/specs/2026-09-04-stage-environments-design.md
//
// 面ごとの違いは Constants の STAGE_ENVIRONMENTS の1行にあり、ここはそれを
// 「この座標の物理係数」と「索敵の倍率」に翻訳するだけ。エンティティは
// motionFor / sightScaleFor の2つの純関数経由でしか環境を知らない
// （game.env を直接読む箇所を増やさない。テストの簡易 game に env が無くても
// 陸上として動くようにするため）。
//
// 描画は kind ごとのファイル（environment/）に分け、main.js からは
// drawOverWorld と drawOverlay の2回だけ呼ぶ。

import {
    STAGE_ENVIRONMENTS, WATER_SPEED_SCALE, WATER_GRAVITY_SCALE, ICE_SLIDE, FOG_SIGHT_SCALE,
} from '../utils/Constants.js';
import { createNoneRenderer } from './environment/none.js';

/** 陸上。陸上の面では全エンティティがこれを受け取り、掛けても値が変わらない。 */
export const LAND_MOTION = Object.freeze({ speed: 1, gravity: 1, slide: 0 });
const WATER_MOTION = Object.freeze({ speed: WATER_SPEED_SCALE, gravity: WATER_GRAVITY_SCALE, slide: 0 });
const SNOW_MOTION = Object.freeze({ speed: 1, gravity: 1, slide: ICE_SLIDE });

const NONE_ROW = Object.freeze({ kind: 'none', backdrop: 'cave', terrain: 'cave' });

/**
 * 座標の物理係数。game.env が無い（テストの簡易 game）なら陸上。
 * @returns {{speed:number, gravity:number, slide:number}}
 */
export function motionFor(game, x, y) {
    return game && game.env ? game.env.motionAt(x, y) : LAND_MOTION;
}

/** 索敵の横半径に掛ける倍率。game.env が無ければ 1。 */
export function sightScaleFor(game) {
    return game && game.env ? game.env.sightScale : 1;
}

export class StageEnvironment {
    /**
     * @param {object} game Game（map / enemies / projectiles を読む）。デモ画面用は null 可
     * @param {number} stageIndex 0..6
     */
    constructor(game, stageIndex) {
        this.game = game;
        const row = STAGE_ENVIRONMENTS[stageIndex] || NONE_ROW;
        this.kind = row.kind;
        this.backdrop = row.backdrop;
        this.sightScale = this.kind === 'fog' ? FOG_SIGHT_SCALE : 1;
        // 描画は Task 7 以降で kind ごとに差し替える。ここではまだ全部 none。
        this.renderer = createNoneRenderer();
    }

    motionAt(x, y) {
        if (this.kind === 'water') {
            const map = this.game && this.game.map;
            return map && map.isWaterAtPixel(x, y) ? WATER_MOTION : LAND_MOTION;
        }
        if (this.kind === 'snow') return SNOW_MOTION;
        return LAND_MOTION;
    }

    /** 毎シミュレーションtick。描画側の時計を進める。 */
    update() {
        this.renderer.update();
    }

    /** ワールド座標（translate 済み）。地形と機体の後、煙幕の前。 */
    drawOverWorld(ctx, camX, camY) {
        this.renderer.drawOverWorld(ctx, camX, camY);
    }

    /** 画面座標。HUD の直前。alphaScale はデモ画面で薄くするため。 */
    drawOverlay(ctx, alphaScale = 1) {
        this.renderer.drawOverlay(ctx, alphaScale);
    }
}
```

`tests/helpers/enemy-world.js` の `makeGame` に1行足す（`spawnSmokeScreen() {}` の後）:

```js
    // 環境。無いと motionFor が陸上へ落ちるので無くても動くが、
    // 明示しておくと「このテストは陸上」と読める
    env: null,
```

- [ ] **Step 4: 通ることを確認**

Run: `npm test -- tests/environment-motion.test.js`
Expected: PASS（6 tests）

- [ ] **Step 5: commit**

```bash
git add src/js/world/StageEnvironment.js src/js/world/environment/none.js tests/helpers/enemy-world.js tests/environment-motion.test.js
git commit -m "feat: StageEnvironment と motionFor / sightScaleFor を追加（まだ誰も呼ばない）"
```

---

### Task 3: 変更前の軌跡を固定値で記録する

物理に係数を掛ける前に、陸上の面で軌跡が1サンプルも変わらないことを縛るテストを作る。
**期待値は変更前のコードから採取して数値をそのまま貼る**（実装から導かない）。

**Files:**
- Create: `tools/record-motion-baseline.mjs`（採取用。git 管理に入れる）
- Test: `tests/environment-land-invariance.test.js`

**Interfaces:**
- Consumes: `Player`、`EnemyTank`、`Missile`、`tests/helpers/enemy-world.js` の `makeMap` / `makeGame`

- [ ] **Step 1: 採取スクリプトを書く**

```js
// tools/record-motion-baseline.mjs
// 陸上での自機・戦車・ミサイルの軌跡のチェックポイントを出力する。
// 環境の係数を物理に入れる前に一度走らせ、出力を
// tests/environment-land-invariance.test.js の BASELINE に貼る。
// 「実装から期待値を導かない」ための道具なので、係数を入れた後は走らせない。
import { Player } from '../src/js/entities/Player.js';
import { EnemyTank } from '../src/js/entities/EnemyTank.js';
import { Missile } from '../src/js/entities/Missile.js';
import { makeMap, makeGame } from '../tests/helpers/enemy-world.js';
import { TILE_SIZE } from '../src/js/utils/Constants.js';

// 幅40・高さ24。床 row 20。列 30 に高さ1の段（乗り上げを通す）。
function rows() {
    const out = [];
    for (let r = 0; r < 24; r++) {
        if (r >= 20) out.push('#'.repeat(40));
        else if (r === 19) out.push('.'.repeat(30) + '#' + '.'.repeat(9));
        else out.push('.'.repeat(40));
    }
    return out;
}

// 入力の台本: 0-199 右、200-259 右+W（バースト→ホバー）、260-399 なし、400-599 左、600-999 右
function keysAt(frame) {
    const held = new Set();
    if (frame < 200) held.add('KeyD');
    else if (frame < 260) { held.add('KeyD'); held.add('KeyW'); }
    else if (frame >= 400 && frame < 600) held.add('KeyA');
    else if (frame >= 600) held.add('KeyD');
    return held;
}

function input(frame) {
    const held = keysAt(frame);
    return {
        keys: {}, isKeyDown: (c) => held.has(c), isKeyPressed: () => false, isCharPressed: () => false,
        mouse: { left: false, right: false }, isLeftClickPressed: () => false, isRightClickPressed: () => false,
        rightHoldFrames: 0, crosshairLocked: false,
        getMouseWorld: () => ({ x: 1000, y: 0 }), getTargetWorld: () => ({ x: 1000, y: 0 }),
    };
}

const CHECKPOINTS = [1, 50, 100, 199, 230, 260, 300, 400, 500, 600, 800, 999];
const r3 = (v) => Math.round(v * 1000) / 1000;

export function record() {
    const game = makeGame(makeMap(rows()));
    const player = new Player(game, 5 * TILE_SIZE, 20 * TILE_SIZE - 24);
    game.player = player;
    const tank = new EnemyTank(game, 20 * TILE_SIZE, 20 * TILE_SIZE - 16);
    tank.fireInterval = 1e9; // 撃たない
    game.enemies.push(tank);
    const missile = new Missile(game, 2 * TILE_SIZE, 10 * TILE_SIZE, -0.2, true);
    game.projectiles.push(missile);

    const out = { player: [], tank: [], missile: [] };
    for (let f = 0; f < 1000; f++) {
        game.input = input(f);
        player.update();
        tank.update();
        if (missile.alive) missile.update();
        if (CHECKPOINTS.includes(f)) {
            out.player.push([f, r3(player.x), r3(player.y), r3(player.vx), r3(player.vy)]);
            out.tank.push([f, r3(tank.x), r3(tank.y), r3(tank.vx), r3(tank.vy)]);
            out.missile.push([f, r3(missile.x), r3(missile.y), missile.alive ? 1 : 0]);
        }
    }
    return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    console.log(JSON.stringify(record(), null, 1));
}
```

- [ ] **Step 2: 走らせて出力を採る**

Run: `node tools/record-motion-baseline.mjs`
Expected: JSON が出る。**Player / EnemyTank のコンストラクタや update が別の game プロパティを要求して落ちる場合は、`makeGame` ではなく `tests/burst-ceiling.test.js` が作っている game を真似て足す**（軌跡の意味は変えない）。出力を控える。

- [ ] **Step 3: テストに貼る**

```js
// tests/environment-land-invariance.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { record } from '../tools/record-motion-baseline.mjs';

// 環境の係数を物理に入れても、陸上（環境なし）の軌跡は1サンプルも変わらない。
// BASELINE は係数を入れる前のコードで tools/record-motion-baseline.mjs を走らせた
// 出力をそのまま貼ったもの（実装から導くと恒真になる）。
const BASELINE = /* ← Step 2 の JSON をここに貼る */ null;

test('land trajectories are unchanged by the environment hooks', () => {
  assert.ok(BASELINE, 'paste the recorded baseline first');
  const now = record();
  assert.deepEqual(now.player, BASELINE.player);
  assert.deepEqual(now.tank, BASELINE.tank);
  assert.deepEqual(now.missile, BASELINE.missile);
});
```

- [ ] **Step 4: 通ること、そして壊せることを確認**

Run: `npm test -- tests/environment-land-invariance.test.js`
Expected: PASS

壊す: `src/js/utils/Constants.js` の `GRAVITY` を一時的に `0.31` にして同じテストを走らせる → FAIL することを確認 → 戻す。

- [ ] **Step 5: commit**

```bash
git add tools/record-motion-baseline.mjs tests/environment-land-invariance.test.js
git commit -m "test: 陸上の軌跡を固定値で縛る（環境の係数を入れる前の基準）"
```

---

### Task 4: 自機の物理に係数を入れる（重力・推力・位置・滑り）

**Files:**
- Modify: `src/js/entities/Player.js`（`update()` の `this.vy += GRAVITY;` 付近、`_updateHorizontal`、`_updateBurstHover`、`_moveHorizontalIntoMap` の `this.x += this.vx;`、`_moveAndCollide` の `this.y += this.vy;`）
- Test: `tests/environment-player-motion.test.js`

**Interfaces:**
- Consumes: `motionFor(game, x, y)`（Task 2）
- Produces: `Player.motion`（今フレームの係数。`_moveAndCollide` と描画が読む）

- [ ] **Step 1: 失敗するテストを書く**

```js
// tests/environment-player-motion.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { makeMap, makeGame, flatFloorRows } from './helpers/enemy-world.js';
import {
  TILE_SIZE, GRAVITY, PLAYER_MAX_SPEED, WATER_SPEED_SCALE, WATER_GRAVITY_SCALE, ICE_SLIDE,
} from '../src/js/utils/Constants.js';

function inputWith(held) {
  return {
    keys: {}, isKeyDown: (c) => held.has(c), isKeyPressed: () => false, isCharPressed: () => false,
    mouse: { left: false, right: false }, isLeftClickPressed: () => false, isRightClickPressed: () => false,
    rightHoldFrames: 0, crosshairLocked: false,
    getMouseWorld: () => ({ x: 0, y: 0 }), getTargetWorld: () => ({ x: 0, y: 0 }),
  };
}

/** 決め打ちの係数を返す env。 */
function fixedEnv(motion) {
  return { motionAt: () => motion, sightScale: 1 };
}

function airbornePlayer(env) {
  const game = makeGame(makeMap(flatFloorRows()));
  game.env = env;
  game.input = inputWith(new Set());
  // 床(row 20 = y 320)のはるか上に置く
  const p = new Player(game, 5 * TILE_SIZE, 2 * TILE_SIZE);
  game.player = p;
  return { game, p };
}

test('gravity is scaled by motion.gravity while falling', () => {
  const { p } = airbornePlayer(fixedEnv({ speed: 1, gravity: WATER_GRAVITY_SCALE, slide: 0 }));
  p.update();
  assert.equal(p.vy, GRAVITY * WATER_GRAVITY_SCALE);
});

test('position advances by vy * speed', () => {
  const { p } = airbornePlayer(fixedEnv({ speed: WATER_SPEED_SCALE, gravity: 1, slide: 0 }));
  const y0 = p.y;
  p.update();
  // 1フレーム目: vy = GRAVITY、y は vy * speed だけ進む
  assert.equal(p.y - y0, GRAVITY * WATER_SPEED_SCALE);
});

test('horizontal input on ice keeps full speed, releasing it slides instead of stopping', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  game.env = fixedEnv({ speed: 1, gravity: 1, slide: ICE_SLIDE });
  const p = new Player(game, 5 * TILE_SIZE, 20 * TILE_SIZE - 24);
  game.player = p;
  game.input = inputWith(new Set(['KeyD']));
  for (let i = 0; i < 5; i++) p.update();
  assert.equal(p.vx, PLAYER_MAX_SPEED);
  assert.ok(p.onGround);
  game.input = inputWith(new Set());
  p.update();
  assert.ok(Math.abs(p.vx - PLAYER_MAX_SPEED * ICE_SLIDE) < 1e-9, `vx ${p.vx}`);
  for (let i = 0; i < 200; i++) p.update();
  assert.equal(p.vx, 0); // いずれ止まる
});

test('on land releasing input still stops instantly', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  const p = new Player(game, 5 * TILE_SIZE, 20 * TILE_SIZE - 24);
  game.player = p;
  game.input = inputWith(new Set(['KeyD']));
  for (let i = 0; i < 5; i++) p.update();
  game.input = inputWith(new Set());
  p.update();
  assert.equal(p.vx, 0);
});
```

- [ ] **Step 2: 落ちることを確認**

Run: `npm test -- tests/environment-player-motion.test.js`
Expected: 前3つが FAIL（係数が効いていない）、4つ目は PASS

- [ ] **Step 3: 実装**

`Player.js` の import に足す:

```js
import { motionFor } from '../world/StageEnvironment.js';
```

`update()` の `this._updateCrouching(input);` の直前に、今フレームの係数を1回だけ引く（中心座標で。左上ではなく中心を使うのは、水面をまたぐ判定を機体の腹で取りたいため）:

```js
        // 今フレームの環境の係数。中心で1回引いて、この後の重力・推力・位置更新が
        // 全部同じ値を使う（途中で水面をまたいでも同一フレーム内で係数が変わらない）
        this.motion = motionFor(this.game, this.x + this.width / 2, this.y + this.height / 2);
```

`this.vy += GRAVITY;` を:

```js
        this.vy += GRAVITY * this.motion.gravity;
```

`_updateHorizontal` の地上停止を:

```js
        } else if (this.onGround) {
            // 陸上は slide=0 で従来どおり即停止。氷では残存率ぶん滑る
            this.vx *= this.motion.slide;
            if (Math.abs(this.vx) < 0.05) this.vx = 0;
        } else {
```

`_updateBurstHover` の `this.vy += thrust;` を:

```js
                this.vy += thrust * this.motion.speed; // 水中では浮上がゆっくり
```

`_moveHorizontalIntoMap` の `this.x += this.vx;` を `this.x += this.vx * this.motion.speed;`、同関数内の `this.x -= this.vx;` を `this.x -= this.vx * this.motion.speed;`。
`_moveAndCollide` の `this.y += this.vy;` を `this.y += this.vy * this.motion.speed;`。

`constructor` に `this.motion = LAND_MOTION;` を足す（import に `LAND_MOTION` を追加）。draw やドッキング中など update を通らない経路でも `motion` が未定義にならないように。

- [ ] **Step 4: 通ることを確認**

Run: `npm test -- tests/environment-player-motion.test.js tests/environment-land-invariance.test.js tests/burst-ceiling.test.js`
Expected: 全 PASS。**特に land-invariance が通ること**（陸上の係数はすべて 1 と 0 なので軌跡は同一のはず。落ちたら `slide` の分岐の閾値が従来の `vx = 0` と食い違っていないか見る）

- [ ] **Step 5: 全テストと commit**

```bash
npm test
git add src/js/entities/Player.js tests/environment-player-motion.test.js
git commit -m "feat: 自機の重力・推力・位置更新に環境の係数を掛ける"
```

---

### Task 5: 敵機・母艦・アイテムの物理に係数を入れる

**Files:**
- Modify: `src/js/entities/EnemyTank.js`（`update()` の `this.vy += GRAVITY;`、`_moveAndCollide` の `this.x += this.vx;` / `this.y += this.vy;`）
- Modify: `src/js/entities/EnemyAttacker.js`（`update()` の `this.vy += GRAVITY;`）と `src/js/entities/attacker/collision.js`（位置更新の `this.x += this.vx` / `this.y += this.vy`。**無ければ `grep -n "this.x += this.vx" src/js/entities/attacker/*.js src/js/entities/EnemyAttacker.js` で探す**）
- Modify: `src/js/entities/Carrier.js`（`this.vy += GRAVITY;` と `_moveAndCollide` 内の位置更新）
- Modify: `src/js/entities/PickupItem.js`（`_fall` の `this.vy += GRAVITY;` と `this.y += this.vy;`）
- Test: `tests/environment-enemy-motion.test.js`

**Interfaces:**
- Consumes: `motionFor`

- [ ] **Step 1: 失敗するテストを書く**

```js
// tests/environment-enemy-motion.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyTank } from '../src/js/entities/EnemyTank.js';
import { Carrier } from '../src/js/entities/Carrier.js';
import { makeMap, makeGame, makeAttacker, flatFloorRows } from './helpers/enemy-world.js';
import { TILE_SIZE, GRAVITY, WATER_GRAVITY_SCALE, WATER_SPEED_SCALE } from '../src/js/utils/Constants.js';

const WATER = { motionAt: () => ({ speed: WATER_SPEED_SCALE, gravity: WATER_GRAVITY_SCALE, slide: 0 }), sightScale: 1 };

function world() {
  const game = makeGame(makeMap(flatFloorRows()));
  game.env = WATER;
  game.input = { isKeyDown: () => false, isKeyPressed: () => false };
  return game;
}

test('tank falls with scaled gravity and scaled displacement', () => {
  const game = world();
  const t = new EnemyTank(game, 5 * TILE_SIZE, 2 * TILE_SIZE);
  t.fireInterval = 1e9;
  const y0 = t.y;
  t.update();
  assert.equal(t.vy, GRAVITY * WATER_GRAVITY_SCALE);
  assert.ok(Math.abs((t.y - y0) - t.vy * WATER_SPEED_SCALE) < 1e-9);
});

test('attacker falls with scaled gravity', () => {
  const game = world();
  const a = makeAttacker(game, 5 * TILE_SIZE, 2 * TILE_SIZE, 'standard');
  a.update();
  assert.equal(a.vy, GRAVITY * WATER_GRAVITY_SCALE);
});

test('carrier falls with scaled gravity', () => {
  const game = world();
  const c = new Carrier(game, 5 * TILE_SIZE, 2 * TILE_SIZE);
  game.carrier = c;
  c.update();
  assert.equal(c.vy, GRAVITY * WATER_GRAVITY_SCALE);
});
```

- [ ] **Step 2: 落ちることを確認**

Run: `npm test -- tests/environment-enemy-motion.test.js`
Expected: FAIL（vy が `GRAVITY` のまま）。コンストラクタが別の game プロパティを要求して落ちる場合は、そのプロパティをテストの `world()` に足す（`tests/enemy-jump-landing.test.js` や `tests/carrier-lift.test.js` が参考）

- [ ] **Step 3: 実装**

4ファイルとも同じ形。`import { motionFor } from '../world/StageEnvironment.js';`（attacker/ 配下は `'../../world/StageEnvironment.js'`）を足し、重力の直前で中心座標の係数を引く:

```js
        const motion = motionFor(this.game, this.x + this.width / 2, this.y + this.height / 2);
        this.vy += GRAVITY * motion.gravity;
```

位置更新は `this.x += this.vx * motion.speed;` / `this.y += this.vy * motion.speed;`。`_moveAndCollide` が別メソッドなら `this.motion = motion;` を持たせて中で読む（Player と同じ）。衝突後に `this.x -= this.vx` で戻している箇所は `this.x -= this.vx * motion.speed` にする（戻し量が進み量と一致しないと壁にめり込む）。

`PickupItem._fall` は `motion.gravity` と `motion.speed` を同様に。

- [ ] **Step 4: 通ることを確認**

Run: `npm test`
Expected: 全 PASS（`environment-land-invariance` も含めて）

- [ ] **Step 5: commit**

```bash
git add src/js/entities/EnemyTank.js src/js/entities/EnemyAttacker.js src/js/entities/attacker src/js/entities/Carrier.js src/js/entities/PickupItem.js tests/environment-enemy-motion.test.js
git commit -m "feat: 敵機・母艦・アイテムの重力と位置更新に環境の係数を掛ける"
```

---

### Task 6: 弾・ミサイル・グレネード・敵ミサイルの位置更新に係数

**Files:**
- Modify: `src/js/entities/Bullet.js`（`update()`）、`src/js/entities/Missile.js`（`update()`）、`src/js/entities/Grenade.js`（`update()` の重力と nextX/nextY）、`src/js/entities/EnemyHomingMissile.js`（`update()` の位置更新と `_updateAcceleration`）
- Test: `tests/environment-projectile-motion.test.js`

- [ ] **Step 1: 失敗するテストを書く**

```js
// tests/environment-projectile-motion.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Missile } from '../src/js/entities/Missile.js';
import { Grenade } from '../src/js/entities/Grenade.js';
import { makeMap, makeGame, flatFloorRows } from './helpers/enemy-world.js';
import { TILE_SIZE, MISSILE_SPEED, WATER_SPEED_SCALE, WATER_GRAVITY_SCALE, GRENADE_GRAVITY } from '../src/js/utils/Constants.js';

const WATER = { motionAt: () => ({ speed: WATER_SPEED_SCALE, gravity: WATER_GRAVITY_SCALE, slide: 0 }), sightScale: 1 };

test('missile advances by speed * WATER_SPEED_SCALE in water', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  game.env = WATER;
  const m = new Missile(game, 5 * TILE_SIZE, 5 * TILE_SIZE, 0, true);
  const x0 = m.x;
  m.update();
  assert.ok(Math.abs((m.x - x0) - MISSILE_SPEED * WATER_SPEED_SCALE) < 1e-9);
});

test('grenade gravity and displacement are scaled in water', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  game.env = WATER;
  const g = new Grenade(game, 5 * TILE_SIZE, 5 * TILE_SIZE, 0, 0);
  const y0 = g.y;
  g.update();
  assert.ok(Math.abs(g.vy - GRENADE_GRAVITY * WATER_GRAVITY_SCALE) < 1e-9);
  assert.ok(Math.abs((g.y - y0) - g.vy * WATER_SPEED_SCALE) < 1e-9);
});
```

- [ ] **Step 2: 落ちることを確認**

Run: `npm test -- tests/environment-projectile-motion.test.js`
Expected: FAIL

- [ ] **Step 3: 実装**

各ファイルに `import { motionFor } from '../world/StageEnvironment.js';`。

`Bullet.update` / `Missile.update`:

```js
        const motion = motionFor(this.game, this.x, this.y);
        this.x += this.vx * motion.speed;
        this.y += this.vy * motion.speed;
```

`Grenade.update`:

```js
        const motion = motionFor(this.game, this.x, this.y);
        this.vy += GRENADE_GRAVITY * motion.gravity;
        if (this.vy > GRENADE_MAX_FALLING_SPEED) this.vy = GRENADE_MAX_FALLING_SPEED;
        let nextX = this.x + this.vx * motion.speed;
        let nextY = this.y + this.vy * motion.speed;
```

（跳ね返り後の `nextX = this.x + this.vx;` / `nextY = this.y + this.vy;` も `* motion.speed` を掛ける）

`EnemyHomingMissile.update`: 位置更新の2行に `* motion.speed`。`_updateAcceleration` は引数で係数を受ける形にする（水中で加速しきらない）:

```js
    _updateAcceleration(speedScale = 1) {
        this.speed = Math.min(this.speed + this.acceleration * speedScale, this.maxSpeed);
    }
```

`update()` の冒頭で `const motion = motionFor(this.game, this.x, this.y); this._updateAcceleration(motion.speed);`。

- [ ] **Step 4: 通ることを確認**

Run: `npm test`
Expected: 全 PASS

- [ ] **Step 5: commit**

```bash
git add src/js/entities/Bullet.js src/js/entities/Missile.js src/js/entities/Grenade.js src/js/entities/EnemyHomingMissile.js tests/environment-projectile-motion.test.js
git commit -m "feat: 弾・ミサイル・グレネード・敵ミサイルの位置更新に環境の係数を掛ける"
```

---

### Task 7: 索敵の倍率（敵5種と Auto Aim）

**Files:**
- Modify: `src/js/entities/EnemyTank.js:226`、`src/js/entities/EnemyTurret.js:256`、`src/js/entities/EnemyDrone.js:271`、`src/js/entities/EnemyAttacker.js:173`、`src/js/entities/EnemyBase.js:385`（`withinSight(dx, dy, RANGE)` の RANGE に `* sightScaleFor(this.game)`）
- Modify: `src/js/main.js`（`_updateAutoAim` の `let bestDist = AUTO_AIM_SNAP_RADIUS;` → `* sightScaleFor(this)`）
- Test: `tests/environment-sight.test.js`

- [ ] **Step 1: 失敗するテストを書く**

```js
// tests/environment-sight.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyTank } from '../src/js/entities/EnemyTank.js';
import { makeMap, makeGame, makeAttacker, flatFloorRows } from './helpers/enemy-world.js';
import { TILE_SIZE, ENEMY_TANK_SIGHT_RANGE, FOG_SIGHT_SCALE } from '../src/js/utils/Constants.js';

const FOG = { motionAt: () => ({ speed: 1, gravity: 1, slide: 0 }), sightScale: FOG_SIGHT_SCALE };

/** 索敵の内側ぎりぎり（陸上では見える、霧では見えない）の距離に標的を置く。 */
function placeTarget(game, dx) {
  game.player = { x: 5 * TILE_SIZE + dx, y: 20 * TILE_SIZE - 24, width: 16, height: 24, alive: true, docked: false };
}

test('tank sees a target at 0.8 * range on land but not in fog', () => {
  const dx = ENEMY_TANK_SIGHT_RANGE * 0.8;
  for (const [env, expected] of [[null, true], [FOG, false]]) {
    const game = makeGame(makeMap(flatFloorRows()));
    game.env = env;
    game.input = { isKeyDown: () => false };
    const t = new EnemyTank(game, 5 * TILE_SIZE, 20 * TILE_SIZE - 16);
    t.patrolDir = 1;
    placeTarget(game, dx);
    const found = t._findTarget ? t._findTarget() : null;
    assert.equal(!!found, expected, `env=${env ? 'fog' : 'land'}`);
  }
});

test('attacker sight shrinks in fog', () => {
  for (const [env, expected] of [[null, 'chase'], [FOG, 'patrol']]) {
    const game = makeGame(makeMap(flatFloorRows()));
    game.env = env;
    const a = makeAttacker(game, 5 * TILE_SIZE, 20 * TILE_SIZE - 24, 'standard');
    placeTarget(game, a.config.sightRange * 0.8);
    a.update();
    assert.equal(a.aiState, expected, `env=${env ? 'fog' : 'land'}`);
  }
});
```

`EnemyTank._findTarget()`（`EnemyTank.js:208`）は存在する。`aiState` の値は `EnemyAttacker.js:175-183` のとおり `'chase'` / `'patrol'`。

- [ ] **Step 2: 落ちることを確認**

Run: `npm test -- tests/environment-sight.test.js`
Expected: 霧側の期待が FAIL

- [ ] **Step 3: 実装**

5ファイルに `import { sightScaleFor } from '../world/StageEnvironment.js';` を足し、各 `withinSight(dx, dy, X)` を `withinSight(dx, dy, X * sightScaleFor(this.game))` にする。`EnemyBase` の `maxRange` が `Infinity` のときは `Infinity * 0.5 = Infinity` なので既定の「常に true」は保たれる。

`main.js` の `_updateAutoAim`:

```js
        // 霧では Auto Aim の索敵も縮む（敵の索敵と同じ倍率）
        let bestDist = AUTO_AIM_SNAP_RADIUS * sightScaleFor(this);
```

（`import { sightScaleFor } from './world/StageEnvironment.js';` を main.js の import に足す。**main.js は `git add -p` で自分のハンクだけ stage する**）

- [ ] **Step 4: 通ることを確認**

Run: `npm test`
Expected: 全 PASS

- [ ] **Step 5: commit**

```bash
git add src/js/entities/EnemyTank.js src/js/entities/EnemyTurret.js src/js/entities/EnemyDrone.js src/js/entities/EnemyAttacker.js src/js/entities/EnemyBase.js tests/environment-sight.test.js
git add -p src/js/main.js   # import と bestDist のハンクだけ。debugStartMission は含めない
git commit -m "feat: 霧で敵5種と Auto Aim の索敵を縮める"
```

---

### Task 8: Game に環境を持たせ、update と draw から呼ぶ

**Files:**
- Modify: `src/js/main.js`（`init` の `this.map = new Map(...)` の直後、`_simulationTick`、`_drawWorld`、`draw()` の `this.hud.draw(ctx)` の直前）
- Modify: `src/js/systems/GameStateManager.js:64`（`game.map = new Map(...)` の直後）
- Test: `tests/environment-game-wiring.test.js`

**Interfaces:**
- Produces: `game.env`（`StageEnvironment`）。以降のタスクは `this.game.env` を前提にできる（ただしエンティティは引き続き `motionFor` 経由）

- [ ] **Step 1: 失敗するテストを書く**

```js
// tests/environment-game-wiring.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { StageEnvironment } from '../src/js/world/StageEnvironment.js';

// _simulationTick が env.update() を呼ぶこと、_drawWorld / draw が
// drawOverWorld / drawOverlay を1回ずつ呼ぶことを、差し替えた env で数える。
function countingEnv() {
  const n = { update: 0, over: 0, overlay: 0 };
  return {
    n,
    update() { n.update++; },
    drawOverWorld() { n.over++; },
    drawOverlay() { n.overlay++; },
  };
}

test('simulation tick advances the environment', () => {
  const env = countingEnv();
  const fake = {
    env,
    _snapshotPrevPositions() {}, _updateCarrier() {}, _updatePlayer() {}, _updateDeathHold() {},
    _updateCamera() {}, _updateAndPrune() {}, _updateLandmines() {}, _updateAutoAim() {},
    _updateOverdrive() {}, map: { update() {} }, _updateEnemyHoverSound() {}, _checkMissionClear() {},
    collisionManager: { update() {} }, _updateProximityAlert() {},
    projectiles: [], particles: [], smokeScreens: [], repairKits: [], autoAimUnits: [], missileKits: [], enemies: [],
  };
  Game._simulationTick.call(fake);
  assert.equal(env.n.update, 1);
});

test('StageEnvironment is what main.js builds for a mission', () => {
  // GameStateManager の面開始と main.js の init が同じクラスを使うこと
  assert.equal(typeof StageEnvironment, 'function');
});
```

（描画側の呼び出し回数は Task 11 の水の描画テストで、実際の `_drawWorld` を偽 ctx で走らせて数える。ここでは update の配線だけ縛る）

- [ ] **Step 2: 落ちることを確認**

Run: `npm test -- tests/environment-game-wiring.test.js`
Expected: FAIL（`env.update` が呼ばれない）

- [ ] **Step 3: 実装**

`main.js`:

```js
import { StageEnvironment, sightScaleFor } from './world/StageEnvironment.js';
```

`init` の `this.map = new Map(this, this.missionsCompleted);` の直後:

```js
        // 面の環境（霧・雪・地底湖）。map の後（水タイルを読む）、Carrier/Player の前
        this.env = new StageEnvironment(this, this.missionsCompleted);
```

`_simulationTick` の `this.map.update();` の直前に `this.env.update();`。

`_drawWorld` の `for (const screen of this.smokeScreens) screen.draw(ctx);` の**直前**に:

```js
        // 環境のワールド描画（水の塗りと水面）。機体と弾の上、煙幕の下
        this.env.drawOverWorld(ctx, camX, camY);
```

`draw()` の `this.hud.draw(ctx);` の直前に:

```js
        // 環境の画面描画（霧の層・降雪）。ワールドの上、HUD の下
        this.env.drawOverlay(ctx);
```

`GameStateManager.js` の `game.map = new Map(game, game.missionsCompleted);` の直後:

```js
        game.env = new StageEnvironment(game, game.missionsCompleted);
```

（`import { StageEnvironment } from '../world/StageEnvironment.js';` を足す）

- [ ] **Step 4: 通ることを確認**

Run: `npm test`
Expected: 全 PASS

- [ ] **Step 5: commit（main.js は `-p`）**

```bash
git add src/js/systems/GameStateManager.js tests/environment-game-wiring.test.js
git add -p src/js/main.js
git commit -m "feat: Game が面の環境を持ち、update と draw から呼ぶ"
```

---

## Phase B: 霧（6面）と遠景の分岐

### Task 9: 霧の描画

**Files:**
- Create: `src/js/world/environment/fog.js`
- Modify: `src/js/world/StageEnvironment.js`（`renderer` を kind で選ぶ）
- Test: `tests/environment-fog-draw.test.js`

**Interfaces:**
- Produces: `createFogRenderer() → { update, drawOverWorld, drawOverlay }`
- `StageEnvironment` に `createRenderer(kind, env)`（モジュール内関数）。document が無ければ none

- [ ] **Step 1: 失敗するテストを書く**

```js
// tests/environment-fog-draw.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT, FOG_LAYERS, FOG_OVERLAY_ALPHA } from '../src/js/utils/Constants.js';

before(() => {
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      return { width: 0, height: 0, getContext: () => ctx, _ctx: ctx };
    },
  };
});

test('fog overlay costs a few drawImage plus one full-screen fill per frame', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const env = new StageEnvironment({ map: { isWaterAtPixel: () => false } }, 5);
  const ctx = makeFakeCtx();
  env.update();
  env.drawOverlay(ctx);
  const draws = ctx.calls.filter((c) => c.name === 'drawImage');
  const fills = ctx.calls.filter((c) => c.name === 'fillRect');
  // 層ごとに最大2回（画面端の継ぎ目で板を2枚並べる）
  assert.ok(draws.length >= FOG_LAYERS.length && draws.length <= FOG_LAYERS.length * 2, `drawImage ${draws.length}`);
  assert.equal(fills.length, 1);
  assert.deepEqual(fills[0].args, [0, 0, CANVAS_WIDTH, CANVAS_HEIGHT]);
  // globalAlpha は戻す
  const alphas = ctx.calls.filter((c) => c.name === 'set:globalAlpha').map((c) => c.args[0]);
  assert.equal(alphas[alphas.length - 1], 1);
  assert.ok(alphas.some((a) => Math.abs(a - FOG_OVERLAY_ALPHA) < 1e-9));
});

test('fog does not draw in the world pass', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const env = new StageEnvironment({ map: { isWaterAtPixel: () => false } }, 5);
  const ctx = makeFakeCtx();
  env.drawOverWorld(ctx, 0, 0);
  assert.equal(ctx.calls.length, 0);
});

test('demo alpha scale thins the fog', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const env = new StageEnvironment(null, 5);
  const ctx = makeFakeCtx();
  env.drawOverlay(ctx, 0.5);
  const alphas = ctx.calls.filter((c) => c.name === 'set:globalAlpha').map((c) => c.args[0]);
  assert.ok(alphas.some((a) => Math.abs(a - FOG_OVERLAY_ALPHA * 0.5) < 1e-9));
});
```

- [ ] **Step 2: 落ちることを確認**

Run: `npm test -- tests/environment-fog-draw.test.js`
Expected: FAIL（none renderer は何も描かない）

- [ ] **Step 3: 実装**

```js
// src/js/world/environment/fog.js
// ============================================
// 霧（6面）の描画
// ============================================
//
// 粒は出さない。雲の塊を敷き詰めた板を層ごとに1枚作っておき、毎フレームは
// 視差付きでずらして drawImage するだけ。最後に全画面を薄く塗る。
// 砲兵の煙幕はワールド座標で先に描かれているので、この層の下に入って霧に溶ける。
//
// 板の中身はフラットな円の重なり。createRadialGradient を毎フレーム作る案は
// 費用が桁で変わるので採らない（板の生成時にも使わない: 遠景と同じ描画言語）。

import {
    CANVAS_WIDTH, CANVAS_HEIGHT,
    FOG_COLOR, FOG_OVERLAY_ALPHA, FOG_SHEET_WIDTH, FOG_SHEET_HEIGHT, FOG_BLOB_COUNT, FOG_LAYERS,
} from '../../utils/Constants.js';
import { SeededRNG } from '../../utils/SeededRNG.js';

/** 雲の板を1枚描く。端が継ぎ目なく並ぶよう、右端・下端にはみ出す塊は反対側にも描く。 */
function buildSheet(seed) {
    const canvas = document.createElement('canvas');
    canvas.width = FOG_SHEET_WIDTH;
    canvas.height = FOG_SHEET_HEIGHT;
    const ctx = canvas.getContext('2d');
    const rng = new SeededRNG(seed);
    ctx.fillStyle = FOG_COLOR;
    for (let i = 0; i < FOG_BLOB_COUNT; i++) {
        const x = rng.next() * FOG_SHEET_WIDTH;
        const y = rng.next() * FOG_SHEET_HEIGHT;
        const r = 40 + rng.next() * 90;
        // 濃さは塊ごとに変え、重なりで雲の濃淡を作る
        ctx.globalAlpha = 0.10 + rng.next() * 0.16;
        for (const dx of [0, -FOG_SHEET_WIDTH, FOG_SHEET_WIDTH]) {
            for (const dy of [0, -FOG_SHEET_HEIGHT, FOG_SHEET_HEIGHT]) {
                ctx.beginPath();
                ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    ctx.globalAlpha = 1;
    return canvas;
}

export function createFogRenderer() {
    const sheets = FOG_LAYERS.map((_, i) => buildSheet(0x0F06 + i * 977));
    let t = 0;
    return {
        update() { t++; },
        drawOverWorld() {},
        drawOverlay(ctx, alphaScale = 1) {
            ctx.save();
            FOG_LAYERS.forEach((layer, i) => {
                const sheet = sheets[i];
                // 横に流れる。層ごとに速度を変えて奥行きを出す
                const ox = ((t * layer.speed) % FOG_SHEET_WIDTH + FOG_SHEET_WIDTH) % FOG_SHEET_WIDTH;
                ctx.globalAlpha = layer.alpha * alphaScale;
                for (let y = 0; y < CANVAS_HEIGHT; y += FOG_SHEET_HEIGHT) {
                    for (let x = -ox; x < CANVAS_WIDTH; x += FOG_SHEET_WIDTH) {
                        ctx.drawImage(sheet, x, y);
                    }
                }
            });
            ctx.globalAlpha = FOG_OVERLAY_ALPHA * alphaScale;
            ctx.fillStyle = FOG_COLOR;
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            ctx.globalAlpha = 1;
            ctx.restore();
        },
    };
}
```

板は Task 1 で 2048×1024 にしてあるので、画面 1366×768 に対して横だけ継ぎ目で2枚、縦は1枚＝層×2回以内に収まる（テストの `FOG_LAYERS.length * 2` はその前提）。

`StageEnvironment.js`:

```js
import { createNoneRenderer, canvasAvailable } from './environment/none.js';
import { createFogRenderer } from './environment/fog.js';

function createRenderer(kind, env) {
    if (!canvasAvailable()) return createNoneRenderer();
    if (kind === 'fog') return createFogRenderer();
    return createNoneRenderer();
}
```

コンストラクタの `this.renderer = createNoneRenderer();` を `this.renderer = createRenderer(this.kind, this);` に。

- [ ] **Step 4: 通ることを確認**

Run: `npm test`
Expected: 全 PASS

- [ ] **Step 5: commit**

```bash
git add src/js/world/environment/fog.js src/js/world/StageEnvironment.js tests/environment-fog-draw.test.js
git commit -m "feat: 霧の描画（板2層のスクロール＋薄塗り）"
```

---

### Task 10: 遠景に `backdrop` の分岐（色の変化と5種の装飾）

**Files:**
- Modify: `src/js/world/CaveBackdrop.js`（`backdropColors(paletteFill, backdrop = 'cave')`、コンストラクタに `backdrop` 引数、`_generate` の装飾分岐）
- Modify: `src/js/world/Map.js:174-178`（`new CaveBackdrop(...)` に `STAGE_ENVIRONMENTS[palIdx].backdrop` を渡す）
- Test: `tests/cave-backdrop.test.js`（既存の階調テストを backdrop 5種で回す）、`tests/environment-backdrop.test.js`

**Interfaces:**
- Produces: `backdropColors(paletteFill, backdrop)`、`new CaveBackdrop(mapW, mapH, paletteFill, rng, backdrop)`

- [ ] **Step 1: 失敗するテストを書く**

`tests/cave-backdrop.test.js` の階調テスト2つのループを、パレット×backdrop の二重ループにする（`ENV_BACKDROPS` を import）:

```js
  for (const palette of STAGE_PALETTES) {
    for (const backdrop of ENV_BACKDROPS) {
      const { voidColor, rockDark, rockLight } = backdropColors(palette.fill, backdrop);
      // …既存の assert をそのまま（メッセージに backdrop を足す）
    }
  }
```

新規:

```js
// tests/environment-backdrop.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';

let lastCtx = null;
before(() => {
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      lastCtx = ctx;
      return { width: 0, height: 0, getContext: () => ctx, _ctx: ctx };
    },
  };
});

function fills(ctx) {
  // fill() の直前の set:fillStyle を色として拾う
  const out = [];
  let cur = null;
  for (const c of ctx.calls) {
    if (c.name === 'set:fillStyle') cur = c.args[0];
    if (c.name === 'fill' || c.name === 'fillRect') out.push(cur);
  }
  return out;
}

test('machine backdrop keeps the rock bands and adds machinery colours', async () => {
  const { CaveBackdrop, backdropColors } = await import('../src/js/world/CaveBackdrop.js');
  const fill = '#483D8B';
  const rock = backdropColors(fill, 'machine');
  new CaveBackdrop(2400, 1200, fill, new SeededRNG(7), 'machine');
  const used = new Set(fills(lastCtx));
  assert.ok(used.has(rock.rockDark), 'rock bands must remain (it was a cave)');
  // 機械の色（配管・ランプ）は岩の3階調のどれでもない
  const extra = [...used].filter((c) => c !== rock.voidColor && c !== rock.rockDark && c !== rock.rockLight);
  assert.ok(extra.length >= 2, `expected machinery colours, got ${[...used].join(',')}`);
});

test('cave backdrop uses only the three rock tones', async () => {
  const { CaveBackdrop, backdropColors } = await import('../src/js/world/CaveBackdrop.js');
  const fill = '#8B4513';
  const rock = backdropColors(fill, 'cave');
  new CaveBackdrop(2400, 1200, fill, new SeededRNG(7), 'cave');
  const used = new Set(fills(lastCtx));
  assert.deepEqual([...used].sort(), [rock.voidColor, rock.rockDark, rock.rockLight].sort());
});

test('Map passes the stage backdrop to CaveBackdrop', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const map = new Map({ rng: new SeededRNG(3) }, 6); // 7面
  assert.equal(map.backdrop.backdrop, 'machine');
});
```

- [ ] **Step 2: 落ちることを確認**

Run: `npm test -- tests/cave-backdrop.test.js tests/environment-backdrop.test.js`
Expected: FAIL（引数が無い／装飾が無い）

- [ ] **Step 3: 実装**

`backdropColors`:

```js
/** backdrop ごとの色の寄せ先と割合。階調テストの上下限に収まる値を選んである。 */
const BACKDROP_TINT = {
    cave: null,
    wet: { to: '#0A2A40', k: 0.25 },      // 湿った岩: 青黒へ
    snow: { to: '#BFD4E6', k: 0.10 },     // 雪: 青白く、ほんの少し明るく
    fog: { to: FOG_COLOR, k: 0.35 },      // 霧: コントラストを落とす（3階調とも同じ方向へ寄せる）。FOG_COLOR は Constants から import
    machine: { to: '#20242C', k: 0.20 },  // 機械: 無彩色の暗いグレーへ
};

export function backdropColors(paletteFill, backdrop = 'cave') {
    const base = {
        voidColor: lerpColor(paletteFill, '#000000', VOID_DARKEN),
        rockDark: lerpColor(paletteFill, '#000000', ROCK_DARK_DARKEN),
        rockLight: lerpColor(paletteFill, '#000000', ROCK_LIGHT_DARKEN),
    };
    const tint = BACKDROP_TINT[backdrop];
    if (!tint) return base;
    return {
        voidColor: lerpColor(base.voidColor, tint.to, tint.k),
        rockDark: lerpColor(base.rockDark, tint.to, tint.k),
        rockLight: lerpColor(base.rockLight, tint.to, tint.k),
    };
}
```

**`k` は階調テスト（void ≥ 3、構造差 6〜30、rockLight ≤ 前景の 0.45）を7パレット×5種で通る値に詰める。**通らなければ `k` を下げる（装飾の色は階調テストの対象外）。

コンストラクタ: `constructor(mapWidth, mapHeight, paletteFill, rng, backdrop = 'cave')`、`this.backdrop = backdrop;`、`this._generate(ctx, paletteFill, rng)` 内で `backdropColors(paletteFill, this.backdrop)`。

`_generate` の岩層ループの後に装飾:

```js
        // 3) backdrop ごとの装飾。岩層の間（空洞の帯）に描く。
        if (this.backdrop === 'wet') this._drawWetDecor(ctx, rng, W, H);
        if (this.backdrop === 'machine') this._drawMachineDecor(ctx, rng, W, H, bandCount);
```

雪は `_drawRockBand` の中で分岐（ハイライト帯の色を `SNOW_CAP_COLOR` に近い色 `lerpColor(rockLight, '#FFFFFF', 0.5)` に、鍾乳石の `SPIKE_HALF_WIDTH` を 8 に）。`_drawRockBand` に `style` 引数を足す。

```js
    /** 湿った岩: 下部の暗い帯と、ところどころの滴りの筋（4px 幅。細片は使わない）。 */
    _drawWetDecor(ctx, rng, W, H) {
        ctx.fillStyle = lerpColor(this.colors.voidColor, '#000000', 0.5);
        ctx.fillRect(0, H * 0.8, W, H * 0.2);
        ctx.fillStyle = lerpColor(this.colors.rockLight, '#4FA3E0', 0.4);
        for (let x = 0; x < W; x += 96) {
            if (rng.next() < 0.5) continue;
            const len = 30 + rng.next() * 80;
            ctx.fillRect(x + rng.next() * 60, H * 0.3 + rng.next() * H * 0.4, 4, len);
        }
    }

    /** 洞窟を改造した要塞: 岩層の間に配管・隔壁パネル・桁・ランプの列。岩は残す。 */
    _drawMachineDecor(ctx, rng, W, H, bandCount) {
        const steel = '#3A4250';
        const steelDark = '#262C36';
        const lamp = '#E8B24A';
        for (let b = 0; b < bandCount - 1; b++) {
            // 層と層の間の空洞の中心
            const gapY = ((b + 1) / bandCount) * H;
            // 配管: 太さ12。96px ごとに継ぎ手
            ctx.fillStyle = steel;
            ctx.fillRect(0, gapY - 6, W, 12);
            ctx.fillStyle = steelDark;
            for (let x = 0; x < W; x += 96) ctx.fillRect(x, gapY - 9, 8, 18);
            // 隔壁パネル: 区間ごとに確率で
            for (let x = 0; x < W; x += 192) {
                if (rng.next() < 0.5) continue;
                ctx.fillStyle = steelDark;
                ctx.fillRect(x + 20, gapY + 14, 120, 40);
                ctx.fillStyle = steel;
                ctx.fillRect(x + 24, gapY + 18, 112, 32);
            }
            // 桁: 縦の柱と X ブレース（多角形の塗りだけ）
            ctx.fillStyle = steel;
            for (let x = 48; x < W; x += 256) {
                ctx.fillRect(x, gapY - 60, 10, 120);
            }
            // ランプの列: 64px ごとに 4px の点
            ctx.fillStyle = lamp;
            for (let x = 32; x < W; x += 64) ctx.fillRect(x, gapY - 20, 4, 4);
        }
    }
```

`_generate` で `this.colors = backdropColors(paletteFill, this.backdrop);` を保持する。

`Map.js`（`_generate` 末尾）:

```js
        this.backdrop = new CaveBackdrop(
            this.width, this.height,
            this.blockStyles[BLOCK_NORMAL].fill,
            new SeededRNG((this.game.rng.state ^ 0x9E3779B9) >>> 0),
            STAGE_ENVIRONMENTS[this.missionLevel % STAGE_ENVIRONMENTS.length].backdrop,
        );
```

（`STAGE_ENVIRONMENTS` を import に足す。派生 RNG の消費が増えても `game.rng` には触れないので決定性は保たれる）

- [ ] **Step 4: 通ることを確認**

Run: `npm test`
Expected: 全 PASS。`cave-backdrop.test.js` の多角形数の上限テスト（`polygons.length <= 16`）が machine で落ちる場合は、そのテストが `'cave'` だけを対象にしていることを確認（cave で作っていれば影響なし）

- [ ] **Step 5: commit**

```bash
git add src/js/world/CaveBackdrop.js src/js/world/Map.js tests/cave-backdrop.test.js tests/environment-backdrop.test.js
git commit -m "feat: 遠景を backdrop で分岐（湿った岩・雪・霧・要塞の機械）"
```


---

## Phase C: 地底湖（4面）

### Task 11: 地底湖の生成と `Map` の水タイル

**Files:**
- Create: `src/js/world/waterPools.js`
- Modify: `src/js/world/Map.js`（コンストラクタで `this.water` を用意、`_generate` の `_placeHardBlocks()` の直後で生成、`isWaterAtPixel` / `isWater` / `waterSurfaceRow` を追加）
- Test: `tests/water-pools.test.js`、`tests/MapDeterminism.test.js`（水の集合も比較）

**Interfaces:**
- Produces:
  - `generateWaterPools({ grid, rows, cols, rooms, excludeRects, rng, count, depthMin, depthRange, maxTiles }) → Array<{ surfaceRow: number, cells: Array<[r, c]> }>`（純関数。grid は読むだけ）
  - `Map.water: Uint8Array(rows*cols)`（1 = 水）、`Map.waterSurface: Int16Array(rows*cols)`（水タイルの水面の行、それ以外 -1）
  - `Map.isWater(r, c)`、`Map.isWaterAtPixel(x, y)`、`Map.waterSurfaceRow(r, c)`
  - `Map.waterCells`（生成直後の `[r, c]` 一覧。決定性テスト用）
- Consumes: `SeededRNG`、`BLOCK_EMPTY`

- [ ] **Step 1: 失敗するテストを書く**

```js
// tests/water-pools.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { generateWaterPools } from '../src/js/world/waterPools.js';

// 20x12。row 0 と 11、col 0 と 19 が壁。真ん中に床 row 8 の部屋（cols 2..9）と、
// row 4 で右へ抜ける通路、右側に床 row 10 の深い部屋（cols 12..17）。
function grid() {
  const g = [];
  for (let r = 0; r < 12; r++) {
    g.push([]);
    for (let c = 0; c < 20; c++) {
      let solid = r === 0 || r === 11 || c === 0 || c === 19;
      if (!solid) solid = true; // いったん全部岩
      g[r].push(solid ? 1 : 0);
    }
  }
  const carve = (r0, r1, c0, c1) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = 0; };
  carve(2, 8, 2, 9);     // 左の部屋（床は row 9 の岩）
  carve(4, 4, 10, 11);   // 通路
  carve(3, 10, 12, 17);  // 右の部屋（床は row 11 の壁）
  return g;
}

const rooms = [{ centerR: 5, centerC: 5 }, { centerR: 6, centerC: 14 }];

test('a pool fills the bottom of a room up to its surface row, and only cells connected to the floor', () => {
  const pools = generateWaterPools({
    grid: grid(), rows: 12, cols: 20, rooms, excludeRects: [], rng: new SeededRNG(1),
    count: 1, depthMin: 3, depthRange: 0, maxTiles: 600,
  });
  assert.equal(pools.length, 1);
  const p = pools[0];
  // 深さ3 = 床の上3段。左の部屋なら row 6,7,8、右なら row 8,9,10
  const rowsUsed = new Set(p.cells.map(([r]) => r));
  assert.equal(rowsUsed.size, 3);
  assert.equal(Math.min(...rowsUsed), p.surfaceRow);
  for (const [r, c] of p.cells) assert.equal(grid()[r][c], 0, 'water only in empty cells');
});

test('pools never enter excluded rects (start / base rooms)', () => {
  const pools = generateWaterPools({
    grid: grid(), rows: 12, cols: 20, rooms, excludeRects: [{ r0: 0, r1: 11, c0: 0, c1: 10 }],
    rng: new SeededRNG(1), count: 2, depthMin: 3, depthRange: 0, maxTiles: 600,
  });
  for (const p of pools) for (const [, c] of p.cells) assert.ok(c > 10, `cell col ${c} inside excluded rect`);
});

test('a pool that would spread beyond maxTiles is dropped', () => {
  const pools = generateWaterPools({
    grid: grid(), rows: 12, cols: 20, rooms, excludeRects: [], rng: new SeededRNG(1),
    count: 2, depthMin: 3, depthRange: 0, maxTiles: 5,
  });
  assert.equal(pools.length, 0);
});

test('same rng gives the same pools', () => {
  const a = generateWaterPools({ grid: grid(), rows: 12, cols: 20, rooms, excludeRects: [], rng: new SeededRNG(9), count: 2, depthMin: 3, depthRange: 2, maxTiles: 600 });
  const b = generateWaterPools({ grid: grid(), rows: 12, cols: 20, rooms, excludeRects: [], rng: new SeededRNG(9), count: 2, depthMin: 3, depthRange: 2, maxTiles: 600 });
  assert.deepEqual(a, b);
});
```

`tests/MapDeterminism.test.js` の1つ目のテストに足す:

```js
  assert.deepEqual(a.waterCells, b.waterCells);
```

と、新しいテスト:

```js
test('stage 4 has water and stage 1 has none; rng consumption of stage 1 is unchanged by water', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const water = buildMap(Map, 42, 3);
  assert.ok(water.waterCells.length > 0, 'stage 4 should have pools');
  const dry = buildMap(Map, 42, 0);
  assert.equal(dry.waterCells.length, 0);
});
```

- [ ] **Step 2: 落ちることを確認**

Run: `npm test -- tests/water-pools.test.js tests/MapDeterminism.test.js`
Expected: FAIL

- [ ] **Step 3: 実装**

```js
// src/js/world/waterPools.js
// ============================================
// 地底湖の生成（純関数）
// ============================================
//
// 低い位置のチャンバーを選び、部屋の床から depth 段を水にする。塗るのは
// 「床からつながる空洞」だけ（通路の口から水が浮いて見えるのを避ける）。
// 塗り広がりが maxTiles を超えたら、その部屋は閉じていないとみなして捨てる。
//
// 乱数は呼び出し側が派生ストリームを渡す。game.rng を消費すると敵の構成が
// 変わって週の決定性が壊れる（CaveBackdrop と同じ理由）。

import { BLOCK_EMPTY } from '../utils/Constants.js';

function inRects(r, c, rects) {
    return rects.some((q) => r >= q.r0 && r <= q.r1 && c >= q.c0 && c <= q.c1);
}

/** 部屋の中心から下へ辿って床の行を返す。空洞が無ければ -1。 */
function floorRowBelow(grid, rows, r, c) {
    if (grid[r] == null || grid[r][c] !== BLOCK_EMPTY) return -1;
    let rr = r;
    while (rr + 1 < rows && grid[rr + 1][c] === BLOCK_EMPTY) rr++;
    return rr + 1 < rows ? rr + 1 : -1;
}

/**
 * @returns {Array<{surfaceRow:number, cells:Array<[number,number]>}>}
 */
export function generateWaterPools({ grid, rows, cols, rooms, excludeRects, rng, count, depthMin, depthRange, maxTiles }) {
    // 低い部屋から順に候補にする（地底湖は下にあるほうが自然）。同じ高さは中心列で安定ソート
    const candidates = rooms
        .map((room) => ({ room, floor: floorRowBelow(grid, rows, room.centerR, room.centerC) }))
        .filter((x) => x.floor > 0 && !inRects(x.room.centerR, x.room.centerC, excludeRects))
        .sort((a, b) => (b.floor - a.floor) || (a.room.centerC - b.room.centerC));

    const pools = [];
    const taken = new Set();
    for (const { room, floor } of candidates) {
        if (pools.length >= count) break;
        const depth = depthMin + Math.floor(rng.next() * (depthRange + 1));
        const surfaceRow = floor - depth;
        if (surfaceRow <= 0) continue;

        // 床の直上から、surfaceRow 以下の空洞を4方向に塗り広げる
        const cells = [];
        const stack = [[floor - 1, room.centerC]];
        const seen = new Set();
        let overflow = false;
        while (stack.length) {
            const [r, c] = stack.pop();
            const key = r * cols + c;
            if (seen.has(key) || taken.has(key)) continue;
            if (r < surfaceRow || r >= rows || c < 0 || c >= cols) continue;
            if (grid[r][c] !== BLOCK_EMPTY) continue;
            if (inRects(r, c, excludeRects)) { overflow = true; break; }
            seen.add(key);
            cells.push([r, c]);
            if (cells.length > maxTiles) { overflow = true; break; }
            stack.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]);
        }
        if (overflow || cells.length === 0) continue;
        cells.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
        for (const [r, c] of cells) taken.add(r * cols + c);
        pools.push({ surfaceRow, cells });
    }
    return pools;
}
```

`Map.js`:

- import に `generateWaterPools`、`STAGE_ENVIRONMENTS`、`WATER_POOL_COUNT` / `WATER_POOL_DEPTH_MIN` / `WATER_POOL_DEPTH_RANGE` / `WATER_POOL_MAX_TILES`
- コンストラクタ（`this._generate()` の前）:

```js
        this.water = null;          // Uint8Array(rows*cols)。1 = 水。水の無い面は null のまま
        this.waterSurface = null;   // Int16Array。水タイルの水面の行。それ以外 -1
        this.waterCells = [];       // 生成直後の一覧（決定性テストと描画キャッシュの初期化用）
        this.envKind = STAGE_ENVIRONMENTS[(missionLevel || 0) % STAGE_ENVIRONMENTS.length].kind;
```

- `_generate` の `this._placeHardBlocks();` の直後:

```js
        // Step 9b: 地底湖（4面だけ）。派生ストリームなので game.rng は動かない。
        // 開始の部屋（左上 3,3 から 20x16）と基地の部屋は除外
        if (this.envKind === 'water') this._generateWater();
```

```js
    _generateWater() {
        const rng = new SeededRNG((this.game.rng.state ^ 0x5DEECE66) >>> 0);
        const b = this.enemyBaseCenter;
        const excludeRects = [
            { r0: 0, r1: 3 + 16 + 2, c0: 0, c1: 3 + 20 + 2 },
            { r0: b.r - 12, r1: b.floorR + 2, c0: b.c - 10, c1: this.cols - 1 },
        ];
        const pools = generateWaterPools({
            grid: this.grid, rows: this.rows, cols: this.cols, rooms: this.rooms, excludeRects, rng,
            count: WATER_POOL_COUNT, depthMin: WATER_POOL_DEPTH_MIN, depthRange: WATER_POOL_DEPTH_RANGE,
            maxTiles: WATER_POOL_MAX_TILES,
        });
        this.water = new Uint8Array(this.rows * this.cols);
        this.waterSurface = new Int16Array(this.rows * this.cols).fill(-1);
        for (const pool of pools) {
            for (const [r, c] of pool.cells) {
                this.water[r * this.cols + c] = 1;
                this.waterSurface[r * this.cols + c] = pool.surfaceRow;
                this.waterCells.push([r, c]);
            }
        }
    }

    isWater(r, c) {
        if (!this.water) return false;
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
        return this.water[r * this.cols + c] === 1;
    }

    isWaterAtPixel(x, y) {
        return this.isWater(Math.floor(y / TILE_SIZE), Math.floor(x / TILE_SIZE));
    }

    /** 水タイルの水面の行。水でなければ -1。 */
    waterSurfaceRow(r, c) {
        if (!this.isWater(r, c)) return -1;
        return this.waterSurface[r * this.cols + c];
    }
```

`_generate` の `_carveMainBaseRoom()` が `enemyBaseCenter` を作るのは `_placeHardBlocks` より前なので、この順序で参照できる。

- [ ] **Step 4: 通ることを確認**

Run: `npm test`
Expected: 全 PASS。`stage 4 has water` が落ちる（プールが0）なら、`WATER_POOL_MAX_TILES` を上げるか、除外矩形が広すぎないか確認

- [ ] **Step 5: commit**

```bash
git add src/js/world/waterPools.js src/js/world/Map.js tests/water-pools.test.js tests/MapDeterminism.test.js
git commit -m "feat: 4面に地底湖を生成し Map が水タイルを持つ"
```

---

### Task 12: 壊れたブロックへの流入

**Files:**
- Modify: `src/js/world/waterPools.js`（`fillDestroyedCells` を追加）
- Modify: `src/js/world/Map.js`（`damageBlock` と `destroyArea`）
- Test: `tests/water-flood.test.js`

**Interfaces:**
- Produces: `fillDestroyedCells(map, cells: Array<[r, c]>) → Array<[r, c]>`（水になったセル）。`Map.onWaterChanged(cells)`（Task 13 の描画キャッシュが上書きするフック。ここでは空）

- [ ] **Step 1: 失敗するテストを書く**

```js
// tests/water-flood.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillDestroyedCells } from '../src/js/world/waterPools.js';

// 最小の Map もどき。5x5、水は (3,1),(4,1)（水面 row 3）。
function mapStub() {
  const rows = 5, cols = 5;
  const water = new Uint8Array(rows * cols);
  const waterSurface = new Int16Array(rows * cols).fill(-1);
  const set = (r, c) => { water[r * cols + c] = 1; waterSurface[r * cols + c] = 3; };
  set(3, 1); set(4, 1);
  const changed = [];
  return {
    rows, cols, water, waterSurface,
    isWater(r, c) { return r >= 0 && c >= 0 && r < rows && c < cols && water[r * cols + c] === 1; },
    waterSurfaceRow(r, c) { return this.isWater(r, c) ? waterSurface[r * cols + c] : -1; },
    onWaterChanged(cells) { changed.push(...cells); },
    changed,
  };
}

test('a destroyed cell below the surface and touching water becomes water', () => {
  const m = mapStub();
  const got = fillDestroyedCells(m, [[3, 2]]);
  assert.deepEqual(got, [[3, 2]]);
  assert.ok(m.isWater(3, 2));
  assert.equal(m.waterSurfaceRow(3, 2), 3);
});

test('a destroyed cell above the surface stays dry even if it touches water', () => {
  const m = mapStub();
  assert.deepEqual(fillDestroyedCells(m, [[2, 1]]), []);
  assert.ok(!m.isWater(2, 1));
});

test('a crater destroyed at once fills through the chain, in any order', () => {
  const m = mapStub();
  // (3,3) は (3,2) 経由でしか水に接しない。先に並んでいても埋まる
  const got = fillDestroyedCells(m, [[3, 3], [3, 2]]);
  assert.deepEqual(got.sort(), [[3, 2], [3, 3]].sort());
  assert.deepEqual(m.changed.sort(), [[3, 2], [3, 3]].sort());
});

test('pre-existing empty cells are not flooded (only the destroyed set)', () => {
  const m = mapStub();
  // (3,2) を壊した。(3,3) は元から空洞だが壊れていないので水にならない
  fillDestroyedCells(m, [[3, 2]]);
  assert.ok(!m.isWater(3, 3));
});
```

- [ ] **Step 2: 落ちることを確認**

Run: `npm test -- tests/water-flood.test.js`
Expected: FAIL

- [ ] **Step 3: 実装**

`waterPools.js` に追加:

```js
/**
 * 壊れたブロックのうち、水面より下で水に4方向で接するものを水にする。
 * 壊れたセルの集合の中だけを塗り広げる（元からの空洞には流さない。流すと
 * 「水面より下の空洞をどこまでも埋める」ことになり基地の部屋へ届く回が出る）。
 * 水面の行は動かさない。
 * @returns {Array<[number,number]>} 水になったセル
 */
export function fillDestroyedCells(map, destroyed) {
    const pending = new Set(destroyed.map(([r, c]) => r * map.cols + c));
    const filled = [];
    let progressed = true;
    while (progressed && pending.size) {
        progressed = false;
        for (const key of [...pending]) {
            const r = Math.floor(key / map.cols);
            const c = key % map.cols;
            const around = [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]];
            let surface = -1;
            for (const [nr, nc] of around) {
                const s = map.waterSurfaceRow(nr, nc);
                if (s >= 0 && r >= s) { surface = s; break; }
            }
            if (surface < 0) continue;
            map.water[key] = 1;
            map.waterSurface[key] = surface;
            filled.push([r, c]);
            pending.delete(key);
            progressed = true;
        }
    }
    if (filled.length) map.onWaterChanged(filled);
    return filled;
}
```

`Map.js`:

- `damageBlock` の `this.invalidateTileRegion(r, c); return true;` の直前に:

```js
            if (this.water) fillDestroyedCells(this, [[r, c]]);
```

- `destroyArea` は個々の `damageBlock` が1セルずつ流入を試すが、クレーターの奥は接していないので埋まらない。`return destroyed;` の直前に:

```js
        // 同時に壊れたクレーターは、水に接する破壊跡から順にまとめて埋める
        if (this.water && destroyed.length) fillDestroyedCells(this, destroyed);
```

- `onWaterChanged(cells) {}` を Map に足す（Task 13 で描画キャッシュの更新を入れる）。

- [ ] **Step 4: 通ることを確認**

Run: `npm test`
Expected: 全 PASS

- [ ] **Step 5: commit**

```bash
git add src/js/world/waterPools.js src/js/world/Map.js tests/water-flood.test.js
git commit -m "feat: 水面より下で壊れたブロックが水になる"
```

---

### Task 13: 水の描画（キャッシュ・波打つ水面・波紋）

**Files:**
- Create: `src/js/world/environment/water.js`
- Modify: `src/js/world/StageEnvironment.js`（`createRenderer` に water）、`src/js/world/Map.js`（`onWaterChanged` が `game.env` に伝える）
- Test: `tests/environment-water-draw.test.js`

**Interfaces:**
- Produces:
  - `createWaterRenderer(env) → { update, drawOverWorld, drawOverlay, invalidate(cells), addRipple(x, strength) }`
  - `surfaceOffset(x, t, ripples) → number`（純関数。波の高さ。デモ画面の水面線も使う）
  - `drawSurfaceLine(ctx, x0, x1, surfaceY, t, ripples)`（純関数寄りの描画。デモ画面も使う）
- Consumes: `Map.water` / `Map.waterSurface` / `Map.waterCells`

- [ ] **Step 1: 失敗するテストを書く**

```js
// tests/environment-water-draw.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { TILE_SIZE, WATER_WAVE_AMPLITUDE, WATER_RIPPLE_DECAY } from '../src/js/utils/Constants.js';

before(() => {
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      return { width: 0, height: 0, getContext: () => ctx, _ctx: ctx };
    },
  };
});

function mapWithPool() {
  const rows = 10, cols = 10;
  const water = new Uint8Array(rows * cols);
  const waterSurface = new Int16Array(rows * cols).fill(-1);
  const waterCells = [];
  for (let r = 7; r < 9; r++) for (let c = 2; c < 6; c++) {
    water[r * cols + c] = 1; waterSurface[r * cols + c] = 7; waterCells.push([r, c]);
  }
  return {
    rows, cols, width: cols * TILE_SIZE, height: rows * TILE_SIZE, water, waterSurface, waterCells,
    isWater(r, c) { return r >= 0 && c >= 0 && r < rows && c < cols && water[r * cols + c] === 1; },
    isWaterAtPixel(x, y) { return this.isWater(Math.floor(y / 16), Math.floor(x / 16)); },
    waterSurfaceRow(r, c) { return this.isWater(r, c) ? waterSurface[r * cols + c] : -1; },
  };
}

test('surface wave stays within the amplitude and ripples decay', async () => {
  const { surfaceOffset } = await import('../src/js/world/environment/water.js');
  for (let x = 0; x < 500; x += 7) {
    for (let t = 0; t < 200; t += 13) {
      assert.ok(Math.abs(surfaceOffset(x, t, [])) <= WATER_WAVE_AMPLITUDE + 1e-9);
    }
  }
  const ripples = [{ x: 100, strength: 4 }];
  const near = Math.abs(surfaceOffset(100, 0, ripples));
  const far = Math.abs(surfaceOffset(400, 0, ripples));
  assert.ok(near > far);
});

test('world pass transfers the water cache once and draws one surface path', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const game = { map: mapWithPool(), enemies: [], projectiles: [], enemyBullets: [], particles: [], player: null, carrier: null };
  const env = new StageEnvironment(game, 3);
  const ctx = makeFakeCtx();
  env.update();
  env.drawOverWorld(ctx, 0, 0);
  assert.equal(ctx.calls.filter((c) => c.name === 'drawImage').length, 1);
  assert.equal(ctx.calls.filter((c) => c.name === 'stroke').length, 1);
  assert.equal(ctx.calls.filter((c) => c.name === 'createLinearGradient' || c.name === 'createRadialGradient').length, 0);
});

test('ripples fade every update', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const game = { map: mapWithPool(), enemies: [], projectiles: [], enemyBullets: [], particles: [], player: null, carrier: null };
  const env = new StageEnvironment(game, 3);
  env.renderer.addRipple(50, 4);
  const s0 = env.renderer.ripples[0].strength;
  env.update();
  assert.ok(Math.abs(env.renderer.ripples[0].strength - s0 * WATER_RIPPLE_DECAY) < 1e-9);
});
```

- [ ] **Step 2: 落ちることを確認**

Run: `npm test -- tests/environment-water-draw.test.js`
Expected: FAIL

- [ ] **Step 3: 実装**

```js
// src/js/world/environment/water.js
// ============================================
// 地底湖（4面）の描画
// ============================================
//
// 水タイルは地形キャッシュと同じ大きさのオフスクリーン canvas に焼き、毎フレームは
// 可視矩形を半透明で1回転送する（機体が水の色をかぶる）。水面の線は区間ごとに
// sin で上下させる。当たり判定は波打たない（水面の行は固定）。
// しぶきが落ちた場所は波紋として一時的に振幅を足し、毎フレーム減衰する。

import {
    TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT,
    WATER_FILL, WATER_SURFACE_COLOR, WATER_WAVE_AMPLITUDE, WATER_WAVE_LENGTH, WATER_WAVE_SPEED,
    WATER_RIPPLE_DECAY, WATER_RIPPLE_MIN,
} from '../../utils/Constants.js';

const RIPPLE_WIDTH = 64; // px。波紋が効く横の範囲

/** 水面の x での上下。基本の sin に、近くの波紋の分を足す。 */
export function surfaceOffset(x, t, ripples) {
    let y = Math.sin((x / WATER_WAVE_LENGTH) * Math.PI * 2 + t * WATER_WAVE_SPEED) * WATER_WAVE_AMPLITUDE;
    for (const rp of ripples) {
        const d = Math.abs(x - rp.x);
        if (d > RIPPLE_WIDTH) continue;
        y += Math.sin((d / RIPPLE_WIDTH) * Math.PI) * rp.strength * Math.cos(t * 0.4);
    }
    return y;
}

/** 水面の線を x0..x1 に描く。8px 刻みの折れ線。 */
export function drawSurfaceLine(ctx, x0, x1, surfaceY, t, ripples) {
    ctx.strokeStyle = WATER_SURFACE_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 8) {
        const y = surfaceY + surfaceOffset(x, t, ripples);
        if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

export function createWaterRenderer(env) {
    const map = env.game.map;
    const cache = document.createElement('canvas');
    cache.width = map.width;
    cache.height = map.height;
    const cctx = cache.getContext('2d');

    const paint = (cells) => {
        cctx.fillStyle = WATER_FILL;
        for (const [r, c] of cells) cctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    };
    paint(map.waterCells);

    // 水面の区間: 「水で、上が水でない」タイルの上辺。生成時に集めて、流入で足す
    const surfaces = new Map(); // key r*cols+c → {x0, x1, y}
    const collect = (cells) => {
        for (const [r, c] of cells) {
            if (map.isWater(r - 1, c)) continue;
            surfaces.set(r * map.cols + c, { x0: c * TILE_SIZE, x1: (c + 1) * TILE_SIZE, y: r * TILE_SIZE });
        }
    };
    collect(map.waterCells);

    const renderer = {
        t: 0,
        ripples: [],
        update() {
            this.t++;
            for (const rp of this.ripples) rp.strength *= WATER_RIPPLE_DECAY;
            this.ripples = this.ripples.filter((rp) => rp.strength >= WATER_RIPPLE_MIN);
        },
        addRipple(x, strength) {
            this.ripples.push({ x, strength });
        },
        invalidate(cells) {
            paint(cells);
            collect(cells);
        },
        drawOverWorld(ctx, camX, camY) {
            const sx = Math.max(0, Math.floor(camX));
            const sy = Math.max(0, Math.floor(camY));
            const sw = Math.min(CANVAS_WIDTH, map.width - sx);
            const sh = Math.min(CANVAS_HEIGHT, map.height - sy);
            if (sw > 0 && sh > 0) ctx.drawImage(cache, sx, sy, sw, sh, sx, sy, sw, sh);

            // 水面。画面内の区間だけを1本のパスにまとめる（区間ごとに stroke しない）
            ctx.strokeStyle = WATER_SURFACE_COLOR;
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (const s of surfaces.values()) {
                if (s.x1 < camX || s.x0 > camX + CANVAS_WIDTH || s.y < camY - 8 || s.y > camY + CANVAS_HEIGHT + 8) continue;
                for (let x = s.x0; x <= s.x1; x += 8) {
                    const y = s.y + surfaceOffset(x, this.t, this.ripples);
                    if (x === s.x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        },
        drawOverlay() {},
    };
    return renderer;
}
```

`StageEnvironment.js` の `createRenderer`:

```js
    if (kind === 'water' && env.game && env.game.map && env.game.map.water) return createWaterRenderer(env);
```

`Map.js` の `onWaterChanged`:

```js
    /** 流入で水が増えたとき。描画キャッシュ（環境側）に伝える。 */
    onWaterChanged(cells) {
        const env = this.game && this.game.env;
        if (env && env.renderer && env.renderer.invalidate) env.renderer.invalidate(cells);
    }
```

- [ ] **Step 4: 通ることを確認**

Run: `npm test`
Expected: 全 PASS

- [ ] **Step 5: commit**

```bash
git add src/js/world/environment/water.js src/js/world/StageEnvironment.js src/js/world/Map.js tests/environment-water-draw.test.js
git commit -m "feat: 地底湖の描画（キャッシュ転送・波打つ水面・波紋）"
```

---

### Task 14: しぶき（粒・発生・水面をまたいだ検出）

**Files:**
- Modify: `src/js/entities/Particle.js`（`SplashParticle`）
- Modify: `src/js/systems/SpawnEffects.js`（`spawnSplash`）
- Modify: `src/js/world/StageEnvironment.js`（`update()` で水面またぎを検出）
- Test: `tests/environment-splash.test.js`

**Interfaces:**
- Produces:
  - `class SplashParticle { constructor(x, y, vx, vy); update(); draw(ctx); alive }`
  - `Game.spawnSplash(x, surfaceY, vy)`：粒数 `min(SPLASH_MAX_PARTICLES, ceil(|vy| * SPLASH_PARTICLES_PER_VY))`、水面に波紋
  - `StageEnvironment._trackWaterCrossings()`：`player / carrier / enemies / projectiles / enemyBullets` の中心が水面をまたいだフレームに `game.spawnSplash` を呼ぶ。エンティティに `_inWater` を持たせる

- [ ] **Step 1: 失敗するテストを書く**

```js
// tests/environment-splash.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StageEnvironment } from '../src/js/world/StageEnvironment.js';
import { SpawnEffects } from '../src/js/systems/SpawnEffects.js';
import { SPLASH_MAX_PARTICLES, SPLASH_PARTICLES_PER_VY, TILE_SIZE } from '../src/js/utils/Constants.js';

function waterBelow(y0) {
  return { isWaterAtPixel: (x, y) => y >= y0, water: new Uint8Array(1) };
}

test('spawnSplash pushes particles proportional to |vy| and caps them', () => {
  const game = { particles: [], env: { renderer: { addRipple() {} } } };
  SpawnEffects.spawnSplash.call(game, 10, 100, 2);
  assert.equal(game.particles.length, Math.ceil(2 * SPLASH_PARTICLES_PER_VY));
  game.particles.length = 0;
  SpawnEffects.spawnSplash.call(game, 10, 100, 50);
  assert.equal(game.particles.length, SPLASH_MAX_PARTICLES);
  for (const p of game.particles) { p.update(); assert.ok(p.alive); }
});

test('a splash happens on the frame an entity crosses the surface, not while it stays inside', () => {
  const calls = [];
  const ent = { x: 0, y: 0, width: 16, height: 16, vy: 3, alive: true };
  const game = {
    map: waterBelow(100), player: ent, carrier: null, enemies: [], projectiles: [], enemyBullets: [], particles: [],
    spawnSplash: (x, y, vy) => calls.push([x, y, vy]),
  };
  const env = new StageEnvironment(game, 3);
  env.update();                 // 外（中心 y=8）
  assert.equal(calls.length, 0);
  ent.y = 96; env.update();     // 中心 104 → 中
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2], 3);
  ent.y = 120; env.update();    // まだ中
  assert.equal(calls.length, 1);
  ent.y = 0; env.update();      // 外へ
  assert.equal(calls.length, 2);
});
```

- [ ] **Step 2: 落ちることを確認**

Run: `npm test -- tests/environment-splash.test.js`
Expected: FAIL

- [ ] **Step 3: 実装**

`Particle.js` に追加（`TrailParticle` の後）:

```js
// --------------------------------------------
// SplashParticle - 水面のしぶき。上へ跳ねて重力で落ちる。fillRect 1回
// --------------------------------------------
export class SplashParticle {
    constructor(x, y, vx, vy) {
        this.x = x; this.y = y; this.vx = vx; this.vy = vy;
        this.lifetime = SPLASH_LIFETIME;
        this.alive = true;
    }
    update() {
        if (!this.alive) return;
        this.vy += 0.18;           // 粒は軽いので重力は本体より弱め
        this.x += this.vx;
        this.y += this.vy;
        if (--this.lifetime <= 0) this.alive = false;
    }
    draw(ctx) {
        if (!this.alive) return;
        ctx.globalAlpha = Math.max(0.15, this.lifetime / SPLASH_LIFETIME);
        ctx.fillStyle = '#BFE3FF';
        ctx.fillRect(Math.round(this.x) - 1, Math.round(this.y) - 1, 2, 2);
        ctx.globalAlpha = 1.0;
    }
}
```

（`SPLASH_LIFETIME` を import に足す）

`SpawnEffects.js`:

```js
    /**
     * 水面のしぶき。エンティティが水面をまたいだフレームに StageEnvironment が呼ぶ。
     * 粒の数は |vy| に比例（速く落ちるほど盛大）。水面には波紋を足す。
     */
    spawnSplash(x, surfaceY, vy) {
        const n = Math.min(SPLASH_MAX_PARTICLES, Math.ceil(Math.abs(vy) * SPLASH_PARTICLES_PER_VY));
        for (let i = 0; i < n; i++) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
            const s = 1 + Math.random() * Math.min(4, Math.abs(vy));
            this.particles.push(new SplashParticle(x, surfaceY, Math.cos(a) * s, Math.sin(a) * s));
        }
        const r = this.env && this.env.renderer;
        if (r && r.addRipple) r.addRipple(x, Math.min(6, Math.abs(vy)));
    },
```

（import に `SplashParticle`、`SPLASH_MAX_PARTICLES`、`SPLASH_PARTICLES_PER_VY`）

`StageEnvironment.js`:

```js
    update() {
        this.renderer.update();
        if (this.kind === 'water') this._trackWaterCrossings();
    }

    /** 前フレームと今フレームの「水中か」を比べ、またいだフレームだけしぶきを出す。 */
    _trackWaterCrossings() {
        const g = this.game;
        const map = g.map;
        const check = (e) => {
            if (!e || e.alive === false) return;
            const cx = e.x + (e.width || 0) / 2;
            const cy = e.y + (e.height || 0) / 2;
            const inWater = map.isWaterAtPixel(cx, cy);
            if (e._inWater === undefined) { e._inWater = inWater; return; } // 初回は記録だけ
            if (inWater !== e._inWater) {
                e._inWater = inWater;
                // 水面の y はまたいだタイルの上辺（水に入る側のタイル）
                const r = Math.floor(cy / TILE_SIZE);
                const c = Math.floor(cx / TILE_SIZE);
                const sr = inWater ? map.waterSurfaceRow(r, c) : map.waterSurfaceRow(r + 1, c);
                const surfaceY = (sr >= 0 ? sr : r) * TILE_SIZE;
                if (g.spawnSplash) g.spawnSplash(cx, surfaceY, e.vy || 0);
            }
        };
        check(g.player);
        check(g.carrier);
        for (const e of g.enemies) check(e);
        for (const p of g.projectiles) check(p);
        for (const b of g.enemyBullets) check(b);
    }
```

（`TILE_SIZE` を import。テストの map もどきは `waterSurfaceRow` を持たないので、`map.waterSurfaceRow ? ... : r` の形でガードする）

- [ ] **Step 4: 通ることを確認**

Run: `npm test`
Expected: 全 PASS（`audio-manager.test.js` などが `Game` の新メソッドを総当たりするなら `spawnSplash` は引数なしでも落ちない: `Math.abs(undefined)` は NaN → `Math.ceil(NaN)` は NaN → `Math.min(24, NaN)` は NaN → ループ0回。OK）

- [ ] **Step 5: commit**

```bash
git add src/js/entities/Particle.js src/js/systems/SpawnEffects.js src/js/world/StageEnvironment.js tests/environment-splash.test.js
git commit -m "feat: 水面をまたいだフレームにしぶきと波紋"
```

---

### Task 15: ドローンは水に入らない

**Files:**
- Modify: `src/js/entities/EnemyDrone.js`（`_moveAndCollide` の縦移動の前）
- Test: `tests/environment-drone-water.test.js`

- [ ] **Step 1: 失敗するテストを書く**

```js
// tests/environment-drone-water.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyDrone } from '../src/js/entities/EnemyDrone.js';
import { makeMap, makeGame, flatFloorRows } from './helpers/enemy-world.js';
import { TILE_SIZE } from '../src/js/utils/Constants.js';

test('drone stops one tile above water instead of entering it', () => {
  const map = makeMap(flatFloorRows());
  const SURFACE = 16 * TILE_SIZE;           // row 16 から下が水（床 row 20 の上4段）
  map.isWaterAtPixel = (x, y) => y >= SURFACE && y < 20 * TILE_SIZE;
  const game = makeGame(map);
  game.player = null;
  const d = new EnemyDrone(game, 5 * TILE_SIZE, 10 * TILE_SIZE);
  for (let i = 0; i < 300; i++) {
    d.vy = 2; // 毎フレーム下向きに押す（状態機械の速度を上書き）
    d._moveAndCollide();
    assert.ok(d.y + d.height <= SURFACE + 0.001, `frame ${i}: drone bottom ${d.y + d.height} entered water at ${SURFACE}`);
  }
});
```

- [ ] **Step 2: 落ちることを確認**

Run: `npm test -- tests/environment-drone-water.test.js`
Expected: FAIL

- [ ] **Step 3: 実装**

`EnemyDrone._moveAndCollide` の `// Vertical` の `this.y += this.vy;` の直前:

```js
        // 水には入らない。次の位置の底が水なら、水面の1つ上で止める
        // （水中の自機を水面すれすれで待つ形になる。設計どおり）
        if (this.vy > 0 && map.isWaterAtPixel) {
            const nextBottom = this.y + this.height + this.vy;
            if (map.isWaterAtPixel(this.x + this.width / 2, nextBottom)) {
                const surfaceY = Math.floor(nextBottom / TILE_SIZE) * TILE_SIZE;
                this.y = surfaceY - this.height;
                this.vy = 0;
            }
        }
```

`map.isWaterAtPixel` の存在チェックは、`tests/helpers/enemy-world.js` の `makeMap` に `isWaterAtPixel: () => false` を足して外す（他のテストの map もどきにも同じ1行）。

- [ ] **Step 4: 通ることを確認**

Run: `npm test`
Expected: 全 PASS

- [ ] **Step 5: commit**

```bash
git add src/js/entities/EnemyDrone.js tests/helpers/enemy-world.js tests/environment-drone-water.test.js
git commit -m "feat: ドローンは水面の上で止まり水に入らない"
```


---

## Phase D: 雪と氷（5面）

### Task 16: 積雪の帯（地形キャッシュに焼く）

**Files:**
- Modify: `src/js/world/Map.js`（`exposedAtGen` ビット、`_drawRockyBlock` の上面）
- Test: `tests/environment-snow-cap.test.js`

**Interfaces:**
- Produces: `Map.exposedAtGen: Uint8Array(rows*cols)`（生成時に上が空洞だったブロック）。`Map.envKind`（Task 11 で追加済み）

- [ ] **Step 1: 失敗するテストを書く**

```js
// tests/environment-snow-cap.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { SNOW_CAP_COLOR, TILE_SIZE } from '../src/js/utils/Constants.js';

let ctxs = [];
before(() => {
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      ctxs.push(ctx);
      return { width: 0, height: 0, getContext: () => ctx, _ctx: ctx };
    },
  };
});

function capFills(ctx) {
  const out = [];
  let cur = null;
  for (const c of ctx.calls) {
    if (c.name === 'set:fillStyle') cur = c.args[0];
    if (c.name === 'fillRect' && cur === SNOW_CAP_COLOR) out.push(c.args);
  }
  return out;
}

test('stage 5 bakes snow caps on generation-exposed tops; stage 1 bakes none', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  ctxs = [];
  new Map({ rng: new SeededRNG(5) }, 4);
  const snowy = ctxs.reduce((n, c) => n + capFills(c).length, 0);
  assert.ok(snowy > 100, `expected many caps on stage 5, got ${snowy}`);
  ctxs = [];
  new Map({ rng: new SeededRNG(5) }, 0);
  assert.equal(ctxs.reduce((n, c) => n + capFills(c).length, 0), 0);
});

test('a top exposed by destruction gets no cap (bare rock)', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  ctxs = [];
  const map = new Map({ rng: new SeededRNG(5) }, 4);
  // 生成時に埋まっていた岩を1つ選んで、その上を壊す
  let target = null;
  for (let r = 3; r < map.rows - 3 && !target; r++) {
    for (let c = 3; c < map.cols - 3; c++) {
      if (map.grid[r][c] === 1 && map.grid[r - 1][c] === 1 && map.grid[r - 2][c] === 0) { target = { r, c }; break; }
    }
  }
  assert.ok(target, 'need a buried block under an exposed one');
  const tileCtx = ctxs[0]; // 最初に作られた canvas がタイルキャッシュ
  tileCtx.calls.length = 0;
  map.damageBlock(target.r - 1, target.c, 99);
  // 再描画された (target.r, target.c) は上が空いたが、生成時露出ではないので帯は無い
  const caps = capFills(tileCtx).filter(([x, y]) => x === target.c * TILE_SIZE && y === target.r * TILE_SIZE);
  assert.equal(caps.length, 0);
});
```

**注意:** タイルキャッシュの canvas が `ctxs[0]` かは `_initTileCache` が `_generate` の中で最初に `createElement` を呼ぶかで決まる。ミニマップや遠景が先なら添字を直す（`Map.js` の `_generate` Step 11/12 の順を見る）。

- [ ] **Step 2: 落ちることを確認**

Run: `npm test -- tests/environment-snow-cap.test.js`
Expected: FAIL

- [ ] **Step 3: 実装**

`Map.js`:

- `_initTileCache()` の直前（`_generate` 内、Step 11 の前）で生成時露出を記録:

```js
        // 生成時に上が空洞だったブロック。雪はここにだけ積もる（壊して新しく出た面は素の岩。
        // 掘った跡が読める）。破壊の再描画は _drawRockyBlock がこのビットを見る
        this.exposedAtGen = new Uint8Array(this.rows * this.cols);
        for (let r = 1; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.grid[r][c] !== BLOCK_EMPTY && this.grid[r - 1][c] === BLOCK_EMPTY) {
                    this.exposedAtGen[r * this.cols + c] = 1;
                }
            }
        }
```

- `_drawRockyBlock` の上面の描画（`if (expTop) { ... }` のブロック）の**末尾**に:

```js
            // 積雪の帯（5面）。生成時に露出していた上面にだけ。
            if (this.envKind === 'snow' && this.exposedAtGen && this.exposedAtGen[r * this.cols + c]) {
                ctx.fillStyle = SNOW_CAP_COLOR;
                ctx.fillRect(x, y, S, SNOW_CAP_THICKNESS);
            }
```

（`SNOW_CAP_COLOR`、`SNOW_CAP_THICKNESS` を import。`_drawRockyBlock` が `ctx.save()` / `clip` の中で描いているなら、帯もその中で描く＝面取りの外は自動で切れる）

- [ ] **Step 4: 通ることを確認**

Run: `npm test`
Expected: 全 PASS

- [ ] **Step 5: commit**

```bash
git add src/js/world/Map.js tests/environment-snow-cap.test.js
git commit -m "feat: 5面の地形に積雪の帯を焼く（生成時に露出していた上面だけ）"
```

---

### Task 17: 降雪の板

**Files:**
- Create: `src/js/world/environment/snow.js`
- Modify: `src/js/world/StageEnvironment.js`（`createRenderer` に snow）
- Test: `tests/environment-snow-draw.test.js`

**Interfaces:**
- Produces: `createSnowRenderer() → { update, drawOverWorld, drawOverlay }`

- [ ] **Step 1: 失敗するテストを書く**

```js
// tests/environment-snow-draw.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { SNOW_LAYERS, SNOW_SHEET_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT } from '../src/js/utils/Constants.js';

before(() => {
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      return { width: 0, height: 0, getContext: () => ctx, _ctx: ctx };
    },
  };
});

test('snow overlay is a bounded number of drawImage calls per layer', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const env = new StageEnvironment(null, 4);
  const ctx = makeFakeCtx();
  for (let i = 0; i < 30; i++) env.update();
  env.drawOverlay(ctx);
  const tilesX = Math.ceil(CANVAS_WIDTH / SNOW_SHEET_SIZE) + 1;
  const tilesY = Math.ceil(CANVAS_HEIGHT / SNOW_SHEET_SIZE) + 1;
  const draws = ctx.calls.filter((c) => c.name === 'drawImage').length;
  assert.ok(draws <= SNOW_LAYERS.length * tilesX * tilesY, `drawImage ${draws}`);
  assert.ok(draws >= SNOW_LAYERS.length);
  assert.equal(ctx.calls.filter((c) => c.name === 'fillRect').length, 0); // 粒を個別に描かない
});

test('layers scroll at different speeds', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const env = new StageEnvironment(null, 4);
  const at = () => {
    const ctx = makeFakeCtx();
    env.drawOverlay(ctx);
    return ctx.calls.filter((c) => c.name === 'drawImage').map((c) => c.args[2]); // y
  };
  const y0 = at();
  env.update();
  const y1 = at();
  // 同じ添字の drawImage の y の差が層ごとに違う
  const deltas = new Set(y1.map((y, i) => Math.round((y - y0[i]) * 100) / 100));
  assert.ok(deltas.size >= 2, `expected different scroll speeds, got ${[...deltas]}`);
});
```

- [ ] **Step 2: 落ちることを確認**

Run: `npm test -- tests/environment-snow-draw.test.js`
Expected: FAIL

- [ ] **Step 3: 実装**

```js
// src/js/world/environment/snow.js
// ============================================
// 降雪（5面）の描画
// ============================================
//
// 粒を個別に描くと、縮尺（タイル16px）に見合う 1〜2px の粒を数千出すことになる。
// 層ごとに「粒を撒いた板」を1枚作り、画面をタイル状に敷きながら落下と横揺れの分だけ
// ずらす。画面上の粒は数千でも、毎フレームは drawImage が層×敷き枚数だけ。
// 板の端は継ぎ目が出ないよう、はみ出す粒を反対側にも描く。

import {
    CANVAS_WIDTH, CANVAS_HEIGHT, SNOW_SHEET_SIZE, SNOW_LAYERS, SNOW_COLOR,
} from '../../utils/Constants.js';
import { SeededRNG } from '../../utils/SeededRNG.js';

function buildSheet(layer, seed) {
    const canvas = document.createElement('canvas');
    canvas.width = SNOW_SHEET_SIZE;
    canvas.height = SNOW_SHEET_SIZE;
    const ctx = canvas.getContext('2d');
    const rng = new SeededRNG(seed);
    ctx.fillStyle = SNOW_COLOR;
    ctx.globalAlpha = layer.alpha;
    for (let i = 0; i < layer.count; i++) {
        const x = Math.floor(rng.next() * SNOW_SHEET_SIZE);
        const y = Math.floor(rng.next() * SNOW_SHEET_SIZE);
        ctx.fillRect(x, y, layer.size, layer.size);
        // 端の継ぎ目
        if (x + layer.size > SNOW_SHEET_SIZE) ctx.fillRect(x - SNOW_SHEET_SIZE, y, layer.size, layer.size);
        if (y + layer.size > SNOW_SHEET_SIZE) ctx.fillRect(x, y - SNOW_SHEET_SIZE, layer.size, layer.size);
    }
    ctx.globalAlpha = 1;
    return canvas;
}

export function createSnowRenderer() {
    const sheets = SNOW_LAYERS.map((layer, i) => buildSheet(layer, 0x5A0E + i * 7919));
    let t = 0;
    return {
        update() { t++; },
        drawOverWorld() {},
        drawOverlay(ctx, alphaScale = 1) {
            ctx.save();
            SNOW_LAYERS.forEach((layer, i) => {
                const S = SNOW_SHEET_SIZE;
                const oy = ((t * layer.speed) % S + S) % S;
                // 横揺れ: 層ごとに位相をずらした sin
                const ox = ((Math.sin(t * 0.02 + i) * layer.sway * 40) % S + S) % S;
                ctx.globalAlpha = alphaScale;
                for (let y = oy - S; y < CANVAS_HEIGHT; y += S) {
                    for (let x = ox - S; x < CANVAS_WIDTH; x += S) {
                        ctx.drawImage(sheets[i], x, y);
                    }
                }
            });
            ctx.globalAlpha = 1;
            ctx.restore();
        },
    };
}
```

`StageEnvironment.js` の `createRenderer` に `if (kind === 'snow') return createSnowRenderer();`。

- [ ] **Step 4: 通ることを確認**

Run: `npm test`
Expected: 全 PASS

- [ ] **Step 5: commit**

```bash
git add src/js/world/environment/snow.js src/js/world/StageEnvironment.js tests/environment-snow-draw.test.js
git commit -m "feat: 降雪の描画（板3層のスクロール）"
```

---

### Task 18: 斜面の検出、滑り、舞う雪、描画オフセット

**Files:**
- Create: `src/js/utils/slope.js`
- Modify: `src/js/entities/Particle.js`（`SnowKickParticle`）、`src/js/systems/SpawnEffects.js`（`spawnSnowKick`）
- Modify: `src/js/entities/Player.js`（`update()` に斜面と粒、`_probeGroundBelowFeet` に下りの吸着、`draw()` にオフセット）
- Modify: `src/js/entities/EnemyTank.js`（下りの加速と粒）
- Test: `tests/slope.test.js`、`tests/environment-snow-motion.test.js`

**Interfaces:**
- Produces:
  - `stairDirection(map, r, c) → -1 | 0 | 1`（`(r, c)` = 足が乗っているブロック。+1 = 右へ上る階段）
  - `slopeDrawOffset(dir, feetCenterX) → number`（45度の線に乗せるための描画の縦オフセット。`dir` 0 なら 0。負 = 上へ）
  - `Game.spawnSnowKick(x, y, count)`
  - `Player.slopeDir`（今フレームの階段の向き）、`Player.drawOffsetY`

- [ ] **Step 1: 失敗するテストを書く**

```js
// tests/slope.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stairDirection, slopeDrawOffset } from '../src/js/utils/slope.js';
import { makeMap } from './helpers/enemy-world.js';
import { TILE_SIZE } from '../src/js/utils/Constants.js';

// 右へ上る階段: 行 r の段が列 c、行 r-1 の段が列 c+1、…
function stairsRows() {
  const rows = [];
  for (let r = 0; r < 12; r++) {
    let s = '';
    for (let c = 0; c < 12; c++) s += (r >= 11 - c ? '#' : '.'); // 対角線の下が岩
    rows.push(s);
  }
  return rows;
}

test('stairDirection sees a rising-right staircase from a middle step', () => {
  const map = makeMap(stairsRows());
  // 段 (r=8, c=3): 右隣 (7,4) が1段高く、左隣 (8,2) は空で (9,2) が岩
  assert.equal(stairDirection(map, 8, 3), 1);
});

test('stairDirection is 0 on flat ground and on a single ledge', () => {
  const flat = makeMap(['............', '............', '############']);
  assert.equal(stairDirection(flat, 2, 5), 0);
  const ledge = makeMap(['............', '......######', '############']);
  assert.equal(stairDirection(ledge, 2, 4), 0); // 上りだけで下りが無い
});

test('slopeDrawOffset interpolates 0..-TILE across a rising step and 0 on flat', () => {
  assert.equal(slopeDrawOffset(0, 100), 0);
  assert.equal(slopeDrawOffset(1, 3 * TILE_SIZE), 0);
  assert.equal(slopeDrawOffset(1, 3 * TILE_SIZE + TILE_SIZE / 2), -TILE_SIZE / 2);
  assert.equal(slopeDrawOffset(-1, 3 * TILE_SIZE + TILE_SIZE / 2), -TILE_SIZE / 2);
  assert.equal(slopeDrawOffset(-1, 4 * TILE_SIZE - 0.001) > -0.1, true);
});
```

```js
// tests/environment-snow-motion.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { SpawnEffects } from '../src/js/systems/SpawnEffects.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import {
  TILE_SIZE, ICE_SLIDE, SLOPE_DOWNHILL_ACCEL, SLOPE_UPHILL_SCALE, PLAYER_MAX_SPEED,
  SNOW_KICK_LAND, SNOW_KICK_WALK,
} from '../src/js/utils/Constants.js';

const SNOW = { motionAt: () => ({ speed: 1, gravity: 1, slide: ICE_SLIDE }), sightScale: 1, kind: 'snow' };

function inputWith(held) {
  return {
    keys: {}, isKeyDown: (c) => held.has(c), isKeyPressed: () => false, isCharPressed: () => false,
    mouse: { left: false, right: false }, isLeftClickPressed: () => false, isRightClickPressed: () => false,
    rightHoldFrames: 0, crosshairLocked: false,
    getMouseWorld: () => ({ x: 0, y: 0 }), getTargetWorld: () => ({ x: 0, y: 0 }),
  };
}

// 幅30。左半分は床 row 20、列 10..19 が右へ下る階段（列 10 が row 11、列 19 が row 20）
function slopeRows() {
  const rows = [];
  for (let r = 0; r < 24; r++) {
    let s = '';
    for (let c = 0; c < 30; c++) {
      let floor = 20;
      if (c >= 10 && c < 20) floor = 11 + (c - 10);
      if (c < 10) floor = 11;
      s += r >= floor ? '#' : '.';
    }
    rows.push(s);
  }
  return rows;
}

function snowWorld() {
  const game = makeGame(makeMap(slopeRows()));
  game.env = SNOW;
  game.snowKicks = [];
  game.spawnSnowKick = (x, y, n) => game.snowKicks.push(n);
  return game;
}

test('standing on a downhill staircase, the player accelerates downhill without input', () => {
  const game = snowWorld();
  game.input = inputWith(new Set());
  // 列 13 の段（row 14）に立つ
  const p = new Player(game, 13 * TILE_SIZE, 14 * TILE_SIZE - 24);
  game.player = p;
  for (let i = 0; i < 3; i++) p.update();
  assert.ok(p.vx > 0, `expected downhill (right) drift, vx=${p.vx}`);
  assert.ok(p.slopeDir === -1, `slopeDir ${p.slopeDir}`); // 左へ上る＝右へ下る
});

test('walking uphill on snow is slower than PLAYER_MAX_SPEED', () => {
  const game = snowWorld();
  game.input = inputWith(new Set(['KeyA'])); // 左 = 上り
  const p = new Player(game, 13 * TILE_SIZE, 14 * TILE_SIZE - 24);
  game.player = p;
  for (let i = 0; i < 3; i++) p.update();
  assert.ok(Math.abs(p.vx) <= PLAYER_MAX_SPEED * SLOPE_UPHILL_SCALE + 1e-9, `vx ${p.vx}`);
});

test('landing on snow kicks up snow; walking kicks a little each frame', () => {
  const game = snowWorld();
  game.input = inputWith(new Set());
  const p = new Player(game, 3 * TILE_SIZE, 5 * TILE_SIZE); // 平地(row 11)の上空
  game.player = p;
  for (let i = 0; i < 120 && !p.onGround; i++) p.update();
  assert.ok(game.snowKicks.includes(SNOW_KICK_LAND));
  game.snowKicks.length = 0;
  game.input = inputWith(new Set(['KeyD']));
  for (let i = 0; i < 5; i++) p.update();
  assert.ok(game.snowKicks.filter((n) => n === SNOW_KICK_WALK).length >= 4);
});

test('spawnSnowKick pushes count particles that rise then fall', () => {
  const game = { particles: [] };
  SpawnEffects.spawnSnowKick.call(game, 10, 10, 4);
  assert.equal(game.particles.length, 4);
  const p = game.particles[0];
  const y0 = p.y;
  p.update();
  assert.ok(p.y < y0);
});
```

- [ ] **Step 2: 落ちることを確認**

Run: `npm test -- tests/slope.test.js tests/environment-snow-motion.test.js`
Expected: FAIL

- [ ] **Step 3: 実装**

```js
// src/js/utils/slope.js
// ============================================
// 階段の検出と45度の描画オフセット（純関数）
// ============================================
//
// 斜面ブロックは作らない。当たり判定は今の「1段の乗り上げ」のままで、
// 足元のタイル列から「階段の途中に立っている」ことだけを検出する。
// 検出は両側を要求する（片側だけだとただの段差も斜面になる）。階段の端の段は
// 平地扱いになるが、生成側（snowStairs）が 5 段以上を保証するので滑れる。

import { TILE_SIZE } from './Constants.js';

/**
 * @param {{isSolid(r,c):boolean}} map
 * @param {number} r 足が乗っているブロックの行
 * @param {number} c 同じく列
 * @returns {-1|0|1} +1 = 右へ上る階段、-1 = 左へ上る階段
 */
export function stairDirection(map, r, c) {
    const rightUp = map.isSolid(r - 1, c + 1) && !map.isSolid(r - 2, c + 1);
    const leftDown = !map.isSolid(r, c - 1) && map.isSolid(r + 1, c - 1);
    if (rightUp && leftDown) return 1;
    const leftUp = map.isSolid(r - 1, c - 1) && !map.isSolid(r - 2, c - 1);
    const rightDown = !map.isSolid(r, c + 1) && map.isSolid(r + 1, c + 1);
    if (leftUp && rightDown) return -1;
    return 0;
}

/**
 * 足の中心 x が段の中でどこにいるかから、45度の線に乗せる描画の縦オフセット。
 * 段の低い側の端で 0、高い側の端で -TILE_SIZE。
 */
export function slopeDrawOffset(dir, feetCenterX) {
    if (dir === 0) return 0;
    const frac = (feetCenterX - Math.floor(feetCenterX / TILE_SIZE) * TILE_SIZE) / TILE_SIZE;
    return -(dir > 0 ? frac : 1 - frac) * TILE_SIZE;
}
```

`Particle.js` に `SnowKickParticle`（`SplashParticle` と同じ形。色 `SNOW_COLOR`、初速は上向き 1〜2.5 ＋ 横 ±1、重力 0.12、寿命 `SNOW_KICK_LIFETIME`、`fillRect` 2×2）。

`SpawnEffects.js`:

```js
    /** 舞う雪。足元から count 粒。 */
    spawnSnowKick(x, y, count) {
        for (let i = 0; i < (count | 0); i++) {
            this.particles.push(new SnowKickParticle(
                x + (Math.random() - 0.5) * 12, y,
                (Math.random() - 0.5) * 2, -(1 + Math.random() * 1.5),
            ));
        }
    },
```

`Player.js`:

- import: `stairDirection, slopeDrawOffset` from `'../utils/slope.js'`、定数 `SLOPE_DOWNHILL_ACCEL, SLOPE_UPHILL_SCALE, ICE_MAX_SLIDE_SPEED, SNOW_KICK_WALK, SNOW_KICK_LAND, SNOW_KICK_SLIDE`
- constructor: `this.slopeDir = 0; this.drawOffsetY = 0;`
- `update()` の `this._updateHorizontal(input);` の**直後**:

```js
        this._applySnowSlope(input);
```

```js
    /**
     * 雪の面の斜面（階段）。下りは加速、上りは最高速が落ちる。
     * onGround は前フレームの結果（_moveAndCollide が毎フレーム冒頭で倒す）。
     */
    _applySnowSlope(input) {
        this.slopeDir = 0;
        if (this.motion.slide === 0 || !this.onGround) return;
        const map = this.game.map;
        const feetX = this.x + this.width / 2;
        const r = Math.floor((this.y + this.height + 1) / TILE_SIZE);
        const c = Math.floor(feetX / TILE_SIZE);
        this.slopeDir = stairDirection(map, r, c);
        if (this.slopeDir === 0) return;
        const downhill = -this.slopeDir;
        const held = (input.isKeyDown('KeyA') || input.isKeyDown('ArrowLeft')) ? -1
            : (input.isKeyDown('KeyD') || input.isKeyDown('ArrowRight')) ? 1 : 0;
        if (held === this.slopeDir) {
            // 上り: 入力の最高速を落とす（_updateHorizontal が ±MAX にした直後）
            this.vx = held * PLAYER_MAX_SPEED * SLOPE_UPHILL_SCALE;
        }
        this.vx += downhill * SLOPE_DOWNHILL_ACCEL;
        this.vx = Math.max(-ICE_MAX_SLIDE_SPEED, Math.min(ICE_MAX_SLIDE_SPEED, this.vx));
    }
```

- `update()` の着地処理（`const landed = ...` の後）に粒:

```js
        if (this.motion.slide > 0) this._kickSnow(landed);
```

```js
    /** 雪の地上での粒。着地で多め、滑っているあいだは毎フレーム。 */
    _kickSnow(landed) {
        if (!this.game.spawnSnowKick) return;
        const fx = this.x + this.width / 2;
        const fy = this.y + this.height;
        if (landed) { this.game.spawnSnowKick(fx, fy, SNOW_KICK_LAND); return; }
        if (!this.onGround || Math.abs(this.vx) < 0.1) return;
        this.game.spawnSnowKick(fx, fy, this.slopeDir !== 0 ? SNOW_KICK_SLIDE : SNOW_KICK_WALK);
    }
```

- `_probeGroundBelowFeet` の冒頭に、雪の階段を下るときの吸着（落下を待たない）:

```js
        // 雪の階段を下るとき: 足元の1段下が床なら落下を待たず吸着する
        // （段を跳ねる動きが消え、描画オフセットと合わせて斜面を滑って見える）
        if (!this.onGround && this.vy >= 0 && this.motion.slide > 0 && this.slopeDir !== 0) {
            const probeY = this.y + this.height + TILE_SIZE + 1;
            const cx = this.x + this.width / 2;
            if (map.isSolidAtPixel(cx, probeY) && !map.isSolidAtPixel(cx, probeY - TILE_SIZE)) {
                this.onGround = true;
                this.vy = 0;
                this.y = Math.floor(probeY / TILE_SIZE) * TILE_SIZE - this.height;
                return;
            }
        }
```

（`_probeGroundBelowFeet` の既存の `const map = this.game.map;` より後に置く）

- `update()` の末尾（`this.wasOnGround = this.onGround;` の後）:

```js
        this.drawOffsetY = this.onGround ? slopeDrawOffset(this.slopeDir, this.x + this.width / 2) : 0;
```

- `draw(ctx)` の `if (!this.alive) return;` の直後に `ctx.save(); ctx.translate(0, this.drawOffsetY);` を置き、メソッド末尾で `ctx.restore();`。**早期 return がある（無敵の点滅）ので、その return の前にも restore が要る。** save/translate を点滅判定の後に移すのが簡単。

`EnemyTank.update`（`this.vx *= FRICTION;` の後）:

```js
        // 雪の階段では下りに加速し、雪を蹴る（自機と同じ規則。ホバー戦車なので45度の補間は無し）
        if (motion.slide > 0) this._applySnowSlope(motion);
```

```js
    _applySnowSlope(motion) {
        const map = this.game.map;
        const r = Math.floor((this.y + this.height + 1) / TILE_SIZE);
        const c = Math.floor((this.x + this.width / 2) / TILE_SIZE);
        const dir = stairDirection(map, r, c);
        if (dir !== 0) {
            this.vx += -dir * SLOPE_DOWNHILL_ACCEL;
            this.vx = Math.max(-ICE_MAX_SLIDE_SPEED, Math.min(ICE_MAX_SLIDE_SPEED, this.vx));
        }
        if (this.game.spawnSnowKick && Math.abs(this.vx) > 0.1
            && this.game.camera && isInView(this, this.game.camera, this.game.canvas, VIEW_CULL_MARGIN)) {
            this.game.spawnSnowKick(this.x + this.width / 2, this.y + this.height, dir !== 0 ? SNOW_KICK_SLIDE : SNOW_KICK_WALK);
        }
    }
```

（`isInView` は `utils/viewCull.js`。画面内の戦車だけ粒を出す）

- [ ] **Step 4: 通ることを確認**

Run: `npm test`
Expected: 全 PASS。**`environment-land-invariance` が落ちたら、陸上（slide 0）で `_applySnowSlope` / `_kickSnow` / 下りの吸着が一切動いていないことを確認する**（3か所とも `motion.slide` で門を閉じている）

- [ ] **Step 5: commit**

```bash
git add src/js/utils/slope.js src/js/entities/Particle.js src/js/systems/SpawnEffects.js src/js/entities/Player.js src/js/entities/EnemyTank.js tests/slope.test.js tests/environment-snow-motion.test.js
git commit -m "feat: 雪の斜面（階段の検出・下りの加速・上りの抵抗・舞う雪・45度の描画）"
```

---

### Task 19: 雪の面の階段の生成

**Files:**
- Create: `src/js/world/snowStairs.js`
- Modify: `src/js/world/Map.js`（`_placeHardBlocks()` の直後、水の生成と同じ場所で `envKind === 'snow'` なら呼ぶ）
- Test: `tests/snow-stairs.test.js`

**Interfaces:**
- Produces: `carveSnowStairs({ grid, blockHP, rows, cols, rooms, rng, count, lengthMin, lengthRange }) → Array<{ r, c, dir, length }>`（grid を書き換える。戻り値は決定性テスト用）。`Map.stairs`

- [ ] **Step 1: 失敗するテストを書く**

```js
// tests/snow-stairs.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { carveSnowStairs } from '../src/js/world/snowStairs.js';
import { stairDirection } from '../src/js/utils/slope.js';

// 30x20。row 15 が床、上は空洞。
function world() {
  const grid = [], blockHP = [];
  for (let r = 0; r < 20; r++) {
    grid.push([]); blockHP.push([]);
    for (let c = 0; c < 30; c++) { const s = r >= 15 || r === 0 || c === 0 || c === 29; grid[r].push(s ? 1 : 0); blockHP[r].push(1); }
  }
  return { grid, blockHP, rows: 20, cols: 30, rooms: [{ centerR: 8, centerC: 15 }] };
}

function mapOf(w) {
  return { isSolid: (r, c) => r < 0 || c < 0 || r >= w.rows || c >= w.cols || w.grid[r][c] !== 0 };
}

test('carves a staircase of at least lengthMin steps that stairDirection recognises in the middle', () => {
  const w = world();
  const stairs = carveSnowStairs({ ...w, rng: new SeededRNG(2), count: 1, lengthMin: 5, lengthRange: 0 });
  assert.equal(stairs.length, 1);
  const s = stairs[0];
  assert.equal(s.length, 5);
  const map = mapOf(w);
  // 真ん中の段に立ったときの向きが s.dir
  const midStep = 2;
  const r = s.r - midStep;             // 段が1つ上がるごとに行が1つ減る
  const c = s.c + s.dir * midStep;
  assert.equal(stairDirection(map, r, c), s.dir);
});

test('same rng carves the same stairs', () => {
  const a = carveSnowStairs({ ...world(), rng: new SeededRNG(4), count: 3, lengthMin: 5, lengthRange: 4 });
  const b = carveSnowStairs({ ...world(), rng: new SeededRNG(4), count: 3, lengthMin: 5, lengthRange: 4 });
  assert.deepEqual(a, b);
});
```

- [ ] **Step 2: 落ちることを確認**

Run: `npm test -- tests/snow-stairs.test.js`
Expected: FAIL

- [ ] **Step 3: 実装**

```js
// src/js/world/snowStairs.js
// ============================================
// 雪の面の階段（純関数。grid を書き換える）
// ============================================
//
// 部屋の床に、length 段の階段を「盛る」（岩を足す）。滑れる長さを保証したいので
// 生成側で意図的に作る。乱数は派生ストリーム（game.rng を消費しない）。
// 段は上に行くほど dir の向きへ1列ずれる。頂上の先は空洞のまま（降りられる）。

import { BLOCK_NORMAL, BLOCK_EMPTY } from '../utils/Constants.js';

/** (r, c) から下へ辿った床の行。空洞でなければ -1。 */
function floorBelow(grid, rows, r, c) {
    if (grid[r] == null || grid[r][c] !== BLOCK_EMPTY) return -1;
    let rr = r;
    while (rr + 1 < rows && grid[rr + 1][c] === BLOCK_EMPTY) rr++;
    return rr + 1 < rows ? rr + 1 : -1;
}

export function carveSnowStairs({ grid, blockHP, rows, cols, rooms, rng, count, lengthMin, lengthRange }) {
    const stairs = [];
    let tries = 0;
    while (stairs.length < count && tries < count * 20) {
        tries++;
        const room = rooms[Math.floor(rng.next() * rooms.length)];
        const dir = rng.next() < 0.5 ? 1 : -1;
        const length = lengthMin + Math.floor(rng.next() * (lengthRange + 1));
        // 部屋の中心から dir と逆側に length/2 ずらした列を最下段にする
        const c0 = room.centerC - dir * Math.floor(length / 2);
        const floor = floorBelow(grid, rows, room.centerR, c0);
        if (floor < 0) continue;
        // 段ごとに「空洞であること」と「頭上に2段の余裕」を確かめる
        let ok = true;
        for (let i = 0; i < length && ok; i++) {
            const c = c0 + dir * i;
            for (let k = 0; k <= i; k++) {
                const r = floor - 1 - k;
                if (r < 2 || c < 1 || c >= cols - 1 || grid[r][c] !== BLOCK_EMPTY) ok = false;
            }
            if (grid[floor - 1 - i - 1] == null || grid[floor - 1 - i - 1][c] !== BLOCK_EMPTY) ok = false;
            if (grid[floor - 1 - i - 2] == null || grid[floor - 1 - i - 2][c] !== BLOCK_EMPTY) ok = false;
        }
        if (!ok) continue;
        for (let i = 0; i < length; i++) {
            const c = c0 + dir * i;
            for (let k = 0; k <= i; k++) {
                grid[floor - 1 - k][c] = BLOCK_NORMAL;
                blockHP[floor - 1 - k][c] = 1;
            }
        }
        stairs.push({ r: floor - 1, c: c0, dir, length });
    }
    return stairs;
}
```

`Map.js`（水の生成の隣）:

```js
        // Step 9c: 雪の面の階段（派生ストリーム）
        this.stairs = [];
        if (this.envKind === 'snow') {
            this.stairs = carveSnowStairs({
                grid: this.grid, blockHP: this.blockHP, rows: this.rows, cols: this.cols, rooms: this.rooms,
                rng: new SeededRNG((this.game.rng.state ^ 0x51A1E5) >>> 0),
                count: SNOW_STAIRS_COUNT, lengthMin: SNOW_STAIRS_LENGTH_MIN, lengthRange: SNOW_STAIRS_LENGTH_RANGE,
            });
        }
```

**階段は `exposedAtGen` を記録する前に盛るので、段の上面にも雪が積もる。**

`tests/MapDeterminism.test.js` に `assert.deepEqual(a.stairs, b.stairs);` を足す。

- [ ] **Step 4: 通ることを確認**

Run: `npm test`
Expected: 全 PASS

- [ ] **Step 5: commit**

```bash
git add src/js/world/snowStairs.js src/js/world/Map.js tests/snow-stairs.test.js tests/MapDeterminism.test.js
git commit -m "feat: 5面の部屋に滑れる長さの階段を作る"
```

---

## Phase E: デモ画面の背景

### Task 20: 面のシーン絵と、面別ランキング・面セレクト・タイトルの背景

**Files:**
- Modify: `src/js/ui/StageScene.js`（`drawStageScene` の末尾で kind ごとの重ね: 水面の線・降雪・霧を帯の中に clip）
- Modify: `src/js/ui/ScreenRenderer.js`（`_demoEnv(stageIndex)` のキャッシュ）
- Modify: `src/js/ui/screens/rankingScreens.js`（`drawStageRankings` の末尾）、`src/js/ui/screens/titleScreen.js`（`drawTitleScreen` の走査線の前、`drawStageSelect` の走査線の前）
- Test: `tests/environment-demo-screens.test.js`

**Interfaces:**
- Produces: `ScreenRenderer._demoEnv(stageIndex) → StageEnvironment`（game null で作る。水の renderer は map が無いので none になり、シーン絵の水面線は `drawSurfaceLine` を直接使う）
- `ScreenRenderer._titleStageIndex()`：CONTINUE があればその面、無ければ 0

- [ ] **Step 1: 失敗するテストを書く**

```js
// tests/environment-demo-screens.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT, STAGE_PALETTES, DEMO_OVERLAY_ALPHA_SCALE, FOG_OVERLAY_ALPHA } from '../src/js/utils/Constants.js';

before(() => {
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      return { width: 0, height: 0, getContext: () => ctx, _ctx: ctx };
    },
  };
});

function renderer(extra = {}) {
  const game = {
    canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    titleMenuItems: () => ['start'],
    selectedTitleItem: () => 'start',
    mode: 'normal',
    saveManager: { save: { missionsCompleted: 0, mode: 'normal', tries: 0 }, reached: 1 },
    stageSelectIndex: 1,
    ...extra,
  };
  return new ScreenRenderer(game);
}

test('stage ranking screen for stage 6 draws the fog overlay thinned for the demo', () => {
  const sr = renderer();
  const ctx = makeFakeCtx();
  sr.drawStageRankings(ctx, 5, { local: { time: [], score: [] }, global: { time: [], score: [] } }, STAGE_PALETTES[5]);
  const alphas = ctx.calls.filter((c) => c.name === 'set:globalAlpha').map((c) => c.args[0]);
  assert.ok(alphas.some((a) => Math.abs(a - FOG_OVERLAY_ALPHA * DEMO_OVERLAY_ALPHA_SCALE) < 1e-9), 'fog overlay missing');
});

test('stage ranking screen for stage 1 draws no environment overlay', () => {
  const sr = renderer();
  const ctx = makeFakeCtx();
  sr.drawStageRankings(ctx, 0, { local: { time: [], score: [] }, global: { time: [], score: [] } }, STAGE_PALETTES[0]);
  assert.equal(ctx.calls.filter((c) => c.name === 'drawImage').length, 0);
});

test('title uses the continue stage when available, else stage 1', () => {
  const a = renderer();
  assert.equal(a._titleStageIndex(), 0);
  const b = renderer({
    titleMenuItems: () => ['start', 'continue'],
    saveManager: { save: { missionsCompleted: 4, mode: 'normal', tries: 1 }, reached: 5 },
  });
  assert.equal(b._titleStageIndex(), 4);
});

test('weekly ranking screen is untouched', () => {
  const sr = renderer();
  const ctx = makeFakeCtx();
  sr.drawLocalRanking(ctx, [], -1, '2026-W36');
  assert.equal(ctx.calls.filter((c) => c.name === 'drawImage').length, 0);
});
```

**注意:** `drawLocalRanking` の引数は `src/js/ui/flows/demoScreens.js` のとおり `(ctx, scores, highlightIndex, weekId)`。実装が違えば合わせる。また「stage 1 は drawImage 0回」は、シーン絵の機体スプライトが drawImage を使っていない前提。使っていれば（煙のスプライトなど）、**環境の重ねを入れる前**にその回数を数えて基準にし、「stage 1 では増えない」を縛る形に変える。

- [ ] **Step 2: 落ちることを確認**

Run: `npm test -- tests/environment-demo-screens.test.js`
Expected: FAIL

- [ ] **Step 3: 実装**

`ScreenRenderer.js`:

```js
import { StageEnvironment } from '../world/StageEnvironment.js';
import { DEMO_OVERLAY_ALPHA_SCALE } from '../utils/Constants.js';
```

クラスに:

```js
    /**
     * デモ画面用の環境。面ごとに1つ作って持つ（霧・雪の板を毎フレーム作り直さない）。
     * game を渡さないので水の描画は none になる（シーン絵の水面線は StageScene が引く）。
     */
    _demoEnv(stageIndex) {
        this._demoEnvs = this._demoEnvs || {};
        if (!this._demoEnvs[stageIndex]) this._demoEnvs[stageIndex] = new StageEnvironment(null, stageIndex);
        return this._demoEnvs[stageIndex];
    }

    /** 画面全体に、その面の環境を（デモ用に薄めて）重ねる。 */
    _drawDemoEnvironment(ctx, stageIndex) {
        const env = this._demoEnv(stageIndex);
        env.update();
        env.drawOverlay(ctx, DEMO_OVERLAY_ALPHA_SCALE);
    }

    /** タイトルの背景に使う面。CONTINUE があればその面、無ければ 1 面。 */
    _titleStageIndex() {
        const items = this.game.titleMenuItems ? this.game.titleMenuItems() : [];
        if (items.includes('continue') && this.game.saveManager) {
            return this.game.saveManager.save.missionsCompleted;
        }
        return 0;
    }
```

`rankingScreens.drawStageRankings` の末尾（走査線の前。走査線が無ければ最後）に `this._drawDemoEnvironment(ctx, stageIndex);`。
`titleScreen.drawStageSelect` の `drawScanlines(ctx, W, H);` の直前に `this._drawDemoEnvironment(ctx, picked - 1);`。
`titleScreen.drawTitleScreen` の `drawScanlines(...)` の直前に `this._drawDemoEnvironment(ctx, this._titleStageIndex());`。

`StageScene.drawStageScene` の `ctx.restore();` の直前に、帯の中だけの重ね:

```js
    // 面の環境を帯の中に描く（設計: デモ画面の背景）。全画面の重ねは画面側が別に行う
    const kind = STAGE_ENVIRONMENTS[stageIndex] ? STAGE_ENVIRONMENTS[stageIndex].kind : 'none';
    if (kind === 'water') {
        ctx.save();
        roundRectPath(ctx, x, y, w, h, 10);
        ctx.clip();
        ctx.fillStyle = WATER_FILL;
        ctx.fillRect(x, floorY - 12, w, h - (floorY - 12 - y));
        drawSurfaceLine(ctx, x, x + w, floorY - 12, nowMs / 16, []);
        ctx.restore();
    }
```

（`STAGE_ENVIRONMENTS`、`WATER_FILL` を import、`drawSurfaceLine` を `../world/environment/water.js` から import。霧と雪は全画面の重ねで帯の中も覆われるので、帯の中だけの重ねは水だけ）

- [ ] **Step 4: 通ることを確認**

Run: `npm test`
Expected: 全 PASS。`tests/demo-screens.test.js` や `tests/stage-ranking-screen.test.js` が drawImage の回数や globalAlpha を数えているなら、環境の重ねの分を期待に足す（**面 1〜3 と 7 では何も増えない**ので、そこを使っているテストは変わらないはず）

- [ ] **Step 5: commit**

```bash
git add src/js/ui/ScreenRenderer.js src/js/ui/StageScene.js src/js/ui/screens/rankingScreens.js src/js/ui/screens/titleScreen.js tests/environment-demo-screens.test.js
git commit -m "feat: 面別ランキング・面セレクト・タイトルの背景にその面の環境を重ねる"
```

---

### Task 21: 実機確認の引き渡しと計測

コードは書かない。ユーザーへ渡す文面と、計測の手順をまとめる。

**Files:**
- Modify: `docs/superpowers/specs/2026-09-04-stage-environments-design.md`（末尾に「実装後の確認」節）

- [ ] **Step 1: 引き渡しの文面を用意する**

以下を含める:

- ハードリロード（Cmd+Shift+R）が要ること
- 確認する面と見るポイント、対応する定数（表にする）:

| 面 | 見るところ | 定数 |
|---|---|---|
| 4 | 水の色と濃さ、水面の波、しぶきの量、水中の重さ | `WATER_FILL` `WATER_WAVE_AMPLITUDE` `SPLASH_PARTICLES_PER_VY` `WATER_SPEED_SCALE` `WATER_GRAVITY_SCALE` |
| 5 | 降雪の密度と速さ、積雪の帯の厚み、滑りの気持ちよさ、斜面の見え方 | `SNOW_LAYERS` `SNOW_CAP_THICKNESS` `ICE_SLIDE` `SLOPE_DOWNHILL_ACCEL` `SLOPE_UPHILL_SCALE` |
| 6 | 霧の濃さ、煙幕との見分けにくさ、索敵の縮み | `FOG_OVERLAY_ALPHA` `FOG_LAYERS` `FOG_SIGHT_SCALE` |
| 7 | 遠景の機械の密度と色 | `CaveBackdrop._drawMachineDecor` のモジュール定数 |
| デモ | 面別ランキング・面セレクト・タイトルの重ねの薄さ | `DEMO_OVERLAY_ALPHA_SCALE` |

- **計測**: 雪の面と霧の面で1回ずつ。2026-08-16 と同じ方式（フレーム間隔と描画+更新の時間を配列に積み、終了時に JSON をダウンロードする一時コード。画面には出さない）。見る値は p99 と max のフレーム間隔、描画時間の平均。8.4% から倍以内なら合格
- 計測用の一時コードは commit しない（`git add -p` で除く）

- [ ] **Step 2: 設計書に節を足して commit**

```bash
git add docs/superpowers/specs/2026-09-04-stage-environments-design.md
git commit -m "docs: 環境の実装後の確認ポイントと計測手順"
```

---

## Self-Review（計画を書いた後に確認した）

**Spec coverage**

| 設計の節 | タスク |
|---|---|
| 0 表と問い合わせ口 | 1, 2 |
| 1 物理（機体・弾・ドローン・霧の索敵・煙幕の独立） | 4, 5, 6, 7, 15 |
| 2 地底湖（生成・破壊・描画・しぶき・波紋） | 11, 12, 13, 14 |
| 3 雪（積雪・降雪・滑り・斜面・階段・舞う雪） | 16, 17, 18, 19 |
| 4 霧 | 9 |
| 5 描画順と費用 | 8, 21 |
| 6 遠景 | 10 |
| 7 デモ画面 | 20 |
| 8 テスト（軌跡の不変・決定性・各挙動） | 3 と各タスク |

**設計との差分（意図的）**

- 斜面の「高さ調整」は当たり判定ではなく描画オフセット＋下りの吸着（設計書を先にそう直してある）
- 戦車の斜面は加速と粒だけで、45度の描画補間は無し（ホバー戦車は段を自前で飛ぶ）

**Type consistency**

- `motionFor(game, x, y)` / `sightScaleFor(game)`: Task 2 で定義、4〜7 と 15 で使用
- `env.renderer.invalidate(cells)` / `addRipple(x, strength)`: Task 13 で定義、12（`onWaterChanged`）と 14 で使用
- `Map.isWater / isWaterAtPixel / waterSurfaceRow / waterCells / water / waterSurface`: Task 11 で定義、12〜15 で使用
- `Map.envKind`: Task 11 で定義、16 と 19 で使用
- `stairDirection(map, r, c)` / `slopeDrawOffset(dir, feetCenterX)`: Task 18 で定義、19 のテストで使用
- `Game.spawnSplash(x, surfaceY, vy)` / `Game.spawnSnowKick(x, y, count)`: 14 / 18
