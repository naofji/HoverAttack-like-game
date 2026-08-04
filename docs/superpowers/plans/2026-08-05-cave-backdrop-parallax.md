# 洞窟遠景の二重スクロール (Cave Backdrop Parallax) 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 地形の空洞部分に、カメラの15%速度でしかスクロールしない暗い洞窟遠景を敷き、前景(岩場)との二重スクロールで奥行きを出す。

**Architecture:** 新規クラス `CaveBackdrop` がマップ生成時に遠景を1枚のオフスクリーンcanvasへ描き切る。毎フレームは `drawImage` 1回で可視矩形をブロック転送するだけ。`Map` が `CaveBackdrop` を所有し、`main.js` の背景ベタ塗り2行を転送呼び出しに置き換える。当たり判定・エンティティ描画・ミニマップには触れない。

**Tech Stack:** 素の ES modules + Canvas 2D。テストは `node --test` (`npm test`)。既存の `SeededRNG` / `lerpColor` / `tests/helpers/fake-ctx.js` を再利用。

**設計仕様:** `docs/superpowers/specs/2026-08-05-cave-backdrop-parallax-design.md`

## Global Constraints

- 視差係数は `FAR_BG_PARALLAX = 0.15`。`src/js/utils/Constants.js` に定義し、他所にハードコードしない。
- ビューポート寸法は `game.canvas` からではなく `CANVAS_WIDTH` (1024) / `CANVAS_HEIGHT` (768) 定数から取る。
- カメラ可動範囲の定義は `src/js/world/Camera.js` の `_clamp()` と厳密に一致させる: `camXmin = 0`, `camXmax = mapW - viewW`, `camYmin = -HUD_TOP_HEIGHT`, `camYmax = mapH - viewH + HUD_BOTTOM_HEIGHT`。現在 `HUD_TOP_HEIGHT = 60`, `HUD_BOTTOM_HEIGHT = 0`。
- canvasサイズも転送元座標も **`floor`** で丸める (`ceil` は使わない)。両者の丸めが一致することで `sourceX(camXmax) === backdropW - viewW` が厳密に成立する。
- 乱数は必ず引数で渡された `SeededRNG` インスタンスの `.next()` を使う。`Math.random()` は禁止 (マップ生成の決定性が壊れる)。
- 不透明度は `ctx.globalAlpha` ではなく `rgba()` 文字列 / グラデーションのカラーストップに畳み込む。
- 新しい色定数は追加しない。`lerpColor(paletteFill, '#000000', t)` で導出する。
- 既存の `COLOR_CAVE_BG` 定数は削除しない (ミニマップ生成とフォールバックで使用中)。

---

### Task 1: CaveBackdrop の座標計算 (視差ジオメトリ)

遠景canvasの寸法と、カメラ座標→転送元座標の変換を確立する。この段階では canvas は生成するが絵は描かない。

**Files:**
- Create: `src/js/world/CaveBackdrop.js`
- Modify: `src/js/utils/Constants.js` (`FAR_BG_PARALLAX` を追加)
- Test: `tests/cave-backdrop.test.js`

**Interfaces:**
- Consumes: `CANVAS_WIDTH`, `CANVAS_HEIGHT`, `HUD_TOP_HEIGHT`, `HUD_BOTTOM_HEIGHT` (既存の `src/js/utils/Constants.js`)
- Produces:
  - `export const FAR_BG_PARALLAX = 0.15`
  - `export class CaveBackdrop`
    - `constructor(mapWidth: number, mapHeight: number, paletteFill: string, rng: SeededRNG)`
    - `.canvas` — オフスクリーン canvas
    - `.width: number`, `.height: number` — canvas寸法
    - `.sourceX(camX: number) -> number` — 整数、`[0, width - CANVAS_WIDTH]` にクランプ
    - `.sourceY(camY: number) -> number` — 整数、`[0, height - CANVAS_HEIGHT]` にクランプ

- [ ] **Step 1: `FAR_BG_PARALLAX` 定数を追加**

`src/js/utils/Constants.js` の `COLOR_CAVE_BG` 定義 (現 361行目) の直後に追加する:

```js
// --- Far cave backdrop (parallax) ---
// 遠景がカメラに追従する割合。0 = 完全固定、1 = 前景と等速。
// 見た目が弱すぎ/強すぎる場合はこの1値だけを調整する。
export const FAR_BG_PARALLAX = 0.15;
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/cave-backdrop.test.js` を新規作成する。期待値はベタ書きにしてある — 式を写し間違えたら気付けるようにするため。

最小マップ (missionLevel 0): 150×75タイル = 2400×1200px
- `camXmax = 2400 - 1024 = 1376` → `floor(1376 * 0.15) = 206` → `width = 206 + 1024 = 1230`
- `camYmin = -60`, `camYmax = 1200 - 768 + 0 = 432` → range `492` → `floor(492 * 0.15) = 73` → `height = 73 + 768 = 841`

最大マップ (missionLevel 4+): 300×150タイル = 4800×2400px
- `camXmax = 3776` → `floor(566.4) = 566` → `width = 1590`
- `camYmin = -60`, `camYmax = 1632` → range `1692` → `floor(253.8) = 253` → `height = 1021`

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, FAR_BG_PARALLAX,
} from '../src/js/utils/Constants.js';

/** 生成した疑似 canvas を記録しておき、テストから ctx を覗けるようにする。 */
let lastFakeCanvas = null;

before(() => {
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ctx,
        _ctx: ctx,
      };
      lastFakeCanvas = canvas;
      return canvas;
    },
  };
});

function makeBackdrop(BackdropClass, mapW, mapH, seed = 1) {
  return new BackdropClass(mapW, mapH, '#8B4513', new SeededRNG(seed));
}

test('parallax factor constant is 0.15', () => {
  assert.equal(FAR_BG_PARALLAX, 0.15);
});

test('backdrop canvas is sized for the smallest map', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const bd = makeBackdrop(CaveBackdrop, 2400, 1200);
  assert.equal(bd.width, 1230);
  assert.equal(bd.height, 841);
  assert.equal(bd.canvas.width, 1230);
  assert.equal(bd.canvas.height, 841);
});

test('backdrop canvas is sized for the largest map', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const bd = makeBackdrop(CaveBackdrop, 4800, 2400);
  assert.equal(bd.width, 1590);
  assert.equal(bd.height, 1021);
});

test('source rect exactly spans the canvas across the camera range', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const bd = makeBackdrop(CaveBackdrop, 2400, 1200);

  // camXmin = 0, camXmax = 1376 / camYmin = -60, camYmax = 432
  assert.equal(bd.sourceX(0), 0);
  assert.equal(bd.sourceX(1376), bd.width - CANVAS_WIDTH);
  assert.equal(bd.sourceY(-60), 0);
  assert.equal(bd.sourceY(432), bd.height - CANVAS_HEIGHT);
});

test('source rect is an integer for fractional camera positions', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const bd = makeBackdrop(CaveBackdrop, 2400, 1200);

  // floor(500.7 * 0.15) = floor(75.105) = 75
  assert.equal(bd.sourceX(500.7), 75);
  // floor((100.3 - (-60)) * 0.15) = floor(24.045) = 24
  assert.equal(bd.sourceY(100.3), 24);
});

test('source rect clamps outside the camera range', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const bd = makeBackdrop(CaveBackdrop, 2400, 1200);

  assert.equal(bd.sourceX(-9999), 0);
  assert.equal(bd.sourceX(9999), bd.width - CANVAS_WIDTH);
  assert.equal(bd.sourceY(-9999), 0);
  assert.equal(bd.sourceY(9999), bd.height - CANVAS_HEIGHT);
});
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `npm test -- tests/cave-backdrop.test.js`
Expected: FAIL — `Cannot find module '.../src/js/world/CaveBackdrop.js'`

- [ ] **Step 4: CaveBackdrop を最小実装**

`src/js/world/CaveBackdrop.js` を新規作成する。この時点では絵は描かない (Task 3 で追加)。

```js
// ============================================
// CaveBackdrop - 視差スクロールする遠景の洞窟レイヤー
// ============================================
//
// マップ生成時に遠景を1枚のオフスクリーンcanvasへ描き切り、
// 以後は毎フレーム drawImage 1回で可視矩形を転送するだけにする。
// カメラ可動範囲の FAR_BG_PARALLAX 倍しか流れないため、canvas は
// 前景のタイルキャッシュよりずっと小さくて済む。

import {
    CANVAS_WIDTH, CANVAS_HEIGHT,
    HUD_TOP_HEIGHT, HUD_BOTTOM_HEIGHT,
    FAR_BG_PARALLAX,
} from '../utils/Constants.js';

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

export class CaveBackdrop {
    /**
     * @param {number} mapWidth   マップ全体の幅 (px)
     * @param {number} mapHeight  マップ全体の高さ (px)
     * @param {string} paletteFill ステージパレットの fill 色 (#rrggbb)
     * @param {SeededRNG} rng     マップ生成と共有する乱数源
     */
    constructor(mapWidth, mapHeight, paletteFill, rng) {
        // Camera._clamp() と同一のカメラ可動範囲
        this.camXMin = 0;
        this.camXMax = mapWidth - CANVAS_WIDTH;
        this.camYMin = -HUD_TOP_HEIGHT;
        this.camYMax = mapHeight - CANVAS_HEIGHT + HUD_BOTTOM_HEIGHT;

        // 転送元計算と丸めを揃えるため floor を使う。
        // これで sourceX(camXMax) === width - CANVAS_WIDTH が厳密に成立する。
        this.width = Math.floor((this.camXMax - this.camXMin) * FAR_BG_PARALLAX) + CANVAS_WIDTH;
        this.height = Math.floor((this.camYMax - this.camYMin) * FAR_BG_PARALLAX) + CANVAS_HEIGHT;

        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    }

    /** カメラX → 転送元X (整数, canvas内に収まるようクランプ) */
    sourceX(camX) {
        const raw = Math.floor((camX - this.camXMin) * FAR_BG_PARALLAX);
        return clamp(raw, 0, this.width - CANVAS_WIDTH);
    }

    /** カメラY → 転送元Y (整数, canvas内に収まるようクランプ) */
    sourceY(camY) {
        const raw = Math.floor((camY - this.camYMin) * FAR_BG_PARALLAX);
        return clamp(raw, 0, this.height - CANVAS_HEIGHT);
    }
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npm test -- tests/cave-backdrop.test.js`
Expected: PASS (6 tests)

- [ ] **Step 6: 既存テストが壊れていないことを確認**

Run: `npm test`
Expected: 全 PASS (この時点では `CaveBackdrop` はまだどこからも呼ばれていない)

- [ ] **Step 7: コミット**

```bash
git add src/js/world/CaveBackdrop.js src/js/utils/Constants.js tests/cave-backdrop.test.js
git commit -m "feat: 遠景レイヤーCaveBackdropの視差ジオメトリを追加"
```

---

### Task 2: 遠景の転送 (draw)

毎フレーム呼ばれる転送メソッドを追加する。疑似ctxが `drawImage` を記録できるよう拡張する。

**Files:**
- Modify: `src/js/world/CaveBackdrop.js`
- Modify: `tests/helpers/fake-ctx.js`
- Test: `tests/cave-backdrop.test.js` (テスト追加)

**Interfaces:**
- Consumes: Task 1 の `CaveBackdrop.sourceX` / `.sourceY` / `.canvas`
- Produces: `CaveBackdrop.draw(ctx: CanvasRenderingContext2D, camX: number, camY: number) -> void`
  — `ctx` は呼び出し時点で `translate(-camX, -camY)` 済みである前提。描画先はワールド座標 `(camX, camY)`。

- [ ] **Step 1: 疑似ctxに drawImage を追加**

`tests/helpers/fake-ctx.js` の `METHODS` 配列 (現 4-8行目) に `'drawImage'` を足す:

```js
const METHODS = [
  'save', 'restore', 'translate', 'scale', 'rotate',
  'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc',
  'stroke', 'fill', 'fillRect', 'strokeRect', 'clearRect',
  'drawImage',
];
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/cave-backdrop.test.js` の末尾に追加する:

```js
test('draw issues exactly one drawImage with the parallax source rect', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const bd = makeBackdrop(CaveBackdrop, 2400, 1200);

  const ctx = makeFakeCtx();
  bd.draw(ctx, 500.7, 100.3);

  const draws = ctx.calls.filter((c) => c.name === 'drawImage');
  assert.equal(draws.length, 1);
  assert.deepEqual(draws[0].args, [
    bd.canvas,
    75, 24, CANVAS_WIDTH, CANVAS_HEIGHT,   // 転送元 (整数化済み)
    500.7, 100.3, CANVAS_WIDTH, CANVAS_HEIGHT, // 転送先 = ワールド座標
  ]);
});
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `npm test -- tests/cave-backdrop.test.js`
Expected: FAIL — `bd.draw is not a function`

- [ ] **Step 4: draw を実装**

`src/js/world/CaveBackdrop.js` の `sourceY()` の直後に追加する:

```js
    /**
     * 遠景の可視矩形をブロック転送する。
     * ctx は translate(-camX, -camY) 済みのため、転送先はワールド座標を指定する。
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} camX 補間済みカメラX
     * @param {number} camY 補間済みカメラY
     */
    draw(ctx, camX, camY) {
        ctx.drawImage(
            this.canvas,
            this.sourceX(camX), this.sourceY(camY), CANVAS_WIDTH, CANVAS_HEIGHT,
            camX, camY, CANVAS_WIDTH, CANVAS_HEIGHT
        );
    }
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npm test -- tests/cave-backdrop.test.js`
Expected: PASS (7 tests)

- [ ] **Step 6: 既存テストが壊れていないことを確認**

Run: `npm test`
Expected: 全 PASS

- [ ] **Step 7: コミット**

```bash
git add src/js/world/CaveBackdrop.js tests/helpers/fake-ctx.js tests/cave-backdrop.test.js
git commit -m "feat: CaveBackdropの視差ブロック転送を実装"
```

---

### Task 3: 遠景の絵の生成 (地色・ブロブ・点描)

`CaveBackdrop` の constructor で実際に洞窟遠景を描く。

**Files:**
- Modify: `src/js/world/CaveBackdrop.js`
- Modify: `tests/helpers/fake-ctx.js` (`createRadialGradient` スタブを追加)
- Test: `tests/cave-backdrop.test.js` (テスト追加)

**Interfaces:**
- Consumes: `lerpColor` (`src/js/utils/color.js`)、Task 1 の `this.width` / `this.height` / `this.canvas`
- Produces: constructor 内で完結。外部に新しいメソッドは出さない (`_generate(ctx, paletteFill, rng)` は private)。

**乱数の消費順序** (決定性のため厳守):
ブロブを1個ずつ `x, y, radius` の順で3回、全ブロブを処理した後、点描を1個ずつ `x, y, sizePick, alpha` の順で4回。

- [ ] **Step 1: 疑似ctxに createRadialGradient を追加**

`tests/helpers/fake-ctx.js` の `makeFakeCtx()` 内、`for (const name of METHODS)` ループの直後 (現 35行目の `}` の後、`return ctx;` の前) に追加する:

```js
  // 実物のグラデーションは比較できないので、生成引数とカラーストップを持つ
  // プレーンオブジェクトを返す。fillStyle に代入されると set:fillStyle として記録される。
  ctx.createRadialGradient = (...args) => ({
    type: 'radialGradient',
    args,
    stops: [],
    addColorStop(offset, color) { this.stops.push([offset, color]); },
  });
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/cave-backdrop.test.js` の末尾に追加する。個数の期待値: 最小マップ `1230 × 841 = 1,034,430` → ブロブ `floor(/40000) = 25`、点描 `floor(/350) = 2955`。

```js
test('generation fills the base, then draws blobs and stipple dots', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const bd = makeBackdrop(CaveBackdrop, 2400, 1200);
  const calls = lastFakeCanvas._ctx.calls;

  const rects = calls.filter((c) => c.name === 'fillRect');
  // 1 (地色) + 25 (ブロブ) + 2955 (点描)
  assert.equal(rects.length, 1 + 25 + 2955);

  // 最初の fillRect は canvas 全面の地色塗り
  assert.deepEqual(rects[0].args, [0, 0, bd.width, bd.height]);

  const gradients = calls.filter(
    (c) => c.name === 'set:fillStyle' && c.args[0] && c.args[0].type === 'radialGradient'
  );
  assert.equal(gradients.length, 25);
  // 各ブロブは中心 alpha 0.5 → 外周 alpha 0 の2ストップ
  for (const g of gradients) {
    assert.equal(g.args[0].stops.length, 2);
    assert.equal(g.args[0].stops[0][0], 0);
    assert.equal(g.args[0].stops[1][0], 1);
    assert.match(g.args[0].stops[1][1], /, 0\)$/);
  }
});

test('generation never uses globalAlpha', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  makeBackdrop(CaveBackdrop, 2400, 1200);
  assert.equal(lastFakeCanvas._ctx.globalAlpha, 1);
});

test('same seed and palette produce an identical backdrop', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');

  makeBackdrop(CaveBackdrop, 2400, 1200, 4242);
  const a = JSON.stringify(lastFakeCanvas._ctx.calls);
  makeBackdrop(CaveBackdrop, 2400, 1200, 4242);
  const b = JSON.stringify(lastFakeCanvas._ctx.calls);

  assert.equal(a, b);
});

test('different palettes produce different colors', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const rngA = new SeededRNG(7);
  const rngB = new SeededRNG(7);

  new CaveBackdrop(2400, 1200, '#8B4513', rngA); // ステージ1: 茶
  const brown = JSON.stringify(lastFakeCanvas._ctx.calls);
  new CaveBackdrop(2400, 1200, '#4682B4', rngB); // ステージ5: 青
  const blue = JSON.stringify(lastFakeCanvas._ctx.calls);

  assert.notEqual(brown, blue);
});
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `npm test -- tests/cave-backdrop.test.js`
Expected: FAIL — 最初のテストで `rects.length` が 0 (constructor がまだ何も描いていない)

- [ ] **Step 4: 生成処理を実装**

`src/js/world/CaveBackdrop.js` の import に `lerpColor` を足す:

```js
import { lerpColor } from '../utils/color.js';
```

ファイル冒頭の `clamp` ヘルパーの下に、生成パラメータと色ヘルパーを追加する:

```js
// --- 遠景の生成パラメータ ---
// いずれも「実機で見て濃い/薄い」を1値で調整できるよう定数に切り出してある。
const BASE_DARKEN = 0.92;   // 地色: パレット色を黒へ寄せる割合
const BLOB_DARK_DARKEN = 0.95;
const BLOB_LIGHT_DARKEN = 0.86;
const DOT_DARKEN = 0.78;

const BLOB_AREA_PER_UNIT = 40000; // この面積あたりブロブ1個
const BLOB_RADIUS_MIN = 120;
const BLOB_RADIUS_RANGE = 200;    // 半径 120〜320px
const BLOB_CENTER_ALPHA = 0.5;

const DOT_AREA_PER_UNIT = 350;    // この面積あたり点1個
const DOT_ALPHA_MIN = 0.3;
const DOT_ALPHA_RANGE = 0.5;      // alpha 0.3〜0.8

/** #rrggbb を rgba(r, g, b, a) 文字列にする。 */
function withAlpha(hex, alpha) {
    const s = String(hex).replace('#', '');
    const r = parseInt(s.slice(0, 2), 16);
    const g = parseInt(s.slice(2, 4), 16);
    const b = parseInt(s.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
```

constructor の末尾 (canvas 生成の後) に生成呼び出しを足す:

```js
        this._generate(this.canvas.getContext('2d'), paletteFill, rng);
```

`sourceX()` の前に `_generate` を追加する:

```js
    /**
     * 遠景を1回だけ描き切る。地色 → 大きなブロブ → 点描 の順に重ねる。
     * 不透明度は globalAlpha ではなく rgba 文字列とカラーストップに畳み込んでいる
     * (状態が残らず、疑似ctxでも記録・比較できるため)。
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} paletteFill ステージパレットの fill 色
     * @param {SeededRNG} rng
     */
    _generate(ctx, paletteFill, rng) {
        const W = this.width;
        const H = this.height;

        const baseColor = lerpColor(paletteFill, '#000000', BASE_DARKEN);
        const blobDark = lerpColor(paletteFill, '#000000', BLOB_DARK_DARKEN);
        const blobLight = lerpColor(paletteFill, '#000000', BLOB_LIGHT_DARKEN);
        const dotColor = lerpColor(paletteFill, '#000000', DOT_DARKEN);

        // 1) 地色
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, W, H);

        // 2) 大きな洞窟空間のうねり。明暗を交互に置いて奥行きのムラを作る。
        const blobCount = Math.floor((W * H) / BLOB_AREA_PER_UNIT);
        for (let i = 0; i < blobCount; i++) {
            const x = rng.next() * W;
            const y = rng.next() * H;
            const radius = BLOB_RADIUS_MIN + rng.next() * BLOB_RADIUS_RANGE;
            const color = (i % 2 === 0) ? blobLight : blobDark;

            const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
            grad.addColorStop(0, withAlpha(color, BLOB_CENTER_ALPHA));
            grad.addColorStop(1, withAlpha(color, 0));
            ctx.fillStyle = grad;
            ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }

        // 3) 点描。粒状感を与えて「ベタ塗りの黒」に見えないようにする。
        const dotCount = Math.floor((W * H) / DOT_AREA_PER_UNIT);
        for (let i = 0; i < dotCount; i++) {
            const x = Math.floor(rng.next() * W);
            const y = Math.floor(rng.next() * H);
            const size = (rng.next() < 0.5) ? 1 : 2;
            const alpha = DOT_ALPHA_MIN + rng.next() * DOT_ALPHA_RANGE;

            ctx.fillStyle = withAlpha(dotColor, alpha);
            ctx.fillRect(x, y, size, size);
        }
    }
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npm test -- tests/cave-backdrop.test.js`
Expected: PASS (11 tests)

- [ ] **Step 6: 既存テストが壊れていないことを確認**

Run: `npm test`
Expected: 全 PASS

- [ ] **Step 7: コミット**

```bash
git add src/js/world/CaveBackdrop.js tests/helpers/fake-ctx.js tests/cave-backdrop.test.js
git commit -m "feat: 遠景の地色・洞窟ブロブ・点描の生成を実装"
```

---

### Task 4: Map と main.js への接続

`Map` に遠景を持たせ、`main.js` の背景ベタ塗りを遠景転送に置き換える。

**Files:**
- Modify: `src/js/world/Map.js` (import 追加、`_generate()` 末尾 現 185行目付近)
- Modify: `src/js/main.js` (`_drawWorld()` 現 1057-1058行)
- Modify: `tests/MapDeterminism.test.js` (DOM スタブ、現 6-15行目)
- Modify: `tests/map-render-cache.test.js` (DOM スタブ、現 6-15行目)
- Test: `tests/cave-backdrop.test.js` (Map結線のテストを追加)

**Interfaces:**
- Consumes: Task 1〜3 の `CaveBackdrop` 全体
- Produces: `Map.backdrop: CaveBackdrop` — `main.js` の `_drawWorld()` から参照される

- [ ] **Step 1: 既存テストの DOM スタブを修正**

`tests/MapDeterminism.test.js` と `tests/map-render-cache.test.js` の両方に同じ `before()` フックがある。現状の `noopCtx` は `createRadialGradient()` に対して `undefined` を返すため、`Task 3` の `grad.addColorStop(...)` で TypeError になる。両ファイルの以下の行を:

```js
  const noopCtx = new Proxy({}, { get: () => () => {} });
```

こう変える:

```js
  // 任意のメソッド呼び出しに応答する。createRadialGradient の戻り値としても
  // 使えるよう addColorStop を持つオブジェクトを返す。
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/cave-backdrop.test.js` の末尾に追加する。

**注意:** ここでは記録型の疑似ctxを使ってはいけない。`Map` はタイルキャッシュに数万ブロックを描くため、全呼び出しを配列に溜めるとテストが数十万件のオブジェクトを抱えて重くなる。`Map` を作る間だけ捨て置きの noop ctx に差し替える。

```js
/** Map 生成用の軽量 DOM スタブ。呼び出しを記録しないので大きなマップでも軽い。 */
function withNoopDocument(fn) {
  const saved = globalThis.document;
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }),
  };
  try {
    return fn();
  } finally {
    globalThis.document = saved;
  }
}

test('Map owns a backdrop sized for its own dimensions', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');

  const map = withNoopDocument(() => new Map({ rng: new SeededRNG(99) }, 0)); // 最小マップ
  assert.ok(map.backdrop instanceof CaveBackdrop, 'map.backdrop should exist');
  assert.equal(map.backdrop.width, 1230);
  assert.equal(map.backdrop.height, 841);
});

test('Map builds the backdrop from the same stage palette as its blocks', async () => {
  const { Map, BLOCK_NORMAL } = await import('../src/js/world/Map.js');
  const { STAGE_PALETTES } = await import('../src/js/utils/Constants.js');

  const level = 4; // STAGE_PALETTES[4] = '#4682B4'
  const map = withNoopDocument(() => new Map({ rng: new SeededRNG(5) }, level));
  assert.equal(map.backdrop.paletteFill, map.blockStyles[BLOCK_NORMAL].fill);
  assert.equal(map.backdrop.paletteFill, STAGE_PALETTES[level].fill);
});
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `npm test -- tests/cave-backdrop.test.js`
Expected: FAIL — `map.backdrop should exist` (`map.backdrop` が undefined)

- [ ] **Step 4: CaveBackdrop に paletteFill を保持させる**

`src/js/world/CaveBackdrop.js` の constructor、`this.canvas` 生成の直前に追加する (テストとデバッグから参照するため):

```js
        this.paletteFill = paletteFill;
```

- [ ] **Step 5: Map に遠景を持たせる**

`src/js/world/Map.js` の import 群 (現 18行目の `} from '../utils/Constants.js';` の直後) に追加する:

```js
import { CaveBackdrop } from './CaveBackdrop.js';
```

`_generate()` 末尾 (現 183-185行目) を次のように変える。遠景生成が rng を消費するので、地形・敵配置の生成が全て終わった**後**に置くこと (先に置くとマップ生成の決定性が変わる):

```js
        // Step 11: Generate off-screen mini-map
        this._generateMiniMap();
        this._initTileCache();

        // Step 12: Generate the parallax far backdrop (must come last —
        // it consumes rng, and moving it earlier would shift terrain generation)
        const palettes = STAGE_PALETTES;
        const palIdx = (this.missionLevel || 0) % palettes.length;
        this.backdrop = new CaveBackdrop(this.width, this.height, palettes[palIdx].fill, this.game.rng);
```

- [ ] **Step 6: テストが通ることを確認**

Run: `npm test -- tests/cave-backdrop.test.js`
Expected: PASS (13 tests)

- [ ] **Step 7: main.js の背景描画を差し替え**

`src/js/main.js` の `_drawWorld()` (現 1057-1058行) の以下2行:

```js
        ctx.fillStyle = COLOR_CAVE_BG;
        ctx.fillRect(camX, camY, this.canvas.width, this.canvas.height);
```

を次に置き換える:

```js
        // 遠景(洞窟)を視差付きで転送。前景の空タイルは透明なのでここが透けて見える。
        if (this.map.backdrop) {
            this.map.backdrop.draw(ctx, camX, camY);
        } else {
            ctx.fillStyle = COLOR_CAVE_BG;
            ctx.fillRect(camX, camY, this.canvas.width, this.canvas.height);
        }
```

`COLOR_CAVE_BG` の import はフォールバックで使い続けるため残すこと。

- [ ] **Step 8: 全テストを実行**

Run: `npm test`
Expected: 全 PASS。特に `tests/MapDeterminism.test.js` と `tests/map-render-cache.test.js` が Step 1 の修正で通っていること。

- [ ] **Step 9: コミット**

```bash
git add src/js/world/Map.js src/js/world/CaveBackdrop.js src/js/main.js tests/cave-backdrop.test.js tests/MapDeterminism.test.js tests/map-render-cache.test.js
git commit -m "feat: 洞窟遠景をMapに接続し背景ベタ塗りを二重スクロールに置換"
```

- [ ] **Step 10: 実機確認をユーザーに依頼**

コード上の検証はここまで。以下は動かさないと判断できないため、ユーザーに確認を依頼する:

- 視差0.15が弱すぎ/強すぎないか → `Constants.js` の `FAR_BG_PARALLAX`
- 点描の密度が濃すぎ/薄すぎないか → `CaveBackdrop.js` の `DOT_AREA_PER_UNIT` (小さいほど濃い)
- 遠景のコントラストが前景のシルエット視認性を損なっていないか → `CaveBackdrop.js` の `*_DARKEN` 群 (1に近いほど黒)
- ステージごとの色調の差が意図通りか (ステージ4=暗緑、ステージ5=暗青)

指摘があれば該当する定数1つを調整する。
