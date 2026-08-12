# スラスター炎の表現強化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 自機と敵アタッカーのホバー噴射を、ランダムな四角3個から「2層の台形＋先端のゆらぎ」の炎に置き換え、推力に応じて長さが変わるようにする。

**Architecture:** 描画ヘルパ `src/js/entities/thrusterFlame.js` を新設し、自機と敵に二重化している7行をそこへ統合する。炎はノズル中心に左右対称なので、自機のワールド座標でも敵の `scale(-1,1)` 済みローカル座標でもそのまま呼べる。揺らぎの乱数は引数 `flicker` で注入でき、既定値だけが `Math.random()` を読む（テストから決定的に検証するため）。

**Tech Stack:** バニラ ES modules、canvas 2D。ビルド工程なし、依存パッケージなし。テストは `node --test`。

設計書: `docs/superpowers/specs/2026-08-12-thruster-flame-design.md`

## Global Constraints

- 調整用の数値はすべて `src/js/utils/Constants.js` に置く。実装側にマジックナンバーを直書きしない
- コメントは日本語で、「なぜそうしたか」を書く。数値には根拠（何の代わりに何倍か等）を残す
- **`git add -A` / `git add .` は使わない。** 変更したファイルを明示して add する
- テストでソース文字列を grep しない。実際に `draw()` を呼んで、記録された呼び出しを見る
- `npm test` が全件通ること（着手前の基準は 824 テスト）
- 実機での見た目の確認はユーザーが行う。こちらでローカルサーバーは立てない

---

### Task 1: 共有モジュール `thrusterFlame.js`

炎の形を作る純粋な描画ヘルパと、敵の `climbThrust` を `power` に写す純関数を作る。
呼び出し側の配線は Task 2・3 で行う。

**Files:**
- Create: `src/js/entities/thrusterFlame.js`
- Modify: `src/js/utils/Constants.js`（定数を追加、`COLOR_HOVER_EXHAUST` を hex に変更）
- Test: `tests/thruster-flame.test.js`

**Interfaces:**
- Consumes: `lerpColor(a, b, t)` from `src/js/utils/color.js`（`#rrggbb` 同士を補間して `#rrggbb` を返す）
- Produces:
  - `drawThrusterFlame(ctx, nozzleX, nozzleY, { color, power, flicker }) -> void`
    - `nozzleX` / `nozzleY`: ノズルの**中心 x** と**上端 y**（呼び出し側の座標系のまま）
    - `color`: 外炎の色（`#rrggbb` 文字列）
    - `power`: 0〜1。内部で clamp する
    - `flicker`: 0〜1。省略時は `Math.random()`
  - `attackerFlamePower(climbThrust) -> number`（0.6〜1.0）

- [ ] **Step 1: 定数を追加する**

`src/js/utils/Constants.js` の `COLOR_HOVER_EXHAUST`（431行目付近）を書き換える。
現在の値は `'rgba(0, 255, 255, 0.6)'` だが、これは `lerpColor()` が解釈できない。

```js
// 芯の色を lerpColor() で作るため hex にしてある（rgba 文字列は解釈できない）。
// 薄さは drawThrusterFlame() 側の globalAlpha で出す。
export const COLOR_HOVER_EXHAUST = '#00FFFF';
```

同じファイルの、自機のホバー関連定数（`HOVER_FUEL_RECOVERY_BOOST`、49行目付近）の直後に
以下のブロックを追加する。

```js
// --- スラスターの炎（描画） ---
// 置き換え前は「1〜4px の四角を毎フレーム3個ランダムに置く」だけで、実質 5px ぶんしか
// 見えていなかった。地味に見えた原因は小ささより「毎フレーム形が変わって芯が無い」ことに
// あったので、台形で芯を固定し、先端だけを揺らす形にした。
export const THRUSTER_FLAME_WIDTH = 5;       // px: ノズル直下の幅
export const THRUSTER_FLAME_LEN_MIN = 6;     // px: power=0（燃料切れ間際）の長さ
export const THRUSTER_FLAME_LEN_MAX = 14;    // px: power=1 の長さ。置き換え前の実質 5px の約3倍
export const THRUSTER_FLAME_CORE_RATIO = 0.55; // 芯の長さ（外炎に対する比）
export const THRUSTER_FLAME_CORE_WHITE = 0.7;  // 芯を白へ寄せる量（0=機体色のまま, 1=真っ白）
export const THRUSTER_FLAME_FLICKER = 0.15;    // 先端の伸び縮み幅（±15%）。置き換え前の
                                               // 完全ランダムは形が定まらず逆に目に入らなかった
export const THRUSTER_FLAME_ALPHA = 0.75;      // 外炎の不透明度
export const THRUSTER_FLAME_CORE_ALPHA = 0.9;  // 芯の不透明度。外炎より濃く出して芯を立てる

// 敵アタッカーの炎の長さは型ごとの climbThrust から作る。0〜1 へ素直に正規化すると
// heavy（0.45 = 最小）の炎がほぼ消えてしまうので、下限を 0.6 に上げて差だけ残す。
export const ATTACKER_CLIMB_THRUST_MIN = 0.45; // heavy
export const ATTACKER_CLIMB_THRUST_MAX = 0.75; // standard
export const ATTACKER_FLAME_POWER_MIN = 0.6;
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/thruster-flame.test.js` を新規作成する。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx, extractFillRects, extractFillRectsWithColor } from './helpers/fake-ctx.js';
import { drawThrusterFlame, attackerFlamePower } from '../src/js/entities/thrusterFlame.js';
import {
  THRUSTER_FLAME_WIDTH, THRUSTER_FLAME_LEN_MIN, THRUSTER_FLAME_LEN_MAX,
  THRUSTER_FLAME_CORE_WHITE, ATTACKER_FLAME_POWER_MIN,
} from '../src/js/utils/Constants.js';
import { lerpColor } from '../src/js/utils/color.js';

/** 段の最下端（y+h の最大値）。炎の長さの代わりに使う。 */
function bottomOf(rects) {
  return Math.max(...rects.map((r) => r.y + r.h));
}

test('power が大きいほど炎が長い', () => {
  const weak = makeFakeCtx();
  const strong = makeFakeCtx();
  drawThrusterFlame(weak, 100, 50, { color: '#00FFFF', power: 0.1, flicker: 0.5 });
  drawThrusterFlame(strong, 100, 50, { color: '#00FFFF', power: 1.0, flicker: 0.5 });
  assert.ok(bottomOf(extractFillRects(strong.calls)) > bottomOf(extractFillRects(weak.calls)));
});

test('炎の長さが LEN_MIN 〜 LEN_MAX に収まる（flicker 込み）', () => {
  for (const flicker of [0, 0.5, 1]) {
    for (const power of [0, 0.5, 1]) {
      const ctx = makeFakeCtx();
      drawThrusterFlame(ctx, 0, 0, { color: '#00FFFF', power, flicker });
      const len = bottomOf(extractFillRects(ctx.calls));
      assert.ok(len >= Math.floor(THRUSTER_FLAME_LEN_MIN * 0.8),
        `len=${len} power=${power} flicker=${flicker}`);
      assert.ok(len <= Math.ceil(THRUSTER_FLAME_LEN_MAX * 1.2),
        `len=${len} power=${power} flicker=${flicker}`);
    }
  }
});

test('下へ行くほど段が狭い（台形になっている）', () => {
  const ctx = makeFakeCtx();
  drawThrusterFlame(ctx, 100, 50, { color: '#00FFFF', power: 1.0, flicker: 0.5 });
  // 外炎だけを取り出す（最初の色で塗られた段）
  const withColor = extractFillRectsWithColor(ctx.calls);
  const outer = withColor.filter((r) => r.color === '#00FFFF');
  assert.equal(outer[0].w, THRUSTER_FLAME_WIDTH);
  for (let i = 1; i < outer.length; i++) {
    assert.ok(outer[i].w <= outer[i - 1].w, `段 ${i} が広がっている`);
    assert.equal(outer[i].y, outer[i - 1].y + 1, '段は 1px ずつ下がる');
  }
  assert.equal(outer[outer.length - 1].w, 1, '先端は 1px');
});

test('段はノズル中心に対して左右対称に置かれる', () => {
  const ctx = makeFakeCtx();
  drawThrusterFlame(ctx, 100, 50, { color: '#00FFFF', power: 1.0, flicker: 0.5 });
  for (const r of extractFillRects(ctx.calls)) {
    const center = r.x + r.w / 2;
    assert.ok(Math.abs(center - 100) <= 0.5, `段の中心が ${center}（ノズルは 100）`);
  }
});

test('芯は外炎より短く、色が白寄り', () => {
  const ctx = makeFakeCtx();
  drawThrusterFlame(ctx, 100, 50, { color: '#00FFFF', power: 1.0, flicker: 0.5 });
  const withColor = extractFillRectsWithColor(ctx.calls);
  const coreColor = lerpColor('#00FFFF', '#FFFFFF', THRUSTER_FLAME_CORE_WHITE);
  const outer = withColor.filter((r) => r.color === '#00FFFF');
  const core = withColor.filter((r) => r.color === coreColor);
  assert.ok(core.length > 0, '芯が描かれていない');
  assert.ok(bottomOf(core) < bottomOf(outer), '芯が外炎より長い');
  assert.ok(core[0].w < THRUSTER_FLAME_WIDTH, '芯が外炎より太い');
});

test('flicker を固定すれば描画は決定的', () => {
  const a = makeFakeCtx();
  const b = makeFakeCtx();
  drawThrusterFlame(a, 100, 50, { color: '#00FFFF', power: 0.7, flicker: 0.3 });
  drawThrusterFlame(b, 100, 50, { color: '#00FFFF', power: 0.7, flicker: 0.3 });
  assert.deepEqual(extractFillRects(a.calls), extractFillRects(b.calls));
});

test('globalAlpha は 1.0 に戻される', () => {
  const ctx = makeFakeCtx();
  drawThrusterFlame(ctx, 100, 50, { color: '#00FFFF', power: 0.7, flicker: 0.3 });
  assert.equal(ctx.globalAlpha, 1.0);
});

test('power は 0〜1 の外側でも壊れない', () => {
  const low = makeFakeCtx();
  const high = makeFakeCtx();
  drawThrusterFlame(low, 0, 0, { color: '#00FFFF', power: -5, flicker: 0.5 });
  drawThrusterFlame(high, 0, 0, { color: '#00FFFF', power: 9, flicker: 0.5 });
  assert.ok(bottomOf(extractFillRects(low.calls)) > 0);
  assert.ok(bottomOf(extractFillRects(high.calls)) <= Math.ceil(THRUSTER_FLAME_LEN_MAX * 1.2));
});

test('attackerFlamePower は 0.6〜1.0 に写す', () => {
  assert.equal(attackerFlamePower(0.45), ATTACKER_FLAME_POWER_MIN); // heavy = 最小
  assert.equal(attackerFlamePower(0.75), 1.0);                      // standard = 最大
  const rival = attackerFlamePower(0.65);
  assert.ok(rival > ATTACKER_FLAME_POWER_MIN && rival < 1.0);
  assert.ok(attackerFlamePower(0.65) > attackerFlamePower(0.5));    // rival > artillery
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npm test -- tests/thruster-flame.test.js`
Expected: FAIL（`Cannot find module .../thrusterFlame.js`）

- [ ] **Step 4: モジュールを実装する**

`src/js/entities/thrusterFlame.js` を新規作成する。

```js
// ============================================
// thrusterFlame - ホバー噴射の炎を描く
// ============================================
//
// 自機（Player）と敵アタッカー（EnemyAttacker）が共有する。置き換え前は
// 「1〜4px の四角を毎フレーム3個ランダムに置く」7行が両方にほぼ同じ形で
// 二重化していた。形を足すと二重化が悪化するので、先に1本にまとめてある。
//
// 炎はノズル中心に左右対称に置くので、自機のワールド座標でも、敵の
// scale(-1, 1) 済みローカル座標でも、呼び出し側で向きを場合分けせずに使える。
//
// 1px 高の段を積んで台形にしているのは、パスで塗るより既存のドット絵の
// 質感に合うため（段ごとの幅をテストで検証できるという利点もある）。

import {
    THRUSTER_FLAME_WIDTH, THRUSTER_FLAME_LEN_MIN, THRUSTER_FLAME_LEN_MAX,
    THRUSTER_FLAME_CORE_RATIO, THRUSTER_FLAME_CORE_WHITE, THRUSTER_FLAME_FLICKER,
    THRUSTER_FLAME_ALPHA, THRUSTER_FLAME_CORE_ALPHA,
    ATTACKER_CLIMB_THRUST_MIN, ATTACKER_CLIMB_THRUST_MAX, ATTACKER_FLAME_POWER_MIN,
} from '../utils/Constants.js';
import { lerpColor } from '../utils/color.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * 幅 topW から 1 へ絞りながら、1px 高の段を length 段ぶん積む。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx ノズルの中心 x
 * @param {number} topY 根元の y
 * @param {number} topW 根元の幅
 * @param {number} length 段数（= 炎の長さ px）
 */
function _drawTaper(ctx, cx, topY, topW, length) {
    for (let i = 0; i < length; i++) {
        const t = length > 1 ? i / (length - 1) : 1; // 0=根元, 1=先端
        const w = Math.max(1, Math.round(topW - (topW - 1) * t));
        ctx.fillRect(Math.round(cx - w / 2), topY + i, w, 1);
    }
}

/**
 * ノズルから下へ伸びる炎を1つ描く。外炎（機体色）の中に白寄りの芯を重ねる。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} nozzleX ノズルの中心 x
 * @param {number} nozzleY ノズルの上端 y
 * @param {{color: string, power: number, flicker?: number}} opts
 *   color   外炎の色（#rrggbb）
 *   power   0〜1。1 で LEN_MAX、0 で LEN_MIN
 *   flicker 0〜1。先端の伸び縮み。既定は Math.random()（テストは固定値を渡す）
 */
export function drawThrusterFlame(ctx, nozzleX, nozzleY, { color, power, flicker = Math.random() }) {
    const p = clamp01(power);
    const base = THRUSTER_FLAME_LEN_MIN + (THRUSTER_FLAME_LEN_MAX - THRUSTER_FLAME_LEN_MIN) * p;
    // flicker 0〜1 を -1〜+1 に写して ±FLICKER ぶん伸び縮みさせる
    const swing = 1 + (clamp01(flicker) * 2 - 1) * THRUSTER_FLAME_FLICKER;
    const outerLen = Math.max(1, Math.round(base * swing));
    const coreLen = Math.max(1, Math.round(outerLen * THRUSTER_FLAME_CORE_RATIO));

    const cx = Math.round(nozzleX);
    const top = Math.round(nozzleY);

    ctx.fillStyle = color;
    ctx.globalAlpha = THRUSTER_FLAME_ALPHA;
    _drawTaper(ctx, cx, top, THRUSTER_FLAME_WIDTH, outerLen);

    ctx.fillStyle = lerpColor(color, '#FFFFFF', THRUSTER_FLAME_CORE_WHITE);
    ctx.globalAlpha = THRUSTER_FLAME_CORE_ALPHA;
    _drawTaper(ctx, cx, top, THRUSTER_FLAME_WIDTH - 2, coreLen);

    ctx.globalAlpha = 1.0;
}

/**
 * 敵アタッカーの climbThrust（0.45〜0.75）を炎の power（0.6〜1.0）へ写す。
 * 0〜1 に正規化すると heavy（0.45）の炎がほぼ消えるので下限を上げてある。
 * @param {number} climbThrust
 * @returns {number} 0.6〜1.0
 */
export function attackerFlamePower(climbThrust) {
    const span = ATTACKER_CLIMB_THRUST_MAX - ATTACKER_CLIMB_THRUST_MIN;
    const t = clamp01((climbThrust - ATTACKER_CLIMB_THRUST_MIN) / span);
    return ATTACKER_FLAME_POWER_MIN + (1 - ATTACKER_FLAME_POWER_MIN) * t;
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npm test -- tests/thruster-flame.test.js`
Expected: PASS（全 9 テスト）

- [ ] **Step 6: 全テストを走らせる**

Run: `npm test`
Expected: PASS。`COLOR_HOVER_EXHAUST` を hex に変えた影響で落ちるテストが無いことを確認する
（参照は `Player.js` の1箇所のみのはずだが、落ちたら参照元を直す）

- [ ] **Step 7: コミット**

```bash
git add src/js/entities/thrusterFlame.js src/js/utils/Constants.js tests/thruster-flame.test.js
git commit -m "feat: スラスター炎の共有描画モジュールを追加

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: 自機の噴射を差し替える

**Files:**
- Modify: `src/js/entities/Player.js:907-921`（`_drawHoverExhaust()`）と冒頭の import
- Test: `tests/player-thruster.test.js`

**Interfaces:**
- Consumes: `drawThrusterFlame(ctx, nozzleX, nozzleY, { color, power, flicker })` from Task 1
- Produces: なし（`Player._drawHoverExhaust(ctx)` のシグネチャは変えない）

置き換え前のノズル位置の計算はそのまま活かす。現状は

```js
const backpackX = this.facingRight ? (this.x - 2) : (this.x + this.width - 4);
const px = backpackX + Math.random() * 4;   // 幅 4px に散らばる → 中心は backpackX + 2
const py = this.y + 12 + Math.random() * 5; // 根元は this.y + 12
```

なので、ノズル中心は `backpackX + 2`、上端は `this.y + 12`。

- [ ] **Step 1: 失敗するテストを書く**

`tests/player-thruster.test.js` を新規作成する。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { makeFakeCtx, extractFillRects } from './helpers/fake-ctx.js';
import { HOVER_MAX_FUEL, PLAYER_WIDTH } from '../src/js/utils/Constants.js';

/** コンストラクタを通さずに _drawHoverExhaust() だけ呼べる最小インスタンス。 */
function makePlayer(overrides = {}) {
  const p = Object.create(Player.prototype);
  p.x = 100; p.y = 50;
  p.width = PLAYER_WIDTH;
  p.facingRight = true;
  p.hovering = true;
  p.hoverFuel = HOVER_MAX_FUEL;
  return Object.assign(p, overrides);
}

function drawExhaust(overrides) {
  const ctx = makeFakeCtx();
  makePlayer(overrides)._drawHoverExhaust(ctx);
  return extractFillRects(ctx.calls);
}

test('ホバーしていなければ何も描かない', () => {
  assert.equal(drawExhaust({ hovering: false }).length, 0);
});

test('燃料が多いほど炎が長い', () => {
  const bottom = (rects) => Math.max(...rects.map((r) => r.y + r.h));
  const full = drawExhaust({ hoverFuel: HOVER_MAX_FUEL });
  const low = drawExhaust({ hoverFuel: HOVER_MAX_FUEL * 0.05 });
  assert.ok(bottom(full) > bottom(low));
});

test('炎はノズル（バックパック直下）から下へ伸びる', () => {
  const rects = drawExhaust({});
  const top = Math.min(...rects.map((r) => r.y));
  assert.equal(top, 62, 'this.y(50) + 12 が根元');
  assert.ok(Math.max(...rects.map((r) => r.y + r.h)) > top, '下へ伸びていない');
});

test('左右の向きでノズル位置が入れ替わる', () => {
  const centerOf = (rects) => {
    const widest = rects.reduce((a, b) => (b.w > a.w ? b : a));
    return widest.x + widest.w / 2;
  };
  const right = centerOf(drawExhaust({ facingRight: true }));
  const left = centerOf(drawExhaust({ facingRight: false }));
  assert.equal(right, 100 - 2 + 2, '右向き: x - 2 + 2');
  assert.equal(left, 100 + PLAYER_WIDTH - 4 + 2, '左向き: x + width - 4 + 2');
});

test('globalAlpha を 1.0 に戻す（後続の描画を薄くしない）', () => {
  const ctx = makeFakeCtx();
  makePlayer()._drawHoverExhaust(ctx);
  assert.equal(ctx.globalAlpha, 1.0);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- tests/player-thruster.test.js`
Expected: FAIL。「燃料が多いほど炎が長い」と「炎はノズルから下へ伸びる」が落ちる
（置き換え前は毎フレームランダムな四角3個で、燃料に連動しない）

- [ ] **Step 3: `_drawHoverExhaust()` を差し替える**

`src/js/entities/Player.js:907-921` を丸ごと置き換える。

```js
    _drawHoverExhaust(ctx) {
        if (!this.hovering) return;

        // バックパックのノズル位置（ローカル x:2〜6, y:12〜14 の橙ノズル直下）。
        // 中心 = backpackX + 2（置き換え前は幅 4px にランダムで散らしていた）
        const backpackX = this.facingRight ? (this.x - 2) : (this.x + this.width - 4);
        // 残燃料で実際の推力が変わる（HOVER_THRUST → HOVER_THRUST_MIN）ので、
        // 炎の長さも同じ比に合わせる。ホバー音も playHover(fuelRatio) で同じ値を
        // 受けているため、炎・音・推力が1つの値を指すことになる
        const fuelRatio = this.hoverFuel / HOVER_MAX_FUEL;
        drawThrusterFlame(ctx, backpackX + 2, this.y + 12, {
            color: COLOR_HOVER_EXHAUST,
            power: fuelRatio,
        });
    }
```

同ファイル冒頭の import に1行足す（`playDestruction` の import の下）。

```js
import { drawThrusterFlame } from './thrusterFlame.js';
```

`COLOR_HOVER_EXHAUST` と `HOVER_MAX_FUEL` は既に `Constants.js` から import 済みなので、
import 文の変更はこの1行だけ。

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- tests/player-thruster.test.js`
Expected: PASS（全 5 テスト）

- [ ] **Step 5: 全テストを走らせる**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/js/entities/Player.js tests/player-thruster.test.js
git commit -m "feat: 自機のホバー噴射を炎の描画に差し替える

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 敵アタッカーの噴射を差し替える

**Files:**
- Modify: `src/js/entities/EnemyAttacker.js:1184-1195`（`draw()` 内の `--- Hover Exhaust (Common) ---` ブロック）と冒頭の import
- Test: `tests/attacker-thruster.test.js`

**Interfaces:**
- Consumes: `drawThrusterFlame(...)` と `attackerFlamePower(climbThrust)` from Task 1
- Produces: なし

置き換え前は色が `'#00FFFF'` 直書きで、型ごとの `config.exhaustColor`
（standard `#33DDEE` / heavy `#66FF66` / rival `#FF6644` / artillery `#FFEE44`）が
使われていない。ここで直す。

ノズル位置は現状の値をそのまま使う（`px = 2 + Math.random() * 4` → 中心 4、
`py = 14 + ... - crouchOffset` → 上端 `14 - crouchOffset`）。`draw()` は既に
`ctx.translate(0, crouchOffset)` 済みなので、`- crouchOffset` を残すと
しゃがみ中でもノズルがワールド上の同じ高さに留まる（置き換え前と同じ挙動）。

- [ ] **Step 1: 失敗するテストを書く**

`tests/attacker-thruster.test.js` を新規作成する。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyAttacker } from '../src/js/entities/EnemyAttacker.js';
import { makeFakeCtx, extractFillRectsWithColor } from './helpers/fake-ctx.js';
import { ENEMY_ATTACKER_TYPES } from '../src/js/utils/Constants.js';
import { attackerFlamePower } from '../src/js/entities/thrusterFlame.js';

const AIR_MAP = { isSolidAtPixel: () => false, cols: 1000, rows: 1000 };

/** コンストラクタのスポーン処理を通さずに draw() できる最小インスタンス。 */
function makeAttacker(typeKey, overrides = {}) {
  const config = ENEMY_ATTACKER_TYPES[typeKey];
  const a = Object.create(EnemyAttacker.prototype);
  a.game = { map: AIR_MAP, enemies: [], player: null, carrier: null,
             projectiles: [], enemyBullets: [] };
  a.x = 0; a.y = 0; a.width = 16; a.height = 24;
  a.vx = 0; a.vy = 0;
  a.alive = true;
  a.onGround = false;
  a.config = config;
  a.hp = config.hp; a.maxHp = config.hp;
  a.maxSpeed = config.speed;
  a.jumpForce = config.jumpForce;
  a.facingRight = true;
  a.walkFrame = 2;
  a.walkTimer = 0;
  a.hovering = true;
  a.crouching = false;
  a.burstCount = 0;
  a.recoil = 0;
  a.smokeTimer = 0;
  return Object.assign(a, overrides);
}

/**
 * 炎の段だけを取り出す。artillery は胴体にも exhaustColor のノズル
 * (2, 12, 4, 2) を描くので、色だけでは分けられない。炎の段は必ず
 * 高さ 1px なので、そこで切り分ける。
 */
function flameRects(typeKey, overrides = {}) {
  const ctx = makeFakeCtx();
  makeAttacker(typeKey, overrides).draw(ctx);
  const color = ENEMY_ATTACKER_TYPES[typeKey].exhaustColor;
  return extractFillRectsWithColor(ctx.calls).filter((r) => r.color === color && r.h === 1);
}

test('4型それぞれの炎が型ごとの exhaustColor で描かれる', () => {
  for (const typeKey of ['standard', 'heavy', 'rival', 'artillery']) {
    const rects = flameRects(typeKey);
    assert.ok(rects.length > 0, `${typeKey} の炎が exhaustColor で描かれていない`);
  }
});

test('水色の直書きが残っていない（artillery は水色を使わない型）', () => {
  const ctx = makeFakeCtx();
  makeAttacker('artillery').draw(ctx);
  const cyan = extractFillRectsWithColor(ctx.calls).filter((r) => r.color === '#00FFFF');
  assert.equal(cyan.length, 0);
});

test('ホバーしていなければ炎を描かない', () => {
  assert.equal(flameRects('rival', { hovering: false }).length, 0);
});

test('climbThrust が大きい型ほど炎が長い', () => {
  const bottom = (rects) => Math.max(...rects.map((r) => r.y + r.h));
  // standard(0.75) > rival(0.65) > artillery(0.5) > heavy(0.45)
  const standard = bottom(flameRects('standard'));
  const heavy = bottom(flameRects('heavy'));
  assert.ok(standard > heavy, `standard=${standard} heavy=${heavy}`);
});

test('heavy でも炎が最低限の長さを保つ（power の下限 0.6）', () => {
  assert.ok(attackerFlamePower(ENEMY_ATTACKER_TYPES.heavy.climbThrust) >= 0.6);
  assert.ok(flameRects('heavy').length >= 6);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- tests/attacker-thruster.test.js`
Expected: FAIL。「4型それぞれの炎が exhaustColor で描かれる」が全型で落ちる
（`'#00FFFF'` 直書きなので、どの型の `exhaustColor` にも一致しない。standard の
`#33DDEE` も水色だが別の値）

- [ ] **Step 3: `--- Hover Exhaust (Common) ---` ブロックを差し替える**

`src/js/entities/EnemyAttacker.js` の以下のブロック（1184行目付近）を置き換える。

置き換え前:

```js
        // --- Hover Exhaust (Common) ---
        if (this.hovering) {
            for (let i = 0; i < 3; i++) {
                const px = 2 + Math.random() * 4;
                const py = 14 + Math.random() * 6 - crouchOffset;
                const size = 1 + Math.random() * 3;
                ctx.fillStyle = '#00FFFF';
                ctx.globalAlpha = 0.3 + Math.random() * 0.4;
                ctx.fillRect(px, py, size, size);
            }
            ctx.globalAlpha = 1.0;
        }
```

置き換え後:

```js
        // --- Hover Exhaust (Common) ---
        if (this.hovering) {
            // 炎はノズル中心に左右対称なので、scale(-1, 1) 済みのこの座標系でも
            // 向きの場合分けなしで置ける。crouchOffset を引いて打ち消しているのは、
            // しゃがんでもノズルがワールド上の同じ高さに留まるようにするため
            drawThrusterFlame(ctx, 4, 14 - crouchOffset, {
                color: cfg.exhaustColor,
                power: attackerFlamePower(cfg.climbThrust),
            });
        }
```

同ファイル冒頭の import に1行足す（`applyDamage` の import の下）。

```js
import { drawThrusterFlame, attackerFlamePower } from './thrusterFlame.js';
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- tests/attacker-thruster.test.js`
Expected: PASS（全 5 テスト）

- [ ] **Step 5: 全テストを走らせる**

Run: `npm test`
Expected: PASS。特に `tests/attacker-leg-animation.test.js` と
`tests/debris-static-parts-match-draw.test.js` が通ること（同じ `draw()` を見ている）

- [ ] **Step 6: コミット**

```bash
git add src/js/entities/EnemyAttacker.js tests/attacker-thruster.test.js
git commit -m "feat: 敵アタッカーの噴射を型ごとの色の炎に差し替える

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: 設計書の追記とユーザーへの引き渡し

**Files:**
- Modify: `docs/superpowers/specs/2026-08-12-thruster-flame-design.md`

- [ ] **Step 1: 定数表に追加した2つを反映する**

設計書の「定数（`Constants.js`）」の表に、実装中に足した不透明度の定数を追記する。

```markdown
| `THRUSTER_FLAME_ALPHA` | 0.75 | 外炎の不透明度 |
| `THRUSTER_FLAME_CORE_ALPHA` | 0.9 | 芯の不透明度。外炎より濃くして芯を立てる |
```

同じく「`power` の決め方」の敵の節に、定数化した3つの名前を書き添える
（`ATTACKER_CLIMB_THRUST_MIN` / `ATTACKER_CLIMB_THRUST_MAX` / `ATTACKER_FLAME_POWER_MIN`）。

- [ ] **Step 2: コミット**

```bash
git add docs/superpowers/specs/2026-08-12-thruster-flame-design.md
git commit -m "docs: スラスター炎の設計書を実装した定数に合わせる

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 3: ユーザーに引き渡す**

以下を伝える。

- **ハードリロード（Cmd+Shift+R）が必要**（`index.html` が `main.js?v=1.0` でキャッシュを効かせているため）
- 確認ポイントと調整用の定数（すべて `src/js/utils/Constants.js`）:

| 見るところ | 定数 | 初期値 |
|---|---|---|
| 炎が長すぎる／短すぎる | `THRUSTER_FLAME_LEN_MAX` | 14 |
| 燃料が減ったときの炎が寂しい | `THRUSTER_FLAME_LEN_MIN` | 6 |
| 炎が太すぎる／細すぎる | `THRUSTER_FLAME_WIDTH` | 5 |
| 芯が白すぎる／目立たない | `THRUSTER_FLAME_CORE_WHITE` | 0.7 |
| 芯が長すぎる／短すぎる | `THRUSTER_FLAME_CORE_RATIO` | 0.55 |
| 先端の揺れがうるさい／足りない | `THRUSTER_FLAME_FLICKER` | 0.15 |
| 炎が濃すぎる／薄すぎる | `THRUSTER_FLAME_ALPHA` / `THRUSTER_FLAME_CORE_ALPHA` | 0.75 / 0.9 |
| 敵 heavy の炎が弱い | `ATTACKER_FLAME_POWER_MIN` | 0.6 |

- 敵の炎の色が型ごとに変わった点（heavy=緑、rival=橙、artillery=黄、standard=水色）も
  合わせて見てもらう
