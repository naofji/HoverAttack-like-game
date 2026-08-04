# 敵アタッカー 脚アニメーション刷新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** EnemyAttacker 4型の脚を `fillRect` 2枚の簡易描画から関節ストローク描画へ置き換え、standard / rival / heavy は2足歩行＋振り子、artillery は対角トロットの4脚クモ歩行にする。

**Architecture:** 「股関節→膝→足首のポリライン＋足裏」を描く単一のプリミティブ `_drawJointedLeg()` を用意し、ポーズの決定（歩行フレーム→座標、空中の振り子回転、クモの脚上げ）は呼び出し側が行う。型ごとの寸法・振り幅はモジュールスコープの `LEG_STYLES` 定数に集約し、`config.name` で引く。AI・物理・当たり判定には一切触れない。

**Tech Stack:** 素の ES モジュール + Canvas 2D。テストは `node --test`（`node:test` / `node:assert/strict`）。

**Spec:** `docs/superpowers/specs/2026-08-04-enemy-attacker-leg-animation-design.md`

## Global Constraints

- 変更対象ファイルは `src/js/entities/EnemyAttacker.js` のみ（＋ `tests/` 配下の新規ファイル2つ）。
- `src/js/utils/Constants.js`、`src/js/entities/Player.js`、AI・物理・当たり判定のコードは変更しない。`this.width` / `this.height` は不変。
- `_updateWalkAnimation()`（`src/js/entities/EnemyAttacker.js:212-224`）は変更しない。タイマー閾値は現行の 5 のまま。
- `draw()` 本体から脚描画メソッドを呼ぶ位置・引数は現行のまま変えない（`this._drawLegs(ctx, crouchOffset)` / `this._drawArtilleryLegs(ctx, crouchOffset)`）。
- 脚の色は固定グレーにせず `this.config.bodyColor`（手前脚）/ `this.config.headColor`（奥脚）を使う。
- 空中の振り子の正規化の分母は `this.maxSpeed`（`PLAYER_MAX_SPEED` ではない）。
- 未知の `config.name` は `standard` のスタイルにフォールバックする。
- テスト実行コマンドは常に `npm test`（＝ `node --test`）。個別実行は `node --test tests/<file>`。
- 実機確認はユーザーが行う。ブラウザ自動化は起動しない。

## File Structure

| ファイル | 責務 |
|---|---|
| `src/js/entities/EnemyAttacker.js`（変更） | `LEG_STYLES` 定数、`_legStyle()` / `_hoverSwing()` / `_drawJointedLeg()` / `_drawLegs()` / `_drawArtilleryLegs()`。`_drawLeg()` は削除 |
| `tests/helpers/fake-ctx.js`（新規） | 呼び出しを記録するフェイク Canvas 2D コンテキストと、記録からポリラインを抽出するヘルパー |
| `tests/attacker-leg-animation.test.js`（新規） | 脚描画の幾何検証（Task 1〜4 で追記していく） |

---

### Task 1: テスト基盤と共通ヘルパー（`_legStyle` / `_hoverSwing`）

**Files:**

- Create: `tests/helpers/fake-ctx.js`
- Create: `tests/attacker-leg-animation.test.js`
- Modify: `src/js/entities/EnemyAttacker.js`（import 直後に `LEG_STYLES` を追加、クラス末尾に2メソッド追加）

**Interfaces:**

- Consumes: なし（最初のタスク）
- Produces:
  - `makeFakeCtx()` → 呼び出し記録つきの疑似 ctx。`ctx.calls` は `{ name: string, args: any[] }` の配列
  - `extractPolylines(calls)` → `Array<Array<{x:number,y:number}>>`。`beginPath` 〜 `stroke` の間の `moveTo`/`lineTo` を1本のポリラインとして取り出す
  - `makeAttacker(overrides)` （テストファイル内のローカル関数）→ コンストラクタを通さない `EnemyAttacker` インスタンス
  - `EnemyAttacker.prototype._legStyle()` → `LEG_STYLES` のエントリ
  - `EnemyAttacker.prototype._hoverSwing()` → `-1`〜`+1` の数値

- [ ] **Step 1: フェイク ctx ヘルパーを作る**

`tests/helpers/fake-ctx.js` を新規作成:

```js
// 呼び出しを記録するだけの疑似 Canvas 2D コンテキスト。
// 描画メソッドの幾何を検証するために使う。

const METHODS = [
  'save', 'restore', 'translate', 'scale', 'rotate',
  'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc',
  'stroke', 'fill', 'fillRect', 'strokeRect', 'clearRect',
];

/** @returns {object} calls 配列を持つ疑似 ctx */
export function makeFakeCtx() {
  const calls = [];
  const ctx = {
    calls,
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    lineCap: '', lineJoin: '', globalAlpha: 1, font: '', textAlign: '',
  };
  for (const name of METHODS) {
    ctx[name] = (...args) => { calls.push({ name, args }); };
  }
  return ctx;
}

/**
 * beginPath 〜 stroke の間の moveTo/lineTo を1本のポリラインとして抽出する。
 * @param {Array<{name:string,args:any[]}>} calls
 * @returns {Array<Array<{x:number,y:number}>>}
 */
export function extractPolylines(calls) {
  const out = [];
  let current = null;
  for (const c of calls) {
    if (c.name === 'beginPath') {
      current = [];
    } else if (current && (c.name === 'moveTo' || c.name === 'lineTo')) {
      current.push({ x: c.args[0], y: c.args[1] });
    } else if (c.name === 'stroke' && current) {
      out.push(current);
      current = null;
    }
  }
  return out;
}

/** fillRect 呼び出しだけを {x,y,w,h} の配列で取り出す。 */
export function extractFillRects(calls) {
  return calls
    .filter((c) => c.name === 'fillRect')
    .map((c) => ({ x: c.args[0], y: c.args[1], w: c.args[2], h: c.args[3] }));
}
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/attacker-leg-animation.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyAttacker } from '../src/js/entities/EnemyAttacker.js';
import { makeFakeCtx, extractPolylines, extractFillRects } from './helpers/fake-ctx.js';

const AIR_MAP = { isSolidAtPixel: () => false, cols: 1000, rows: 1000 };

function makeConfig(overrides = {}) {
  return {
    hp: 30, speed: 1.0, jumpForce: -8, score: 100,
    fireInterval: 30, sightRange: 100,
    movementType: 'stop_and_shoot', name: 'standard',
    climbStyle: 'hover', aimAccuracy: 1.0,
    bodyColor: '#55CCDD', headColor: '#338899',
    visorColor: '#FF0000', backpackColor: '#888888', exhaustColor: '#00FFFF',
    ...overrides
  };
}

/** コンストラクタのスポーン処理を通さずに描画可能な最小インスタンスを作る。 */
function makeAttacker(overrides = {}) {
  const { config: configOverrides, ...state } = overrides;
  const config = makeConfig(configOverrides);
  const a = Object.create(EnemyAttacker.prototype);
  a.game = { map: AIR_MAP, enemies: [], player: null, carrier: null,
             projectiles: [], enemyBullets: [] };
  a.x = 0; a.y = 0; a.width = 16; a.height = 24;
  a.vx = 0; a.vy = 0;
  a.alive = true;
  a.onGround = true;
  a.config = config;
  a.hp = config.hp; a.maxHp = config.hp;
  a.maxSpeed = config.speed;
  a.jumpForce = config.jumpForce;
  a.facingRight = true;
  a.walkFrame = 2;
  a.walkTimer = 0;
  a.hovering = false;
  a.crouching = false;
  a.burstCount = 0;
  a.frameCounter = 0;
  Object.assign(a, state);
  return a;
}

test('_legStyle: 既知の型はそれぞれ専用スタイルを返す', () => {
  assert.equal(makeAttacker({ config: { name: 'heavy' } })._legStyle().lineWidth, 4);
  assert.equal(makeAttacker({ config: { name: 'standard' } })._legStyle().lineWidth, 3);
});

test('_legStyle: rival は standard と同一のスタイル（プレイヤー同等）', () => {
  const rival = makeAttacker({ config: { name: 'rival' } })._legStyle();
  const standard = makeAttacker({ config: { name: 'standard' } })._legStyle();
  assert.deepEqual(rival, standard);
});

test('_legStyle: 未知の型は standard にフォールバックする', () => {
  const unknown = makeAttacker({ config: { name: 'nonexistent-type' } })._legStyle();
  const standard = makeAttacker({ config: { name: 'standard' } })._legStyle();
  assert.deepEqual(unknown, standard);
});

test('_hoverSwing: maxSpeed で正規化され -1..+1 に収まる', () => {
  const a = makeAttacker({ vx: 0.5, config: { speed: 1.0 } });
  assert.equal(a._hoverSwing(), 0.5);

  a.vx = 5.0; // maxSpeed を大きく超える
  assert.equal(a._hoverSwing(), 1);

  a.vx = -5.0;
  assert.equal(a._hoverSwing(), -1);
});

test('_hoverSwing: 左向きのときは進行方向ローカルに反転する', () => {
  const right = makeAttacker({ vx: 0.5, facingRight: true, config: { speed: 1.0 } });
  const left = makeAttacker({ vx: 0.5, facingRight: false, config: { speed: 1.0 } });
  assert.equal(left._hoverSwing(), -right._hoverSwing());
});

test('_hoverSwing: 型ごとの maxSpeed で正規化される（rival が振り切れない）', () => {
  const rival = makeAttacker({ vx: 1.2, config: { name: 'rival', speed: 1.2 } });
  const heavy = makeAttacker({ vx: 0.5, config: { name: 'heavy', speed: 0.5 } });
  assert.equal(rival._hoverSwing(), 1);
  assert.equal(heavy._hoverSwing(), 1);
});
```

- [ ] **Step 3: テストを実行して失敗を確認**

Run: `npm test -- tests/attacker-leg-animation.test.js`

Expected: FAIL。`a._legStyle is not a function` で落ちる。

- [ ] **Step 4: `LEG_STYLES` と2メソッドを実装**

`src/js/entities/EnemyAttacker.js` の import ブロック直後（`import { MissileKit } ...` の次の行）に追加:

```js
/**
 * 型別の脚描画パラメータ（描画専用なので Constants.js には置かない）。
 * rival は「プレイヤーと対等な好敵手」なので standard = プレイヤーと同じ値を共有する。
 */
const LEG_STYLES = {
    standard: {
        hipFar: 7, hipNear: 10, lineWidth: 3,
        footW: 5, footH: 2, strideScale: 1,
        maxSwing: Math.PI / 4, phaseOffset: 0.2,
        crouchSpread: 3, thighPlate: false,
    },
    rival: {
        hipFar: 7, hipNear: 10, lineWidth: 3,
        footW: 5, footH: 2, strideScale: 1,
        maxSwing: Math.PI / 4, phaseOffset: 0.2,
        crouchSpread: 3, thighPlate: false,
    },
    heavy: {
        hipFar: 6, hipNear: 11, lineWidth: 4,
        footW: 6, footH: 3, strideScale: 0.7,
        maxSwing: Math.PI / 6, phaseOffset: 0.15,
        crouchSpread: 5, thighPlate: true,
    },
    artillery: {
        hipFar: 7, hipNear: 10, lineWidth: 2,
        footW: 3, footH: 2, strideScale: 1,
        maxSwing: (25 * Math.PI) / 180, phaseOffset: 0.2,
        crouchSpread: 6, thighPlate: false,
    },
};
```

クラス末尾（`_drawLeg` の直前）に2メソッドを追加:

```js
    /** 型別の脚スタイルを引く。未知の型は standard にフォールバック。 */
    _legStyle() {
        return LEG_STYLES[this.config.name] || LEG_STYLES.standard;
    }

    /**
     * 空中の振り子量を -1..+1 で返す。
     * 進行方向ローカルの横速度を、その機体の最高速で正規化する。
     * 型ごとに最高速が 2.4 倍違う（heavy 0.5 / rival 1.20）ため、
     * プレイヤーのような固定定数ではなく this.maxSpeed を分母にする。
     */
    _hoverSwing() {
        const localVx = this.facingRight ? this.vx : -this.vx;
        const max = this.maxSpeed;
        const clamped = Math.max(-max, Math.min(max, localVx));
        return clamped / max;
    }
```

- [ ] **Step 5: テストを実行して成功を確認**

Run: `npm test -- tests/attacker-leg-animation.test.js`

Expected: PASS（6件）。

- [ ] **Step 6: コミット**

```bash
git add tests/helpers/fake-ctx.js tests/attacker-leg-animation.test.js src/js/entities/EnemyAttacker.js
git commit -m "feat: 敵アタッカー脚描画の型別スタイル定数と振り子計算を追加"
```

---

### Task 2: 共通プリミティブ `_drawJointedLeg()`

**Files:**

- Modify: `src/js/entities/EnemyAttacker.js`（Task 1 で追加した `_hoverSwing()` の直後）
- Test: `tests/attacker-leg-animation.test.js`（追記）

**Interfaces:**

- Consumes: Task 1 の `makeFakeCtx()` / `extractPolylines()` / `extractFillRects()` / `makeAttacker()`
- Produces:
  - `_drawJointedLeg(ctx, opts)` — `opts` は
    `{ hipX, hipY, kneeX, kneeY, footX, footY, legColor, footColor, lineWidth, footW, footH, footRotation = 0, thighPlate = false }`。
    股関節→膝→足首の3点を1本の `stroke` で描き、足首を原点に `translate`（必要なら `rotate`）して足裏を `fillRect` する。
    後続の全タスクがこの1本を唯一の脚描画手段として使う。

- [ ] **Step 1: 失敗するテストを書く**

`tests/attacker-leg-animation.test.js` の末尾に追記:

```js
test('_drawJointedLeg: 股関節→膝→足首の3点ポリラインを1本描く', () => {
  const a = makeAttacker();
  const ctx = makeFakeCtx();
  a._drawJointedLeg(ctx, {
    hipX: 10, hipY: 16, kneeX: 12, kneeY: 19, footX: 14, footY: 22,
    legColor: '#111111', footColor: '#222222',
    lineWidth: 3, footW: 5, footH: 2,
  });

  const lines = extractPolylines(ctx.calls);
  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0], [
    { x: 10, y: 16 },
    { x: 12, y: 19 },
    { x: 14, y: 22 },
  ]);
});

test('_drawJointedLeg: 足裏は足首を原点に translate して描かれる', () => {
  const a = makeAttacker();
  const ctx = makeFakeCtx();
  a._drawJointedLeg(ctx, {
    hipX: 10, hipY: 16, kneeX: 12, kneeY: 19, footX: 14, footY: 22,
    legColor: '#111111', footColor: '#222222',
    lineWidth: 3, footW: 5, footH: 2,
  });

  const translates = ctx.calls.filter((c) => c.name === 'translate');
  assert.deepEqual(translates.at(-1).args, [14, 22]);

  const rects = extractFillRects(ctx.calls);
  const foot = rects.at(-1);
  assert.equal(foot.w, 5);
  assert.equal(foot.h, 2);
});

test('_drawJointedLeg: footRotation が 0 のときは rotate しない', () => {
  const a = makeAttacker();
  const ctx = makeFakeCtx();
  a._drawJointedLeg(ctx, {
    hipX: 10, hipY: 16, kneeX: 12, kneeY: 19, footX: 14, footY: 22,
    legColor: '#111111', footColor: '#222222',
    lineWidth: 3, footW: 5, footH: 2, footRotation: 0,
  });
  assert.equal(ctx.calls.filter((c) => c.name === 'rotate').length, 0);
});

test('_drawJointedLeg: footRotation が非0なら足裏を回転する', () => {
  const a = makeAttacker();
  const ctx = makeFakeCtx();
  a._drawJointedLeg(ctx, {
    hipX: 10, hipY: 16, kneeX: 12, kneeY: 19, footX: 14, footY: 22,
    legColor: '#111111', footColor: '#222222',
    lineWidth: 3, footW: 5, footH: 2, footRotation: 0.5,
  });
  const rotates = ctx.calls.filter((c) => c.name === 'rotate');
  assert.equal(rotates.length, 1);
  assert.equal(rotates[0].args[0], 0.5);
});

test('_drawJointedLeg: thighPlate 指定時は腿の装甲板が1枚増える', () => {
  const a = makeAttacker();
  const base = makeFakeCtx();
  const plated = makeFakeCtx();
  const opts = {
    hipX: 10, hipY: 16, kneeX: 12, kneeY: 19, footX: 14, footY: 22,
    legColor: '#111111', footColor: '#222222',
    lineWidth: 4, footW: 6, footH: 3,
  };
  a._drawJointedLeg(base, { ...opts, thighPlate: false });
  a._drawJointedLeg(plated, { ...opts, thighPlate: true });

  assert.equal(extractFillRects(plated.calls).length,
               extractFillRects(base.calls).length + 1);
});

test('_drawJointedLeg: save/restore が対で呼ばれる', () => {
  const a = makeAttacker();
  const ctx = makeFakeCtx();
  a._drawJointedLeg(ctx, {
    hipX: 10, hipY: 16, kneeX: 12, kneeY: 19, footX: 14, footY: 22,
    legColor: '#111111', footColor: '#222222',
    lineWidth: 3, footW: 5, footH: 2,
  });
  assert.equal(ctx.calls.filter((c) => c.name === 'save').length,
               ctx.calls.filter((c) => c.name === 'restore').length);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test -- tests/attacker-leg-animation.test.js`

Expected: FAIL。`a._drawJointedLeg is not a function`。

- [ ] **Step 3: `_drawJointedLeg()` を実装**

`src/js/entities/EnemyAttacker.js` の `_hoverSwing()` の直後に追加:

```js
    /**
     * 脚1本を描く唯一のプリミティブ。
     * ポーズの決定（歩行フレーム→座標、振り子回転、脚上げ）は呼び出し側の責務で、
     * ここは渡された座標をそのまま描くだけの純粋な描画関数。
     */
    _drawJointedLeg(ctx, opts) {
        const {
            hipX, hipY, kneeX, kneeY, footX, footY,
            legColor, footColor, lineWidth, footW, footH,
            footRotation = 0, thighPlate = false,
        } = opts;

        // 股関節 → 膝 → 足首
        ctx.strokeStyle = legColor;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.lineTo(kneeX, kneeY);
        ctx.lineTo(footX, footY);
        ctx.stroke();

        // 腿の装甲板（heavy のバルク感）
        if (thighPlate) {
            ctx.fillStyle = footColor;
            ctx.fillRect((hipX + kneeX) / 2 - 2, (hipY + kneeY) / 2 - 1, 4, 3);
        }

        // 足裏
        ctx.save();
        ctx.translate(footX, footY);
        if (footRotation !== 0) ctx.rotate(footRotation);
        ctx.fillStyle = footColor;
        ctx.fillRect(-Math.floor(footW / 2), 0, footW, footH);
        ctx.restore();
    }
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm test -- tests/attacker-leg-animation.test.js`

Expected: PASS（12件）。

- [ ] **Step 5: コミット**

```bash
git add tests/attacker-leg-animation.test.js src/js/entities/EnemyAttacker.js
git commit -m "feat: 敵アタッカーの関節脚描画プリミティブを追加"
```

---

### Task 3: 2足型（standard / rival / heavy）の脚描画置き換え

**Files:**

- Modify: `src/js/entities/EnemyAttacker.js`（`_drawLegs()` を全面書き換え、`_drawLeg()` を削除、ポーズ表を追加）
- Test: `tests/attacker-leg-animation.test.js`（追記）

**Interfaces:**

- Consumes: Task 2 の `_drawJointedLeg(ctx, opts)`、Task 1 の `_legStyle()` / `_hoverSwing()`
- Produces:
  - `_drawLegs(ctx, crouchOffset = 0)` — 既存シグネチャ維持。しゃがみ／空中／歩行を振り分ける
  - `_drawWalkLegs(ctx, hipY, style)` / `_drawAirLegs(ctx, hipY, style)` / `_drawCrouchLegs(ctx, hipY, style)`
  - モジュールスコープ定数 `WALK_FRAME_POSES`（`{near:number, far:number}` の配列）と `LEG_POSES`（`{kdx,kdy,fdx,fdy}` の配列）

- [ ] **Step 1: 失敗するテストを書く**

`tests/attacker-leg-animation.test.js` の末尾に追記:

```js
// --- 2足型（standard / rival / heavy） ---

/** 脚2本ぶんのポリラインを取り出す。[0] が奥脚、[1] が手前脚。 */
function drawLegsAndExtract(a, crouchOffset = 0) {
  const ctx = makeFakeCtx();
  a._drawLegs(ctx, crouchOffset);
  return { lines: extractPolylines(ctx.calls), rects: extractFillRects(ctx.calls), ctx };
}

test('2足型: 接地時は脚を2本描く', () => {
  const a = makeAttacker({ onGround: true, vx: 0.9, walkFrame: 0 });
  const { lines } = drawLegsAndExtract(a);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].length, 3); // hip, knee, foot
});

test('2足型: walkFrame 0..3 でそれぞれ異なる足先座標になる', () => {
  const seen = new Set();
  for (const frame of [0, 1, 2, 3]) {
    const a = makeAttacker({ onGround: true, vx: 0.9, walkFrame: frame });
    const { lines } = drawLegsAndExtract(a);
    const key = lines.map((l) => `${l[2].x},${l[2].y}`).join('|');
    seen.add(key);
  }
  assert.equal(seen.size, 4, 'walkFrame ごとに異なるポーズになること');
});

test('2足型: 空中で vx の符号を反転すると足先が股関節の前後に振れる', () => {
  const fwd = makeAttacker({ onGround: false, vx: 0.9 });
  const back = makeAttacker({ onGround: false, vx: -0.9 });

  const fwdLines = drawLegsAndExtract(fwd).lines;
  const backLines = drawLegsAndExtract(back).lines;

  // 手前脚（2本目）の足先の、股関節からの水平オフセット
  const fwdOffset = fwdLines[1][2].x - fwdLines[1][0].x;
  const backOffset = backLines[1][2].x - backLines[1][0].x;

  assert.ok(fwdOffset * backOffset < 0, '前進時と後退時で足先が逆側に流れること');
});

test('2足型: 空中で vx=0 でも位相ずれにより左右の脚が揃わない', () => {
  const a = makeAttacker({ onGround: false, vx: 0 });
  const { lines } = drawLegsAndExtract(a);
  const farOffset = lines[0][2].x - lines[0][0].x;
  const nearOffset = lines[1][2].x - lines[1][0].x;
  assert.notEqual(farOffset, nearOffset);
});

test('2足型: rival の脚の頂点は standard と完全に一致する（プレイヤー同等）', () => {
  const mk = (name) => makeAttacker({
    onGround: true, vx: 0.9, walkFrame: 1, config: { name, speed: 1.0 },
  });
  const rival = drawLegsAndExtract(mk('rival')).lines;
  const standard = drawLegsAndExtract(mk('standard')).lines;
  assert.deepEqual(rival, standard);
});

test('2足型: heavy は足裏が大きく歩幅が狭い', () => {
  const mk = (name) => makeAttacker({
    onGround: true, vx: 0.9, walkFrame: 0, config: { name, speed: 1.0 },
  });

  const heavy = drawLegsAndExtract(mk('heavy'));
  const standard = drawLegsAndExtract(mk('standard'));

  // 足裏サイズ（装甲板を除く最後の fillRect が足裏）
  assert.ok(heavy.rects.at(-1).w > standard.rects.at(-1).w, 'heavy の足裏が大きいこと');

  // 歩幅: 手前脚の足先の股関節からの水平オフセットの大きさ
  const stride = (r) => Math.abs(r.lines[1][2].x - r.lines[1][0].x);
  assert.ok(stride(heavy) < stride(standard), 'heavy の歩幅が狭いこと');
});

test('2足型: しゃがみ時は膝が股関節より外側に開く', () => {
  const a = makeAttacker({ onGround: true, vx: 0, crouching: true });
  const { lines } = drawLegsAndExtract(a, 4);
  assert.equal(lines.length, 2);

  const [far, near] = lines;
  assert.ok(far[1].x < far[0].x, '奥脚の膝が外(左)に開くこと');
  assert.ok(near[1].x > near[0].x, '手前脚の膝が外(右)に開くこと');
});

test('2足型: しゃがみ時は crouchOffset ぶん股関節が上に寄る（足は接地位置を保つ）', () => {
  const a = makeAttacker({ onGround: true, vx: 0, crouching: true });
  const standing = drawLegsAndExtract(makeAttacker({ onGround: true, vx: 0 }), 0).lines;
  const crouched = drawLegsAndExtract(a, 4).lines;
  assert.equal(crouched[0][0].y, standing[0][0].y - 4);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test -- tests/attacker-leg-animation.test.js`

Expected: FAIL。旧 `_drawLegs` は `fillRect` しか呼ばないため `extractPolylines` が空配列を返し、「接地時は脚を2本描く」が `0 !== 2` で落ちる。

- [ ] **Step 3: ポーズ表の定数を追加**

`src/js/entities/EnemyAttacker.js` の `LEG_STYLES` 定義の直後に追加:

```js
/** 歩行4フレーム → 手前脚/奥脚のポーズ番号（Player の WALK_POSES と同じ割り当て）。 */
const WALK_FRAME_POSES = [
    { near: 0, far: 1 },
    { near: 2, far: 3 },
    { near: 2, far: 2 }, // 直立・停止時
    { near: 3, far: 2 },
];

/**
 * ポーズ番号 → 股関節からの相対座標（膝 kdx/kdy、足首 fdx/fdy）。
 * Player._drawSingleLeg の switch から移植したもの。
 */
const LEG_POSES = [
    { kdx: 2, kdy: 3, fdx: 4, fdy: 6 },
    { kdx: -3, kdy: 3, fdx: -5, fdy: 4 },
    { kdx: 0, kdy: 3, fdx: 0, fdy: 6 },
    { kdx: 4, kdy: 1, fdx: 3, fdy: 3 },
];

/** 空中で股関節を中心に回転させる基準ポーズ（Player._drawSingleLeg 準拠）。 */
const AIR_BASE_POSE = {
    near: { kdx: 1, kdy: 3, fdx: 0, fdy: 6 },
    far: { kdx: -1, kdy: 3, fdx: -2, fdy: 6 },
};
```

- [ ] **Step 4: `_drawLegs()` を書き換え、`_drawLeg()` を削除**

`src/js/entities/EnemyAttacker.js` の既存の `_drawLegs(ctx, crouchOffset = 0) { ... }` と
`_drawLeg(ctx, legX, legY, offset) { ... }` を丸ごと削除し、以下に置き換える:

```js
    /** 2足型（standard / rival / heavy）の脚。しゃがみ／空中／歩行を振り分ける。 */
    _drawLegs(ctx, crouchOffset = 0) {
        const style = this._legStyle();
        // draw() が既に crouchOffset ぶん下へ平行移動しているので、
        // 股関節を同じだけ上げると足の接地位置が変わらない。
        const hipY = 16 - crouchOffset;

        if (crouchOffset > 0) {
            this._drawCrouchLegs(ctx, hipY, style);
        } else if (!this.onGround) {
            this._drawAirLegs(ctx, hipY, style);
        } else {
            this._drawWalkLegs(ctx, hipY, style);
        }
    }

    /** 脚1本ぶんの共通オプションを組み立てる。 */
    _legPaint(isNear, style) {
        return {
            legColor: isNear ? this.config.bodyColor : this.config.headColor,
            footColor: isNear ? this.config.headColor : this.config.bodyColor,
            lineWidth: style.lineWidth,
            footW: style.footW,
            footH: style.footH,
            thighPlate: style.thighPlate,
        };
    }

    /** 接地時: 4フレームの2足歩行サイクル。 */
    _drawWalkLegs(ctx, hipY, style) {
        const frame = WALK_FRAME_POSES[this.walkFrame] || WALK_FRAME_POSES[2];

        const drawOne = (isNear, poseIndex) => {
            const hipX = isNear ? style.hipNear : style.hipFar;
            const p = LEG_POSES[poseIndex];
            const s = style.strideScale;
            this._drawJointedLeg(ctx, {
                hipX, hipY,
                kneeX: hipX + p.kdx * s, kneeY: hipY + p.kdy,
                footX: hipX + p.fdx * s, footY: hipY + p.fdy,
                ...this._legPaint(isNear, style),
            });
        };

        drawOne(false, frame.far);  // 奥脚を先に（手前脚が上に重なる）
        drawOne(true, frame.near);
    }

    /** 空中: 横速度に比例して股関節を中心に脚が振れる。 */
    _drawAirLegs(ctx, hipY, style) {
        const swing = this._hoverSwing();

        const drawOne = (isNear, swingAmount) => {
            const hipX = isNear ? style.hipNear : style.hipFar;
            const base = isNear ? AIR_BASE_POSE.near : AIR_BASE_POSE.far;
            const angle = swingAmount * style.maxSwing;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const rot = (dx, dy) => ({
                x: hipX + (dx * cos - dy * sin),
                y: hipY + (dx * sin + dy * cos),
            });
            const knee = rot(base.kdx, base.kdy);
            const foot = rot(base.fdx, base.fdy);
            this._drawJointedLeg(ctx, {
                hipX, hipY,
                kneeX: knee.x, kneeY: knee.y,
                footX: foot.x, footY: foot.y,
                footRotation: angle / 1.5,
                ...this._legPaint(isNear, style),
            });
        };

        // 奥脚は位相をずらし、左右がぴったり揃わないようにする
        drawOne(false, swing * 0.8 - style.phaseOffset);
        drawOne(true, swing);
    }

    /** しゃがみ（バースト射撃時）: 膝を外に折って車高を下げる。 */
    _drawCrouchLegs(ctx, hipY, style) {
        const spread = style.crouchSpread;

        const drawOne = (isNear, dir) => {
            const hipX = isNear ? style.hipNear : style.hipFar;
            this._drawJointedLeg(ctx, {
                hipX, hipY,
                kneeX: hipX + dir * (spread + 2), kneeY: hipY + 4,
                footX: hipX + dir * spread, footY: hipY + 6,
                ...this._legPaint(isNear, style),
            });
        };

        drawOne(false, -1);
        drawOne(true, 1);
    }
```

- [ ] **Step 5: テストを実行して成功を確認**

Run: `npm test -- tests/attacker-leg-animation.test.js`

Expected: PASS（20件）。

- [ ] **Step 6: 既存テストが壊れていないことを確認**

Run: `npm test`

Expected: 全件 PASS。失敗があれば `_drawLeg` を参照している箇所を探して直す（`grep -rn "_drawLeg\b" src tests`）。

- [ ] **Step 7: コミット**

```bash
git add tests/attacker-leg-animation.test.js src/js/entities/EnemyAttacker.js
git commit -m "feat: standard/rival/heavy の脚を関節2足歩行アニメーションに置き換え"
```

---

### Task 4: artillery の4脚クモ歩行

**Files:**

- Modify: `src/js/entities/EnemyAttacker.js`（`_drawArtilleryLegs()` を全面書き換え、脚定義の定数を追加）
- Test: `tests/attacker-leg-animation.test.js`（追記）

**Interfaces:**

- Consumes: Task 2 の `_drawJointedLeg()`、Task 1 の `_legStyle()` / `_hoverSwing()`
- Produces:
  - `_drawArtilleryLegs(ctx, crouchOffset = 0)` — 既存シグネチャ維持
  - モジュールスコープ定数 `SPIDER_LEGS`（4本の脚定義）、`SPIDER_SWEEP`、`SPIDER_LIFT`

- [ ] **Step 1: 失敗するテストを書く**

`tests/attacker-leg-animation.test.js` の末尾に追記:

```js
// --- artillery（4脚クモ歩行） ---

function drawArtilleryAndExtract(a, crouchOffset = 0) {
  const ctx = makeFakeCtx();
  a._drawArtilleryLegs(ctx, crouchOffset);
  return extractPolylines(ctx.calls);
}

function makeArtillery(overrides = {}) {
  return makeAttacker({
    onGround: true, vx: 0.4,
    ...overrides,
    config: { name: 'artillery', speed: 0.4, bodyColor: '#DDAA00',
              headColor: '#AA7700', ...(overrides.config || {}) },
  });
}

test('artillery: 脚を4本描く', () => {
  const lines = drawArtilleryAndExtract(makeArtillery({ walkFrame: 0 }));
  assert.equal(lines.length, 4);
  for (const l of lines) assert.equal(l.length, 3);
});

test('artillery: 全脚の膝が股関節より上にある（クモ型の逆へ字）', () => {
  for (const frame of [0, 1, 2, 3]) {
    const lines = drawArtilleryAndExtract(makeArtillery({ walkFrame: frame }));
    for (const [hip, knee] of lines.map((l) => [l[0], l[1]])) {
      assert.ok(knee.y < hip.y, `frame ${frame}: 膝(${knee.y}) が股関節(${hip.y}) より上にあること`);
    }
  }
});

test('artillery: グループAとグループBの足先は常に逆位相', () => {
  // SPIDER_LEGS の並び順は [手前前脚, 奥前脚, 手前後脚, 奥後脚]。
  // グループA = index 0 と 3、グループB = index 1 と 2。
  // walkFrame 2 は両グループとも中立なので、これを基準に差分を取る。
  const baseline = drawArtilleryAndExtract(makeArtillery({ walkFrame: 2 }));
  const baseOffset = (i) => baseline[i][2].x - baseline[i][0].x;

  for (const frame of [0, 1, 2, 3]) {
    const lines = drawArtilleryAndExtract(makeArtillery({ walkFrame: frame }));
    const offset = (i) => lines[i][2].x - lines[i][0].x;

    // 同じグループの2本は同じスイープ量ぶん動く
    assert.equal(offset(0) - baseOffset(0), offset(3) - baseOffset(3),
                 `frame ${frame}: グループAの2本が同位相であること`);
    assert.equal(offset(1) - baseOffset(1), offset(2) - baseOffset(2),
                 `frame ${frame}: グループBの2本が同位相であること`);

    // A と B のスイープは互いに逆符号（中立フレームでは両方 0）
    assert.equal(offset(0) - baseOffset(0), -(offset(1) - baseOffset(1)),
                 `frame ${frame}: A と B のスイープが逆位相であること`);
  }
});

test('artillery: 接地脚が常に2本以上ある', () => {
  for (const frame of [0, 1, 2, 3]) {
    const lines = drawArtilleryAndExtract(makeArtillery({ walkFrame: frame }));
    const footYs = lines.map((l) => l[2].y);
    const lowest = Math.max(...footYs);
    const grounded = footYs.filter((y) => y === lowest).length;
    assert.ok(grounded >= 2, `frame ${frame}: 接地脚が ${grounded} 本（2本以上必要）`);
  }
});

test('artillery: 遊脚は接地脚より足先が高い位置にある', () => {
  const lines = drawArtilleryAndExtract(makeArtillery({ walkFrame: 1 }));
  const footYs = lines.map((l) => l[2].y);
  assert.ok(new Set(footYs).size > 1, 'frame 1 では脚の高さに差が出ること');
});

test('artillery: 停止時（walkFrame 2）は全脚が同じ高さで静止する', () => {
  const lines = drawArtilleryAndExtract(makeArtillery({ vx: 0, walkFrame: 2 }));
  const footYs = lines.map((l) => l[2].y);
  assert.equal(new Set(footYs).size, 1);
});

test('artillery: 空中では脚が丸まり、接地時より足先が股関節に近づく', () => {
  const ground = drawArtilleryAndExtract(makeArtillery({ onGround: true, vx: 0, walkFrame: 2 }));
  const air = drawArtilleryAndExtract(makeArtillery({ onGround: false, vx: 0 }));

  const reach = (lines, i) => Math.abs(lines[i][2].x - lines[i][0].x);
  assert.ok(reach(air, 0) < reach(ground, 0), '空中では脚が縮むこと');
});

test('artillery: 空中で vx の符号を反転すると足先が逆側に流れる', () => {
  const fwd = drawArtilleryAndExtract(makeArtillery({ onGround: false, vx: 0.4 }));
  const back = drawArtilleryAndExtract(makeArtillery({ onGround: false, vx: -0.4 }));
  assert.notDeepEqual(fwd, back);
  // 前脚(index 0)の足先の高さが振り子で変わる
  assert.notEqual(fwd[0][2].y, back[0][2].y);
});

test('artillery: しゃがみ時は接地時より足が左右に広く張り出す', () => {
  const stand = drawArtilleryAndExtract(makeArtillery({ vx: 0, walkFrame: 2 }), 0);
  const crouch = drawArtilleryAndExtract(makeArtillery({ vx: 0, walkFrame: 2 }), 4);

  const width = (lines) => {
    const xs = lines.map((l) => l[2].x);
    return Math.max(...xs) - Math.min(...xs);
  };
  assert.ok(width(crouch) > width(stand), 'しゃがみで脚が広がること');
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test -- tests/attacker-leg-animation.test.js`

Expected: FAIL。旧 `_drawArtilleryLegs` は `fillRect` のみなので「脚を4本描く」が `0 !== 4` で落ちる。

- [ ] **Step 3: クモ脚の定数を追加**

`src/js/entities/EnemyAttacker.js` の `AIR_BASE_POSE` の直後に追加:

```js
/**
 * artillery の4脚。並びは [手前前脚, 奥前脚, 手前後脚, 奥後脚]。
 * group A = 手前前脚 + 奥後脚 / group B = 奥前脚 + 手前後脚 の対角トロット。
 * reach は股関節からの足先の水平到達距離（前脚が正、後脚が負）。
 */
const SPIDER_LEGS = [
    { hipX: 14, reach: 5, isNear: true, group: 0 },
    { hipX: 11, reach: 4, isNear: false, group: 1 },
    { hipX: 7, reach: -4, isNear: true, group: 1 },
    { hipX: 4, reach: -5, isNear: false, group: 0 },
];

/**
 * 参照フレーム → 足先の前後スイープ量。
 * 半周期ずらすと符号が反転する（sweep[(p+2)%4] === -sweep[p]）ので、
 * group A / B が常に逆位相になる。frame 2 は両グループとも 0 = 停止時の中立ポーズ。
 */
const SPIDER_SWEEP = [0, 2, 0, -2];

/**
 * 参照フレーム → 遊脚相の足上げ量。
 * group A は walkFrame 3、group B は walkFrame 1 で持ち上がり、同時には浮かない
 * （＝常に2本以上が接地する）。
 */
const SPIDER_LIFT = [0, 0, 0, 2];

/** 膝の跳ね上げ量（股関節より上）と足首の下がり量。 */
const SPIDER_KNEE_RISE = 4;
const SPIDER_FOOT_DROP = 6;
```

- [ ] **Step 4: `_drawArtilleryLegs()` を書き換え**

既存の `_drawArtilleryLegs(ctx, crouchOffset = 0) { ... }` を丸ごと削除し、以下に置き換える:

```js
    /**
     * artillery の4脚クモ歩行。
     * 膝を胴体より上へ跳ね上げた逆へ字シルエットで、対角の2本ずつを
     * 半周期ずらして動かす（常に2本以上が接地する）。
     */
    _drawArtilleryLegs(ctx, crouchOffset = 0) {
        const style = this._legStyle();
        const hipY = 16 - crouchOffset;

        if (crouchOffset > 0) {
            this._drawSpiderCrouch(ctx, hipY, style);
        } else if (!this.onGround) {
            this._drawSpiderAir(ctx, hipY, style);
        } else {
            this._drawSpiderWalk(ctx, hipY, style);
        }
    }

    /** 脚1本ぶんの塗り設定（手前脚は bodyColor、奥脚は headColor）。 */
    _spiderPaint(leg, style) {
        return {
            legColor: leg.isNear ? this.config.bodyColor : this.config.headColor,
            footColor: leg.isNear ? this.config.headColor : this.config.bodyColor,
            lineWidth: style.lineWidth,
            footW: style.footW,
            footH: style.footH,
        };
    }

    /** 接地時: 対角トロット。group 0 は walkFrame、group 1 は半周期ずれ。 */
    _drawSpiderWalk(ctx, hipY, style) {
        for (const leg of SPIDER_LEGS) {
            const phase = leg.group === 0
                ? this.walkFrame
                : (this.walkFrame + 2) % 4;
            const sweep = SPIDER_SWEEP[phase];
            const lift = SPIDER_LIFT[phase];

            const footX = leg.hipX + leg.reach + sweep;
            const footY = hipY + SPIDER_FOOT_DROP - lift;

            this._drawJointedLeg(ctx, {
                hipX: leg.hipX, hipY,
                kneeX: leg.hipX + (leg.reach + sweep) * 0.5,
                kneeY: hipY - SPIDER_KNEE_RISE,
                footX, footY,
                ...this._spiderPaint(leg, style),
            });
        }
    }

    /** 空中: 脚を丸めつつ、横速度に応じて股関節中心に振れる。 */
    _drawSpiderAir(ctx, hipY, style) {
        const swing = this._hoverSwing();

        for (const leg of SPIDER_LEGS) {
            // グループごとに縮み量を変えて非対称にする（クモが落下時に脚を縮める挙動）
            const curl = leg.group === 0 ? 0.6 : 0.8;
            const angle = swing * style.maxSwing;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const rot = (dx, dy) => ({
                x: leg.hipX + (dx * cos - dy * sin),
                y: hipY + (dx * sin + dy * cos),
            });

            const knee = rot(leg.reach * 0.5 * curl, -SPIDER_KNEE_RISE * curl);
            const foot = rot(leg.reach * curl, SPIDER_FOOT_DROP * curl);

            this._drawJointedLeg(ctx, {
                hipX: leg.hipX, hipY,
                kneeX: knee.x, kneeY: knee.y,
                footX: foot.x, footY: foot.y,
                footRotation: angle / 1.5,
                ...this._spiderPaint(leg, style),
            });
        }
    }

    /** しゃがみ（狙撃姿勢）: 膝を大きく跳ね上げ、足を広く張って車高を下げる。 */
    _drawSpiderCrouch(ctx, hipY, style) {
        const spread = style.crouchSpread;

        for (const leg of SPIDER_LEGS) {
            const dir = leg.reach >= 0 ? 1 : -1;
            this._drawJointedLeg(ctx, {
                hipX: leg.hipX, hipY,
                kneeX: leg.hipX + dir * spread * 0.5,
                kneeY: hipY - SPIDER_KNEE_RISE - 2,
                footX: leg.hipX + leg.reach + dir * spread,
                footY: hipY + SPIDER_FOOT_DROP,
                ...this._spiderPaint(leg, style),
            });
        }
    }
```

- [ ] **Step 5: テストを実行して成功を確認**

Run: `npm test -- tests/attacker-leg-animation.test.js`

Expected: PASS（29件）。

- [ ] **Step 6: コミット**

```bash
git add tests/attacker-leg-animation.test.js src/js/entities/EnemyAttacker.js
git commit -m "feat: artillery型に4脚クモ歩行アニメーションを実装"
```

---

### Task 5: 全型の回帰確認と仕上げ

**Files:**

- Test: `tests/attacker-leg-animation.test.js`（追記）
- Modify: `src/js/entities/EnemyAttacker.js`（必要に応じた修正のみ）

**Interfaces:**

- Consumes: Task 1〜4 のすべて
- Produces: なし（検証タスク）

- [ ] **Step 1: 回帰テストを書く**

`tests/attacker-leg-animation.test.js` の末尾に追記:

```js
// --- 回帰 ---

test('回帰: 4型 × 3状態で draw() が例外を投げない', () => {
  const types = ['standard', 'heavy', 'rival', 'artillery'];
  const states = [
    { name: '接地', patch: { onGround: true, vx: 0.5, walkFrame: 1 } },
    { name: '空中', patch: { onGround: false, vx: 0.5, hovering: true } },
    { name: 'しゃがみ', patch: { onGround: true, vx: 0, crouching: true } },
  ];

  for (const name of types) {
    for (const state of states) {
      const a = makeAttacker({ ...state.patch, config: { name } });
      const ctx = makeFakeCtx();
      assert.doesNotThrow(() => a.draw(ctx), `${name} / ${state.name}`);
      assert.ok(ctx.calls.length > 0, `${name} / ${state.name}: 何か描画されること`);
    }
  }
});

test('回帰: 未知の型でも draw() が通り standard 相当の脚になる', () => {
  const unknown = makeAttacker({ onGround: true, vx: 0.5, walkFrame: 1,
                                 config: { name: 'nonexistent-type' } });
  const standard = makeAttacker({ onGround: true, vx: 0.5, walkFrame: 1,
                                  config: { name: 'standard' } });

  const ctxU = makeFakeCtx();
  const ctxS = makeFakeCtx();
  assert.doesNotThrow(() => unknown._drawLegs(ctxU, 0));
  standard._drawLegs(ctxS, 0);
  assert.deepEqual(extractPolylines(ctxU.calls), extractPolylines(ctxS.calls));
});

test('回帰: alive=false の間は draw() が何も描かない', () => {
  const a = makeAttacker({ alive: false });
  const ctx = makeFakeCtx();
  a.draw(ctx);
  assert.equal(ctx.calls.length, 0);
});

test('回帰: 左向きでも脚が2本（artillery は4本）描かれる', () => {
  const left = makeAttacker({ facingRight: false, onGround: false, vx: -0.5 });
  const ctx = makeFakeCtx();
  left._drawLegs(ctx, 0);
  assert.equal(extractPolylines(ctx.calls).length, 2);

  const art = makeAttacker({ facingRight: false, onGround: false, vx: -0.4,
                             config: { name: 'artillery', speed: 0.4 } });
  const ctxA = makeFakeCtx();
  art._drawArtilleryLegs(ctxA, 0);
  assert.equal(extractPolylines(ctxA.calls).length, 4);
});
```

- [ ] **Step 2: テストを実行**

Run: `npm test -- tests/attacker-leg-animation.test.js`

Expected: PASS（33件）。失敗した場合は該当メソッドを直してから次へ進む。特に「4型 × 3状態」で落ちるときは、`draw()` 内で artillery 以外が `_drawLegs`、artillery が `_drawArtilleryLegs` を呼ぶ分岐が保たれているか確認する。

- [ ] **Step 3: 旧メソッドの残骸がないことを確認**

Run: `grep -n "_drawLeg\b" src/js/entities/EnemyAttacker.js`

Expected: 出力なし（`_drawLegs` / `_drawJointedLeg` はヒットしない検索なので、旧 `_drawLeg` が完全に消えていること）。

- [ ] **Step 4: 全テストを実行**

Run: `npm test`

Expected: 全件 PASS。1件も既存テストが壊れていないこと。

- [ ] **Step 5: 変更範囲がスコープ内に収まっていることを確認**

Run: `git status --short`

Expected: `src/js/entities/EnemyAttacker.js`、`tests/attacker-leg-animation.test.js`、`tests/helpers/fake-ctx.js` の3つ（＋今回の作業前から変更されていた無関係なファイル）。`Constants.js` と `Player.js` が変更されていないこと。

- [ ] **Step 6: コミット**

```bash
git add tests/attacker-leg-animation.test.js
git commit -m "test: 敵アタッカー脚アニメーションの回帰テストを追加"
```

- [ ] **Step 7: ユーザーに実機確認を依頼**

実装完了を報告し、ブラウザでの見た目の確認をユーザーに依頼する。自分でブラウザ自動化は起動しない。

確認してほしい点:

- standard / rival がプレイヤーと同じように2足で歩き、脚の関節が見えるか
- heavy がどっしり歩いているか（歩幅が狭く、脚が太いか）
- artillery の4脚が2本ずつ交互に動いてクモらしく見えるか
- ジャンプ・ホバー中に脚が進行方向と逆に振れるか
- バースト射撃のしゃがみ姿勢が不自然になっていないか

---

## Self-Review

**1. Spec coverage**

| 仕様セクション | 対応タスク |
|---|---|
| 共通の描画基盤（ポリライン＋足裏、色は config 由来） | Task 2 |
| 空中の振り子（`this.maxSpeed` で正規化、位相ずらし） | Task 1（計算）＋ Task 3（2足）＋ Task 4（artillery） |
| 型別パラメータ `LEG_STYLES`、未知名フォールバック | Task 1 |
| standard（プレイヤー同形、4フレーム表移植） | Task 3 |
| heavy（太脚・がに股・装甲板・大足・狭い歩幅・振り子30°） | Task 2（装甲板）＋ Task 3 |
| rival（プレイヤー同等＝standard と同一値） | Task 1（定数）＋ Task 3（一致テスト） |
| artillery（逆へ字シルエット、対角トロット、空中の丸まり、狙撃スタンス） | Task 4 |
| しゃがみ（2足型3種、heavy のみ広め） | Task 3 |
| 構成（`_drawLegs` / `_drawArtilleryLegs` / `_drawJointedLeg` / `_legStyle` / `_hoverSwing`） | Task 1〜4 |
| テスト（2足5件・artillery 3件・回帰2件） | Task 3 / Task 4 / Task 5 |
| 受け入れ基準 | Task 5 |

漏れなし。

**2. Placeholder scan**

「TBD」「後で実装」「適切にエラー処理」等の記述なし。全コードステップに実コードあり。

**3. Type consistency**

- `_drawJointedLeg` の `opts` キー（`hipX, hipY, kneeX, kneeY, footX, footY, legColor, footColor, lineWidth, footW, footH, footRotation, thighPlate`）は Task 2 の定義と Task 3・4 の呼び出しで一致。
- `_legPaint` / `_spiderPaint` はどちらも `legColor / footColor / lineWidth / footW / footH` を返し、`_legPaint` のみ `thighPlate` を追加で返す（heavy 専用のため artillery 側には不要）。
- `LEG_STYLES` の全キー（`hipFar, hipNear, lineWidth, footW, footH, strideScale, maxSwing, phaseOffset, crouchSpread, thighPlate`）は4型すべてに定義済みで、`deepEqual` による rival/standard 一致テストが成立する。
- `SPIDER_LEGS` の並び順（手前前脚・奥前脚・手前後脚・奥後脚）はテストのインデックス前提（A = 0,3 / B = 1,2）と一致。
