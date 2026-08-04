# 破壊演出: 機体パーツ飛散 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 機体が破壊されたとき、意味のあるパーツ単位に砕けて、重力・慣性・回転を伴いながら縮小して消える破片を飛ばす。

**Architecture:** 破片1個を表す `DebrisPart` クラスを新設し、既存の `game.particles[]` に流し込む。パーツ定義は機体ごとの独立モジュールに「機体バウンディングボックス左上を原点とし右向きを正とするローカル座標の矩形」として持つ。`buildDebris()` がローカル→ワールド変換（向き反転・機体回転・慣性継承）を一手に引き受ける。可動部を持つ機体だけが `getDebrisParts()` を実装し、死亡時点の関節角度を焼き込んだ矩形を返す。

**Tech Stack:** バニラ JavaScript（ES modules）、Canvas 2D、`node --test`（ヘッドレス）、`tests/helpers/fake-ctx.js` による描画呼び出し検証。

## Global Constraints

- 仕様書: `docs/superpowers/specs/2026-08-05-destruction-debris-design.md`
- 対象は6機体のみ: Player、Carrier、EnemyDrone、EnemyTank、EnemyTurret、EnemyAttacker。**EnemyBase、AutoAimUnit、Landmine、各種ミサイル・グレネードには手を入れない**
- 破片はゲームプレイに一切影響しない。ダメージ判定なし、ノックバックなし、**地形との衝突判定なし**（地形をすり抜ける）
- 破片は `game.particles[]` に入れる。`main.js` のゲームループ構造、`GameStateManager.resetLevel` のクリア処理は変更しない
- 乱数は `Math.random()` を使う。`game.rng`（シード付き）は**絶対に使わない** — マップ生成の再現性を壊し、`tests/MapDeterminism.test.js` が落ちる
- 座標系の統一規約: パーツ定義はすべて **機体バウンディングボックス左上 `(entity.x, entity.y)` を原点、右向き（facingRight=true）** のローカル座標。`x, y` はパーツの**中心**であって左上ではない
- 既存の描画コードの見た目を変えてはならない。共通化のための抽出は可、挙動の変更は不可
- 全タスクで `npm test` が通ること
- コミットメッセージは日本語、末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## File Structure

| ファイル | 責務 |
|---|---|
| `src/js/entities/DebrisPart.js` | 破片1個。位置・速度・回転・寿命・縮小を持ち `update()` / `draw()` する。自分が何の部品かは知らない |
| `src/js/entities/debris/shapes.js` | `segmentPart()` — 線分を回転矩形パーツへ変換するヘルパー。パーツ定義モジュールから参照される葉ノードで、何にも依存しない |
| `src/js/entities/debris/index.js` | `DEBRIS_SPECS` レジストリと `buildDebris(entity, kind)`。ローカル→ワールド変換の唯一の場所 |
| `src/js/entities/debris/droneParts.js` | EnemyDrone のパーツ定義（静的のみ） |
| `src/js/entities/debris/playerParts.js` | Player の静的パーツ＋脚・武装のパーツ生成関数 |
| `src/js/entities/debris/tankParts.js` | EnemyTank のパーツ定義（静的のみ） |
| `src/js/entities/debris/turretParts.js` | EnemyTurret の静的パーツ＋旋回体パーツ生成関数 |
| `src/js/entities/debris/attackerParts.js` | EnemyAttacker の型別静的パーツ＋脚パーツ生成関数 |
| `src/js/entities/debris/carrierParts.js` | Carrier のパーツ定義（静的のみ） |
| `src/js/utils/Constants.js` | 破片チューニング定数を追記 |
| `src/js/main.js` | `spawnDebris()` を追加（`spawnExplosion` の隣） |
| `tests/debris-part.test.js` | `DebrisPart` の物理 |
| `tests/debris-build.test.js` | 座標変換・パーツ定義の妥当性 |
| `tests/debris-spawn.test.js` | `spawnDebris` の統合と同時存在数上限 |

---

### Task 1: DebrisPart と共通定数

破片1個の物理と描画。他に一切依存しない単体モジュール。

**Files:**
- Create: `src/js/entities/DebrisPart.js`
- Modify: `src/js/utils/Constants.js`（末尾に追記）
- Test: `tests/debris-part.test.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `new DebrisPart(opts)` — `opts = { x, y, w, h, color, angle, vx, vy, spin, holdFrames, lifetime, game }`。`x, y` はワールド座標のパーツ中心
  - インスタンスプロパティ: `x, y, vx, vy, angle, spin, hold, life, maxLife, alive, color, w, h`
  - `update()` / `draw(ctx)` / `alive` — 既存 `Particle` と同じ契約
  - `get scale()` — 1 → 0 の縮小率
  - `get alpha()` — 1 → 0 のフェード率
  - 定数: `DEBRIS_GRAVITY`, `DEBRIS_DRAG`, `DEBRIS_LIFETIME`, `DEBRIS_LIFETIME_JITTER`, `DEBRIS_SPIN_SCALE`, `DEBRIS_SPEED_JITTER`, `DEBRIS_MAX_ACTIVE`, `DEBRIS_FLASH_COLOR`, `DEBRIS_FADE_START`

- [ ] **Step 1: 定数を追加する**

`src/js/utils/Constants.js` の末尾に追記:

```js
// --- Destruction Debris ---
// 破片は当たり判定を持たない純粋な演出。地形も無視して落下し続ける。
export const DEBRIS_GRAVITY = 0.22;        // per frame, 通常の GRAVITY より軽い（滞空を長めに見せる）
export const DEBRIS_DRAG = 0.985;          // 毎フレーム vx に乗算する空気抵抗
export const DEBRIS_LIFETIME = 55;         // frames
export const DEBRIS_LIFETIME_JITTER = 20;  // 寿命に加算する乱数の幅
export const DEBRIS_SPIN_SCALE = 0.06;     // 横方向初速 → 角速度への係数
export const DEBRIS_SPEED_JITTER = 0.45;   // 初速に加える乱数の幅
export const DEBRIS_MAX_ACTIVE = 160;      // 同時に存在できる破片の上限
export const DEBRIS_FLASH_COLOR = '#FFFFFF'; // ホールド中の白熱色
export const DEBRIS_FADE_START = 0.75;     // 寿命のこの割合を過ぎたら alpha を落とし始める
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/debris-part.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DebrisPart } from '../src/js/entities/DebrisPart.js';
import { DEBRIS_GRAVITY, DEBRIS_FLASH_COLOR } from '../src/js/utils/Constants.js';
import { makeFakeCtx, extractFillRects, extractSets } from './helpers/fake-ctx.js';

/** 決定的なテストのため乱数要素をすべて明示指定した破片を作る。 */
function makePart(overrides = {}) {
  return new DebrisPart({
    x: 100, y: 50, w: 8, h: 4, color: '#CCAA00', angle: 0,
    vx: 2, vy: -1, spin: 0.1, holdFrames: 0, lifetime: 40,
    ...overrides,
  });
}

test('ホールド中は動かず、白熱色で描かれる', () => {
  const p = makePart({ holdFrames: 3 });
  const ctx = makeFakeCtx();
  p.update();
  p.draw(ctx);
  assert.equal(p.x, 100);
  assert.equal(p.y, 50);
  assert.equal(p.life, 40, 'ホールド中は寿命を消費しない');
  assert.equal(extractSets(ctx.calls, 'fillStyle')[0], DEBRIS_FLASH_COLOR);
});

test('ホールドが明けると飛散し、自前の色で描かれる', () => {
  const p = makePart({ holdFrames: 1 });
  p.update();               // ホールド消費
  const ctx = makeFakeCtx();
  p.update();               // 1フレーム目の飛散
  p.draw(ctx);
  assert.equal(p.x, 102);
  assert.equal(p.y, 49);
  assert.equal(extractSets(ctx.calls, 'fillStyle')[0], '#CCAA00');
});

test('重力で vy が単調増加する', () => {
  const p = makePart({ vy: 0 });
  const seen = [];
  for (let i = 0; i < 5; i++) { p.update(); seen.push(p.vy); }
  for (let i = 1; i < seen.length; i++) {
    assert.ok(seen[i] > seen[i - 1], `vy が増えていない: ${seen}`);
  }
  assert.ok(Math.abs(seen[0] - DEBRIS_GRAVITY) < 1e-9);
});

test('空気抵抗で横速度が減衰する', () => {
  const p = makePart({ vx: 4 });
  p.update();
  assert.ok(p.vx < 4 && p.vx > 3.5, `減衰しすぎ/しなさすぎ: ${p.vx}`);
});

test('回転し続ける', () => {
  const p = makePart({ angle: 0, spin: 0.25 });
  p.update();
  p.update();
  assert.ok(Math.abs(p.angle - 0.5) < 1e-9);
});

test('寿命が尽きると alive が false になる', () => {
  const p = makePart({ lifetime: 3 });
  p.update(); p.update();
  assert.equal(p.alive, true);
  p.update();
  assert.equal(p.alive, false);
});

test('scale は 1 から 0 へ単調減少する', () => {
  const p = makePart({ lifetime: 10 });
  let prev = p.scale;
  assert.ok(Math.abs(prev - 1) < 1e-9, `開始時の scale は 1: ${prev}`);
  for (let i = 0; i < 10; i++) {
    p.update();
    assert.ok(p.scale <= prev, `scale が増えた: ${prev} -> ${p.scale}`);
    prev = p.scale;
  }
  assert.ok(prev < 0.05, `最後まで縮んでいない: ${prev}`);
});

test('alpha は終盤まで 1 のまま、最後だけ落ちる', () => {
  const p = makePart({ lifetime: 20 });
  for (let i = 0; i < 10; i++) p.update();
  assert.equal(p.alpha, 1);
  for (let i = 0; i < 8; i++) p.update();
  assert.ok(p.alpha < 1 && p.alpha > 0, `終盤でフェードしていない: ${p.alpha}`);
});

test('draw は中心原点の矩形を1つ描く', () => {
  const p = makePart();
  const ctx = makeFakeCtx();
  p.draw(ctx);
  const rects = extractFillRects(ctx.calls);
  assert.equal(rects.length, 1);
  assert.deepEqual(rects[0], { x: -4, y: -2, w: 8, h: 4 });
  const translate = ctx.calls.find((c) => c.name === 'translate');
  assert.deepEqual(translate.args, [100, 50]);
});

test('死んだ破片は描画しない', () => {
  const p = makePart({ lifetime: 1 });
  p.update();
  const ctx = makeFakeCtx();
  p.draw(ctx);
  assert.equal(ctx.calls.length, 0);
});

test('画面外の破片は描画しない', () => {
  const game = { camera: { x: 5000, y: 5000 }, canvas: { width: 1024, height: 768 } };
  const p = makePart({ game });
  const ctx = makeFakeCtx();
  p.draw(ctx);
  assert.equal(ctx.calls.length, 0);
});
```

- [ ] **Step 3: テストを実行して失敗を確認する**

Run: `npm test -- tests/debris-part.test.js`
Expected: FAIL — `Cannot find module '.../DebrisPart.js'`

- [ ] **Step 4: DebrisPart を実装する**

`src/js/entities/DebrisPart.js` を新規作成:

```js
// ============================================
// Debris Part - 破壊された機体のパーツ1個
// ============================================
// 既存の Particle と同じ「update() / draw() / alive」契約に従うので、
// game.particles[] に混ぜるだけでゲームループに乗る。
// 当たり判定は一切持たず、地形も無視して落下し続ける純粋な演出。

import {
    DEBRIS_GRAVITY, DEBRIS_DRAG, DEBRIS_FLASH_COLOR, DEBRIS_FADE_START,
} from '../utils/Constants.js';

export class DebrisPart {
    /**
     * @param {object} opts
     * @param {number} opts.x パーツ中心のワールド X
     * @param {number} opts.y パーツ中心のワールド Y
     * @param {number} opts.w パーツ幅
     * @param {number} opts.h パーツ高さ
     * @param {string} opts.color
     * @param {number} opts.angle 初期回転（ラジアン）
     * @param {number} opts.vx
     * @param {number} opts.vy
     * @param {number} opts.spin 角速度（ラジアン/フレーム）
     * @param {number} opts.holdFrames 飛散開始までの静止フレーム数
     * @param {number} opts.lifetime 飛散開始後の寿命（フレーム）
     * @param {object} [opts.game] 画面外カリング用。無ければカリングしない
     */
    constructor(opts) {
        this.x = opts.x;
        this.y = opts.y;
        this.w = opts.w;
        this.h = opts.h;
        this.color = opts.color;
        this.angle = opts.angle || 0;
        this.vx = opts.vx;
        this.vy = opts.vy;
        this.spin = opts.spin;
        this.hold = opts.holdFrames || 0;
        this.maxLife = opts.lifetime;
        this.life = opts.lifetime;
        this.game = opts.game || null;
        this.alive = true;
    }

    /** 縮小率。後半ほど強く効くカーブで、消える直前に一気に小さくなる。 */
    get scale() {
        const p = 1 - this.life / this.maxLife;
        return Math.max(0, 1 - p * p);
    }

    /** 不透明度。寿命の終盤 DEBRIS_FADE_START 以降でのみ落ちる。 */
    get alpha() {
        const p = 1 - this.life / this.maxLife;
        if (p < DEBRIS_FADE_START) return 1;
        return Math.max(0, (1 - p) / (1 - DEBRIS_FADE_START));
    }

    update() {
        if (!this.alive) return;

        // 局面1: ホールド。元の位置に静止したまま白熱する。
        // パーツが元の配置のまま並ぶので、これがそのまま発光シルエットになる。
        if (this.hold > 0) {
            this.hold--;
            return;
        }

        // 局面2: 飛散。地形は見ない。
        this.x += this.vx;
        this.y += this.vy;
        this.vy += DEBRIS_GRAVITY;
        this.vx *= DEBRIS_DRAG;
        this.angle += this.spin;

        // 局面3: 消滅
        this.life--;
        if (this.life <= 0) this.alive = false;
    }

    draw(ctx) {
        if (!this.alive) return;
        if (this._isOffscreen()) return;

        const s = this.scale;
        if (s <= 0) return;

        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.scale(s, s);
        ctx.fillStyle = (this.hold > 0) ? DEBRIS_FLASH_COLOR : this.color;
        ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
        ctx.restore();
    }

    /** カメラ矩形から余裕をもって外れていれば描画を省く。 */
    _isOffscreen() {
        const game = this.game;
        if (!game || !game.camera || !game.canvas) return false;
        const margin = Math.max(this.w, this.h) + 8;
        return (
            this.x < game.camera.x - margin ||
            this.y < game.camera.y - margin ||
            this.x > game.camera.x + game.canvas.width + margin ||
            this.y > game.camera.y + game.canvas.height + margin
        );
    }
}
```

- [ ] **Step 5: テストを実行して通ることを確認する**

Run: `npm test -- tests/debris-part.test.js`
Expected: PASS（10テスト）

- [ ] **Step 6: 全テストを実行する**

Run: `npm test`
Expected: 既存テストを含めて全 PASS

- [ ] **Step 7: コミット**

```bash
git add src/js/entities/DebrisPart.js src/js/utils/Constants.js tests/debris-part.test.js
git commit -m "$(cat <<'EOF'
feat: 破片1個を表す DebrisPart と共通チューニング定数を追加

ホールド→飛散→縮小消滅の3局面を1クラスで通す。既存 Particle と
同じ update/draw/alive 契約なので game.particles にそのまま混ざる。
地形との衝突は行わない。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: buildDebris・spawnDebris・EnemyDrone

座標変換の基盤を作り、可動部を持たない EnemyDrone で1機体を端から端まで貫通させる。**このタスク完了時点で実機確認を行い、方向性の可否を判断する。**

**Files:**
- Create: `src/js/entities/debris/shapes.js`
- Create: `src/js/entities/debris/index.js`
- Create: `src/js/entities/debris/droneParts.js`
- Modify: `src/js/main.js`（`spawnExplosion` の直後に `spawnDebris` を追加）
- Modify: `src/js/entities/EnemyDrone.js:425-429`（`die()` に1行追加）
- Test: `tests/debris-build.test.js`, `tests/debris-spawn.test.js`

**Interfaces:**
- Consumes: Task 1 の `DebrisPart` と破片定数
- Produces:
  - パーツ定義の型: `{ x, y, w, h, color, weight, angle }` — `x, y` は**機体バウンディングボックス左上を原点とし右向きとしたローカル座標での中心**。`weight` 省略時 1、`angle` 省略時 0
  - 機体スペックの型:
    ```js
    { holdFrames: number, burst: number, parts: Part[],
      mirrored?: (entity) => boolean, rotation?: (entity) => number }
    ```
    `mirrored` 省略時は `(e) => e.facingRight === false`、`rotation` 省略時は `() => 0`
  - `DEBRIS_SPECS` — kind 文字列 → スペックのレジストリ
  - `buildDebris(entity, kind)` → `DebrisPart[]`
  - `segmentPart(x1, y1, x2, y2, thickness, color, weight)` → `Part`（線分を回転した矩形として表す）。
    実体は `shapes.js` にあり、`index.js` は再エクスポートする。パーツ定義モジュールは
    **`shapes.js` から直接 import すること**（`index.js` 経由にすると循環参照になる）
  - `game.spawnDebris(entity, kind)` — 破片を `game.particles` に push し、上限を超えた分の古い破片を落とす
  - `droneDebris` スペック

- [ ] **Step 1: 失敗するテストを書く（座標変換）**

`tests/debris-build.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDebris, DEBRIS_SPECS } from '../src/js/entities/debris/index.js';
import { segmentPart } from '../src/js/entities/debris/shapes.js';

/** 乱数の影響を消して変換だけを見るための最小エンティティ。 */
function makeEntity(overrides = {}) {
  return {
    x: 200, y: 100, width: 24, height: 16,
    vx: 0, vy: 0, facingRight: true,
    ...overrides,
  };
}

/** テスト専用スペックを一時的に登録して使う。 */
const TEST_KIND = '__test__';
DEBRIS_SPECS[TEST_KIND] = {
  holdFrames: 2,
  burst: 0,   // 放射方向の初速をゼロにして変換だけを検証する
  parts: [{ x: 4, y: 6, w: 8, h: 4, color: '#123456', weight: 1 }],
};

test('右向きならローカル座標がそのままワールドへ平行移動される', () => {
  const [p] = buildDebris(makeEntity(), TEST_KIND);
  assert.equal(p.x, 204);
  assert.equal(p.y, 106);
  assert.equal(p.w, 8);
  assert.equal(p.h, 4);
  assert.equal(p.color, '#123456');
});

test('左向きならX座標が機体幅の内側で反転する', () => {
  const [p] = buildDebris(makeEntity({ facingRight: false }), TEST_KIND);
  assert.equal(p.x, 200 + 24 - 4, 'x は entity.x + width - localX');
  assert.equal(p.y, 106, 'y は反転しない');
});

test('左向きでは初期角度の符号も反転する', () => {
  DEBRIS_SPECS['__angled__'] = {
    holdFrames: 0, burst: 0,
    parts: [{ x: 4, y: 6, w: 8, h: 4, color: '#000', angle: 0.5 }],
  };
  const [right] = buildDebris(makeEntity(), '__angled__');
  const [left] = buildDebris(makeEntity({ facingRight: false }), '__angled__');
  assert.ok(Math.abs(right.angle - 0.5) < 1e-9);
  assert.ok(Math.abs(left.angle + 0.5) < 1e-9);
  delete DEBRIS_SPECS['__angled__'];
});

test('機体の速度が破片の初速に継承される', () => {
  const [p] = buildDebris(makeEntity({ vx: 3, vy: -2 }), TEST_KIND);
  // burst が 0 なので、慣性 + 微小なランダム散らし のみ
  assert.ok(Math.abs(p.vx - 3) < 1.0, `慣性が継承されていない: ${p.vx}`);
  assert.ok(Math.abs(p.vy + 2) < 1.0, `慣性が継承されていない: ${p.vy}`);
});

test('スペックの holdFrames が破片に伝わる', () => {
  const [p] = buildDebris(makeEntity(), TEST_KIND);
  assert.equal(p.hold, 2);
});

test('rotation フックが指定されると機体中心まわりに回転する', () => {
  DEBRIS_SPECS['__rot__'] = {
    holdFrames: 0, burst: 0,
    rotation: () => Math.PI / 2,
    // 機体中心 (12, 8) の真右 4px の点
    parts: [{ x: 16, y: 8, w: 2, h: 2, color: '#000' }],
  };
  const [p] = buildDebris(makeEntity(), '__rot__');
  // 90度回転すると中心の真下へ移る
  assert.ok(Math.abs(p.x - (200 + 12)) < 1e-6, `x=${p.x}`);
  assert.ok(Math.abs(p.y - (100 + 12)) < 1e-6, `y=${p.y}`);
  assert.ok(Math.abs(p.angle - Math.PI / 2) < 1e-9);
  delete DEBRIS_SPECS['__rot__'];
});

test('getDebrisParts があればスペックの静的パーツより優先される', () => {
  const entity = makeEntity();
  entity.getDebrisParts = () => [{ x: 0, y: 0, w: 1, h: 1, color: '#FFF' }];
  const parts = buildDebris(entity, TEST_KIND);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].color, '#FFF');
});

test('未登録の kind では空配列を返す', () => {
  assert.deepEqual(buildDebris(makeEntity(), 'nonexistent'), []);
});

test('segmentPart は線分を回転矩形に変換する', () => {
  const p = segmentPart(0, 0, 3, 4, 2, '#ABCDEF', 0.7);
  assert.equal(p.x, 1.5, '中点');
  assert.equal(p.y, 2);
  assert.equal(p.w, 5, '線分の長さ');
  assert.equal(p.h, 2, '線の太さ');
  assert.ok(Math.abs(p.angle - Math.atan2(4, 3)) < 1e-9);
  assert.equal(p.color, '#ABCDEF');
  assert.equal(p.weight, 0.7);
});

test('EnemyDrone のパーツが機体枠から極端に外れていない', () => {
  const spec = DEBRIS_SPECS.drone;
  assert.ok(spec, 'drone スペックが登録されている');
  assert.ok(spec.parts.length >= 5, `パーツが少なすぎる: ${spec.parts.length}`);
  const W = 24, H = 16;
  for (const part of spec.parts) {
    assert.ok(typeof part.color === 'string' && part.color.length > 0);
    assert.ok(part.w > 0 && part.h > 0);
    assert.ok(part.x >= -W && part.x <= W * 2, `x が範囲外: ${part.x}`);
    assert.ok(part.y >= -H && part.y <= H * 2, `y が範囲外: ${part.y}`);
  }
});

delete DEBRIS_SPECS[TEST_KIND];
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm test -- tests/debris-build.test.js`
Expected: FAIL — `Cannot find module '.../debris/index.js'`

- [ ] **Step 3: shapes.js を実装する**

`src/js/entities/debris/shapes.js` を新規作成。パーツ定義モジュールが共通で使う形状ヘルパー。
何にも依存しない葉ノードにしておくことで、`index.js` ↔ 各 `*Parts.js` の循環参照を避ける。

```js
// 破片パーツの形状ヘルパー。
// パーツ定義の座標系は「機体バウンディングボックス左上原点・右向き」で、
// x, y はパーツの中心を指す。

/**
 * 線分を「回転した細長い矩形」として表すパーツを作る。
 * 脚のようにストロークで描かれている部品を破片へ落とし込むのに使う。
 * @returns {{x:number,y:number,w:number,h:number,color:string,weight:number,angle:number}}
 */
export function segmentPart(x1, y1, x2, y2, thickness, color, weight = 1) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return {
        x: (x1 + x2) / 2,
        y: (y1 + y2) / 2,
        w: Math.hypot(dx, dy),
        h: thickness,
        color,
        weight,
        angle: Math.atan2(dy, dx),
    };
}
```

- [ ] **Step 4: droneParts.js を実装する**

`src/js/entities/debris/droneParts.js` を新規作成。

座標は `EnemyDrone.draw()`（`src/js/entities/EnemyDrone.js:431`）の矩形を、描画原点（機体中心）から
バウンディングボックス左上原点へ `+12, +8` して移し、左上指定から中心指定へ直したもの。

```js
// EnemyDrone の破片パーツ定義。
// 元の描画は機体中心を原点にしているので、ここでは +12/+8 して
// バウンディングボックス左上原点（24x16）へ揃えてある。
// 向きの反転は patrolDir、機体の傾きは tiltAngle が持つ。

export const droneDebris = {
    holdFrames: 0,   // 雑魚なのでタメなしで即分解する
    burst: 2.2,
    mirrored: (e) => e.patrolDir < 0,
    rotation: (e) => e.tiltAngle || 0,
    parts: [
        // 中央コア
        { x: 12, y: 8, w: 12, h: 8, color: '#445566', weight: 1.6 },
        // 前後アーム
        { x: 22, y: 7.5, w: 8, h: 3, color: '#8899AA', weight: 0.7 },
        { x: 2, y: 7.5, w: 8, h: 3, color: '#8899AA', weight: 0.7 },
        // 前後モーターポッド
        { x: 26, y: 7, w: 4, h: 6, color: '#334455', weight: 0.9 },
        { x: -2, y: 7, w: 4, h: 6, color: '#334455', weight: 0.9 },
        // アイ
        { x: 16, y: 10, w: 5, h: 5, color: '#FFCC00', weight: 0.5 },
        // 機銃
        { x: 13, y: 13.5, w: 6, h: 3, color: '#222222', weight: 0.6 },
    ],
};
```

- [ ] **Step 5: debris/index.js を実装する**

`src/js/entities/debris/index.js` を新規作成:

```js
// ============================================
// Debris Factory - パーツ定義からワールド座標の破片を作る
// ============================================
// パーツ定義の座標系は全機体で統一されている:
//   原点 = 機体バウンディングボックス左上 (entity.x, entity.y)
//   向き = 右向き (facingRight = true) のときの見た目
//   x, y = パーツの中心（左上ではない）
// ローカル→ワールドの変換は、この1ファイルだけが知っている。

import { DebrisPart } from '../DebrisPart.js';
import {
    DEBRIS_LIFETIME, DEBRIS_LIFETIME_JITTER,
    DEBRIS_SPIN_SCALE, DEBRIS_SPEED_JITTER,
} from '../../utils/Constants.js';
import { droneDebris } from './droneParts.js';

// 呼び出し側の利便のために再エクスポートする。
// ただし *Parts.js からは shapes.js を直接 import すること（循環参照になるため）。
export { segmentPart } from './shapes.js';

/** kind 文字列 → 機体スペック。各機体の die() が渡す文字列に対応する。 */
export const DEBRIS_SPECS = {
    drone: droneDebris,
};

/** 既定の向き判定。facingRight を持たない機体はスペック側で上書きする。 */
const defaultMirrored = (e) => e.facingRight === false;
const defaultRotation = () => 0;

/**
 * 機体から破片の配列を組み立てる。
 * 可動部を持つ機体は getDebrisParts() を実装し、死亡時点のポーズを
 * 焼き込んだパーツ配列を返す。持たない機体はスペックの静的テーブルを使う。
 * @returns {DebrisPart[]}
 */
export function buildDebris(entity, kind) {
    const spec = DEBRIS_SPECS[kind];
    if (!spec) return [];

    const parts = (typeof entity.getDebrisParts === 'function')
        ? entity.getDebrisParts()
        : spec.parts;
    if (!parts || parts.length === 0) return [];

    const mirrored = (spec.mirrored || defaultMirrored)(entity);
    const rotation = (spec.rotation || defaultRotation)(entity);
    const cx = entity.width / 2;
    const cy = entity.height / 2;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    const out = [];
    for (const part of parts) {
        // 1. 機体中心まわりの回転（ドローンの傾きなど）
        let lx = part.x;
        let ly = part.y;
        if (rotation !== 0) {
            const dx = lx - cx;
            const dy = ly - cy;
            lx = cx + (dx * cos - dy * sin);
            ly = cy + (dx * sin + dy * cos);
        }

        // 2. 向きの反転
        const worldX = entity.x + (mirrored ? entity.width - lx : lx);
        const worldY = entity.y + ly;

        let angle = (part.angle || 0) + rotation;
        if (mirrored) angle = -angle;

        // 3. 初速 = 慣性 + 機体中心からの放射 / weight + 散らし
        const weight = part.weight || 1;
        const radialX = (mirrored ? -(lx - cx) : (lx - cx));
        const radialY = ly - cy;
        const radialLen = Math.hypot(radialX, radialY) || 1;
        const power = spec.burst / weight;
        const vx = (entity.vx || 0)
            + (radialX / radialLen) * power
            + (Math.random() - 0.5) * DEBRIS_SPEED_JITTER;
        const vy = (entity.vy || 0)
            + (radialY / radialLen) * power
            + (Math.random() - 0.5) * DEBRIS_SPEED_JITTER;

        // 横へ勢いよく飛んだ破片ほど速く回る（慣性を視覚的に一貫させる）
        const spin = vx * DEBRIS_SPIN_SCALE * (Math.random() < 0.5 ? -1 : 1);

        out.push(new DebrisPart({
            x: worldX, y: worldY,
            w: part.w, h: part.h,
            color: part.color,
            angle, vx, vy, spin,
            holdFrames: spec.holdFrames,
            lifetime: DEBRIS_LIFETIME + Math.floor(Math.random() * DEBRIS_LIFETIME_JITTER),
            game: entity.game || null,
        }));
    }
    return out;
}
```

- [ ] **Step 6: テストを実行して通ることを確認する**

Run: `npm test -- tests/debris-build.test.js`
Expected: PASS（10テスト）

- [ ] **Step 7: spawnDebris の失敗するテストを書く**

`tests/debris-spawn.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDebris } from '../src/js/entities/debris/index.js';
import { DebrisPart } from '../src/js/entities/DebrisPart.js';
import { DEBRIS_MAX_ACTIVE } from '../src/js/utils/Constants.js';

/**
 * main.js の game オブジェクトは DOM に依存するため import できない。
 * spawnDebris と同じ実装を持つ最小の器で振る舞いを固定する。
 * （main.js 側の実装がこの契約から外れたら debris-integration 側で気づく）
 */
function makeGame() {
  return {
    particles: [],
    camera: { x: 0, y: 0 },
    canvas: { width: 1024, height: 768 },
    spawnDebris(entity, kind) {
      const debris = buildDebris(entity, kind);
      if (debris.length === 0) return;
      this.particles.push(...debris);
      let excess = this.particles.filter((p) => p instanceof DebrisPart).length - DEBRIS_MAX_ACTIVE;
      if (excess <= 0) return;
      for (let i = 0; i < this.particles.length && excess > 0; i++) {
        if (this.particles[i] instanceof DebrisPart) {
          this.particles.splice(i, 1);
          i--;
          excess--;
        }
      }
    },
  };
}

function makeDrone(game, x = 100, y = 100) {
  return {
    game, x, y, width: 24, height: 16,
    vx: 0, vy: 0, patrolDir: 1, tiltAngle: 0,
  };
}

test('spawnDebris が particles に破片を追加する', () => {
  const game = makeGame();
  game.spawnDebris(makeDrone(game), 'drone');
  assert.equal(game.particles.length, 7);
  assert.ok(game.particles.every((p) => p instanceof DebrisPart));
});

test('未登録の kind では何も追加しない', () => {
  const game = makeGame();
  game.spawnDebris(makeDrone(game), 'nope');
  assert.equal(game.particles.length, 0);
});

test('同時存在数の上限を超えない（古いものから落とす）', () => {
  const game = makeGame();
  for (let i = 0; i < 40; i++) game.spawnDebris(makeDrone(game, i * 30, 100), 'drone');
  const count = game.particles.filter((p) => p instanceof DebrisPart).length;
  assert.equal(count, DEBRIS_MAX_ACTIVE);
});

test('上限処理は破片以外のパーティクルを消さない', () => {
  const game = makeGame();
  const marker = { alive: true, update() {}, draw() {} };
  game.particles.push(marker);
  for (let i = 0; i < 40; i++) game.spawnDebris(makeDrone(game, i * 30, 100), 'drone');
  assert.ok(game.particles.includes(marker), '爆発パーティクルが巻き添えで消えた');
});
```

- [ ] **Step 8: テストを実行して失敗を確認する**

Run: `npm test -- tests/debris-spawn.test.js`
Expected: FAIL — `game.particles.length` が 0（`drone` スペック未登録なら）または `buildDebris` の import エラー。Step 4 まで済んでいれば PASS するので、その場合は次へ進む

- [ ] **Step 9: main.js に spawnDebris を追加する**

`src/js/main.js` の import 行（`Particle` を読み込んでいる 37行目付近）に追加:

```js
import { buildDebris } from './entities/debris/index.js';
import { DebrisPart } from './entities/DebrisPart.js';
```

定数 import に `DEBRIS_MAX_ACTIVE` を追加し、`spawnExplosion`（`src/js/main.js:1186`）の直後に追加:

```js
    /**
     * 破壊された機体のパーツを破片として撒く。
     * 当たり判定は持たず、既存の particles 配列に相乗りするだけ。
     * @param {object} entity 破壊された機体
     * @param {string} kind DEBRIS_SPECS のキー
     */
    spawnDebris(entity, kind) {
        const debris = buildDebris(entity, kind);
        if (debris.length === 0) return;
        this.particles.push(...debris);
        this._trimDebris();
    },

    /** 破片の同時存在数を上限内に収める。古い破片から落とす。 */
    _trimDebris() {
        let excess = this.particles.filter((p) => p instanceof DebrisPart).length - DEBRIS_MAX_ACTIVE;
        if (excess <= 0) return;
        for (let i = 0; i < this.particles.length && excess > 0; i++) {
            if (this.particles[i] instanceof DebrisPart) {
                this.particles.splice(i, 1);
                i--;
                excess--;
            }
        }
    },
```

- [ ] **Step 10: EnemyDrone から呼び出す**

`src/js/entities/EnemyDrone.js:425` の `die()` を変更:

```js
    die() {
        this.alive = false;
        this.game.spawnDebris(this, 'drone');
        this.game.spawnExplosion(this.x + this.width / 2, this.y + this.height / 2, 20);
        this.game.addScore(ENEMY_DRONE_SCORE);
    }
```

`spawnDebris` を先に呼ぶのは、破片が爆発パーティクルより手前に描かれないようにするため（`particles` は配列順に描画される）。

- [ ] **Step 11: 全テストを実行する**

Run: `npm test`
Expected: 全 PASS

- [ ] **Step 12: コミット**

```bash
git add src/js/entities/debris/ src/js/main.js src/js/entities/EnemyDrone.js tests/debris-build.test.js tests/debris-spawn.test.js
git commit -m "$(cat <<'EOF'
feat: 破片生成の基盤と EnemyDrone のパーツ飛散を追加

buildDebris がローカル座標→ワールド座標の変換（向き反転・機体回転・
慣性継承）を一手に引き受ける。可動部のない EnemyDrone を最初の
適用例として通した。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 13: 実機確認を依頼する（チェックポイント）**

ローカルサーバーを起動する:

```bash
python3 -m http.server 8000
```

ユーザーに次を伝えて確認を依頼し、**返答を待ってから Task 3 へ進む**:

- `http://localhost:8000` を開き、**ハードリロード**（Cmd+Shift+R）してからドローンを撃破する
- 見るべき点: パーツが機体の見た目と一致しているか / 飛び散る勢いは適切か / 爆発に埋もれていないか / 縮んで消えるタイミングは自然か
- 調整したい場合は `DEBRIS_GRAVITY`・`DEBRIS_LIFETIME`・`droneDebris.burst` の数値で対応する

---

### Task 3: Player の破片（可動脚＋武装）

可動部フックの雛形を確立する。以降の機体はこの形を踏襲する。

**Files:**
- Create: `src/js/entities/debris/playerParts.js`
- Modify: `src/js/entities/debris/index.js`（スペック登録）
- Modify: `src/js/entities/Player.js`（`_aimAngle()` と `_legPose()` / `_collectLegPoses()` の抽出、`getDebrisParts()` 追加、`die()` に1行）
- Test: `tests/debris-player.test.js`

**Interfaces:**
- Consumes: Task 2 の `segmentPart`、パーツ定義の型、`DEBRIS_SPECS`
- Produces:
  - `playerDebris` スペック（`holdFrames: 5`, `burst: 2.6`）
  - `PLAYER_STATIC_PARTS` — 頭部・胴体・バックパック・スラスター
  - `playerLegParts(player)` → `Part[]`（4パーツ: 各脚の腿と脛）
  - `playerWeaponParts(player)` → `Part[]`（2パーツ）
  - `Player.prototype._aimAngle(crouchOffset)` → `number`（機体ローカルでの武装の向き。ラジアン）
  - `Player.prototype._legPose(isNear, walkPose, hoverSwing)` → `{hipX, hipY, kx, ky, fx, fy}`
  - `Player.prototype._collectLegPoses()` → `Array<{isNear, hipX, hipY, kneeX, kneeY, footX, footY, lineWidth}>`
  - `Player.prototype.getDebrisParts()` → `Part[]`

**重要（脚ポーズ計算の一本化）:** 脚の関節座標の計算は `Player` 側の `_legPose()` / `_collectLegPoses()`
だけが持つ。`playerParts.js` は**座標計算を一切再実装せず**、受け取った関節座標を線分パーツへ落とすだけにする。
EnemyAttacker（Task 5）と同じ構造で、脚のポーズを直したときに破片だけ古いまま取り残される事故を防ぐ。

- [ ] **Step 1: 失敗するテストを書く**

`tests/debris-player.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { buildDebris, DEBRIS_SPECS } from '../src/js/entities/debris/index.js';
import { PLAYER_WIDTH, PLAYER_HEIGHT } from '../src/js/utils/Constants.js';
import { makeFakeCtx, extractPolylines } from './helpers/fake-ctx.js';

function makeGame() {
  return {
    map: { isSolidAtPixel: () => false, pixelToTile: () => ({ r: 0, c: 0 }) },
    camera: { x: 0, y: 0 },
    canvas: { width: 1024, height: 768 },
    input: null,
    particles: [],
    carrier: null,
    enemies: [],
    projectiles: [],
    spawnExplosion() {},
    spawnHeavyDamage() {},
    spawnSparks() {},
    // main.js の spawnDebris と同じ振る舞いの最小実装（上限処理は debris-spawn 側で検証済み）
    spawnDebris(entity, kind) { this.particles.push(...buildDebris(entity, kind)); },
  };
}

function makePlayer(overrides = {}) {
  const game = makeGame();
  const p = new Player(game, 100, 200);
  p.docked = false;
  p.crouching = false;
  p.onGround = true;
  Object.assign(p, overrides);
  return p;
}

test('playerDebris スペックが登録されている', () => {
  const spec = DEBRIS_SPECS.player;
  assert.ok(spec);
  assert.ok(spec.holdFrames >= 4, '自機は大物なのでタメを持つ');
});

test('getDebrisParts が静的パーツ・脚・武装をすべて返す', () => {
  const p = makePlayer();
  const parts = p.getDebrisParts();
  assert.ok(parts.length >= 9, `パーツが少なすぎる: ${parts.length}`);
  for (const part of parts) {
    assert.ok(typeof part.color === 'string' && part.color.length > 0);
    assert.ok(part.w > 0 && part.h > 0, `サイズが不正: ${JSON.stringify(part)}`);
    assert.ok(Number.isFinite(part.x) && Number.isFinite(part.y));
  }
});

test('パーツが機体枠から極端に外れていない', () => {
  const p = makePlayer();
  for (const part of p.getDebrisParts()) {
    assert.ok(part.x >= -PLAYER_WIDTH && part.x <= PLAYER_WIDTH * 2, `x=${part.x}`);
    assert.ok(part.y >= -PLAYER_HEIGHT && part.y <= PLAYER_HEIGHT * 2, `y=${part.y}`);
  }
});

test('ホバー中と接地中で脚パーツの座標が変わる', () => {
  const ground = makePlayer({ onGround: true, walkFrame: 0 });
  const air = makePlayer({ onGround: false, vx: 1.5 });
  const gy = ground.getDebrisParts().map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('|');
  const ay = air.getDebrisParts().map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('|');
  assert.notEqual(gy, ay, '死亡時のポーズが反映されていない');
});

test('武装の種類でパーツが変わる', () => {
  const bazooka = makePlayer({ currentWeapon: 'missile' });
  const mg = makePlayer({ currentWeapon: 'mg' });
  assert.notEqual(
    JSON.stringify(bazooka.getDebrisParts()),
    JSON.stringify(mg.getDebrisParts()),
  );
});

test('左向きなら buildDebris でX座標が反転する', () => {
  const right = makePlayer({ facingRight: true });
  const left = makePlayer({ facingRight: false });
  const [r0] = buildDebris(right, 'player');
  const [l0] = buildDebris(left, 'player');
  const localX = r0.x - right.x;
  assert.ok(Math.abs((l0.x - left.x) - (PLAYER_WIDTH - localX)) < 1e-9);
});

test('die() が破片を particles へ入れる', () => {
  const p = makePlayer();
  p.die();
  assert.ok(p.game.particles.length >= 9, '破片が撒かれていない');
});

test('input が無くても getDebrisParts が例外を投げない', () => {
  const p = makePlayer();
  p.game.input = null;
  assert.doesNotThrow(() => p.getDebrisParts());
});

// これが描画と破片のポーズ一致を守る要のテスト。
// _collectLegPoses() が _drawSingleLeg と別のポーズを返すようになったら、ここで落ちる。
test('_collectLegPoses が実際に描かれた脚のポリラインと一致する', () => {
  const states = [
    { onGround: true, crouching: false, docked: false, walkFrame: 0 },
    { onGround: true, crouching: false, docked: false, walkFrame: 3 },
    { onGround: false, crouching: false, docked: false, vx: 1.2 },
    { onGround: true, crouching: true, docked: false },
  ];
  for (const state of states) {
    const p = makePlayer();
    Object.assign(p, state);
    p.facingRight = true;
    p.invincibleTimer = 0;

    const ctx = makeFakeCtx();
    p.draw(ctx);
    const drawn = extractPolylines(ctx.calls);
    const label = JSON.stringify(state);
    const near = (a, b) => Math.abs(a - b) < 1e-6;

    for (const pose of p._collectLegPoses()) {
      const found = drawn.some((line) =>
        line.length >= 2 &&
        near(line[0].x, pose.hipX) && near(line[0].y, pose.hipY) &&
        near(line[1].x, pose.kneeX) && near(line[1].y, pose.kneeY));
      assert.ok(found, `${label}: 描画に一致する脚が無い hip=(${pose.hipX},${pose.hipY}) knee=(${pose.kneeX},${pose.kneeY})`);
    }
  }
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm test -- tests/debris-player.test.js`
Expected: FAIL — `DEBRIS_SPECS.player` が undefined

- [ ] **Step 3: Player に狙い角度の抽出メソッドを追加する**

`_drawBazooka` と `_drawMachineGun`（`src/js/entities/Player.js:686` と `:721`）が同じ角度計算を重複して持っている。
これを1箇所に抽出し、破片生成からも使えるようにする。**見た目は変えない。**

`Player.js` の `_drawBazooka` の直前に追加:

```js
    /**
     * 武装の向き（機体ローカル、ラジアン）。
     * 描画と破片生成の両方から使うので、ここが唯一の計算箇所。
     * 照準情報が取れない場合（テスト等）は水平前方を返す。
     * @param {number} crouchOffset
     */
    _aimAngle(crouchOffset) {
        const input = this.game && this.game.input;
        if (!input || typeof input.getTargetWorld !== 'function') return 0;

        const targetWorld = input.getTargetWorld(this.game.camera);
        const cx = Math.round(this.x) + this.width / 2;
        const cy = Math.round(this.y) + 6 + crouchOffset;
        const raw = Math.atan2(targetWorld.y - cy, targetWorld.x - cx);
        return this.facingRight ? raw : Math.PI - raw;
    }
```

`_drawBazooka` の冒頭を書き換える:

```js
    _drawBazooka(ctx, x, y, crouchOffset) {
        const cx = x + this.width / 2;
        const cy = y + 6 + crouchOffset;
        const rawAngle = this._aimAngle(crouchOffset);
```

（`targetWorld` の取得と `rawAngle` の計算、`if (!this.facingRight) rawAngle = Math.PI - rawAngle;` の3ブロックを上記1行に置き換える。以降の `ctx.save()` 以下はそのまま。）

`_drawMachineGun` も同じ形に書き換える。

- [ ] **Step 4: Player の脚ポーズ計算を抽出する**

`_drawSingleLeg`（`src/js/entities/Player.js:614`）は「関節座標の計算」と「描画」を1つのメソッドで
やっている。破片生成が同じ計算を再実装しないよう、計算部分を切り出す。**見た目は変えない。**

`_drawSingleLeg` の直前に追加:

```js
    /**
     * 脚1本の関節座標を求める（描画はしない）。
     * 描画と破片生成の両方から使うので、ここが唯一の計算箇所。
     * @param {boolean} isNear 手前脚か
     * @param {number|null} walkPose 歩行ポーズ番号。ホバー中は null
     * @param {number|null} hoverSwing ホバー中の振り子量 -1..+1。接地中は null
     * @returns {{hipX:number,hipY:number,kx:number,ky:number,fx:number,fy:number}}
     */
    _legPose(isNear, walkPose, hoverSwing) {
        const hipX = isNear ? 10 : 7;
        const hipY = 16;
        let kx, ky, fx, fy;

        if (hoverSwing !== null) {
            const maxAngle = Math.PI / 4;
            const angle = hoverSwing * maxAngle;
            const baseKx = isNear ? 1 : -1;
            const baseKy = 3;
            const baseFx = isNear ? 0 : -2;
            const baseFy = 6;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);

            kx = hipX + (baseKx * cosA - baseKy * sinA);
            ky = hipY + (baseKx * sinA + baseKy * cosA);
            fx = hipX + (baseFx * cosA - baseFy * sinA);
            fy = hipY + (baseFx * sinA + baseFy * cosA);
        } else {
            switch (walkPose) {
                case 0: kx = hipX + 2; ky = hipY + 3; fx = kx + 2; fy = 22; break;
                case 1: kx = hipX - 3; ky = hipY + 3; fx = kx - 2; fy = 20; break;
                case 2: kx = hipX; ky = hipY + 3; fx = kx; fy = 22; break;
                case 3: kx = hipX + 4; ky = hipY + 1; fx = kx - 1; fy = 19; break;
            }
        }

        return { hipX, hipY, kx, ky, fx, fy };
    }

    /**
     * 死亡時の両脚の関節座標を集める（描画はしない）。
     * 破片生成が「今どんなポーズだったか」を知るための唯一の入口。
     * @returns {Array<{isNear:boolean,hipX:number,hipY:number,kneeX:number,kneeY:number,footX:number,footY:number,lineWidth:number}>}
     */
    _collectLegPoses() {
        const out = [];
        const push = (isNear, pose) => {
            out.push({
                isNear,
                hipX: pose.hipX, hipY: pose.hipY,
                kneeX: pose.kx, kneeY: pose.ky,
                footX: pose.fx, footY: pose.fy,
                lineWidth: 3,
            });
        };

        if (this.crouching || this.docked) {
            // _drawCrouchedLegs の固定ポーズ（座標はそちらのポリラインと同一）
            push(false, { hipX: 7, hipY: 16, kx: 2, ky: 20, fx: 6, fy: 22 });
            push(true, { hipX: 10, hipY: 16, kx: 15, ky: 20, fx: 11, fy: 22 });
            return out;
        }

        if (!this.onGround) {
            let localVx = this.facingRight ? this.vx : -this.vx;
            localVx = Math.max(-PLAYER_MAX_SPEED, Math.min(PLAYER_MAX_SPEED, localVx));
            const hoverSwing = localVx / PLAYER_MAX_SPEED;
            push(false, this._legPose(false, null, hoverSwing * 0.8 - 0.2));
            push(true, this._legPose(true, null, hoverSwing));
            return out;
        }

        const WALK_POSES = [
            { near: 0, far: 1 },
            { near: 2, far: 3 },
            { near: 2, far: 2 },
            { near: 3, far: 2 },
        ];
        const pose = WALK_POSES[this.walkFrame] || WALK_POSES[2];
        push(false, this._legPose(false, pose.far, null));
        push(true, this._legPose(true, pose.near, null));
        return out;
    }
```

`_drawSingleLeg` の冒頭を、抽出したメソッドを使う形に書き換える:

```js
    _drawSingleLeg(ctx, isNear, walkPose, hoverSwing) {
        const { hipX, hipY, kx, ky, fx, fy } = this._legPose(isNear, walkPose, hoverSwing);
```

（元の `const hipX = ...` から `switch` ブロックの終わりまでを、この1行に置き換える。
以降の「Leg stroke」以下の描画コードはそのまま。）

- [ ] **Step 5: テストを実行して既存の描画が壊れていないことを確認する**

Run: `npm test`
Expected: 全 PASS（`debris-player.test.js` を除く）

- [ ] **Step 6: playerParts.js を実装する**

`src/js/entities/debris/playerParts.js` を新規作成。

座標は `Player._drawBody`（`src/js/entities/Player.js:545`）と `_drawSingleLeg`（`:614`）に対応する。
`_drawSingleLeg` は「股関節→膝→足首」のポリラインなので、腿と脛の2本の線分に分けて破片にする。

```js
// Player の破片パーツ定義。
// 座標は Player._drawBody / _drawSingleLeg / _drawBazooka の
// ローカル座標（機体左上原点・右向き）にそのまま対応する。
// 頭部とバイザーは1パーツにまとめてある（別々に飛ぶと顔が割れて見えるため）。

import { segmentPart } from './shapes.js';

/** しゃがみ/ホバーで動かない部品。x, y はパーツ中心。 */
export const PLAYER_STATIC_PARTS = [
    { x: 10, y: 2.5, w: 8, h: 5, color: '#CCCCCC', weight: 1.0 },   // 頭部
    { x: 10, y: 10, w: 10, h: 12, color: '#E8E8E8', weight: 1.6 },  // 胴体
    { x: 4, y: 9, w: 4, h: 8, color: '#AAAAAA', weight: 1.0 },      // バックパック
    { x: 4, y: 13, w: 4, h: 2, color: '#FF6600', weight: 0.5 },     // スラスター
];

/**
 * 死亡時の脚のポーズを破片にする。
 * 関節座標の計算そのものは Player._collectLegPoses() が持っており、
 * ここは受け取った座標を線分パーツへ落とすだけ。
 * @returns {Array} パーツ4個（各脚の腿と脛）
 */
export function playerLegParts(player) {
    const out = [];
    for (const pose of player._collectLegPoses()) {
        const legColor = pose.isNear ? '#DDDDDD' : '#AAAAAA';
        const footColor = pose.isNear ? '#888888' : '#666666';
        out.push(segmentPart(pose.hipX, pose.hipY, pose.kneeX, pose.kneeY, pose.lineWidth, legColor, 0.9));
        out.push(segmentPart(pose.kneeX, pose.kneeY, pose.footX, pose.footY, pose.lineWidth, footColor, 0.7));
    }
    return out;
}

/**
 * 武装を、死亡時の狙い角度のまま2パーツで飛ばす。
 * しゃがみ中は武装が描かれていないので何も返さない。
 */
export function playerWeaponParts(player) {
    const isCrouched = player.crouching || player.docked;
    if (isCrouched) return [];

    const crouchOffset = 0;
    const angle = player._aimAngle(crouchOffset);
    // _drawBazooka / _drawMachineGun の回転中心（ローカル座標）
    const pivotX = player.width / 2 + 2;
    const pivotY = 6 + crouchOffset;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    /** 武装ローカル座標のパーツを、回転中心まわりに回して機体ローカルへ移す。 */
    const rotated = (lx, ly, w, h, color, weight) => ({
        x: pivotX + (lx * cos - ly * sin),
        y: pivotY + (lx * sin + ly * cos),
        w, h, color, weight, angle,
    });

    if (player.currentWeapon === 'missile') {
        return [
            rotated(3, 0, 22, 4, '#666666', 0.8),   // 砲身
            rotated(13, 0, 4, 6, '#444444', 0.6),   // マズル
        ];
    }
    return [
        rotated(1.5, 0.5, 7, 5, '#777777', 0.8),    // 機関部
        rotated(8, 0, 6, 2, '#666666', 0.5),        // 銃身
    ];
}

export const playerDebris = {
    holdFrames: 5,   // 自機の破壊は重い出来事なので、はっきりタメる
    burst: 2.6,
    parts: PLAYER_STATIC_PARTS,
};
```

- [ ] **Step 7: Player に getDebrisParts と die() の呼び出しを追加する**

`src/js/entities/Player.js` の import に追加:

```js
import { PLAYER_STATIC_PARTS, playerLegParts, playerWeaponParts } from './debris/playerParts.js';
```

`die()`（`src/js/entities/Player.js:435`）を変更:

```js
    die() {
        this.alive = false;
        this.game.spawnDebris(this, 'player');
        // Spawn explosion particles
        this.game.spawnExplosion(this.x + this.width / 2, this.y + this.height / 2, 15);
        this.lives--;

        // Release lock-on when dead
        if (this.game.input) {
            this.game.input.crosshairLocked = false;
        }
    }
```

`draw(ctx)` の直前に追加:

```js
    /** 破壊時の破片パーツ。静的部位に、死亡時のポーズを焼き込んだ脚と武装を足す。 */
    getDebrisParts() {
        return [
            ...PLAYER_STATIC_PARTS,
            ...playerLegParts(this),
            ...playerWeaponParts(this),
        ];
    }
```

- [ ] **Step 8: スペックを登録する**

`src/js/entities/debris/index.js` を変更:

```js
import { droneDebris } from './droneParts.js';
import { playerDebris } from './playerParts.js';

export const DEBRIS_SPECS = {
    drone: droneDebris,
    player: playerDebris,
};
```

注意: `playerParts.js` は `segmentPart` を **`./shapes.js` から直接** import すること。
`./index.js` 経由にすると `index.js` ↔ `playerParts.js` の循環参照になる。

- [ ] **Step 9: テストを実行して通ることを確認する**

Run: `npm test -- tests/debris-player.test.js`
Expected: PASS（9テスト）

- [ ] **Step 9: 全テストを実行する**

Run: `npm test`
Expected: 全 PASS

- [ ] **Step 11: コミット**

```bash
git add src/js/entities/debris/playerParts.js src/js/entities/debris/index.js src/js/entities/Player.js tests/debris-player.test.js
git commit -m "$(cat <<'EOF'
feat: 自機の破壊にパーツ飛散を追加

死亡時の脚のポーズと武装の狙い角度を焼き込んだ破片を飛ばす。
_drawBazooka と _drawMachineGun に重複していた狙い角度の計算を
_aimAngle() に抽出し、描画と破片生成で共有する。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: EnemyTank と EnemyTurret

単純な機体2つ。Tank は完全に静的、Turret は旋回体の角度と天井/床の設置向きを反映する。

**注意（仕様書からの訂正）:** 仕様書では EnemyTank の砲身を可動部としているが、`EnemyTank.draw()`（`src/js/entities/EnemyTank.js:251`）を確認したところ砲身は固定描画で、可動部は存在しない。Tank は静的テーブルのみで実装する。

**Files:**
- Create: `src/js/entities/debris/tankParts.js`
- Create: `src/js/entities/debris/turretParts.js`
- Modify: `src/js/entities/debris/index.js`
- Modify: `src/js/entities/EnemyTank.js:238`（`die()`）
- Modify: `src/js/entities/EnemyTurret.js:150`（`die()`）、`getDebrisParts()` 追加
- Test: `tests/debris-tank-turret.test.js`

**Interfaces:**
- Consumes: Task 2 の `DEBRIS_SPECS`、パーツ定義の型
- Produces:
  - `tankDebris` スペック（`holdFrames: 2`, `burst: 2.0`）
  - `turretDebris` スペック（`holdFrames: 2`, `burst: 1.8`）
  - `turretBaseParts(turret)` → `Part[]`（設置向きに応じた基部とアーム）
  - `turretHeadParts(turret)` → `Part[]`（`currentAngle` を反映した旋回体）
  - `EnemyTurret.prototype.getDebrisParts()` → `Part[]`

- [ ] **Step 1: 失敗するテストを書く**

`tests/debris-tank-turret.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEBRIS_SPECS, buildDebris } from '../src/js/entities/debris/index.js';
import { turretBaseParts, turretHeadParts } from '../src/js/entities/debris/turretParts.js';
import {
  ENEMY_TANK_WIDTH, ENEMY_TANK_HEIGHT,
  ENEMY_TURRET_WIDTH, ENEMY_TURRET_HEIGHT,
} from '../src/js/utils/Constants.js';

test('tank のパーツが機体枠に概ね収まる', () => {
  const spec = DEBRIS_SPECS.tank;
  assert.ok(spec);
  assert.ok(spec.parts.length >= 5, `パーツが少なすぎる: ${spec.parts.length}`);
  for (const p of spec.parts) {
    assert.ok(p.x >= -ENEMY_TANK_WIDTH && p.x <= ENEMY_TANK_WIDTH * 2, `x=${p.x}`);
    assert.ok(p.y >= -ENEMY_TANK_HEIGHT && p.y <= ENEMY_TANK_HEIGHT * 2, `y=${p.y}`);
    assert.ok(p.w > 0 && p.h > 0);
  }
});

test('turret の基部は設置向きで上下が入れ替わる', () => {
  const floor = { isCeilingMounted: false, width: ENEMY_TURRET_WIDTH, height: ENEMY_TURRET_HEIGHT };
  const ceiling = { isCeilingMounted: true, width: ENEMY_TURRET_WIDTH, height: ENEMY_TURRET_HEIGHT };
  const floorY = turretBaseParts(floor)[0].y;
  const ceilingY = turretBaseParts(ceiling)[0].y;
  assert.ok(floorY > ENEMY_TURRET_HEIGHT / 2, `床置きの基部が下にない: ${floorY}`);
  assert.ok(ceilingY < ENEMY_TURRET_HEIGHT / 2, `天井吊りの基部が上にない: ${ceilingY}`);
});

test('turret の基部は初速をほぼ持たない（据え付けが崩れる感じ）', () => {
  for (const p of turretBaseParts({ isCeilingMounted: false, width: 24, height: 24 })) {
    assert.ok(p.weight >= 5, `基部の weight が軽い: ${p.weight}`);
  }
});

test('turret の旋回体は currentAngle を反映する', () => {
  const a = turretHeadParts({ currentAngle: 0, recoil: 0, width: 24, height: 24 });
  const b = turretHeadParts({ currentAngle: Math.PI / 2, recoil: 0, width: 24, height: 24 });
  assert.notEqual(
    a.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join('|'),
    b.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join('|'),
  );
});

test('turret の破片は基部と旋回体の両方を含む', () => {
  const turret = {
    x: 300, y: 400, width: ENEMY_TURRET_WIDTH, height: ENEMY_TURRET_HEIGHT,
    vx: 0, vy: 0, currentAngle: 0.3, recoil: 0, isCeilingMounted: false,
    getDebrisParts() { return [...turretBaseParts(this), ...turretHeadParts(this)]; },
  };
  const debris = buildDebris(turret, 'turret');
  assert.ok(debris.length >= 5, `破片が少なすぎる: ${debris.length}`);
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm test -- tests/debris-tank-turret.test.js`
Expected: FAIL — `Cannot find module '.../turretParts.js'`

- [ ] **Step 3: tankParts.js を実装する**

`src/js/entities/debris/tankParts.js` を新規作成。座標は `EnemyTank.draw()`（`src/js/entities/EnemyTank.js:251`）の矩形に対応（16x12、左上原点）。

```js
// EnemyTank の破片パーツ定義。可動部は無く、向きの反転のみ。
// 座標は EnemyTank.draw() の fillRect をそのまま中心指定へ直したもの。

export const tankDebris = {
    holdFrames: 2,
    burst: 2.0,
    parts: [
        { x: 8, y: 5.5, w: 14, h: 7, color: '#CCAA00', weight: 1.8 },  // 車体
        { x: 8, y: 3.5, w: 12, h: 3, color: '#DDBB22', weight: 0.7 },  // 車体上面
        { x: 11, y: 2, w: 6, h: 4, color: '#2266AA', weight: 1.1 },    // 砲塔
        { x: 16, y: 2, w: 4, h: 2, color: '#445566', weight: 0.5 },    // 砲身
        { x: 8, y: 10.5, w: 16, h: 3, color: '#334455', weight: 1.4 }, // ホバースカート
    ],
};
```

- [ ] **Step 4: turretParts.js を実装する**

`src/js/entities/debris/turretParts.js` を新規作成。座標は `EnemyTurret.draw()`（`src/js/entities/EnemyTurret.js:156`）に対応。
描画原点は機体中心なので、`+12, +12` してバウンディングボックス左上原点（24x24）へ揃える。

```js
// EnemyTurret の破片パーツ定義。
// 描画は機体中心を原点にしているので、ここでは +12/+12 して
// バウンディングボックス左上原点（24x24）へ揃えてある。
// 基部は地形に据え付けられているため weight を大きくし、ほとんど飛ばさない。

const CX = 12;
const CY = 12;

/** 設置向き（床置き / 天井吊り）に応じた基部とアーム。 */
export function turretBaseParts(turret) {
    if (turret.isCeilingMounted) {
        return [
            { x: CX, y: CY - 8, w: 20, h: 8, color: '#555555', weight: 8 },
            { x: CX, y: CY - 2, w: 8, h: 4, color: '#555555', weight: 6 },
        ];
    }
    return [
        { x: CX, y: CY + 8, w: 20, h: 8, color: '#555555', weight: 8 },
        { x: CX, y: CY + 2, w: 8, h: 4, color: '#555555', weight: 6 },
    ];
}

/** 死亡時の砲塔角度を焼き込んだ旋回体。 */
export function turretHeadParts(turret) {
    const angle = turret.currentAngle || 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const barrelLength = 14 - (turret.recoil || 0);

    // 砲身は回転中心から前方へ伸びるので、中心を回して置き直す
    const barrelCx = 4 + barrelLength / 2;
    return [
        {
            x: CX + barrelCx * cos,
            y: CY + barrelCx * sin,
            w: barrelLength, h: 4, color: '#888888', weight: 0.7, angle,
        },
        { x: CX, y: CY, w: 16, h: 16, color: '#667788', weight: 1.6 },
        { x: CX, y: CY, w: 6, h: 6, color: '#FFCC00', weight: 0.4 },
    ];
}

export const turretDebris = {
    holdFrames: 2,
    burst: 1.8,
    mirrored: () => false,   // 砲台は左右反転しない
    parts: [...turretBaseParts({ isCeilingMounted: false }), ...turretHeadParts({ currentAngle: 0, recoil: 0 })],
};
```

- [ ] **Step 5: 機体側から呼び出す**

`src/js/entities/EnemyTank.js:238` の `die()` の先頭に追加:

```js
        this.game.spawnDebris(this, 'tank');
```

`src/js/entities/EnemyTurret.js:150` の `die()` の先頭に追加:

```js
        this.game.spawnDebris(this, 'turret');
```

`EnemyTurret.js` の import に追加:

```js
import { turretBaseParts, turretHeadParts } from './debris/turretParts.js';
```

`EnemyTurret` の `draw(ctx)` の直前に追加:

```js
    /** 破壊時の破片パーツ。設置向きと死亡時の砲塔角度を反映する。 */
    getDebrisParts() {
        return [...turretBaseParts(this), ...turretHeadParts(this)];
    }
```

- [ ] **Step 6: スペックを登録する**

`src/js/entities/debris/index.js`:

```js
import { droneDebris } from './droneParts.js';
import { playerDebris } from './playerParts.js';
import { tankDebris } from './tankParts.js';
import { turretDebris } from './turretParts.js';

export const DEBRIS_SPECS = {
    drone: droneDebris,
    player: playerDebris,
    tank: tankDebris,
    turret: turretDebris,
};
```

- [ ] **Step 7: テストを実行して通ることを確認する**

Run: `npm test -- tests/debris-tank-turret.test.js`
Expected: PASS（5テスト）

- [ ] **Step 8: 全テストを実行する**

Run: `npm test`
Expected: 全 PASS

- [ ] **Step 9: コミット**

```bash
git add src/js/entities/debris/tankParts.js src/js/entities/debris/turretParts.js src/js/entities/debris/index.js src/js/entities/EnemyTank.js src/js/entities/EnemyTurret.js tests/debris-tank-turret.test.js
git commit -m "$(cat <<'EOF'
feat: 敵戦車と砲台の破壊にパーツ飛散を追加

砲台は設置向きと死亡時の砲塔角度を反映し、基部は据え付けが崩れる
ようにほとんど飛ばさない。戦車は可動部を持たないため静的テーブルのみ。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: EnemyAttacker（型別の機体と脚）

最も複雑な機体。`ENEMY_ATTACKER_TYPES` により配色・シルエット・脚の本数が異なる。

**Files:**
- Create: `src/js/entities/debris/attackerParts.js`
- Modify: `src/js/entities/debris/index.js`
- Modify: `src/js/entities/EnemyAttacker.js:981`（`die()`）、`getDebrisParts()` 追加
- Test: `tests/debris-attacker.test.js`

**Interfaces:**
- Consumes: Task 2 の `segmentPart`、Task 4 までのパターン
- Produces:
  - `attackerDebris` スペック（`holdFrames: 4`, `burst: 2.4`）
  - `attackerBodyParts(attacker)` → `Part[]`（`config.name` 別の胴体・頭部・装甲・砲）
  - `attackerLegParts(attacker)` → `Part[]`（歩行/空中/しゃがみ、2脚または4脚）
  - `EnemyAttacker.prototype._collectLegPoses()` → `Array<{isNear, hipX, hipY, kneeX, kneeY, footX, footY, lineWidth}>`
  - `EnemyAttacker.prototype.getDebrisParts()` → `Part[]`

**重要（ポーズの厳密一致）:** `_collectLegPoses()` は 2足型（`_drawLegs` 系）と 4脚クモ型
（`_drawArtilleryLegs` 系）の**両方を、描画と同じ分岐・同じ式で**再現する。近似で済ませてはならない。
テストが描画されたポリラインと関節座標を突き合わせて一致を検証する。

- [ ] **Step 1: 失敗するテストを書く**

`tests/debris-attacker.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMap, makeGame, makeAttacker } from './helpers/enemy-world.js';
import { DEBRIS_SPECS, buildDebris } from '../src/js/entities/debris/index.js';
import { ENEMY_ATTACKER_TYPES, PLAYER_WIDTH, PLAYER_HEIGHT } from '../src/js/utils/Constants.js';
import { makeFakeCtx, extractPolylines } from './helpers/fake-ctx.js';

const FLAT = [
  '................',
  '................',
  '################',
];

function attackerOf(typeKey) {
  const game = makeGame(makeMap(FLAT));
  game.spawnDebris = () => {};
  game.addScore = () => {};
  return makeAttacker(game, 40, 16, typeKey);
}

test('attackerDebris スペックが登録されている', () => {
  assert.ok(DEBRIS_SPECS.attacker);
  assert.ok(DEBRIS_SPECS.attacker.holdFrames >= 3);
});

test('全機種でパーツが生成され、機体枠から極端に外れない', () => {
  for (const typeKey of Object.keys(ENEMY_ATTACKER_TYPES)) {
    const e = attackerOf(typeKey);
    const parts = e.getDebrisParts();
    assert.ok(parts.length >= 6, `${typeKey}: パーツが少なすぎる (${parts.length})`);
    for (const p of parts) {
      assert.ok(typeof p.color === 'string' && p.color.length > 0, `${typeKey}: 色が無い`);
      assert.ok(p.w > 0 && p.h > 0, `${typeKey}: サイズ不正 ${JSON.stringify(p)}`);
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${typeKey}: 座標不正`);
      assert.ok(p.x >= -PLAYER_WIDTH * 2 && p.x <= PLAYER_WIDTH * 3, `${typeKey}: x=${p.x}`);
      assert.ok(p.y >= -PLAYER_HEIGHT && p.y <= PLAYER_HEIGHT * 2, `${typeKey}: y=${p.y}`);
    }
  }
});

test('機種ごとに配色が異なる', () => {
  const heavy = attackerOf('heavy').getDebrisParts().map((p) => p.color).join(',');
  const rival = attackerOf('rival').getDebrisParts().map((p) => p.color).join(',');
  assert.notEqual(heavy, rival);
});

test('artillery は 4 脚ぶんのパーツを持つ', () => {
  const artillery = attackerOf('artillery');
  const standard = attackerOf('standard');
  assert.ok(
    artillery.getDebrisParts().length > standard.getDebrisParts().length,
    '4脚機のパーツが2脚機より多くない',
  );
});

test('接地と空中でポーズが変わる', () => {
  const ground = attackerOf('standard');
  ground.onGround = true;
  ground.crouching = false;
  ground.burstCount = 0;
  const a = ground.getDebrisParts().map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('|');
  ground.onGround = false;
  ground.vx = ground.maxSpeed;
  const b = ground.getDebrisParts().map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('|');
  assert.notEqual(a, b);
});

test('buildDebris で破片オブジェクトになる', () => {
  const e = attackerOf('heavy');
  const debris = buildDebris(e, 'attacker');
  assert.ok(debris.length >= 6);
  assert.ok(debris.every((d) => d.alive));
});

// これが描画と破片のポーズ一致を守る要のテスト。
// _collectLegPoses() が _drawLegs / _drawArtilleryLegs と別のポーズを返すように
// なったら、ここで落ちる。
test('_collectLegPoses が実際に描かれた脚のポリラインと一致する', () => {
  for (const typeKey of Object.keys(ENEMY_ATTACKER_TYPES)) {
    for (const state of [{ onGround: true, crouching: false }, { onGround: false, crouching: false }, { onGround: true, crouching: true }]) {
      const e = attackerOf(typeKey);
      Object.assign(e, state);
      e.burstCount = 0;
      e.facingRight = true;

      const ctx = makeFakeCtx();
      e.draw(ctx);
      const drawn = extractPolylines(ctx.calls);
      const poses = e._collectLegPoses();
      const label = `${typeKey}/${JSON.stringify(state)}`;

      // 描画された脚のポリラインの中に、各ポーズの股関節→膝→足首が存在すること。
      // draw() は crouchOffset ぶん translate してから描くので、Y はその分だけずれる。
      const crouchOffset = state.crouching ? 4 : 0;
      for (const pose of poses) {
        const wantHip = { x: pose.hipX, y: pose.hipY - crouchOffset };
        const wantKnee = { x: pose.kneeX, y: pose.kneeY - crouchOffset };
        const near = (a, b) => Math.abs(a - b) < 1e-6;
        const found = drawn.some((line) =>
          line.length >= 2 &&
          near(line[0].x, wantHip.x) && near(line[0].y, wantHip.y) &&
          near(line[1].x, wantKnee.x) && near(line[1].y, wantKnee.y));
        assert.ok(found, `${label}: 描画に一致する脚が無い hip=${JSON.stringify(wantHip)} knee=${JSON.stringify(wantKnee)}`);
      }
    }
  }
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm test -- tests/debris-attacker.test.js`
Expected: FAIL — `DEBRIS_SPECS.attacker` が undefined

- [ ] **Step 3: attackerParts.js を実装する**

`src/js/entities/debris/attackerParts.js` を新規作成。
胴体は `EnemyAttacker.draw()`（`src/js/entities/EnemyAttacker.js:1006`）の型別分岐に、
脚は `_drawLegs` / `_drawArtilleryLegs`（`:1239` / `:1145`）に対応する。

脚のポーズ計算は `EnemyAttacker` 側のプライベートメソッドを再実装せず、
`_collectLegPoses()` という新しいメソッドをエンティティ側に足して座標だけを受け取る（Step 4）。

```js
// EnemyAttacker の破片パーツ定義。
// 胴体は draw() の型別分岐に、脚は _collectLegPoses() が返す関節座標に対応する。
// 座標は機体左上原点・右向き（16x24）。

import { segmentPart } from './shapes.js';

/**
 * 型別の胴体・頭部・装甲・砲。crouchOffset は draw() が全体を下げる量。
 * @returns {Array}
 */
export function attackerBodyParts(attacker) {
    const cfg = attacker.config;
    const type = cfg.name;
    const dy = (attacker.crouching || attacker.burstCount > 0) ? 4 : 0;
    const at = (x, y, w, h, color, weight) => ({ x, y: y + dy, w, h, color, weight });

    if (type === 'heavy') {
        return [
            at(6, 4, 6, 4, cfg.backpackColor, 0.9),   // 肩装甲
            at(10, 10.5, 12, 13, cfg.bodyColor, 1.8), // 胴体
            at(10.5, 2, 9, 6, cfg.headColor, 1.1),    // 頭部
            at(12, 2, 4, 2, cfg.visorColor, 0.4),     // バイザー
            at(17, 10, 6, 4, '#666666', 0.8),         // 主砲
            at(19.5, 10, 3, 4, '#999999', 0.5),       // 砲口
        ];
    }
    if (type === 'rival') {
        return [
            at(10, 10, 8, 12, cfg.bodyColor, 1.5),
            at(10, 2.5, 6, 5, cfg.headColor, 1.0),
            at(11, -2, 2, 2, cfg.headColor, 0.3),     // ホーン
            at(12, -0.5, 2, 3, cfg.headColor, 0.3),
            at(11.5, 2, 3, 2, cfg.visorColor, 0.4),
            at(17, 7, 8, 2, '#777777', 0.6),          // 砲身
            at(3.5, 8.5, 5, 5, cfg.backpackColor, 0.9),
        ];
    }
    if (type === 'artillery') {
        return [
            at(10.5, 10.5, 11, 11, cfg.bodyColor, 1.7),
            at(10.5, 3.5, 7, 5, cfg.headColor, 1.0),
            at(12.5, 3, 3, 2, cfg.visorColor, 0.4),
            at(20, 9, 12, 2, '#555555', 0.7),         // 長砲身
            at(25, 9, 2, 4, '#888888', 0.4),
            segmentPart(3, 4 + dy, 6, -4 + dy, 1.5, cfg.exhaustColor, 0.3), // アンテナ
        ];
    }
    return [
        at(10, 10, 10, 12, cfg.bodyColor, 1.6),
        at(10, 2.5, 8, 5, cfg.headColor, 1.0),
        at(11.5, 2.5, 3, 3, cfg.visorColor, 0.4),
        at(4, 9, 4, 8, cfg.backpackColor, 0.9),
        at(4, 13, 4, 2, cfg.exhaustColor, 0.4),
        at(15.5, 8, 5, 2, '#777777', 0.6),
        at(18, 8, 2, 2, '#999999', 0.4),
    ];
}

/**
 * 死亡時の脚のポーズを破片にする。
 * 関節座標の計算そのものは EnemyAttacker._collectLegPoses() が持っており、
 * ここは受け取った座標を線分パーツへ落とすだけ。
 */
export function attackerLegParts(attacker) {
    const cfg = attacker.config;
    const poses = attacker._collectLegPoses();
    const out = [];
    for (const pose of poses) {
        const legColor = pose.isNear ? cfg.bodyColor : cfg.headColor;
        const footColor = pose.isNear ? cfg.headColor : cfg.bodyColor;
        out.push(segmentPart(pose.hipX, pose.hipY, pose.kneeX, pose.kneeY, pose.lineWidth, legColor, 0.9));
        out.push(segmentPart(pose.kneeX, pose.kneeY, pose.footX, pose.footY, pose.lineWidth, footColor, 0.7));
    }
    return out;
}

export const attackerDebris = {
    holdFrames: 4,
    burst: 2.4,
    parts: [],   // 全パーツが型とポーズに依存するので getDebrisParts() から供給する
};
```

- [ ] **Step 4: EnemyAttacker に脚ポーズの収集メソッドを追加する**

`src/js/entities/EnemyAttacker.js` の `_drawLegs`（`:1239`）の直前に追加。
既存の `_drawWalkLegs` / `_drawAirLegs` / `_drawCrouchLegs` / `_drawSpider*` と同じ計算を、
描画せず座標だけ集めて返す形で行う。**描画側のコードは変更しない。**

```js
    /**
     * 死亡時の脚の関節座標を集める（描画はしない）。
     * 破片生成が「今どんなポーズだったか」を知るための唯一の入口。
     * @returns {Array<{isNear:boolean,hipX:number,hipY:number,kneeX:number,kneeY:number,footX:number,footY:number,lineWidth:number}>}
     */
    _collectLegPoses() {
        const style = this._legStyle();
        const isCrouching = this.crouching || this.burstCount > 0;
        const crouchOffset = isCrouching ? 4 : 0;
        const hipY = 16;   // draw() の平行移動込みで見た絶対位置に合わせる
        const out = [];
        const push = (isNear, hipX, kneeX, kneeY, footX, footY) => {
            out.push({
                isNear, hipX, hipY, kneeX, kneeY, footX, footY,
                lineWidth: style.lineWidth,
            });
        };

        if (this.config.name === 'artillery') {
            // 4脚クモ型。_drawSpiderWalk / _drawSpiderAir / _drawSpiderCrouch と
            // 同じ分岐・同じ式で関節座標を求める（描画とズレると破片だけ別ポーズになる）。
            if (isCrouching) {
                const spread = style.crouchSpread;
                for (const leg of SPIDER_LEGS) {
                    const dir = leg.reach >= 0 ? 1 : -1;
                    push(
                        leg.isNear, leg.hipX,
                        leg.hipX + dir * spread * 0.5, hipY - SPIDER_KNEE_RISE - 2,
                        leg.hipX + leg.reach + dir * spread, hipY + SPIDER_FOOT_DROP,
                    );
                }
                return out;
            }

            if (!this.onGround) {
                const swing = this._hoverSwing();
                const angle = swing * style.maxSwing;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                for (const leg of SPIDER_LEGS) {
                    const curl = leg.group === 0 ? 0.6 : 0.8;
                    const rot = (dx, dy) => ({
                        x: leg.hipX + (dx * cos - dy * sin),
                        y: hipY + (dx * sin + dy * cos),
                    });
                    const knee = rot(leg.reach * 0.5 * curl, -SPIDER_KNEE_RISE * curl);
                    const foot = rot(leg.reach * curl, SPIDER_FOOT_DROP * curl);
                    push(leg.isNear, leg.hipX, knee.x, knee.y, foot.x, foot.y);
                }
                return out;
            }

            for (const leg of SPIDER_LEGS) {
                const phase = leg.group === 0 ? this.walkFrame : (this.walkFrame + 2) % 4;
                const sweep = SPIDER_SWEEP[phase];
                const lift = SPIDER_LIFT[phase];
                push(
                    leg.isNear, leg.hipX,
                    leg.hipX + (leg.reach + sweep) * 0.5, hipY - SPIDER_KNEE_RISE,
                    leg.hipX + leg.reach + sweep, hipY + SPIDER_FOOT_DROP - lift,
                );
            }
            return out;
        }

        if (isCrouching) {
            const spread = style.crouchSpread;
            for (const [isNear, dir] of [[false, -1], [true, 1]]) {
                const hipX = isNear ? style.hipNear : style.hipFar;
                push(isNear, hipX, hipX + dir * (spread + 2), hipY + 4, hipX + dir * spread, hipY + 6);
            }
            return out;
        }

        if (!this.onGround) {
            const swing = this._hoverSwing();
            for (const [isNear, amount] of [[false, swing * 0.8 - style.phaseOffset], [true, swing]]) {
                const hipX = isNear ? style.hipNear : style.hipFar;
                const base = isNear ? AIR_BASE_POSE.near : AIR_BASE_POSE.far;
                const angle = amount * style.maxSwing;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const rot = (dx, dy) => ({ x: hipX + (dx * cos - dy * sin), y: hipY + (dx * sin + dy * cos) });
                const knee = rot(base.kdx, base.kdy);
                const foot = rot(base.fdx, base.fdy);
                push(isNear, hipX, knee.x, knee.y, foot.x, foot.y);
            }
            return out;
        }

        const frame = WALK_FRAME_POSES[this.walkFrame] || WALK_FRAME_POSES[2];
        for (const [isNear, poseIndex] of [[false, frame.far], [true, frame.near]]) {
            const hipX = isNear ? style.hipNear : style.hipFar;
            const p = LEG_POSES[poseIndex];
            const s = style.strideScale;
            push(isNear, hipX, hipX + p.kdx * s, hipY + p.kdy, hipX + p.fdx * s, hipY + p.fdy);
        }
        return out;
    }
```

- [ ] **Step 5: getDebrisParts と die() の呼び出しを追加する**

`src/js/entities/EnemyAttacker.js` の import に追加:

```js
import { attackerBodyParts, attackerLegParts } from './debris/attackerParts.js';
```

`die()`（`src/js/entities/EnemyAttacker.js:981`）の先頭に追加:

```js
        this.game.spawnDebris(this, 'attacker');
```

`draw(ctx)` の直前に追加:

```js
    /** 破壊時の破片パーツ。型別の胴体に、死亡時のポーズの脚を足す。 */
    getDebrisParts() {
        return [...attackerBodyParts(this), ...attackerLegParts(this)];
    }
```

- [ ] **Step 6: スペックを登録する**

`src/js/entities/debris/index.js`:

```js
import { droneDebris } from './droneParts.js';
import { playerDebris } from './playerParts.js';
import { tankDebris } from './tankParts.js';
import { turretDebris } from './turretParts.js';
import { attackerDebris } from './attackerParts.js';

export const DEBRIS_SPECS = {
    drone: droneDebris,
    player: playerDebris,
    tank: tankDebris,
    turret: turretDebris,
    attacker: attackerDebris,
};
```

- [ ] **Step 7: テストを実行して通ることを確認する**

Run: `npm test -- tests/debris-attacker.test.js`
Expected: PASS（7テスト）

- [ ] **Step 8: 既存の脚アニメーションテストが壊れていないことを確認する**

Run: `npm test -- tests/attacker-leg-animation.test.js`
Expected: PASS（描画コードには手を入れていないため）

- [ ] **Step 10: 全テストを実行する**

Run: `npm test`
Expected: 全 PASS

- [ ] **Step 11: コミット**

```bash
git add src/js/entities/debris/attackerParts.js src/js/entities/debris/index.js src/js/entities/EnemyAttacker.js tests/debris-attacker.test.js
git commit -m "$(cat <<'EOF'
feat: 敵アタッカーの破壊にパーツ飛散を追加

型別の胴体パーツと、死亡時の関節座標を反映した脚パーツを飛ばす。
関節座標は _collectLegPoses() から取得し、描画側のコードには触れない。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Carrier（母艦）

最も大きく、破壊がゲーム的にも重い機体。

**Files:**
- Create: `src/js/entities/debris/carrierParts.js`
- Modify: `src/js/entities/debris/index.js`
- Modify: `src/js/entities/Carrier.js:185`（`die()`）
- Test: `tests/debris-carrier.test.js`

**Interfaces:**
- Consumes: Task 2 の `DEBRIS_SPECS`
- Produces: `carrierDebris` スペック（`holdFrames: 6`, `burst: 2.8`）

- [ ] **Step 1: 失敗するテストを書く**

`tests/debris-carrier.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEBRIS_SPECS, buildDebris } from '../src/js/entities/debris/index.js';
import { CARRIER_WIDTH, CARRIER_HEIGHT } from '../src/js/utils/Constants.js';

function makeCarrier() {
  return {
    x: 500, y: 300, width: CARRIER_WIDTH, height: CARRIER_HEIGHT,
    vx: 0, vy: 0, facingRight: true,
  };
}

test('carrier スペックは大物らしいタメを持つ', () => {
  const spec = DEBRIS_SPECS.carrier;
  assert.ok(spec);
  assert.ok(spec.holdFrames >= 5, `タメが短い: ${spec.holdFrames}`);
});

test('パーツが機体枠に概ね収まる', () => {
  const spec = DEBRIS_SPECS.carrier;
  assert.ok(spec.parts.length >= 6, `パーツが少なすぎる: ${spec.parts.length}`);
  for (const p of spec.parts) {
    assert.ok(p.x >= -CARRIER_WIDTH && p.x <= CARRIER_WIDTH * 2, `x=${p.x}`);
    assert.ok(p.y >= -CARRIER_HEIGHT && p.y <= CARRIER_HEIGHT * 2, `y=${p.y}`);
    assert.ok(p.w > 0 && p.h > 0);
  }
});

test('船体が左右2片に割れる', () => {
  const hulls = DEBRIS_SPECS.carrier.parts.filter((p) => p.color === '#1a3a6a');
  assert.equal(hulls.length, 2, '下部船体が2片になっていない');
  assert.notEqual(hulls[0].x, hulls[1].x, '2片が同じ位置にある');
});

test('左右の船体片は反対方向へ飛ぶ', () => {
  const debris = buildDebris(makeCarrier(), 'carrier');
  const hulls = debris.filter((d) => d.color === '#1a3a6a');
  assert.equal(hulls.length, 2);
  const [left, right] = hulls[0].x < hulls[1].x ? hulls : [hulls[1], hulls[0]];
  assert.ok(left.vx < right.vx, `左右へ割れていない: ${left.vx} vs ${right.vx}`);
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm test -- tests/debris-carrier.test.js`
Expected: FAIL — `DEBRIS_SPECS.carrier` が undefined

- [ ] **Step 3: carrierParts.js を実装する**

`src/js/entities/debris/carrierParts.js` を新規作成。
座標は `Carrier._drawHull` / `_drawEngines`（`src/js/entities/Carrier.js:224` / `:250`）に対応する。
描画は `drawY = y - 8` として上へずらしているので、Y をすべて `-8` してある。

```js
// Carrier（母艦）の破片パーツ定義。可動部は無い。
// 描画が drawY = y - 8 として上へずらしているため、Y はすべて -8 済み。
// 下部船体は左右2片に割り、船が中央から裂けるように見せる。

export const carrierDebris = {
    holdFrames: 6,   // 母艦の喪失はゲーム的に最も重い。しっかりタメる
    burst: 2.8,
    mirrored: () => false,   // 母艦は左右反転しない
    parts: [
        // 下部船体（左右2片）
        { x: 18, y: 14, w: 28, h: 16, color: '#1a3a6a', weight: 2.2 },
        { x: 46, y: 14, w: 28, h: 16, color: '#1a3a6a', weight: 2.2 },
        // 上部船体（赤）
        { x: 32, y: 4, w: 48, h: 8, color: '#AA2222', weight: 1.8 },
        // 発着デッキ
        { x: 32, y: -1.5, w: 32, h: 5, color: '#CC9900', weight: 1.2 },
        // コックピット窓
        { x: 32, y: 4, w: 8, h: 4, color: '#00AAFF', weight: 0.6 },
        // エンジンポッド
        { x: 4, y: 15, w: 8, h: 10, color: '#2255AA', weight: 1.4 },
        { x: 60, y: 15, w: 8, h: 10, color: '#2255AA', weight: 1.4 },
    ],
};
```

- [ ] **Step 4: Carrier から呼び出す**

`src/js/entities/Carrier.js:185` の `die()` の先頭に追加:

```js
        this.game.spawnDebris(this, 'carrier');
```

- [ ] **Step 5: スペックを登録する**

`src/js/entities/debris/index.js`:

```js
import { droneDebris } from './droneParts.js';
import { playerDebris } from './playerParts.js';
import { tankDebris } from './tankParts.js';
import { turretDebris } from './turretParts.js';
import { attackerDebris } from './attackerParts.js';
import { carrierDebris } from './carrierParts.js';

export const DEBRIS_SPECS = {
    drone: droneDebris,
    player: playerDebris,
    tank: tankDebris,
    turret: turretDebris,
    attacker: attackerDebris,
    carrier: carrierDebris,
};
```

- [ ] **Step 6: テストを実行して通ることを確認する**

Run: `npm test -- tests/debris-carrier.test.js`
Expected: PASS（4テスト）

- [ ] **Step 7: 全テストを実行する**

Run: `npm test`
Expected: 全 PASS

- [ ] **Step 8: コミット**

```bash
git add src/js/entities/debris/carrierParts.js src/js/entities/debris/index.js src/js/entities/Carrier.js tests/debris-carrier.test.js
git commit -m "$(cat <<'EOF'
feat: 母艦の破壊にパーツ飛散を追加

下部船体を左右2片に割り、中央から裂けるように見せる。
ゲーム的に最も重い破壊なのでタメを最長の6フレームとした。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 爆発演出との調整と仕上げ

破片が爆発に埋もれないよう、爆発側のパーティクル構成を見直す。

**Files:**
- Modify: `src/js/entities/Particle.js:136-160`（`createExplosion` のデブリ粒子）
- Modify: 各機体の `die()` の爆発サイズ（実機確認の結果しだい）
- Test: `tests/debris-explosion-balance.test.js`

**Interfaces:**
- Consumes: Task 1〜6 のすべて
- Produces: `createExplosion(x, y, count, opts)` — `opts = { debrisSmoke: boolean }`（既定 `true`）。`false` で灰色のデブリ粒子を混ぜない

- [ ] **Step 1: 失敗するテストを書く**

`tests/debris-explosion-balance.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExplosion } from '../src/js/entities/Particle.js';

test('既定では従来どおり灰色のデブリ粒子が混ざりうる', () => {
  let sawGrey = false;
  for (let i = 0; i < 40 && !sawGrey; i++) {
    sawGrey = createExplosion(0, 0, 60).some((p) => p.color === '#888888');
  }
  assert.ok(sawGrey, '灰色のデブリ粒子が一度も出ない');
});

test('debrisSmoke:false なら灰色のデブリ粒子を混ぜない', () => {
  for (let i = 0; i < 40; i++) {
    const parts = createExplosion(0, 0, 60, { debrisSmoke: false });
    assert.ok(!parts.some((p) => p.color === '#888888'), '灰色の粒子が混ざった');
  }
});

test('opts を渡してもパーティクル数は変わらない', () => {
  const a = createExplosion(0, 0, 30).length;
  const b = createExplosion(0, 0, 30, { debrisSmoke: false }).length;
  assert.equal(a, b);
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm test -- tests/debris-explosion-balance.test.js`
Expected: FAIL — 2つ目のテストで灰色の粒子が混ざる

- [ ] **Step 3: createExplosion にオプションを追加する**

`src/js/entities/Particle.js:136` を変更:

```js
/**
 * @param {number} x
 * @param {number} y
 * @param {number} count
 * @param {object} [opts]
 * @param {boolean} [opts.debrisSmoke=true] 灰色のデブリ粒子を混ぜるか。
 *   本物のパーツ破片を撒く機体では false にして画面が濁るのを避ける。
 */
export function createExplosion(x, y, count, opts = {}) {
    const { debrisSmoke = true } = opts;
    const particles = [];

    // Add a central flash
    const flashSize = 10 + count / 4;
    particles.push(new FlashParticle(x, y, flashSize));

    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.5 + Math.random() * (count > 50 ? 5 : 3);
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;

        // Variety of colors
        let color = EXPLOSION_COLORS[Math.floor(Math.random() * EXPLOSION_COLORS.length)];
        if (debrisSmoke && Math.random() < 0.2) color = '#888888'; // Add some debris/smoke particles

        const size = 1 + Math.random() * 4;
        const lifetime = 15 + Math.floor(Math.random() * 25);

        particles.push(new Particle(x, y, vx, vy, color, size, lifetime));
    }

    return particles;
}
```

- [ ] **Step 4: spawnExplosion からオプションを渡せるようにする**

`src/js/main.js:1186` の `spawnExplosion` を変更:

```js
    /** Spawn explosion particles and chain-detonate nearby landmines */
    spawnExplosion(x, y, size, opts) {
        this.particles.push(...createExplosion(x, y, size, opts));
        audioManager.playExplosion(size > 10);
```

（以降の連鎖爆発の処理はそのまま。）

- [ ] **Step 5: 破片を撒く6機体の爆発からデブリ粒子を外す**

次の6箇所の `spawnExplosion` 呼び出しに `{ debrisSmoke: false }` を渡す:

- `src/js/entities/Player.js` の `die()` — `spawnExplosion(cx, cy, 15, { debrisSmoke: false })`
- `src/js/entities/Carrier.js:187` — サイズ 25
- `src/js/entities/EnemyDrone.js` の `die()` — サイズ 20
- `src/js/entities/EnemyTank.js:243` — `EXPLOSION_PARTICLE_COUNT`
- `src/js/entities/EnemyTurret.js:152` — サイズ 30
- `src/js/entities/EnemyAttacker.js:985` — `EXPLOSION_PARTICLE_COUNT`

いずれも既存の引数はそのままに、第4引数として `{ debrisSmoke: false }` を足すだけ。

- [ ] **Step 6: テストを実行して通ることを確認する**

Run: `npm test -- tests/debris-explosion-balance.test.js`
Expected: PASS（3テスト）

- [ ] **Step 7: 全テストを実行する**

Run: `npm test`
Expected: 全 PASS

- [ ] **Step 8: コミット**

```bash
git add src/js/entities/Particle.js src/js/main.js src/js/entities/Player.js src/js/entities/Carrier.js src/js/entities/EnemyDrone.js src/js/entities/EnemyTank.js src/js/entities/EnemyTurret.js src/js/entities/EnemyAttacker.js tests/debris-explosion-balance.test.js
git commit -m "$(cat <<'EOF'
tune: 破片を撒く機体の爆発から灰色のデブリ粒子を外す

本物のパーツ破片が飛ぶようになったため、爆発側の擬似デブリは
冗長で画面を濁らせる。createExplosion に debrisSmoke オプションを
足し、対象6機体でのみ無効化する。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: 最終の実機確認を依頼する**

ローカルサーバーを起動する:

```bash
python3 -m http.server 8000
```

ユーザーに次を伝えて確認を依頼する:

- `http://localhost:8000` を**ハードリロード**（Cmd+Shift+R）してから開く
- 6機体すべての破壊を確認する: 自機（被弾死）、母艦、ドローン、戦車、砲台、アタッカー各種
- 見るべき点: タメの長さが機体の格に合っているか / 破片が爆発に埋もれていないか / 多数を同時撃破したときに画面が破片で埋まらないか / 空中の敵と地上の敵で違和感がないか
- 調整の窓口: 各 `*Parts.js` の `holdFrames` と `burst`、`Constants.js` の `DEBRIS_GRAVITY` / `DEBRIS_LIFETIME` / `DEBRIS_MAX_ACTIVE`

---

## 完了条件

- 6機体すべてが破壊時にパーツ破片を飛ばす
- `npm test` が全 PASS
- 破片がゲームプレイに影響しない（当たり判定なし、地形すり抜け、ノックバック非関与）
- ユーザーによる実機確認が完了している
