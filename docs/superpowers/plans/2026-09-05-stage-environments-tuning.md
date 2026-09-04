# 面ごとの環境 実機フィードバック対応（第2ラウンド） 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 実機確認（2026-09-04）で挙がった5点を `feat/stage-environments` に入れる。水の波を細かく淡く、雪を岩の奥に灰色で降らせて滑りを増やし階段を坂の絵にする、霧を雲形にする、5〜7面の遠景のトーンを落とす。7面のタイルは触らない（要塞化の設計で扱う）。

**Architecture:** 第1ラウンドの構造は変えない。描画側のインターフェースに `drawBehindTerrain`（遠景の直後・地形の前、ワールド座標）と `drawDemoOverlay`（デモ画面用の画面重ね）の2つを足し、雪だけがそれを使う。タイルの形は `Map._drawRockyBlock` の面取りの延長（面取り幅を対角線いっぱい／中心まで伸ばす）で、当たり判定は触らない。自機の45度の描画オフセットは坂の斜辺に合わせて向きを反転する。

**Tech Stack:** バニラ ES modules、canvas 2D、`node --test`。

**Spec:** `docs/superpowers/specs/2026-09-04-stage-environments-design.md`（第1ラウンドの設計。今回の変更点はこの計画の各タスクに書き、完了時に設計書の「実装後の確認」を更新する）

## Global Constraints

- `git add -A` / `git add .` は使わない。`src/js/main.js` はユーザーのデバッグ用 `debugStartMission` が置かれることがあるので `git add -p` で自分のハンクだけ
- 数値は `src/js/utils/Constants.js`。決めた根拠をコメントに書く。コメントは日本語で「なぜ」
- 陸上の軌跡は変えない（`tests/environment-land-invariance.test.js` は触らず緑のまま）
- 週の決定性を壊さない（`game.rng` を消費しない）。`tests/MapDeterminism.test.js` が緑のまま
- 描画で毎フレームのグラデーション生成をしない（板の生成時は可）
- テストは実装から期待値を導かない。壊して赤くなることを確認する
- `npm test`（約3秒、現在 1742 件）

---

## File Structure

| ファイル | 責務 |
|---|---|
| `src/js/utils/Constants.js`（Modify） | 水・雪・霧・遠景の調整値 |
| `src/js/world/environment/water.js`（Modify） | 水面の線の太さと色 |
| `src/js/systems/SpawnEffects.js`（Modify） | 波紋の強さの上限 |
| `src/js/world/environment/none.js` / `fog.js` / `water.js` / `snow.js`（Modify） | `drawBehindTerrain` / `drawDemoOverlay` の追加 |
| `src/js/world/StageEnvironment.js`（Modify） | 2メソッドの転送 |
| `src/js/main.js`（Modify） | `_drawWorld` で遠景の直後に `drawBehindTerrain` |
| `src/js/ui/ScreenRenderer.js`（Modify） | デモ画面は `drawDemoOverlay` を呼ぶ |
| `src/js/world/Map.js`（Modify） | 雪の面の階段の段と板状の突出を三角に描く。積雪の帯を斜辺に沿わせる |
| `src/js/utils/slope.js`（Modify） | 描画オフセットの向きを坂の斜辺に合わせる |
| `src/js/world/CaveBackdrop.js`（Modify） | 5〜7面（と4面の滴り）の色を落とす |
| `tests/environment-*.test.js`、`tests/slope.test.js`、`tests/cave-backdrop.test.js`（Modify/Create） | 各タスクのテスト |

---

### Task R1: 水の波を細かく、水面の線を淡く細く、波紋を穏やかに

**Files:**
- Modify: `src/js/utils/Constants.js`（水の定数）
- Modify: `src/js/world/environment/water.js`（`drawSurfaceLine` と `drawOverWorld` の `lineWidth`）
- Modify: `src/js/systems/SpawnEffects.js`（`spawnSplash` の `addRipple` の上限）
- Test: `tests/environment-water-draw.test.js`、`tests/environment-splash.test.js`

**Interfaces:**
- Produces: `WATER_SURFACE_LINE_WIDTH`（1）、`WATER_RIPPLE_MAX`（2.5）

- [ ] **Step 1: 失敗するテストを書く**

`tests/environment-water-draw.test.js` に追加:

```js
test('surface line is thin and the wave is fine', async () => {
  const { WATER_WAVE_LENGTH, WATER_WAVE_AMPLITUDE, WATER_SURFACE_LINE_WIDTH } = await import('../src/js/utils/Constants.js');
  // 実機の指摘: 波は細かく、線は細く淡く。設計時の 48 / 2.5 / 2 から下げた値を固定する
  assert.ok(WATER_WAVE_LENGTH <= 24, `wave length ${WATER_WAVE_LENGTH}`);
  assert.ok(WATER_WAVE_AMPLITUDE <= 1.5, `amplitude ${WATER_WAVE_AMPLITUDE}`);
  assert.equal(WATER_SURFACE_LINE_WIDTH, 1);

  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const game = { map: mapWithPool(), enemies: [], projectiles: [], enemyBullets: [], particles: [], player: null, carrier: null };
  const env = new StageEnvironment(game, 3);
  const ctx = makeFakeCtx();
  env.drawOverWorld(ctx, 0, 0);
  const widths = ctx.calls.filter((c) => c.name === 'set:lineWidth').map((c) => c.args[0]);
  assert.deepEqual(widths, [WATER_SURFACE_LINE_WIDTH]);
});
```

`tests/environment-splash.test.js` に追加:

```js
test('ripple strength is capped at WATER_RIPPLE_MAX', async () => {
  const { WATER_RIPPLE_MAX } = await import('../src/js/utils/Constants.js');
  const ripples = [];
  const game = { particles: [], env: { renderer: { addRipple: (x, s) => ripples.push(s) } } };
  SpawnEffects.spawnSplash.call(game, 10, 100, 50);
  assert.deepEqual(ripples, [WATER_RIPPLE_MAX]);
  assert.ok(WATER_RIPPLE_MAX <= 2.5);
});
```

- [ ] **Step 2: 落ちることを確認** — `npm test -- tests/environment-water-draw.test.js tests/environment-splash.test.js` → FAIL

- [ ] **Step 3: 実装**

`Constants.js`:

```js
export const WATER_SURFACE_COLOR = 'rgba(180, 220, 255, 0.45)'; // 実機: もっと淡く（0.9 → 0.45）
export const WATER_SURFACE_LINE_WIDTH = 1;  // 実機: 細い線（2 → 1）
export const WATER_WAVE_AMPLITUDE = 1.5;    // 実機: 波を細かく（2.5 → 1.5）
export const WATER_WAVE_LENGTH = 24;        // 実機: 波を細かく（48 → 24。1.5 タイル）
export const WATER_RIPPLE_MAX = 2.5;        // しぶきの波紋の強さの上限（実機: 爆発の波動は穏やかに。6 → 2.5）
```

`water.js`: `drawSurfaceLine` と `drawOverWorld` の `ctx.lineWidth = 2;` を `ctx.lineWidth = WATER_SURFACE_LINE_WIDTH;`（import 追加）。
`SpawnEffects.spawnSplash`: `r.addRipple(x, Math.min(6, Math.abs(vy)))` → `Math.min(WATER_RIPPLE_MAX, Math.abs(vy))`（import 追加）。水面の可視判定の余白 `12` は `WATER_RIPPLE_MAX + WATER_WAVE_AMPLITUDE` を上回っていればよいので、コメントの数値だけ直す。

- [ ] **Step 4: 通ることを確認** — `npm test` → 全 PASS

- [ ] **Step 5: commit**

```bash
git add src/js/utils/Constants.js src/js/world/environment/water.js src/js/systems/SpawnEffects.js tests/environment-water-draw.test.js tests/environment-splash.test.js
git commit -m "tune: 地底湖の波を細かく、水面の線を淡く細く、波紋を穏やかに（実機の指摘）"
```

---

### Task R2: 雪を岩の奥に灰色で降らせる（`drawBehindTerrain` / `drawDemoOverlay`）

**Files:**
- Modify: `src/js/utils/Constants.js`（`SNOW_COLOR`、`SNOW_LAYERS`、`ICE_SLIDE`）
- Modify: `src/js/world/environment/none.js`、`fog.js`、`water.js`、`snow.js`（インターフェース拡張）
- Modify: `src/js/world/StageEnvironment.js`（転送）
- Modify: `src/js/main.js`（`_drawWorld` の遠景の直後）
- Modify: `src/js/ui/ScreenRenderer.js`（`_drawDemoEnvironment` は `drawDemoOverlay` を呼ぶ）
- Test: `tests/environment-snow-draw.test.js`、`tests/environment-game-wiring.test.js`、`tests/environment-demo-screens.test.js`、`tests/environment-player-motion.test.js`

**Interfaces:**
- Produces: 描画側インターフェースが `{ update, drawBehindTerrain(ctx, camX, camY), drawOverWorld(ctx, camX, camY), drawOverlay(ctx, alphaScale), drawDemoOverlay(ctx, alphaScale) }` になる
  - `drawBehindTerrain`: ワールド座標（translate 済み）。遠景の直後、地形タイルの前
  - `drawOverlay`: 本編の画面重ね（霧だけが使う。雪は何もしない）
  - `drawDemoOverlay`: デモ画面の画面重ね（霧は `drawOverlay` と同じ。雪はこれまでの画面スクロールをここへ移す）
- `StageEnvironment.drawBehindTerrain(ctx, camX, camY)` / `drawDemoOverlay(ctx, alphaScale = 1)`

- [ ] **Step 1: 失敗するテストを書く**

`tests/environment-snow-draw.test.js` を書き換える:

```js
test('in-game snow falls behind the terrain (world pass), not over the HUD', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const env = new StageEnvironment(null, 4);
  for (let i = 0; i < 30; i++) env.update();
  const behind = makeFakeCtx();
  env.drawBehindTerrain(behind, 640, 320);
  const draws = behind.calls.filter((c) => c.name === 'drawImage');
  const tilesX = Math.ceil(CANVAS_WIDTH / SNOW_SHEET_SIZE) + 1;
  const tilesY = Math.ceil(CANVAS_HEIGHT / SNOW_SHEET_SIZE) + 1;
  assert.ok(draws.length >= SNOW_LAYERS.length && draws.length <= SNOW_LAYERS.length * tilesX * tilesY, `drawImage ${draws.length}`);
  // ワールド座標: 全ての板がカメラの可視矩形に掛かる位置に置かれる
  for (const d of draws) {
    const [, x, y] = d.args;
    assert.ok(x + SNOW_SHEET_SIZE > 640 && x < 640 + CANVAS_WIDTH, `sheet x ${x} outside view`);
    assert.ok(y + SNOW_SHEET_SIZE > 320 && y < 320 + CANVAS_HEIGHT, `sheet y ${y} outside view`);
  }
  const over = makeFakeCtx();
  env.drawOverlay(over);
  assert.equal(over.calls.filter((c) => c.name === 'drawImage').length, 0, 'in-game overlay must not draw snow');
});

test('demo overlay still scrolls snow in screen space', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const env = new StageEnvironment(null, 4);
  const ctx = makeFakeCtx();
  env.drawDemoOverlay(ctx, 0.5);
  assert.ok(ctx.calls.filter((c) => c.name === 'drawImage').length >= SNOW_LAYERS.length);
  const alphas = ctx.calls.filter((c) => c.name === 'set:globalAlpha').map((c) => c.args[0]);
  assert.ok(alphas.includes(0.5));
});

test('snow flakes are small and dim grey so they read apart from bullets', async () => {
  const { SNOW_COLOR, SNOW_LAYERS } = await import('../src/js/utils/Constants.js');
  const lum = (hex) => { const s = hex.slice(1); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)).reduce((a, b, i) => a + b * [0.2126, 0.7152, 0.0722][i], 0); };
  assert.ok(lum(SNOW_COLOR) < 160, `snow colour too bright: ${SNOW_COLOR}`); // 弾（白）と見分ける
  for (const layer of SNOW_LAYERS) assert.ok(layer.size <= 2, `flake size ${layer.size}`);
});
```

（既存の「layers scroll at different speeds」は `drawBehindTerrain` を使う形に直す: y の差が層ごとに違うことを同じ方法で見る。）

`tests/environment-game-wiring.test.js` に追加（`_drawWorld` の順序）:

```js
test('world pass draws snow behind the terrain: backdrop → env.behind → map', () => {
  const order = [];
  const fake = {
    gameState: 'playing', simAlpha: 1,
    camera: { renderX: () => 0, renderY: () => 0 },
    canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    _applyRenderInterpolation() {}, _restoreRenderInterpolation() {},
    map: { backdrop: { draw() { order.push('backdrop'); } }, draw() { order.push('map'); } },
    env: { drawBehindTerrain() { order.push('behind'); }, drawOverWorld() { order.push('over'); }, drawOverlay() {} },
    carrier: null, player: null, projectiles: [], particles: [], landmines: [], repairKits: [], autoAimUnits: [], missileKits: [],
    grenadeTrajectory: null, _drawHpBarIfDamaged() {}, enemies: [], enemyBullets: [], flag: null, smokeScreens: [],
  };
  Game._drawWorld.call(fake, makeFakeCtx());
  assert.deepEqual(order, ['backdrop', 'behind', 'map', 'over']);
});
```

（`_drawWorld` が他に触るプロパティがあれば fake に足す。`isInView` は `enemies` が空なら呼ばれない。）

`tests/environment-demo-screens.test.js`: 面別ランキング（5面）で `drawDemoOverlay` 経由の drawImage が出ること（既存の 6 面のテストの雪版を1つ）。

`tests/environment-player-motion.test.js`: `ICE_SLIDE` が `>= 0.94` であることを1行足す（実機: もう少し滑る）。

- [ ] **Step 2: 落ちることを確認** — FAIL

- [ ] **Step 3: 実装**

`Constants.js`:

```js
export const ICE_SLIDE = 0.94;   // 実機: もう少し滑る（0.9 → 0.94。止まるまでの距離が約1.7倍）
export const SNOW_LAYERS = [
    { count: 320, size: 1, speed: 0.5, sway: 0.25, alpha: 0.55 }, // 遠い
    { count: 180, size: 1, speed: 0.9, sway: 0.5,  alpha: 0.7 },
    { count: 90,  size: 2, speed: 1.4, sway: 0.9,  alpha: 0.85 }, // 近い
];
// 実機: 白だと弾と紛れる。輝度の低い灰色にして、岩の奥（遠景と地形の間）に降らせる
export const SNOW_COLOR = '#8A9098';
```

`none.js`: `drawBehindTerrain() {}` と `drawDemoOverlay() {}` を足す。
`fog.js`: `drawBehindTerrain() {}`、`drawDemoOverlay(ctx, a) { this.drawOverlay(ctx, a); }`（オブジェクトリテラルなので `renderer.drawOverlay` を参照する形で書く）。
`water.js`: 2つとも no-op。
`snow.js`: 板の生成はそのまま。`drawOverlay` を no-op にし、旧 `drawOverlay` の中身を `drawDemoOverlay` に移す。`drawBehindTerrain(ctx, camX, camY)`:

```js
        drawBehindTerrain(ctx, camX, camY) {
            // ワールド座標で、カメラの可視矩形に掛かる板だけを敷く。落下と横揺れは
            // 画面版と同じだが、板はワールドに固定されるので歩くと地形と一緒に流れる
            // （空洞の向こうで降っている雪を岩の穴から見る形）
            ctx.save();
            SNOW_LAYERS.forEach((layer, i) => {
                const S = SNOW_SHEET_SIZE;
                const oy = ((t * layer.speed) % S + S) % S;
                const ox = ((Math.sin(t * 0.02 + i) * layer.sway * 40) % S + S) % S;
                const x0 = Math.floor((camX - ox) / S) * S + ox - S;
                const y0 = Math.floor((camY - oy) / S) * S + oy - S;
                for (let y = y0; y < camY + CANVAS_HEIGHT; y += S) {
                    for (let x = x0; x < camX + CANVAS_WIDTH; x += S) {
                        if (x + S <= camX || y + S <= camY) continue;
                        ctx.drawImage(sheets[i], x, y);
                    }
                }
            });
            ctx.restore();
        },
```

`StageEnvironment.js`: `drawBehindTerrain(ctx, camX, camY) { this.renderer.drawBehindTerrain(ctx, camX, camY); }`、`drawDemoOverlay(ctx, alphaScale = 1) { this.renderer.drawDemoOverlay(ctx, alphaScale); }`。
`main.js` `_drawWorld`: 遠景の `if/else` の直後に

```js
        // 環境の「岩の奥」の描画（雪）。遠景の上、地形の下＝空洞の向こうで降っている
        this.env.drawBehindTerrain(ctx, camX, camY);
```

`ScreenRenderer._drawDemoEnvironment`: `env.drawOverlay(ctx, DEMO_OVERLAY_ALPHA_SCALE)` → `env.drawDemoOverlay(ctx, DEMO_OVERLAY_ALPHA_SCALE)`。

既存テストの env スタブ（`tests/carrier-arrow-draw-order.test.js`、`tests/draw-view-cull.test.js`、`tests/environment-game-wiring.test.js`）に `drawBehindTerrain() {}` を足す。

- [ ] **Step 4: 通ることを確認** — `npm test` → 全 PASS（`environment-land-invariance` も）

- [ ] **Step 5: commit（main.js は `-p`）**

```bash
git add src/js/utils/Constants.js src/js/world/environment/none.js src/js/world/environment/fog.js src/js/world/environment/water.js src/js/world/environment/snow.js src/js/world/StageEnvironment.js src/js/ui/ScreenRenderer.js tests/environment-snow-draw.test.js tests/environment-game-wiring.test.js tests/environment-demo-screens.test.js tests/environment-player-motion.test.js tests/carrier-arrow-draw-order.test.js tests/draw-view-cull.test.js
git add -p src/js/main.js
git commit -m "tune: 雪を岩の奥に灰色で降らせ、滑りを増やす（実機の指摘）"
```

---

### Task R3: 雪の面の階段を45度の坂に、板状の突出をくの字の三角に描く

**Files:**
- Modify: `src/js/world/Map.js`（`_drawRockyBlock` の面取り幅と積雪の帯）
- Modify: `src/js/utils/slope.js`（`slopeDrawOffset` の向き）
- Test: `tests/environment-snow-shape.test.js`（Create）、`tests/slope.test.js`

**Interfaces:**
- 形の規則（雪の面 `envKind === 'snow'` だけ。当たり判定は不変）:
  - **階段の段**: 上と左が露出、下が岩、右上 `(r-1, c+1)` が岩 → 左上の面取りを対角線いっぱい（`cTL = S`）。鏡像は `cTR = S`。斜辺 = 段の左下から右上（右上がりの坂）
  - **板状の突出**: 上・下・片側が露出し、反対側が岩（高さ1の板の先端）→ 露出した側の上下を中心まで面取り（`cTL = cBL = S/2`、鏡像は `cTR = cBR = S/2`）。頂点が中心に来るくの字の三角
  - **積雪の帯**: 段の斜辺に沿って `SNOW_CAP_THICKNESS` 幅の帯（clip の内側に `lineWidth = SNOW_CAP_THICKNESS * 2` で斜辺を stroke）。板状の突出には上面が無いので帯なし
- `slopeDrawOffset(dir, feetCenterX)` は **正の値**を返す（坂の斜辺は段の上端より低いので、絵を下へずらす）: 低い側の端で `+TILE_SIZE`、高い側の端で `0`

- [ ] **Step 1: 失敗するテストを書く**

```js
// tests/environment-snow-shape.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { TILE_SIZE, BLOCK_NORMAL, BLOCK_EMPTY, SNOW_CAP_COLOR } from '../src/js/utils/Constants.js';

let ctxs = [];
before(() => {
  globalThis.document = {
    createElement: () => { const ctx = makeFakeCtx(); ctxs.push(ctx); return { width: 0, height: 0, getContext: () => ctx, _ctx: ctx }; },
  };
});

/** Map を生成せずに _drawRockyBlock だけを呼ぶための最小の Map もどき。 */
async function blockDrawer(rows, envKind) {
  const { Map } = await import('../src/js/world/Map.js');
  const grid = rows.map((s) => s.split('').map((ch) => (ch === '#' ? BLOCK_NORMAL : BLOCK_EMPTY)));
  const m = Object.create(Map.prototype);
  m.grid = grid; m.rows = grid.length; m.cols = grid[0].length; m.envKind = envKind;
  m.blockStyles = { [BLOCK_NORMAL]: { fill: '#8B4513', border: '#5c2e0b' } };
  m.exposedAtGen = new Uint8Array(m.rows * m.cols);
  for (let r = 1; r < m.rows; r++) for (let c = 0; c < m.cols; c++) if (grid[r][c] !== BLOCK_EMPTY && grid[r - 1][c] === BLOCK_EMPTY) m.exposedAtGen[r * m.cols + c] = 1;
  return m;
}

/** 最初の beginPath..closePath の頂点列（ベースの多角形）。 */
function basePolygon(ctx) {
  const pts = [];
  let inPath = false;
  for (const c of ctx.calls) {
    if (c.name === 'beginPath') { if (pts.length) break; inPath = true; continue; }
    if (!inPath) continue;
    if (c.name === 'moveTo' || c.name === 'lineTo') pts.push(c.args);
    if (c.name === 'closePath') break;
  }
  return pts;
}

// 右上がりの階段: (2,1) が段。上(1,1)空、左(2,0)空、下(3,1)岩、右上(1,2)岩
const STAIRS = ['....', '..##', '.###', '####'];

test('on the snow stage a stair step is drawn as a half-tile triangle (45° ramp)', async () => {
  const m = await blockDrawer(STAIRS, 'snow');
  const ctx = makeFakeCtx();
  m._drawRockyBlock(ctx, 2, 1, BLOCK_NORMAL);
  const x = TILE_SIZE, y = 2 * TILE_SIZE, S = TILE_SIZE;
  const pts = basePolygon(ctx).map(([px, py]) => [px, py]);
  // 斜辺の両端（右上と左下）が頂点にあり、左上の角 (x, y) は無い
  assert.ok(pts.some(([px, py]) => px === x + S && py === y), 'top-right vertex');
  assert.ok(pts.some(([px, py]) => px === x && py === y + S), 'bottom-left vertex');
  assert.ok(!pts.some(([px, py]) => px === x && py === y), 'top-left corner must be cut away');
  // 積雪の帯は斜辺に沿う stroke
  const stroked = ctx.calls.some((c, i) => c.name === 'set:strokeStyle' && c.args[0] === SNOW_CAP_COLOR);
  assert.ok(stroked, 'snow band along the hypotenuse');
});

test('on a non-snow stage the same step keeps the small chamfer', async () => {
  const m = await blockDrawer(STAIRS, 'none');
  const ctx = makeFakeCtx();
  m._drawRockyBlock(ctx, 2, 1, BLOCK_NORMAL);
  const x = TILE_SIZE, y = 2 * TILE_SIZE;
  const pts = basePolygon(ctx);
  // 小さい面取り: 上辺の左端は x+4..x+9 の範囲
  const topLeft = pts[0];
  assert.ok(topLeft[0] > x && topLeft[0] < x + 10 && topLeft[1] === y, `chamfer ${topLeft}`);
});

// 板状の突出: (1,1) は上下と左が露出、右(1,2)は岩
const PLATE = ['....', '.###', '....', '####'];

test('on the snow stage a 1-high plate tip is drawn as a chevron meeting at the tile centre', async () => {
  const m = await blockDrawer(PLATE, 'snow');
  const ctx = makeFakeCtx();
  m._drawRockyBlock(ctx, 1, 1, BLOCK_NORMAL);
  const x = TILE_SIZE, y = TILE_SIZE, S = TILE_SIZE;
  const pts = basePolygon(ctx);
  assert.ok(pts.some(([px, py]) => px === x + S / 2 && py === y + S / 2), 'apex at the tile centre');
  assert.ok(!pts.some(([px, py]) => px === x && (py === y || py === y + S)), 'left corners cut away');
});
```

`tests/slope.test.js` の `slopeDrawOffset` のテストを新しい向きに直す（**期待値は手で決める**: 右上がり `dir=1`、段の左端 `frac=0` → `+TILE_SIZE`、中央 → `+TILE_SIZE/2`、右端直前 → ほぼ 0。`dir=-1` は鏡像）。

- [ ] **Step 2: 落ちることを確認** — FAIL

- [ ] **Step 3: 実装**

`Map._drawRockyBlock`（面取りサイズの決定の直後）:

```js
        // 雪の面だけ形を変える（実機の指摘。当たり判定は階段のまま）:
        // - 階段の段（上と片側が露出、下は岩、露出側の反対の斜め上が岩）は面取りを
        //   対角線いっぱいまで伸ばし、階段全体を45度の坂に見せる。自機の描画オフセット
        //   （utils/slope.js）はこの斜辺の上に足が乗るよう向きを合わせてある
        // - 板状の突出（上下と片側が露出した高さ1の先端）は上下から中心まで面取りし、
        //   頂点が中心に来るくの字の三角にする
        let rampTL = false, rampTR = false;
        if (this.envKind === 'snow') {
            const solid = (rr, cc) => rr >= 0 && rr < this.rows && cc >= 0 && cc < this.cols && this.grid[rr][cc] !== BLOCK_EMPTY;
            if (expTop && expLeft && !expBottom && solid(r - 1, c + 1)) { cTL = S; rampTL = true; }
            else if (expTop && expRight && !expBottom && solid(r - 1, c - 1)) { cTR = S; rampTR = true; }
            else if (expTop && expBottom && expLeft && !expRight) { cTL = S / 2; cBL = S / 2; }
            else if (expTop && expBottom && expRight && !expLeft) { cTR = S / 2; cBR = S / 2; }
        }
```

（`cTL` などを `const` から `let` に変える。多角形の頂点列挙はそのまま使える: `cTL = S` のとき `moveTo(x+S, y)` → … → `lineTo(x, y+S)` → `lineTo(x+S, y)` と、対角線が閉じる。`cTL = S/2, cBL = S/2` のときは `(x+S/2, y)` … `(x+S/2, y+S)` → `(x, y+S/2)` → `(x+S/2, y)` となり、頂点 `(x, y+S/2)` が左端に来る。**頂点を中心に置く**には、この2つの面取りだけ座標を `(x + S/2, y + S/2)` にする必要があるので、`cTL === S/2 && cBL === S/2` のときは左辺の頂点を `lineTo(x + S / 2, y + S / 2)` に置き換える（鏡像も同様）。実装で分岐を書き、テストが `(x+S/2, y+S/2)` を要求する。）

積雪の帯（既存の `if (expTop)` の帯の描画）: `rampTL || rampTR` のときは `fillRect` の代わりに斜辺を stroke:

```js
            if (rampTL || rampTR) {
                ctx.strokeStyle = SNOW_CAP_COLOR;
                ctx.lineWidth = SNOW_CAP_THICKNESS * 2; // clip で内側の半分だけ残る
                ctx.beginPath();
                if (rampTL) { ctx.moveTo(x, y + S); ctx.lineTo(x + S, y); }
                else { ctx.moveTo(x + S, y + S); ctx.lineTo(x, y); }
                ctx.stroke();
            } else {
                ctx.fillStyle = SNOW_CAP_COLOR;
                ctx.fillRect(x, y, S, SNOW_CAP_THICKNESS);
            }
```

`slope.js`:

```js
/**
 * 足の中心 x が段の中でどこにいるかから、坂の斜辺に足を乗せるための描画の縦オフセット。
 * 当たり判定は段の上端（水平）なので、絵だけを斜辺まで下げる。
 * 段の低い側の端で +TILE_SIZE（斜辺は1段下の上端と同じ高さ）、高い側の端で 0。
 * 第1ラウンドでは段の上端どうしを結ぶ線（負のオフセット）だったが、実機で
 * 坂の絵（Map._drawRockyBlock の対角線の面取り）と合わせて向きを反転した。
 */
export function slopeDrawOffset(dir, feetCenterX) {
    if (dir === 0) return 0;
    const frac = (feetCenterX - Math.floor(feetCenterX / TILE_SIZE) * TILE_SIZE) / TILE_SIZE;
    const t = dir > 0 ? frac : 1 - frac;
    return (1 - t) * TILE_SIZE;
}
```

- [ ] **Step 4: 通ることを確認** — `npm test` → 全 PASS（`environment-snow-cap`、`MapDeterminism`、`environment-land-invariance` を含む）

- [ ] **Step 5: commit**

```bash
git add src/js/world/Map.js src/js/utils/slope.js tests/environment-snow-shape.test.js tests/slope.test.js
git commit -m "feat: 雪の面の階段を45度の坂に、板状の突出をくの字の三角に描く（実機の指摘）"
```

---

### Task R4: 霧を雲形の半透明パーティクルで

**Files:**
- Modify: `src/js/utils/Constants.js`（`FOG_BLOB_COUNT`、`FOG_BLOB_RADIUS_MIN/RANGE`、`FOG_BLOB_ASPECT`、`FOG_BLOB_ALPHA_MIN/RANGE`）
- Modify: `src/js/world/environment/fog.js`（`buildSheet`）
- Test: `tests/environment-fog-draw.test.js`

**Interfaces:**
- `buildSheet` は `SMOKE_SHAPES`（`entities/smokeSprites.js`）の瘤の並びを使い、1つの雲を「半径 r の瘤の重なり」として描く。横に `FOG_BLOB_ASPECT`（2.0）倍に潰す（`ctx.scale`）。瘤ごとに `createRadialGradient`（板の生成時だけ）。alpha は雲ごとに `FOG_BLOB_ALPHA_MIN + rng * RANGE`

- [ ] **Step 1: 失敗するテストを書く**

`tests/environment-fog-draw.test.js` に追加:

```js
test('fog sheets are built from organic smoke-shaped clouds, squashed horizontally', async () => {
  const { FOG_BLOB_COUNT, FOG_BLOB_ASPECT } = await import('../src/js/utils/Constants.js');
  const { SMOKE_SHAPES } = await import('../src/js/entities/smokeSprites.js');
  sheets = [];
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  new StageEnvironment(null, 5);
  assert.ok(sheets.length >= 2, 'two sheets built');
  for (const s of sheets) {
    const grads = s.calls.filter((c) => c.name === 'createRadialGradient').length;
    const minLobes = Math.min(...SMOKE_SHAPES.map((sh) => sh.length));
    assert.ok(grads >= FOG_BLOB_COUNT * minLobes, `expected ≥ ${FOG_BLOB_COUNT * minLobes} lobes, got ${grads}`);
    const scales = s.calls.filter((c) => c.name === 'scale');
    assert.ok(scales.length >= FOG_BLOB_COUNT && scales.every((c) => c.args[0] === FOG_BLOB_ASPECT && c.args[1] === 1));
    assert.equal(s.calls.filter((c) => c.name === 'arc').length, 0, 'no plain circles');
  }
  assert.ok(FOG_BLOB_ASPECT >= 1.8);
});
```

（`before()` の document スタブで作った ctx を `sheets` に集める。描画時の overlay テストは変えない。）

- [ ] **Step 2: 落ちることを確認** — FAIL

- [ ] **Step 3: 実装**

`Constants.js`:

```js
export const FOG_BLOB_COUNT = 220;          // 実機: ムラを増やす（160 → 220。雲は小さくする）
export const FOG_BLOB_RADIUS_MIN = 18;      // 実機: 小さめ（40〜130 → 18〜60）
export const FOG_BLOB_RADIUS_RANGE = 42;
export const FOG_BLOB_ASPECT = 2.0;         // 横長。円だと幾何学的に見える（実機の指摘）
export const FOG_BLOB_ALPHA_MIN = 0.05;     // 雲ごとの濃さの幅でムラを出す
export const FOG_BLOB_ALPHA_RANGE = 0.30;
```

`fog.js` `buildSheet`:

```js
// 雲は煙幕と同じ瘤の並び（SMOKE_SHAPES）で描く。円を並べると幾何学的に見える
// （実機の指摘）。瘤ごとの放射グラデーションは板の生成時だけで、毎フレームは使わない
function drawCloud(ctx, shape, cx, cy, r, alpha) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(FOG_BLOB_ASPECT, 1);
    for (const lobe of shape) {
        const lx = lobe.dx * r, ly = lobe.dy * r, lr = lobe.r * r;
        const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
        g.addColorStop(0, withAlpha(FOG_COLOR, alpha * lobe.a));
        g.addColorStop(0.6, withAlpha(FOG_COLOR, alpha * lobe.a * 0.5));
        g.addColorStop(1, withAlpha(FOG_COLOR, 0));
        ctx.fillStyle = g;
        ctx.fillRect(lx - lr, ly - lr, lr * 2, lr * 2);
    }
    ctx.restore();
}
```

（`withAlpha` は `utils/color.js` にある。`buildSheet` のループで `shape = SMOKE_SHAPES[i % SMOKE_SHAPES.length]`、`r = FOG_BLOB_RADIUS_MIN + rng * RANGE`、`alpha = FOG_BLOB_ALPHA_MIN + rng * RANGE`、端の継ぎ目は今までどおり 9 箇所に描く。fake ctx に `translate`/`scale`/`save`/`restore` はある。）

- [ ] **Step 4: 通ることを確認** — `npm test` → 全 PASS

- [ ] **Step 5: commit**

```bash
git add src/js/utils/Constants.js src/js/world/environment/fog.js tests/environment-fog-draw.test.js
git commit -m "tune: 霧を煙幕と同じ雲形の半透明パーティクルで描く（実機の指摘）"
```

---

### Task R5: 5〜7面（と4面の滴り）の遠景のトーンを落とす

**Files:**
- Modify: `src/js/world/CaveBackdrop.js`（`_drawRockBand` の雪のハイライト、`_drawWetDecor`、`_drawMachineDecor` の色）
- Test: `tests/environment-backdrop.test.js`

**Interfaces:**
- 装飾色の規則: **どの装飾色も、その面の前景ブロック色の輝度の 0.45 倍以下**（岩の3階調と同じ上限）。雪のハイライト帯は `lerpColor(rockLight, '#FFFFFF', 0.12)`（0.5 → 0.12）。機械: steel `#2A2E35`、steelDark `#1C1F25`、lamp `#6E5A2E`（彩度を落とした暗い琥珀）。滴り: `lerpColor(rockLight, '#3A6A90', 0.3)`

- [ ] **Step 1: 失敗するテストを書く**

`tests/environment-backdrop.test.js` に追加:

```js
test('backdrop decoration colours never compete with the foreground (≤ 0.45 × palette luminance)', async () => {
  const { CaveBackdrop } = await import('../src/js/world/CaveBackdrop.js');
  const { STAGE_PALETTES, ENV_BACKDROPS } = await import('../src/js/utils/Constants.js');
  const lum = (hex) => { const s = hex.replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)).reduce((a, b, i) => a + b * [0.2126, 0.7152, 0.0722][i], 0); };
  for (const backdrop of ENV_BACKDROPS) {
    for (const palette of STAGE_PALETTES) {
      new CaveBackdrop(2400, 1200, palette.fill, new SeededRNG(3), backdrop);
      const used = new Set(fills(lastCtx).filter((c) => typeof c === 'string' && c.startsWith('#')));
      for (const c of used) {
        assert.ok(lum(c) <= lum(palette.fill) * 0.45, `${backdrop}/${palette.fill}: ${c} (${lum(c).toFixed(1)}) too bright`);
      }
    }
  }
});
```

（`fills()` は既存のヘルパー。stroke は使っていないので fill だけで足りる。）

- [ ] **Step 2: 落ちることを確認** — FAIL（雪のハイライトと機械のランプで落ちる）

- [ ] **Step 3: 実装** — 上の色に変え、根拠（実機: 5〜7面の遠景が目立ちすぎ。白い線は明度と彩度を落とす）をコメントに。落ちるパレットがあれば係数を下げる。

- [ ] **Step 4: 通ることを確認** — `npm test` → 全 PASS（`cave-backdrop.test.js` の階調テストも）

- [ ] **Step 5: commit**

```bash
git add src/js/world/CaveBackdrop.js tests/environment-backdrop.test.js
git commit -m "tune: 5〜7面の遠景の装飾を暗く彩度を落とす（実機の指摘）"
```

---

### Task R6: 設計書の「実装後の確認」を更新

- [ ] 設計書末尾の表に、今回動かした定数（`WATER_WAVE_LENGTH` `WATER_SURFACE_LINE_WIDTH` `WATER_RIPPLE_MAX` `SNOW_COLOR` `ICE_SLIDE` `FOG_BLOB_*`）と「雪は岩の奥」「階段は坂の絵」「板状の突出はくの字」を1行ずつ足す。7面のタイルは要塞化の設計で扱うと明記。
- [ ] commit: `docs: 第2ラウンドの確認ポイントを設計書に追記`

---

## Self-Review

- **Coverage**: ユーザーの5点 → R1（水）、R2+R3（雪）、R4（霧）、R5（遠景トーン）、R6（記録）。7面タイルは対象外と明記
- **Type consistency**: `drawBehindTerrain(ctx, camX, camY)` / `drawDemoOverlay(ctx, alphaScale)` は R2 で4つの renderer と `StageEnvironment` に同名で定義。`slopeDrawOffset` の符号反転は R3 で `Player.drawOffsetY` の使い方（`ctx.translate(0, drawOffsetY)`）と整合（正で下へ）
- **Risk**: R3 の形の変更はタイルキャッシュだけで当たり判定に触らない。R2 の本編の重ねが無くなるので、5面の drawImage 回数は「岩の奥」の層に移るだけ（回数は同じ桁）
